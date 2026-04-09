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
	onMount(() => { mounted = true; });

	const visibleCategories = $derived.by(() => {
		const filtered = categories
			.map(cat => ({
				...cat,
				apps: cat.apps.filter(app => {
					if (app.adminOnly && !isAdmin) return false;
					// Before mount (SSR), show defaults. After mount, use user prefs.
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
	let contextAnchor = $state(null); // the DOM element that triggered the menu
	let contextMenuEl = $state(null);
	let longPressTimer = null;


	onMount(() => {
		const ua = navigator.userAgent;
		if (/iPad|iPhone|iPod/.test(ua)) platform = 'ios';
		else if (/Android/.test(ua)) platform = 'android';

		const dismiss = (e) => {
			if (contextMenuEl && !contextMenuEl.contains(e.target)) contextApp = null;
		};
		window.addEventListener('click', dismiss);
		return () => window.removeEventListener('click', dismiss);
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
			// Reset position so the menu renders at its natural size
			contextMenuEl.style.left = '0px';
			contextMenuEl.style.top = '0px';

			// Use requestAnimationFrame to measure after layout
			requestAnimationFrame(() => {
				if (!contextMenuEl || !contextAnchor) return;
				const anchorRect = contextAnchor.getBoundingClientRect();
				const menuRect = contextMenuEl.getBoundingClientRect();
				const vw = window.innerWidth;
				const vh = window.innerHeight;
				const pad = 8;

				// Default: bottom-right of the icon
				let x = anchorRect.right;
				let y = anchorRect.bottom + 4;

				// If overflows right, flip to left side
				if (x + menuRect.width > vw - pad) x = anchorRect.left - menuRect.width;
				// If overflows left, clamp to left edge
				if (x < pad) x = pad;

				// If overflows bottom, flip above the icon
				if (y + menuRect.height > vh - pad) y = anchorRect.top - menuRect.height - 4;
				// If overflows top, clamp to top edge
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

	function iconUrl(icon) { return getIconSrc(iconStyle, icon); }
	function iconClass(icon) { return getIconClass(iconStyle, icon); }

</script>

<!-- Spotlight search dropdown with scrim over grid -->
{#if searchResults}
	<!-- Results card floating above grid, full width to match search bar -->
	<div class="absolute left-0 right-0 top-0 z-40">
		<div class="rounded-2xl shadow-theme max-h-[50vh] overflow-y-auto" style="background: var(--modal-bg); border: 1px solid var(--modal-card-border);">
			{#if searchResults.length > 0}
				<div class="flex flex-col gap-0.5 p-2">
					{#each searchResults as app (app.id)}
						<a
							href={app.url}
							target="_blank"
							rel="noopener noreferrer"
							class="group flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline hover:bg-surface-card-hover transition-colors"
						>
							<div class="app-icon-wrap w-9 h-9 rounded-[10px] flex items-center justify-center relative overflow-hidden shrink-0" style={iconStyle === 'colored' ? getBrandBgStyle(app.icon) : ''}>
								{#key app.id}
									<AppIcon icon={app.icon} name={app.name} size="w-5 h-5" {iconStyle} />
								{/key}
							</div>
							<div class="flex flex-col min-w-0">
								<span class="text-[0.8rem] text-content-muted group-hover:text-content transition-colors">{app.name}</span>
								<span class="text-[0.65rem] text-content-dim/50 truncate">{app.subtitle || app.url.replace(/^https?:\/\//, '')}</span>
							</div>
							<span class="ml-auto text-[0.6rem] text-content-dim/50 shrink-0">&nearr;</span>
						</a>
					{/each}
				</div>
			{:else}
				<div class="py-6 text-center text-[0.8rem] text-content-dim">No apps match "{search}"</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Normal grid view -->
<div class="grid grid-cols-3 gap-3.5 mt-4 mb-4 max-lg:grid-cols-2">
		{#each visibleCategories as category (category.label)}
			<fieldset class="category-card rounded-2xl p-5 max-md:p-4">
				<legend class="text-[0.65rem] text-content-muted tracking-wide px-2">{category.label}</legend>
				<div class="grid grid-cols-4 gap-y-4 max-md:grid-cols-2">
					{#each category.apps as app (app.id)}
						<a
							href={app.url}
							target="_blank"
							rel="noopener noreferrer"
							class="group relative flex flex-col items-center gap-2 no-underline w-full"
							oncontextmenu={(e) => showContext(app, e)}
							ontouchstart={(e) => startLongPress(app, e)}
							ontouchend={cancelLongPress}
							ontouchmove={cancelLongPress}
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

