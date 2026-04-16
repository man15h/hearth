<script>
	import { onMount, getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { adminApps as adminAppsStore } from '$lib/stores/adminApps.js';
	import { buildAppsFromConfig, resolveIcon } from '$lib/apps.js';
	import { getIconSrc, getIconClass, handleIconError, getBrandBgStyle, getBrandIconClass } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	import { browser } from '$app/environment';

	const siteConfig = getContext('config');
	const { categories, defaultAppIds, setupGuides } = buildAppsFromConfig(siteConfig?.apps);

	let { isAdmin = false, guideApp = $bindable(null), search = '' } = $props();
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

	const visibleCategories = $derived.by(() => {
		const filtered = categories
			.map(cat => ({
				...cat,
				apps: cat.apps.filter(app => {
					if (app.adminOnly && !isAdmin) return false;
					if (!mounted) return app.default !== false;
					return visibleAppIds.includes(app.id);
				})
			}))
			.filter(cat => cat.apps.length > 0);

		// Merge admin-added apps
		for (const ac of adminCategories) {
			const visibleApps = ac.apps.filter(a => visibleAppIds.includes(a.id));
			if (!visibleApps.length) continue;
			const existing = filtered.find(c => c.label === ac.label);
			if (existing) existing.apps.push(...visibleApps);
			else filtered.push({ label: ac.label, apps: visibleApps });
		}

		if (bookmarksCategory) filtered.push(bookmarksCategory);
		return filtered;
	});

	// Search: flat list of matching apps across all categories
	const searchQuery = $derived(search.trim().toLowerCase());
	const searchResults = $derived.by(() => {
		if (!searchQuery) return null;
		const matches = [];
		for (const cat of visibleCategories) {
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
	let editMode = $state(false);

	function slugify(label) {
		return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
	}

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
			}
		}
		grid.batchUpdate(false);

		requestAnimationFrame(() => {
			if (!grid) return;
			for (const el of grid.getGridItems()) grid.resizeToContent(el);
		});
	}

	async function initGrid() {
		if (!gridEl || grid) return;
		const { GridStack } = await import('gridstack');

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

		// Keep --cols in sync with the tile's live `w` during drag, so icons
		// reflow into the new column count via pure CSS grid. One CSS var
		// write per event is effectively free — no Svelte re-render, no
		// per-app JS. We let sizeToContent recompute height only on stop.
		grid.on('resize', (_event, el) => {
			if (!el) return;
			const newW = el.gridstackNode?.w;
			if (!newW) return;
			const inner = el.querySelector('.app-grid-inner');
			if (inner) inner.style.setProperty('--cols', newW);
			// Re-measure content height live so the tile grows/shrinks vertically
			// as rows are added/removed during the drag.
			grid.resizeToContent(el);
		});

		grid.on('resizestop', (_event, el) => {
			if (!el) return;
			const newW = el.gridstackNode?.w;
			if (newW) {
				const inner = el.querySelector('.app-grid-inner');
				if (inner) inner.style.setProperty('--cols', newW);
			}
			requestAnimationFrame(() => grid.resizeToContent(el));
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
		grid._claudeCleanup = () => {
			window.removeEventListener('resize', onWindowResize);
			clearTimeout(resizeTimer);
		};
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (grid) {
			// Destroy and re-enable drag with updated handle
			grid.enableMove(false);
			grid.enableResize(false);
			if (editMode) {
				grid.opts.handle = null; // drag from anywhere
				grid.enableMove(true);
				grid.enableResize(true);
			}
		}
	}

	onMount(() => {
		mounted = true;

		const ua = navigator.userAgent;
		if (/iPad|iPhone|iPod/.test(ua)) platform = 'ios';
		else if (/Android/.test(ua)) platform = 'android';

		const dismiss = (e) => {
			if (contextMenuEl && !contextMenuEl.contains(e.target)) contextApp = null;
		};
		window.addEventListener('click', dismiss);

		// Init GridStack after Svelte has rendered the DOM
		requestAnimationFrame(() => initGrid());

		return () => {
			window.removeEventListener('click', dismiss);
			if (grid) {
				grid._claudeCleanup?.();
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
		const isMobile = window.innerWidth < 1024;
		const maxCols = isMobile ? 4 : 12;

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

		// Apply layout
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

<!-- Edit mode toggle -->
<div class="flex justify-end gap-2 mt-4 mb-2">
	{#if editMode}
		<button
			onclick={resetLayout}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.7rem] font-medium transition-all duration-150 border bg-transparent text-content-dim border-transparent hover:text-content-muted hover:border-border-card"
		>
			<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
			Reset
		</button>
	{/if}
	<button
		onclick={toggleEditMode}
		class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.7rem] font-medium transition-all duration-150 border {editMode ? 'bg-surface-card-strong text-content border-border-card' : 'bg-transparent text-content-dim border-transparent hover:text-content-muted hover:border-border-card'}"
	>
		{#if editMode}
			<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
			Done
		{:else}
			<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
			Edit layout
		{/if}
	</button>
</div>

<!-- GridStack container -->
<div bind:this={gridEl} class="grid-stack mb-4 {editMode ? 'grid-edit-mode' : ''}">
	{#each visibleCategories as category (category.label)}
		{@const catId = slugify(category.label)}
		{@const w = defaultWidth(category.apps.length)}
		<div class="grid-stack-item"
			gs-id={catId}
			gs-w={w}
			gs-x={undefined}
			gs-y={undefined}
			gs-min-w="2"
			gs-min-h="1"
		>
			<div class="grid-stack-item-content">
				<fieldset class="category-card rounded-2xl py-4 px-1 {editMode ? 'category-card-edit' : ''} relative">
					<legend class="gs-drag-handle text-[0.65rem] text-content-muted tracking-wide px-2">{category.label}</legend>
					{#if editMode}
						<div class="edit-overlay"></div>
					{/if}
					<div class="app-grid-inner" style="--cols: {w}">
						{#each category.apps as app (app.id)}
							<a
								href={editMode ? undefined : app.url}
								target={openInNewTab && !editMode ? '_blank' : undefined}
								rel={openInNewTab && !editMode ? 'noopener noreferrer' : undefined}
								class="group relative flex flex-col items-center gap-2 no-underline w-full {editMode ? 'pointer-events-none' : ''}"
								oncontextmenu={editMode ? undefined : (e) => showContext(app, e)}
								ontouchstart={editMode ? undefined : (e) => startLongPress(app, e)}
								ontouchend={editMode ? undefined : cancelLongPress}
								ontouchmove={editMode ? undefined : cancelLongPress}
							>
								<div class="app-icon-wrap w-11 h-11 rounded-[12px] max-md:w-12 max-md:h-12 max-md:rounded-[14px] flex items-center justify-center transition-opacity duration-150 group-hover:opacity-85 relative overflow-hidden" style={iconStyle === 'colored' ? getBrandBgStyle(app.icon) : ''}>
									{#key app.id}
										<AppIcon icon={app.icon} name={app.name} size="w-6 h-6 max-md:w-7 max-md:h-7" {iconStyle} />
									{/key}
								</div>
								<span class="text-[0.65rem] font-medium text-center transition-colors duration-150 group-hover:text-content leading-tight w-full truncate text-content-muted">{app.name}</span>
							</a>
						{/each}
					</div>
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
