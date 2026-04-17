<script>
	import { onMount, getContext, untrack } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { adminApps as adminAppsStore } from '$lib/stores/adminApps.js';
	import { buildAppsFromConfig, resolveIcon } from '$lib/apps.js';
	import { getIconSrc, getIconClass, handleIconError, getBrandBgStyle, getBrandIconClass } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	import { browser } from '$app/environment';

	const siteConfig = getContext('config');
	const { categories, defaultAppIds, setupGuides } = buildAppsFromConfig(siteConfig?.apps);

	let { isAdmin = false, guideApp = $bindable(null), editMode = $bindable(false), searchEnabled = false } = $props();
	let searchInput = $state('');
	let platform = $state('desktop');

	// Lock body scroll when setup guide modal is open
	$effect(() => {
		if (!browser) return;
		if (guideApp) {
			document.body.style.overflow = 'hidden';
			return () => { document.body.style.overflow = ''; };
		}
	});

	// Visible app IDs — null means default set
	const visibleAppIds = $derived($prefs.visibleApps || defaultAppIds);
	const iconStyle = $derived($prefs.iconStyle || 'colored');
	const openInNewTab = $derived($prefs.openInNewTab ?? true);

	// Build admin-added apps grouped by category (from server-backed store)
	const adminCategories = $derived.by(() => {
		const apps = $adminAppsStore || [];
		if (!apps.length) return [];
		const groups = {};
		for (const a of apps) {
			const cat = a.category || 'Custom';
			if (!groups[cat]) groups[cat] = [];
			groups[cat].push({
				id: a.id, name: a.name, url: a.url,
				icon: resolveIcon(a.icon),
				selfHosted: a.self_hosted || false, adminOnly: false,
				default: true, ios: null, android: null, extension: null
			});
		}
		return Object.entries(groups).map(([label, apps]) => ({ label, apps }));
	});

	// Build custom bookmarks category from prefs
	const bookmarksCategory = $derived.by(() => {
		const custom = $prefs.customApps || [];
		if (!custom.length) return null;
		return {
			label: 'Bookmarks',
			apps: custom.map(a => ({
				id: a.id, name: a.name, url: a.url,
				icon: resolveIcon(a.icon),
				selfHosted: false, adminOnly: false,
				default: true, ios: null, android: null, extension: null
			}))
		};
	});

	let mounted = $state(false);

	// Union of all apps the user *could* place (built-in + admin-added,
	// bookmarks excluded — they keep their own untouchable category).
	const allApps = $derived.by(() => {
		const m = new Map();
		for (const cat of categories) {
			for (const app of cat.apps) {
				if (app.adminOnly && !isAdmin) continue;
				m.set(app.id, { app, defaultCategory: cat.label });
			}
		}
		for (const ac of adminCategories) {
			for (const app of ac.apps) {
				m.set(app.id, { app, defaultCategory: ac.label });
			}
		}
		return m;
	});

	// Default placement snapshot: apps with default_visible !== false,
	// grouped by their config category. Used to seed `categoryLayout`
	// on first render, and as a reset baseline.
	const defaultLayout = $derived.by(() => {
		const byCat = new Map();
		for (const cat of categories) {
			for (const app of cat.apps) {
				if (app.adminOnly && !isAdmin) continue;
				if (app.default === false) continue;
				if (!byCat.has(cat.label)) byCat.set(cat.label, []);
				byCat.get(cat.label).push(app.id);
			}
		}
		for (const ac of adminCategories) {
			for (const app of ac.apps) {
				if (!byCat.has(ac.label)) byCat.set(ac.label, []);
				byCat.get(ac.label).push(app.id);
			}
		}
		return Array.from(byCat, ([label, appIds]) => ({
			id: slugify(label), label, appIds
		}));
	});

	// Authoritative layout. `null` only until the first-mount seed effect
	// runs; after that it's always an array.
	const categoryLayout = $derived(
		Array.isArray($prefs.categoryLayout) ? $prefs.categoryLayout : null
	);

	// First-mount seed: write defaultLayout into prefs if the user has
	// none. Hidden-by-default apps skip placement and land in the tray.
	$effect(() => {
		if (!browser || !mounted) return;
		if (categoryLayout) return;
		prefs.update(p => ({ ...p, categoryLayout: defaultLayout }));
	});

	// Lazily seed `categoryCols` for any rendered category that doesn't
	// have an entry yet. Intentionally does NOT overwrite existing
	// entries so app add/remove can't shrink an existing width.
	$effect(() => {
		for (const cat of renderCategories) {
			const catId = slugify(cat.label);
			if (categoryCols[catId] == null) {
				categoryCols[catId] = defaultWidth(Math.max(cat.apps.length, 2));
			}
		}
	});

	const renderCategories = $derived.by(() => {
		// Until the seed effect fires on first render we fall back to
		// defaultLayout so SSR → hydration has something sensible.
		const layout = categoryLayout ?? defaultLayout;
		const result = [];
		for (const entry of layout) {
			const apps = entry.appIds
				.map(id => allApps.get(id)?.app)
				.filter(Boolean);
			// Keep empty categories visible in edit mode so they're
			// droppable; hide them otherwise.
			if (!apps.length && !editMode) continue;
			result.push({ label: entry.label, apps });
		}
		if (bookmarksCategory) result.push(bookmarksCategory);
		return result;
	});

	// Apps in `allApps` but not placed anywhere go to the tray.
	const trayApps = $derived.by(() => {
		const layout = categoryLayout ?? defaultLayout;
		const placed = new Set(layout.flatMap(c => c.appIds || []));
		const out = [];
		for (const [id, { app }] of allApps) {
			if (!placed.has(id)) out.push(app);
		}
		return out;
	});

	// Search: flat list of matching apps across all rendered categories
	const searchQuery = $derived(searchInput.trim().toLowerCase());
	const allAppsArr = $derived(Array.from(allApps.values()).map(v => v.app));
	const searchResults = $derived.by(() => {
		if (!searchQuery) return null;
		const matches = [];
		for (const cat of renderCategories) {
			for (const app of cat.apps) {
				if (app.name.toLowerCase().includes(searchQuery)) matches.push(app);
			}
		}
		return matches;
	});

	// Portal action: moves element to document.body to escape transform containing blocks
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	let contextApp = $state(null);
	let contextAnchor = $state(null);
	let contextMenuEl = $state(null);
	let longPressTimer = null;

	// ── GridStack ──
	let gridEl = $state(null);
	let grid = null;
	// Cleanup for GridStack-attached listeners (window resize, debounce timer).
	// Closure-scoped so it survives teardown even if `grid` is nulled first.
	let cleanupGridListeners = null;

	// Per-category column count (--cols). Seeded lazily via the
	// $effect below (never from within render, which would loop).
	// Updated only when the user resizes a tile or when
	// `applyLayoutForColumn` restores a saved width. Decoupled from
	// `apps.length` so dropping a new app into a full tile wraps to
	// a new row instead of squishing icons.
	let categoryCols = $state({});

	// ── Tray scroll ──────────────────────────────────────────────
	let trayScrollerEl = $state(null);
	let trayScrollPos = $state(0);
	let trayScrollMax = $state(0);

	function onTrayScroll() {
		if (!trayScrollerEl) return;
		trayScrollPos = Math.round(trayScrollerEl.scrollLeft);
		trayScrollMax = trayScrollerEl.scrollWidth - trayScrollerEl.clientWidth;
	}

	function scrollTray(direction) {
		if (!trayScrollerEl) return;
		const page = trayScrollerEl.clientWidth * 0.8;
		trayScrollerEl.scrollBy({ left: direction * page, behavior: 'smooth' });
	}

	$effect(() => {
		void trayApps;
		if (!trayScrollerEl) return;
		requestAnimationFrame(() => {
			trayScrollPos = Math.round(trayScrollerEl.scrollLeft);
			trayScrollMax = trayScrollerEl.scrollWidth - trayScrollerEl.clientWidth;
		});
	});

	// ── iOS-style edit state ────────────────────────────────────────
	// When set, every category card pulses and the next category click
	// places the picked app there. Cleared by Escape / outside click /
	// clicking the same tray item again.
	let pickedApp = $state(null);
	let pickedAnchor = null; // element we focused from, for Escape restore
	let dragHoverCatId = $state(null); // highlights drop target during DnD
	let announcerText = $state(''); // aria-live polite

	function slugify(label) {
		return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
	}

	function cloneLayout(layout) {
		return layout.map(c => ({ id: c.id, label: c.label, appIds: [...c.appIds] }));
	}

	function removeFromCategory(appId) {
		prefs.update(p => {
			const next = cloneLayout(p.categoryLayout || defaultLayout);
			for (const cat of next) {
				cat.appIds = cat.appIds.filter(id => id !== appId);
			}
			return { ...p, categoryLayout: next };
		});
	}

	function pickTrayApp(app, anchor) {
		if (pickedApp?.id === app.id) {
			cancelPickup();
			return;
		}
		pickedApp = app;
		pickedAnchor = anchor || null;
		announcerText = `Picked up ${app.name}. Select a category to place it.`;
	}

	function placeIntoCategory(catLabel) {
		if (!pickedApp) return;
		if (catLabel === 'Bookmarks') return; // bookmarks are untouchable
		const id = pickedApp.id;
		const placedName = pickedApp.name;
		prefs.update(p => {
			const next = cloneLayout(p.categoryLayout || defaultLayout);
			// Strip from any existing placement (cross-category move).
			for (const cat of next) {
				cat.appIds = cat.appIds.filter(x => x !== id);
			}
			let bucket = next.find(c => c.label === catLabel);
			if (!bucket) {
				bucket = { id: slugify(catLabel), label: catLabel, appIds: [] };
				next.push(bucket);
			}
			bucket.appIds.push(id);
			return { ...p, categoryLayout: next };
		});
		announcerText = `Placed ${placedName} in ${catLabel}.`;
		pickedApp = null;
		pickedAnchor = null;
	}

	function cancelPickup() {
		// Cancel any long-press timer and in-flight floating clone too,
		// so Escape / editMode-exit / unmount leave no stuck state.
		if (pendingDrag) {
			clearTimeout(pendingDrag.holdTimer);
			pendingDrag = null;
		}
		if (dragClone) { dragClone.remove(); dragClone = null; }
		dragApp = null;
		dragSourceLabel = null;
		dragHoverTray = false;
		dragHoverCatId = null;
		detachDragListeners();
		if (!pickedApp) return;
		const anchor = pickedAnchor;
		pickedApp = null;
		pickedAnchor = null;
		announcerText = 'Cancelled.';
		if (anchor?.focus) requestAnimationFrame(() => anchor.focus());
	}

	// Resize only the tiles whose appIds changed between layouts. Double-rAF
	// so the callback runs *after* Svelte has flushed the {#each} DOM update
	// for the category we just mutated — a single rAF measures stale DOM.
	function scheduleTileResize(changedIds) {
		if (!grid) return;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			if (!grid) return;
			for (const el of grid.getGridItems()) {
				const gsId = el.getAttribute('gs-id');
				if (!changedIds || changedIds.has(gsId)) grid.resizeToContent(el);
			}
		}));
	}

	// Auto-resize on layout mutation. On the first run (prev=null) we resize
	// every tile; on subsequent runs we diff previous vs. current layout and
	// only resize the categories whose appIds actually changed.
	let prevCatLayout = null;
	$effect(() => {
		const cur = categoryLayout;
		untrack(() => {
			if (!mounted || !grid) return;
			const prev = prevCatLayout;
			prevCatLayout = cur;
			if (!prev) { scheduleTileResize(null); return; }
			const changed = new Set();
			for (const c of cur || []) {
				const p = prev.find(x => x.label === c.label);
				if (!p || p.appIds.length !== c.appIds.length ||
					!p.appIds.every((id, i) => id === c.appIds[i])) changed.add(slugify(c.label));
			}
			for (const p of prev) {
				if (!(cur || []).find(c => c.label === p.label)) changed.add(slugify(p.label));
			}
			if (changed.size) scheduleTileResize(changed);
		});
	});

	// ── Pointer-based drag (smooth iOS-like icon follow) ─────────
	// pointerdown on any app (tray or placed) → floating clone follows
	// finger/cursor → hit-test categories + tray on move → pointerup
	// resolves placement (cross-category move, send-to-tray, or cancel).
	// Tray items use a long-press gate so short horizontal swipes scroll
	// the strip instead of accidentally starting a drag.
	let dragClone = null;
	let dragApp = null;
	let dragSourceLabel = null; // category label where drag started; null if from tray
	let dragHoverTray = $state(false);
	let pendingDrag = null; // { app, sourceLabel, target, pointerId, startX, startY, holdTimer }
	let dragListenersAttached = false;
	const LONG_PRESS_MS = 280;
	const MOVE_CANCEL_PX = 8;
	const CLONE_OFFSET = 20;

	function attachDragListeners() {
		if (dragListenersAttached) return;
		window.addEventListener('pointermove', onAppPointerMove);
		window.addEventListener('pointerup', onAppPointerUp);
		window.addEventListener('pointercancel', onAppPointerUp);
		dragListenersAttached = true;
	}

	function detachDragListeners() {
		if (!dragListenersAttached) return;
		window.removeEventListener('pointermove', onAppPointerMove);
		window.removeEventListener('pointerup', onAppPointerUp);
		window.removeEventListener('pointercancel', onAppPointerUp);
		dragListenersAttached = false;
	}

	function beginDrag(app, sourceLabel, target, pointerId, x, y) {
		if (dragApp) return; // another drag already in-flight — don't overwrite state
		try { target.setPointerCapture(pointerId); } catch {}
		dragApp = app;
		dragSourceLabel = sourceLabel ?? null;
		pickedApp = app;
		dragHoverCatId = null;
		dragHoverTray = false;
		const iconEl = target.querySelector('.app-icon-wrap');
		if (iconEl) {
			dragClone = iconEl.cloneNode(true);
			dragClone.classList.add('drag-clone');
			dragClone.style.left = `${x - CLONE_OFFSET}px`;
			dragClone.style.top = `${y - CLONE_OFFSET}px`;
			document.body.appendChild(dragClone);
		}
	}

	function onAppPointerDown(e, app, sourceLabel) {
		if (e.button && e.button !== 0) return; // left / primary only
		e.stopPropagation();

		// Listeners live on window for the duration of the gesture, so
		// the drag survives re-renders that would otherwise strip per-element
		// handlers (editMode flip, category reshuffle, etc.).
		attachDragListeners();

		// Category apps: drag begins immediately (no scroll to preserve).
		if (sourceLabel !== null) {
			e.preventDefault();
			beginDrag(app, sourceLabel, e.currentTarget, e.pointerId, e.clientX, e.clientY);
			return;
		}

		// Tray apps: wait for a long-press so horizontal swipes can still
		// scroll the strip. Cancel if the user moves past MOVE_CANCEL_PX
		// before the timer fires.
		const target = e.currentTarget;
		const pointerId = e.pointerId;
		pendingDrag = {
			app, sourceLabel, target, pointerId,
			startX: e.clientX, startY: e.clientY,
			holdTimer: setTimeout(() => {
				if (!pendingDrag) return;
				const p = pendingDrag; pendingDrag = null;
				beginDrag(p.app, p.sourceLabel, p.target, p.pointerId, p.startX, p.startY);
			}, LONG_PRESS_MS)
		};
	}

	function cancelPending() {
		if (!pendingDrag) return;
		clearTimeout(pendingDrag.holdTimer);
		pendingDrag = null;
		if (!dragApp) detachDragListeners();
	}

	function onAppPointerMove(e) {
		if (pendingDrag) {
			const dx = Math.abs(e.clientX - pendingDrag.startX);
			const dy = Math.abs(e.clientY - pendingDrag.startY);
			if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) cancelPending();
			return;
		}
		if (!dragClone) return;
		dragClone.style.left = `${e.clientX - 20}px`;
		dragClone.style.top = `${e.clientY - 20}px`;

		// Hit-test: tray first (to allow sending a placed app back), then categories.
		const underEl = document.elementFromPoint(e.clientX, e.clientY);
		if (underEl?.closest?.('.app-tray')) {
			dragHoverTray = !!dragSourceLabel; // only meaningful when the drag came from a category
			dragHoverCatId = null;
			return;
		}
		dragHoverTray = false;
		const card = underEl?.closest?.('.category-card');
		if (card) {
			const gsItem = card.closest('.grid-stack-item');
			const catId = gsItem?.getAttribute('gs-id');
			dragHoverCatId = catId || null;
		} else {
			dragHoverCatId = null;
		}
	}

	function onAppPointerUp(e) {
		if (pendingDrag) { cancelPending(); return; }
		if (!dragApp) { detachDragListeners(); return; }
		// Clean up the floating clone.
		if (dragClone) { dragClone.remove(); dragClone = null; }

		if (dragHoverTray && dragSourceLabel) {
			// Send a placed app back to the tray.
			removeFromCategory(dragApp.id);
			announcerText = `Moved ${dragApp.name} to the tray.`;
			pickedApp = null;
			pickedAnchor = null;
		} else if (dragHoverCatId && gridEl) {
			const layout = categoryLayout ?? defaultLayout;
			const entry = layout.find(c => slugify(c.label) === dragHoverCatId);
			if (entry && entry.label !== 'Bookmarks' && entry.label !== dragSourceLabel) {
				placeIntoCategory(entry.label);
			}
		}

		dragHoverCatId = null;
		dragHoverTray = false;
		dragApp = null;
		dragSourceLabel = null;
		detachDragListeners();
		// pickedApp is cleared by placeIntoCategory / tray drop, or we cancel:
		if (pickedApp) cancelPickup();
	}

	// Global Escape + outside-click cancel while a pickup is active.
	$effect(() => {
		if (!browser || !editMode || !pickedApp) return;
		const onKey = (e) => { if (e.key === 'Escape') cancelPickup(); };
		const onClick = (e) => {
			if (gridEl?.contains(e.target)) return;
			if (e.target.closest?.('.app-tray')) return;
			cancelPickup();
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('click', onClick, true);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('click', onClick, true);
		};
	});

	// Default width: 1 column per app on desktop, compact on mobile
	function defaultWidth(appCount, mobile = false) {
		if (mobile) {
			// Mobile: 4 cols total, default w:2, w:4 if >6 apps
			return appCount > 6 ? 4 : 2;
		}
		// Desktop: 1 col per app, min 2, max 12
		return Math.min(Math.max(appCount, 2), 12);
	}

	// Save layout keyed by column count: { "4": [...], "6": [...], "12": [...] }
	function saveLayout() {
		if (!grid) return;
		const cols = grid.getColumn();
		const items = grid.getGridItems();
		const layout = items.map(el => {
			const node = el.gridstackNode;
			if (!node) return null;
			return {
				id: el.getAttribute('gs-id'),
				x: node.x, y: node.y,
				w: node.w, h: node.h
			};
		}).filter(Boolean);
		prefs.update(p => {
			const layouts = (typeof p.gridLayouts === 'object' && p.gridLayouts) ? { ...p.gridLayouts } : {};
			layouts[cols] = layout;
			return { ...p, gridLayouts: layouts };
		});
	}

	// Get saved layout for current column count
	function getSavedLayout(cols) {
		const layouts = $prefs.gridLayouts;
		if (!layouts || typeof layouts !== 'object') return [];
		const layout = layouts[cols];
		return Array.isArray(layout) ? layout : [];
	}

	// Apply the saved per-column layout, or compute sensible defaults
	// for the current column count if nothing is saved yet.
	let lastAppliedCol = null;
	function applyLayoutForColumn(cols) {
		if (!grid || !gridEl) return;
		lastAppliedCol = cols;
		const savedLayout = getSavedLayout(cols);
		const isMobile = cols <= 4;

		grid.batchUpdate();
		if (savedLayout.length) {
			for (const item of savedLayout) {
				const el = gridEl.querySelector(`[gs-id="${item.id}"]`);
				if (!el) continue;
				grid.update(el, { x: item.x, y: item.y, w: item.w, h: item.h });
				const inner = el.querySelector('.app-grid-inner');
				if (inner) inner.style.setProperty('--cols', item.w);
				categoryCols[item.id] = item.w;
			}
		} else {
			// No saved layout for this breakpoint — recompute widths
			// using the column-aware default so mobile isn't stuck with
			// desktop widths (and vice versa).
			for (const el of grid.getGridItems()) {
				const inner = el.querySelector('.app-grid-inner');
				const appCount = inner?.querySelectorAll(':scope > a').length || 0;
				const w = Math.min(defaultWidth(appCount, isMobile), cols);
				grid.update(el, { w });
				if (inner) inner.style.setProperty('--cols', w);
				const gsId = el.getAttribute('gs-id');
				if (gsId) categoryCols[gsId] = w;
			}
		}
		grid.batchUpdate(false);

		requestAnimationFrame(() => {
			if (!grid) return;
			for (const el of grid.getGridItems()) grid.resizeToContent(el);
		});
	}

	async function initGrid(isCancelled) {
		if (!gridEl || grid) return;
		const { GridStack } = await import('gridstack');
		// Bail if the component unmounted during the dynamic import
		// (i.e. on rapid SPA navigation away from the dashboard).
		if (isCancelled?.() || !gridEl?.isConnected) return;

		grid = GridStack.init({
			column: 12,
			cellHeight: 1,
			sizeToContent: true,
			// float: false — tiles cannot sit below empty rows;
			// they auto-float up during drag. Keeps horizontal
			// placement but enforces vertical compaction live.
			float: false,
			animate: true,
			handle: '.gs-drag-handle',
			disableResize: true,
			disableDrag: true,
			margin: 7,
			columnOpts: {
				breakpointForWindow: true,
				breakpoints: [
					{ w: 768, c: 4 },
					{ w: 1024, c: 6 },
					{ w: 1200, c: 12 },
				]
			}
		}, gridEl);

		// Apply saved positions for the current column count.
		// `lastAppliedCol` tracks which breakpoint we've restored for, so
		// crossing a breakpoint on window resize re-applies the right layout.
		applyLayoutForColumn(grid.getColumn());

		// Save only on explicit user actions. 'change' fires for gridstack's
		// own cascade during breakpoint transitions too, which would
		// overwrite the saved per-column layout with auto-scaled values.
		grid.on('dragstop', () => saveLayout());
		grid.on('resizestop', () => saveLayout());

		// Keep --cols in sync with the tile's live `w` during drag. The CSS
		// variable write is ~free and runs every event; the expensive
		// `resizeToContent` (forced layout read + write) is coalesced to
		// one call per animation frame to avoid layout thrash on weak CPUs.
		const pendingResize = new WeakSet();
		grid.on('resize', (_event, el) => {
			if (!el) return;
			const newW = el.gridstackNode?.w;
			if (!newW) return;
			const inner = (el._innerCache ??= el.querySelector('.app-grid-inner'));
			if (inner) inner.style.setProperty('--cols', newW);
			const gsId = el.getAttribute('gs-id');
			if (gsId) categoryCols[gsId] = newW;
			if (pendingResize.has(el)) return;
			pendingResize.add(el);
			requestAnimationFrame(() => {
				pendingResize.delete(el);
				if (!grid || !el.isConnected) return;
				grid.resizeToContent(el);
			});
		});

		grid.on('resizestop', (_event, el) => {
			if (!el) return;
			const newW = el.gridstackNode?.w;
			if (newW) {
				const inner = (el._innerCache ??= el.querySelector('.app-grid-inner'));
				if (inner) inner.style.setProperty('--cols', newW);
				const gsId = el.getAttribute('gs-id');
				if (gsId) categoryCols[gsId] = newW;
			}
			requestAnimationFrame(() => {
				if (!grid || !el.isConnected) return;
				grid.resizeToContent(el);
			});
		});

		// Re-apply the per-column saved layout when crossing a breakpoint.
		// Gridstack's built-in cascade runs on the old widths; we need to
		// layer our column-specific layout on top after it settles.
		let resizeTimer = null;
		const onWindowResize = () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (!grid) return;
				const cols = grid.getColumn();
				if (cols !== lastAppliedCol) applyLayoutForColumn(cols);
			}, 150);
		};
		window.addEventListener('resize', onWindowResize);
		cleanupGridListeners = () => {
			window.removeEventListener('resize', onWindowResize);
			clearTimeout(resizeTimer);
		};
	}

	// React to editMode transitions regardless of who flipped the flag
	// (inline Done button, gear-menu entry, future long-press, etc.)
	let prevEditMode = false;
	$effect(() => {
		const current = editMode;
		untrack(() => {
			if (current === prevEditMode) return;
			const leaving = !current && prevEditMode;
			prevEditMode = current;

			if (leaving) {
				cancelPickup(); // abort any in-flight drag / pending long-press
				if (grid && categoryLayout) {
					for (const el of [...grid.getGridItems()]) {
						const gsId = el.getAttribute('gs-id');
						const entry = categoryLayout.find(c => slugify(c.label) === gsId);
						if (entry && entry.appIds.length === 0) {
							grid.removeWidget(el, false);
						}
					}
					saveLayout();
				}
			}

			if (grid) {
				grid.enableMove(false);
				grid.enableResize(false);
				if (current) {
					// Keep handle restricted to `.gs-drag-handle` (the category legend)
					// so category tiles move from the header only. App-level drag is
					// handled by our custom pointer logic directly on the app icons.
					grid.enableMove(true);
					grid.enableResize(true);
				}
			}
		});
	});

	onMount(() => {
		mounted = true;

		const ua = navigator.userAgent;
		if (/iPad|iPhone|iPod/.test(ua)) platform = 'ios';
		else if (/Android/.test(ua)) platform = 'android';

		const dismiss = (e) => {
			if (contextMenuEl && !contextMenuEl.contains(e.target)) contextApp = null;
		};
		window.addEventListener('click', dismiss);

		// Init GridStack after Svelte has rendered the DOM.
		// `cancelled` guards against the component unmounting before either the
		// outer rAF or the dynamic `import('gridstack')` inside initGrid resolves —
		// without it we'd wire listeners to a DOM node Svelte already detached.
		let cancelled = false;
		requestAnimationFrame(() => { if (!cancelled) initGrid(() => cancelled); });

		return () => {
			cancelled = true;
			window.removeEventListener('click', dismiss);
			// Tear down any in-flight drag/pending so we don't leave a
			// floating clone or timer alive after the component unmounts.
			cancelPickup();
			cleanupGridListeners?.();
			cleanupGridListeners = null;
			if (grid) {
				grid.destroy(false);
				grid = null;
			}
		};
	});

	function showContext(app, e) {
		e.preventDefault();
		e.stopPropagation();
		contextAnchor = e.currentTarget;
		contextApp = app;
	}

	// Position context menu relative to anchor element after render
	$effect(() => {
		if (contextMenuEl && contextApp && contextAnchor) {
			contextMenuEl.style.left = '0px';
			contextMenuEl.style.top = '0px';

			requestAnimationFrame(() => {
				if (!contextMenuEl || !contextAnchor) return;
				const anchorRect = contextAnchor.getBoundingClientRect();
				const menuRect = contextMenuEl.getBoundingClientRect();
				const vw = window.innerWidth;
				const vh = window.innerHeight;
				const pad = 8;

				let x = anchorRect.right;
				let y = anchorRect.bottom + 4;

				if (x + menuRect.width > vw - pad) x = anchorRect.left - menuRect.width;
				if (x < pad) x = pad;
				if (y + menuRect.height > vh - pad) y = anchorRect.top - menuRect.height - 4;
				if (y < pad) y = pad;

				contextMenuEl.style.left = `${x}px`;
				contextMenuEl.style.top = `${y}px`;
				contextMenuEl.style.visibility = 'visible';
			});
		}
	});

	function startLongPress(app, e) {
		const target = e.currentTarget;
		longPressTimer = setTimeout(() => {
			e.preventDefault();
			contextAnchor = target;
			contextApp = app;
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function openGuide(app) {
		contextApp = null;
		guideApp = app;
	}

	function resetLayout() {
		if (!grid) return;
		// Use gridstack's own column count so this stays in sync if the
		// columnOpts breakpoints ever shift.
		const cols = grid.getColumn();
		const isMobile = cols <= 4;
		const maxCols = cols;

		const items = grid.getGridItems();

		const cats = items.map(el => {
			const inner = el.querySelector('.app-grid-inner');
			const appCount = inner?.querySelectorAll(':scope > a').length || 0;
			return { el, appCount };
		});

		// Mobile: smallest first (compact categories shown first)
		// Desktop: largest first (better Tetris packing)
		if (isMobile) {
			cats.sort((a, b) => a.appCount - b.appCount);
		} else {
			cats.sort((a, b) => b.appCount - a.appCount);
		}

		// Two-pass packing:
		// Pass 1: try preferred width (1-row on desktop, 2-col on mobile)
		// Pass 2: for anything that didn't fit, use compact layout
		const rows = [];
		const deferred = [];

		for (const cat of cats) {
			const w1 = defaultWidth(cat.appCount, isMobile);
			let placed = false;

			for (const row of rows) {
				if (row.used + w1 <= maxCols) {
					cat.x = row.used;
					cat.w = w1;
					cat.rowIdx = rows.indexOf(row);
					row.used += w1;
					placed = true;
					break;
				}
			}

			if (!placed) {
				// Start a new row if this category fits as 1-row
				if (w1 <= maxCols) {
					cat.x = 0;
					cat.w = w1;
					cat.rowIdx = rows.length;
					rows.push({ used: w1 });
				} else {
					deferred.push(cat);
				}
			}
		}

		// Pass 2: pack deferred items using 2-row layout
		for (const cat of deferred) {
			const w2 = Math.max(Math.ceil(cat.appCount / 2), 2);
			let placed = false;

			for (const row of rows) {
				if (row.used + w2 <= maxCols) {
					cat.x = row.used;
					cat.w = w2;
					cat.rowIdx = rows.indexOf(row);
					row.used += w2;
					placed = true;
					break;
				}
			}

			if (!placed) {
				cat.x = 0;
				cat.w = w2;
				cat.rowIdx = rows.length;
				rows.push({ used: w2 });
			}
		}

		// Apply layout — `y` uses a large row sentinel (rowIdx * 500) so tiles
		// are placed into distinct gridstack rows during the batch; the final
		// `compact()` below collapses them down to actual content positions.
		grid.batchUpdate();
		for (const cat of cats) {
			grid.update(cat.el, { x: cat.x, y: cat.rowIdx * 500, w: cat.w, h: 1 });
			const inner = cat.el.querySelector('.app-grid-inner');
			if (inner) inner.style.setProperty('--cols', cat.w);
		}
		grid.batchUpdate(false);

		// sizeToContent + compact after DOM reflows
		requestAnimationFrame(() => {
			if (!grid) return;
			for (const el of grid.getGridItems()) {
				grid.resizeToContent(el);
			}
			grid.compact();
			saveLayout();
		});
	}

	function iconUrl(icon) { return getIconSrc(iconStyle, icon); }
	function iconClass(icon) { return getIconClass(iconStyle, icon); }
</script>

<!-- Fixed-height slot shared by SearchBar and the edit-mode tray. -->
{#if searchEnabled || editMode}
	{@const canScrollLeft = trayScrollPos > 0}
	{@const canScrollRight = trayScrollPos < trayScrollMax}
	<div class="edit-slot">
		{#if searchEnabled}
			<div class="edit-slot-pane {editMode ? 'is-hidden' : ''}" aria-hidden={editMode}>
				<SearchBar bind:query={searchInput} apps={allAppsArr} onEditLayout={() => editMode = true} />
			</div>
		{/if}
		<div class="edit-slot-pane edit-slot-tray {editMode ? '' : 'is-hidden'}" aria-hidden={!editMode}>
			<div class="app-tray {dragHoverTray ? 'tray-drop-hover' : ''}" role="toolbar" aria-label="Unplaced apps">
				{#if trayApps.length === 0}
					<div class="app-tray-empty flex-1">Everything placed. Click × on an app to move it here.</div>
				{:else}
					{#if canScrollLeft}
						<button class="app-tray-arrow" aria-label="Scroll left" onclick={() => scrollTray(-1)}>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
						</button>
					{/if}
					<div class="app-tray-fade {canScrollLeft ? 'fade-left' : ''} {canScrollRight ? 'fade-right' : ''}">
						<div class="app-tray-scroller" bind:this={trayScrollerEl} onscroll={onTrayScroll}>
							{#each trayApps as app (app.id)}
								<button
									type="button"
									class="app-tray-item {pickedApp?.id === app.id ? 'app-tray-item-selected' : ''}"
									aria-label="Move {app.name} to a category"
									title={app.name}
									aria-pressed={pickedApp?.id === app.id}
									onpointerdown={(e) => onAppPointerDown(e, app, null)}
									onclick={(e) => { e.stopPropagation(); pickTrayApp(app, e.currentTarget); }}
								>
									<div class="app-icon-wrap w-9 h-9 rounded-[10px] flex items-center justify-center relative overflow-hidden" style={iconStyle === 'colored' ? getBrandBgStyle(app.icon) : ''}>
										<AppIcon icon={app.icon} name={app.name} size="w-[18px] h-[18px]" {iconStyle} />
									</div>
								</button>
							{/each}
						</div>
					</div>
					{#if canScrollRight}
						<button class="app-tray-arrow" aria-label="Scroll right" onclick={() => scrollTray(1)}>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
						</button>
					{/if}
				{/if}
				<div class="app-tray-actions">
					<button onclick={resetLayout} class="app-tray-reset" aria-label="Reset layout to default" title="Reset layout to default">Reset</button>
					<button onclick={() => { editMode = false; }} class="app-tray-done" aria-label="Done editing">Done</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- aria-live announcer for pickup / place / cancel -->
<div class="sr-only" aria-live="polite" aria-atomic="true">{announcerText}</div>

<!-- GridStack container -->
<div bind:this={gridEl} class="grid-stack mb-4 {editMode ? 'grid-edit-mode' : ''} {pickedApp ? 'picking' : ''}">
	{#each renderCategories as category (category.label)}
		{@const catId = slugify(category.label)}
		{@const w = categoryCols[catId] ?? defaultWidth(Math.max(category.apps.length, 2))}
		{@const isBookmarks = category.label === 'Bookmarks'}
		<div class="grid-stack-item"
			gs-id={catId}
			gs-w={w}
			gs-x={undefined}
			gs-y={undefined}
			gs-min-w="2"
			gs-min-h="1"
		>
			<div class="grid-stack-item-content">
				<fieldset
					class="category-card rounded-2xl py-4 px-1 {editMode ? 'category-card-edit' : ''} {dragHoverCatId === catId ? 'drop-target-hover' : ''} relative"
				>
					<legend class="gs-drag-handle text-[0.65rem] text-content-muted tracking-wide px-2">{category.label}</legend>
					{#if editMode}
						{#if dragHoverCatId === catId && pickedApp && !isBookmarks}
							<div
								class="drop-overlay"
								role="button"
								aria-label="Place {pickedApp.name} in {category.label}"
								onclick={(e) => { e.stopPropagation(); placeIntoCategory(category.label); }}
							>
								<div class="drop-overlay-icon" style={iconStyle === 'colored' ? getBrandBgStyle(pickedApp.icon) : ''}>
									<AppIcon icon={pickedApp.icon} name={pickedApp.name} size="w-5 h-5" {iconStyle} />
								</div>
								<span class="drop-overlay-text">Drop here</span>
							</div>
						{:else if pickedApp && !isBookmarks && pickedApp.id !== dragApp?.id}
							<div
								class="edit-overlay"
								role="button"
								aria-label="Place {pickedApp.name} in {category.label}"
								onclick={(e) => { e.stopPropagation(); placeIntoCategory(category.label); }}
							></div>
						{/if}
					{/if}
					{#if editMode && category.apps.length === 0}
						<div class="app-grid-empty" aria-hidden="true">Drop here</div>
					{:else}
						<div class="app-grid-inner" style="--cols: {w}">
							{#each category.apps as app (app.id)}
								<a
									href={editMode ? undefined : app.url}
									target={openInNewTab && !editMode ? '_blank' : undefined}
									rel={openInNewTab && !editMode ? 'noopener noreferrer' : undefined}
									class="group relative flex flex-col items-center gap-2 no-underline w-full {editMode && !isBookmarks ? 'app-draggable' : ''}"
									oncontextmenu={editMode ? undefined : (e) => showContext(app, e)}
									ontouchstart={editMode ? undefined : (e) => startLongPress(app, e)}
									ontouchend={editMode ? undefined : cancelLongPress}
									ontouchmove={editMode ? undefined : cancelLongPress}
									onpointerdown={editMode && !isBookmarks ? (e) => onAppPointerDown(e, app, category.label) : undefined}
								>
									<div class="app-icon-wrap w-11 h-11 rounded-[12px] max-md:w-12 max-md:h-12 max-md:rounded-[14px] flex items-center justify-center transition-opacity duration-150 group-hover:opacity-85 relative overflow-hidden" style={iconStyle === 'colored' ? getBrandBgStyle(app.icon) : ''}>
										{#key app.id}
											<AppIcon icon={app.icon} name={app.name} size="w-6 h-6 max-md:w-7 max-md:h-7" {iconStyle} />
										{/key}
									</div>
									<span class="text-[0.65rem] font-medium text-center transition-colors duration-150 group-hover:text-content leading-tight w-full truncate text-content-muted">{app.name}</span>
									{#if editMode && !isBookmarks}
										<button
											type="button"
											class="app-remove-x"
											aria-label="Remove {app.name} from dashboard"
											onclick={(e) => { e.preventDefault(); e.stopPropagation(); removeFromCategory(app.id); }}
										>×</button>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				</fieldset>
			</div>
		</div>
	{/each}
</div>

<!-- Context menu (portal to body to escape transform containing block) -->
{#if contextApp}
	<div
		bind:this={contextMenuEl}
		use:portal
		class="fixed z-50 glass-card rounded-xl py-1.5 shadow-theme min-w-[200px] animate-context-in"
		style="visibility: hidden;"
		role="menu"
	>
		{#if contextApp.ios}
			<a href={contextApp.ios} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">&#63743;</span> Download for iOS
			</a>
		{/if}
		{#if contextApp.android}
			<a href={contextApp.android} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">&#9654;</span> Download for Android
			</a>
		{/if}
		{#if contextApp.extension}
			<a href={contextApp.extension} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">&#8862;</span> Browser Extension
			</a>
		{/if}
		{#if setupGuides[contextApp.name]}
			{#if contextApp.ios || contextApp.android || contextApp.extension}
				<div class="border-t border-border-card my-1"></div>
			{/if}
			<button onclick={() => openGuide(contextApp)} class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors w-full text-left font-mono" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">?</span> Setup Guide
			</button>
		{/if}
		<div class="border-t border-border-card my-1"></div>
		<a href={contextApp.url} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
			<span class="text-content-muted text-xs w-4 text-center">&#8599;</span> Open {contextApp.name}
		</a>
	</div>
{/if}

<!-- Setup Guide Modal (portal to body) -->
{#if guideApp && setupGuides[guideApp.name]}
	{@const guide = setupGuides[guideApp.name]}
	<div use:portal class="fixed inset-0 bg-surface-overlay backdrop-blur-[6px] flex items-center justify-center z-[100] p-4 animate-fade-in" onclick={() => guideApp = null}>
		<div class="glass-card rounded-2xl w-full max-w-[480px] overflow-hidden animate-modal-enter shadow-theme relative" onclick={(e) => e.stopPropagation()}>
			<button class="absolute top-4 right-5 bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content z-10" onclick={() => guideApp = null}>&times;</button>

			<!-- Header with icon color glow -->
			<div class="p-8 pb-6">
				<div class="flex items-center gap-3.5 mb-1">
					<div class="app-icon-wrap w-12 h-12 rounded-[14px] flex items-center justify-center relative overflow-hidden shrink-0">
						{#if iconStyle === 'colored' && guideApp.icon?.colored}
							<img src={guideApp.icon.colored} alt="" class="absolute inset-0 w-full h-full scale-150 blur-xl opacity-40 pointer-events-none" />
						{/if}
						<AppIcon icon={guideApp.icon} name={guideApp.name} size="w-7 h-7" {iconStyle} className={iconStyle === 'colored' ? 'relative z-10' : ''} />
					</div>
					<div>
						<h3 class="text-[1.2rem] font-semibold text-content m-0">{guide.title}</h3>
						<p class="text-[0.8rem] text-content-dim m-0">{guide.subtitle}</p>
					</div>
				</div>
			</div>

			<!-- Steps -->
			<div class="px-8 pb-4 max-h-[300px] overflow-y-auto">
				{#each guide.steps as step, i}
					<div class="flex gap-3.5 {i < guide.steps.length - 1 ? 'mb-5' : ''}">
						<div class="flex flex-col items-center">
							<span class="w-7 h-7 rounded-full bg-surface-card-strong text-[0.75rem] font-semibold text-content-muted flex items-center justify-center shrink-0">{i + 1}</span>
							{#if i < guide.steps.length - 1}
								<div class="w-px flex-1 bg-surface-card mt-2"></div>
							{/if}
						</div>
						<div class="pt-0.5 pb-1">
							<p class="text-[0.9rem] text-content font-medium m-0">{step.label}</p>
							<p class="text-[0.8rem] text-content-dim m-0 mt-1 leading-relaxed">{step.desc}</p>
						</div>
					</div>
				{/each}
			</div>

			<!-- Server URL -->
			<div class="mx-8 mb-5 px-4 py-2.5 glass-card rounded-xl">
				<span class="text-[0.65rem] text-content-dim uppercase tracking-[0.15em]">Server URL</span>
				<p class="text-[0.85rem] text-content-muted font-mono m-0 mt-0.5">{guideApp.url}</p>
			</div>

			<!-- Actions -->
			<div class="px-8 pb-8 flex gap-2.5">
				{#if guideApp.ios}
					<a href={guideApp.ios} target="_blank" rel="noopener noreferrer" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[10px] text-[0.85rem] font-medium font-mono text-center no-underline bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong transition-colors">
						<img src="/icons/appstore.svg" alt="" class="w-4 h-4 icon-white" /> App Store
					</a>
				{/if}
				{#if guideApp.android}
					<a href={guideApp.android} target="_blank" rel="noopener noreferrer" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[10px] text-[0.85rem] font-medium font-mono text-center no-underline bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong transition-colors">
						<img src="/icons/googleplay.svg" alt="" class="w-4 h-4 icon-white" /> Play Store
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}
