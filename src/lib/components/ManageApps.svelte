<script>
	import { getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { adminApps as adminAppsStore } from '$lib/stores/adminApps.js';
	import { buildAppsFromConfig, resolveIcon } from '$lib/apps.js';
	import { getIconSrc, getIconClass, handleIconError } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';
	import IntegrationsPanel from '$lib/components/IntegrationsPanel.svelte';
	import { appDirectory } from '$lib/appDirectory.js';
	import { TOTAL_WALLPAPERS, getWallpaperThumbUrl } from '$lib/wallpaper.js';
	import { browser } from '$app/environment';

	const siteConfig = getContext('config');
	const { categories, defaultAppIds } = buildAppsFromConfig(siteConfig?.apps);

	let { open = $bindable(false), isAdmin = false } = $props();

	let activeTab = $state('appearance');
	let visibleSet = $state(new Set($prefs.visibleApps || defaultAppIds));
	let iconStyle = $state($prefs.iconStyle || 'colored');
	let theme = $state($prefs.theme || 'auto');
	let wallpaperEnabled = $state($prefs.wallpaperEnabled !== false);
	let wallpaperId = $state($prefs.wallpaperId || null);
	let openInNewTab = $state($prefs.openInNewTab ?? true);
	let wallpaperPage = $state(0);
	let enabledWidgets = $state(new Set($prefs.enabledWidgets || ['weather', 'news', 'search']));
	const WALLPAPERS_PER_PAGE = 12;
	const totalPages = Math.ceil(TOTAL_WALLPAPERS / WALLPAPERS_PER_PAGE);

	// Custom bookmarks (per-user)
	let customApps = $state($prefs.customApps || []);
	let showAddForm = $state(false);
	let newName = $state('');
	let newUrl = $state('');
	let newIcon = $state('');

	// Admin default apps (server-backed, shared across all users)
	let adminApps = $derived($adminAppsStore);
	let showAdminAddForm = $state(false);
	let adminNewName = $state('');
	let adminNewUrl = $state('');
	let adminNewIcon = $state('');
	let adminNewCategory = $state('');
	let adminNewSelfHosted = $state(false);
	let adminSearch = $state('');
	let showSearchResults = $state(false);

	// Existing app IDs/names to filter out already-added apps
	const existingNames = $derived(new Set([
		...categories.flatMap(c => c.apps.map(a => a.name.toLowerCase())),
		...adminApps.map(a => a.name.toLowerCase())
	]));

	const searchResults = $derived.by(() => {
		const q = adminSearch.trim().toLowerCase();
		if (!q) return appDirectory.filter(a => !existingNames.has(a.name.toLowerCase())).slice(0, 8);
		return appDirectory
			.filter(a => a.name.toLowerCase().includes(q) && !existingNames.has(a.name.toLowerCase()))
			.slice(0, 8);
	});

	function selectFromDirectory(entry) {
		adminNewName = entry.name;
		adminNewIcon = entry.icon;
		adminNewCategory = entry.category || 'Custom';
		adminNewSelfHosted = entry.self_hosted || false;
		adminSearch = '';
		showSearchResults = false;
	}

	let prevOpen = false;
	$effect(() => {
		if (open && !prevOpen) {
			activeTab = 'appearance';
			visibleSet = new Set($prefs.visibleApps || defaultAppIds);
			iconStyle = $prefs.iconStyle || 'colored';
			theme = $prefs.theme || 'auto';
			wallpaperEnabled = $prefs.wallpaperEnabled !== false;
			wallpaperId = $prefs.wallpaperId || null;
			openInNewTab = $prefs.openInNewTab ?? true;
			wallpaperPage = wallpaperId ? Math.floor((wallpaperId - 1) / WALLPAPERS_PER_PAGE) : 0;
			enabledWidgets = new Set($prefs.enabledWidgets || ['weather', 'news', 'search']);
			customApps = $prefs.customApps || [];
			adminAppsStore.load();
			showAddForm = false;
			showAdminAddForm = false;
			newName = ''; newUrl = ''; newIcon = '';
			adminNewName = ''; adminNewUrl = ''; adminNewIcon = ''; adminNewCategory = ''; adminNewSelfHosted = false;
		}
		prevOpen = open;
	});


	function toggle(appId) {
		const next = new Set(visibleSet);
		if (next.has(appId)) next.delete(appId);
		else next.add(appId);
		visibleSet = next;
		prefs.update(p => ({ ...p, visibleApps: [...next] }));
	}

	function setIconStyle(style) {
		iconStyle = style;
		prefs.update(p => ({ ...p, iconStyle: style }));
	}

	function setTheme(t) {
		theme = t;
		prefs.update(p => ({ ...p, theme: t }));
	}

	function toggleWallpaper() {
		wallpaperEnabled = !wallpaperEnabled;
		prefs.update(p => ({ ...p, wallpaperEnabled }));
	}

	function toggleOpenInNewTab() {
		openInNewTab = !openInNewTab;
		prefs.update(p => ({ ...p, openInNewTab }));
	}

	function toggleWidget(id) {
		const next = new Set(enabledWidgets);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		enabledWidgets = next;
		prefs.update(p => ({ ...p, enabledWidgets: [...next] }));
	}

	function selectWallpaper(id) {
		wallpaperId = id;
		prefs.update(p => ({ ...p, wallpaperId: id }));
	}

	function resetDefaults() {
		visibleSet = new Set(defaultAppIds);
		iconStyle = 'colored';
		theme = 'auto';
		wallpaperEnabled = true;
		wallpaperId = null;
		openInNewTab = true;
		prefs.update(p => ({ ...p, visibleApps: null, iconStyle: 'colored', theme: 'auto', wallpaperEnabled: true, wallpaperId: null, openInNewTab: true, customApps: [] }));
		customApps = [];
	}

	// Bookmark helpers
	function addBookmark() {
		if (!newName.trim() || !newUrl.trim()) return;
		let url = newUrl.trim();
		if (!url.startsWith('http')) url = 'https://' + url;
		try {
			const parsed = new URL(url);
			if (!['http:', 'https:'].includes(parsed.protocol)) return;
		} catch { return; }
		const id = 'custom-' + Date.now();
		let icon = newIcon.trim();
		if (!icon) {
			try { icon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; }
			catch { icon = null; }
		}
		customApps = [...customApps, { id, name: newName.trim(), url, icon }];
		prefs.update(p => ({ ...p, customApps }));
		newName = ''; newUrl = ''; newIcon = '';
		showAddForm = false;
	}

	function removeBookmark(id) {
		customApps = customApps.filter(a => a.id !== id);
		prefs.update(p => ({ ...p, customApps }));
	}

	// Admin app helpers — server-backed via adminApps store
	async function addAdminApp() {
		if (!adminNewName.trim() || !adminNewUrl.trim()) return;
		let url = adminNewUrl.trim();
		if (!url.startsWith('http')) url = 'https://' + url;
		const icon = adminNewIcon.trim() || null;
		const app = {
			name: adminNewName.trim(), url, icon,
			category: adminNewCategory.trim() || 'Custom',
			self_hosted: adminNewSelfHosted
		};
		const result = await adminAppsStore.add(app);
		if (result) {
			// Add to visible set
			const next = new Set(visibleSet);
			next.add(result.id);
			visibleSet = next;
			prefs.update(p => ({ ...p, visibleApps: [...next] }));
		}
		adminNewName = ''; adminNewUrl = ''; adminNewIcon = ''; adminNewCategory = ''; adminNewSelfHosted = false;
		showAdminAddForm = false;
	}

	async function removeAdminApp(id) {
		await adminAppsStore.remove(id);
	}

	function portal(node) {
		document.body.appendChild(node);
		return { destroy() { if (node.parentNode) node.parentNode.removeChild(node); } };
	}

	const filteredCategories = $derived(
		categories
			.map(cat => ({ ...cat, apps: cat.apps.filter(app => !app.adminOnly || isAdmin) }))
			.filter(cat => cat.apps.length > 0)
	);

	const iconStyles = [
		{ id: 'colored', label: 'Colored' },
		{ id: 'white', label: 'White' },
		{ id: 'grayed', label: 'Grayed' }
	];

	const themes = [
		{ id: 'auto', label: 'Dynamic' },
		{ id: 'dark', label: 'Dark' },
		{ id: 'light', label: 'Light' }
	];
</script>

{#if open}
	<div
		use:portal
		class="fixed inset-0 bg-surface-overlay backdrop-blur-[6px] flex items-center justify-center z-[100] p-4 animate-fade-in"
		onclick={() => open = false}
	>
		<div
			class="glass-card rounded-2xl w-full max-w-[620px] h-[520px] max-md:max-w-full max-md:h-[75vh] max-md:rounded-xl overflow-hidden animate-modal-enter shadow-theme relative flex flex-col"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Mobile: horizontal tabs + close -->
			<div class="hidden max-md:flex shrink-0 px-3 pt-2 pb-1 gap-1 border-b border-border-card overflow-x-auto items-center">
				{#each [
					{ id: 'appearance', label: 'Appearance' },
					{ id: 'apps', label: 'Bookmarks' },
					{ id: 'widgets', label: 'Widgets' },
					{ id: 'integrations', label: 'Integrations' }
				] as tab}
					<button
						class="flex-1 min-w-fit px-2.5 py-2.5 rounded-lg border-none cursor-pointer text-center text-[0.75rem] font-medium transition-all duration-150 {activeTab === tab.id ? 'bg-surface-card-strong text-content' : 'bg-transparent text-content-dim'}"
						onclick={() => activeTab = tab.id}
					>{tab.label}</button>
				{/each}
				<button
					class="bg-transparent border-none text-content-dim cursor-pointer hover:text-content px-2 py-2 shrink-0"
					onclick={() => open = false}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>

			<!-- Tabbed layout: sidebar (desktop) + content -->
			<div class="flex flex-1 min-h-0">
				<!-- Sidebar — hidden on mobile -->
				<div class="w-[160px] shrink-0 px-2.5 pt-3 pb-3 flex flex-col max-md:hidden">
					<button
						class="bg-transparent border-none text-content-dim cursor-pointer hover:text-content self-end mr-1 mb-2"
						onclick={() => open = false}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
					<div class="flex flex-col gap-0.5">
						{#each [
							{ id: 'appearance', label: 'Appearance', svg: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v-2M4.22 4.22l1.42 1.42m12.72 12.72-1.42-1.42M1 12h2m18 0h-2M4.22 19.78l1.42-1.42M18.36 5.64l-1.42 1.42"/>' },
							{ id: 'apps', label: 'Bookmarks', svg: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>' },
							{ id: 'widgets', label: 'Widgets', svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>' },
							{ id: 'integrations', label: 'Integrations', svg: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M12 17v5"/><path d="M5 8h14a2 2 0 0 1 2 2v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3a2 2 0 0 1 2-2z"/>' }
						] as tab}
							<button
								class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border-none cursor-pointer transition-all duration-150 text-left {activeTab === tab.id ? 'bg-surface-card-strong' : 'bg-transparent hover:bg-surface-card-hover'}"
								onclick={() => activeTab = tab.id}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0 {activeTab === tab.id ? 'text-content' : 'text-content-dim'}">{@html tab.svg}</svg>
								<span class="text-[0.78rem] font-medium {activeTab === tab.id ? 'text-content' : 'text-content-dim'}">{tab.label}</span>
							</button>
						{/each}
					</div>
					<div class="mt-auto pt-3">
						<button
							class="text-[0.65rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content transition-colors font-mono px-3"
							onclick={resetDefaults}
						>Reset defaults</button>
					</div>
				</div>

				<!-- Tab content -->
				<div class="flex-1 max-md:border-l-0 border-l border-border-card px-5 max-md:px-4 pt-3 pb-4 overflow-y-auto">

				{#if activeTab === 'appearance'}
				<!-- ═══ APPEARANCE TAB ═══ -->
				<div class="mb-4">
					<div class="text-[0.85rem] font-semibold text-content">Appearance</div>
					<div class="text-[0.7rem] text-content-dim mt-0.5">Customize how your dashboard looks.</div>
				</div>

				<!-- Theme -->
				<div class="mb-5">
					<div class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Theme</div>
					<div class="flex gap-6">
						{#each themes as t}
							<button
								class="bg-transparent border-none cursor-pointer p-0 text-[0.85rem] font-mono transition-all duration-150 {theme === t.id ? 'text-content font-semibold' : 'text-content-dim hover:text-content-muted'}"
								onclick={() => setTheme(t.id)}
							>{t.label}</button>
						{/each}
					</div>
				</div>

				<!-- Icon style -->
				<div class="mb-5">
					<div class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Icon style</div>
					<div class="flex gap-6">
						{#each iconStyles as style}
							<button
								class="bg-transparent border-none cursor-pointer p-0 text-[0.85rem] font-mono transition-all duration-150 {iconStyle === style.id ? 'text-content font-semibold' : 'text-content-dim hover:text-content-muted'}"
								onclick={() => setIconStyle(style.id)}
							>{style.label}</button>
						{/each}
					</div>
				</div>

				<!-- Open apps in new tab -->
				<div class="mb-4">
					<div class="flex items-center justify-between">
						<span class="text-[0.8rem] text-content-muted">Open apps in new tab</span>
						<button class="bg-transparent border-none cursor-pointer p-0" onclick={toggleOpenInNewTab}>
							<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {openInNewTab ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {openInNewTab ? 'translate-x-4' : 'translate-x-0.5'}"></div>
							</div>
						</button>
					</div>
				</div>

				<!-- Wallpaper — visible in all themes, disabled when not Dynamic -->
				<div class="mb-4 {theme !== 'auto' ? 'opacity-40 pointer-events-none' : ''}">
					<div class="flex items-center justify-between mb-3">
						<span class="text-[0.8rem] text-content-muted">Wallpaper {theme !== 'auto' ? '(Dynamic only)' : ''}</span>
						<button class="bg-transparent border-none cursor-pointer p-0" onclick={toggleWallpaper}>
							<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {wallpaperEnabled && theme === 'auto' ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {wallpaperEnabled && theme === 'auto' ? 'translate-x-4' : 'translate-x-0.5'}"></div>
							</div>
						</button>
					</div>

					{#if wallpaperEnabled && theme === 'auto'}
						<!-- Daily rotation option -->
						<button
							class="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[0.75rem] font-mono cursor-pointer transition-all duration-150 mb-2 {!wallpaperId ? 'bg-surface-card-strong text-content border border-border-pill' : 'bg-transparent text-content-dim border border-border-card hover:bg-surface-card-hover'}"
							onclick={() => selectWallpaper(null)}
						>Daily rotation</button>

						<!-- Wallpaper grid — always visible -->
						<div class="grid grid-cols-3 max-md:grid-cols-2 gap-1.5">
							{#each Array.from({length: WALLPAPERS_PER_PAGE}, (_, i) => wallpaperPage * WALLPAPERS_PER_PAGE + i + 1).filter(id => id <= TOTAL_WALLPAPERS) as id}
								<button
									class="relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-150 bg-surface-card {wallpaperId == id ? 'border-white/60 shadow-lg' : 'border-transparent hover:border-border-pill'}"
									onclick={() => selectWallpaper(id)}
								>
									<div class="absolute inset-0 bg-surface-card-strong animate-pulse-status"></div>
									<img
										src={getWallpaperThumbUrl(id)}
										alt="Wallpaper {id}"
										loading="lazy"
										class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-0"
										onload={(e) => e.target.classList.replace('opacity-0', 'opacity-100')}
									/>
									{#if wallpaperId == id}
										<div class="absolute inset-0 bg-white/10 flex items-center justify-center z-10">
											<span class="text-white text-xs font-bold drop-shadow">✓</span>
										</div>
									{/if}
								</button>
							{/each}
						</div>

						<!-- Pagination -->
						<div class="flex items-center justify-between mt-2 px-1">
							<button
								class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content transition-colors font-mono disabled:opacity-30 disabled:cursor-not-allowed"
								disabled={wallpaperPage === 0}
								onclick={() => wallpaperPage--}
							>← Prev</button>
							<span class="text-[0.65rem] text-content-dim font-mono">{wallpaperPage + 1} / {totalPages}</span>
							<button
								class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content transition-colors font-mono disabled:opacity-30 disabled:cursor-not-allowed"
								disabled={wallpaperPage >= totalPages - 1}
								onclick={() => wallpaperPage++}
							>Next →</button>
						</div>
					{/if}
				</div>

				{:else if activeTab === 'apps'}
				<!-- ═══ APPS TAB ═══ -->
				<!-- Per-app visibility + per-category toggles have moved to the
				     in-grid iOS-style edit mode. This tab is now just for
				     bookmarks and — for admins — adding default apps. -->
				<div class="mb-4">
					<div class="text-[0.85rem] font-semibold text-content">Bookmarks & Apps</div>
					<div class="text-[0.7rem] text-content-dim mt-0.5">Use the grid's <span class="font-mono">Edit layout</span> button to show/hide or rearrange apps.</div>
				</div>

				<!-- Admin-added default apps (read-only here for non-admins; admin can remove) -->
				{#if adminApps.length > 0 && isAdmin}
					<div class="mt-2">
						<div class="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Added Apps</div>
						{#each adminApps as app}
							{@const icon = resolveIcon(app.icon)}
							<div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-card-hover transition-colors">
								<AppIcon {icon} name={app.name} size="w-3.5 h-3.5" wrapSize="w-5 h-5" {iconStyle} wrap />
								<span class="text-[0.8rem] text-content-muted flex-1 truncate">{app.name}</span>
								<button
									class="bg-transparent border-none text-content-dim text-sm cursor-pointer hover:text-red-400 transition-colors p-1"
									onclick={() => removeAdminApp(app.id)}
									title="Remove"
								>&times;</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Admin: Add Default App -->
				{#if isAdmin}
					<div class="mt-5">
						<div class="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Add App</div>
						{#if showAdminAddForm}
							<div class="p-3 bg-surface-input border border-border-card rounded-xl space-y-2">
								<!-- Search from directory -->
								{#if !adminNewName}
									<div class="relative">
										<input type="text" bind:value={adminSearch} placeholder="Search apps (e.g. Jellyfin, Grafana...)"
											onfocus={() => showSearchResults = true}
											class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
										{#if showSearchResults && searchResults.length > 0}
											<div class="absolute left-0 right-0 top-full mt-1 bg-surface-modal backdrop-blur-xl border border-border-card rounded-lg overflow-hidden z-10 max-h-[200px] overflow-y-auto">
												{#each searchResults as entry}
													{@const icon = resolveIcon(entry.icon)}
													<button
														class="flex items-center gap-2.5 w-full px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors text-left font-mono"
														onclick={() => selectFromDirectory(entry)}
													>
														<AppIcon {icon} name={entry.name} size="w-3.5 h-3.5" wrapSize="w-5 h-5" {iconStyle} wrap />
														<span class="text-[0.8rem] text-content-muted flex-1">{entry.name}</span>
														<span class="text-[0.6rem] text-content-dim">{entry.category}</span>
													</button>
												{/each}
											</div>
										{/if}
									</div>
									<button
										class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content-muted transition-colors font-mono px-1"
										onclick={() => { adminNewName = ' '; adminNewName = ''; showSearchResults = false; }}
									>or enter manually</button>
								{:else}
									<!-- Selected / manual entry -->
									<div class="flex items-center gap-2">
										{#if adminNewIcon}
											{@const icon = resolveIcon(adminNewIcon)}
											<AppIcon {icon} name={adminNewName} size="w-3.5 h-3.5" wrapSize="w-5 h-5" {iconStyle} wrap />
										{/if}
										<input type="text" bind:value={adminNewName} placeholder="App name"
											class="flex-1 bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
										<button
											class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content-muted transition-colors font-mono shrink-0"
											onclick={() => { adminNewName = ''; adminNewIcon = ''; adminNewCategory = ''; adminNewSelfHosted = false; showSearchResults = true; }}
										>clear</button>
									</div>
									<input type="text" bind:value={adminNewUrl} placeholder="URL (e.g. app.example.com)"
										class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
									<input type="text" bind:value={adminNewIcon} placeholder="Icon — di:name, si:name, or URL"
										class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
									<input type="text" bind:value={adminNewCategory} placeholder="Category (default: Custom)"
										class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
									<label class="flex items-center gap-2 px-1 text-[0.75rem] text-content-dim cursor-pointer">
										<input type="checkbox" bind:checked={adminNewSelfHosted} class="accent-zinc-400" />
										<span>Self-hosted — shows in onboarding</span>
									</label>
									<div class="flex gap-2 pt-1">
										<button
											class="flex-1 py-2 px-3 rounded-lg text-[0.8rem] font-mono bg-surface-card-strong text-content border border-border-card cursor-pointer hover:bg-surface-card-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
											disabled={!adminNewName.trim() || !adminNewUrl.trim()}
											onclick={addAdminApp}
										>Add App</button>
										<button
											class="py-2 px-3 rounded-lg text-[0.8rem] font-mono bg-transparent text-content-dim border border-border-card cursor-pointer hover:text-content transition-colors"
											onclick={() => { showAdminAddForm = false; adminNewName = ''; showSearchResults = false; }}
										>Cancel</button>
									</div>
								{/if}
							</div>
						{:else}
							<button
								class="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-transparent border border-dashed border-border-card cursor-pointer hover:bg-surface-card-hover hover:border-border-pill transition-all text-left font-mono"
								onclick={() => { showAdminAddForm = true; showSearchResults = true; }}
							>
								<span class="text-content-dim text-sm">+</span>
								<span class="text-[0.8rem] text-content-dim">Add default app</span>
							</button>
						{/if}
					</div>
				{/if}

				<!-- Custom Bookmarks (per-user) -->
				<div class="mt-5">
					<div class="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Your Bookmarks</div>

					{#each customApps as app}
						{@const icon = resolveIcon(app.icon)}
						<div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-card-hover transition-colors">
							<AppIcon {icon} name={app.name} size="w-3.5 h-3.5" wrapSize="w-5 h-5" {iconStyle} wrap />
							<span class="text-[0.8rem] text-content-muted flex-1 truncate">{app.name}</span>
							<button
								class="bg-transparent border-none text-content-dim text-sm cursor-pointer hover:text-red-400 transition-colors p-1"
								onclick={() => removeBookmark(app.id)}
								title="Remove"
							>&times;</button>
						</div>
					{/each}

					{#if showAddForm}
						<div class="mt-2 p-3 bg-surface-input border border-border-card rounded-xl space-y-2">
							<input type="text" bind:value={newName} placeholder="Name"
								class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
							<input type="text" bind:value={newUrl} placeholder="URL (e.g. github.com)"
								class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
							<input type="text" bind:value={newIcon} placeholder="Icon (optional — si:github, URL, or blank)"
								class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill" />
							<div class="flex gap-2 pt-1">
								<button
									class="flex-1 py-2 px-3 rounded-lg text-[0.8rem] font-mono bg-surface-card-strong text-content border border-border-card cursor-pointer hover:bg-surface-card-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
									disabled={!newName.trim() || !newUrl.trim()}
									onclick={addBookmark}
								>Add</button>
								<button
									class="py-2 px-3 rounded-lg text-[0.8rem] font-mono bg-transparent text-content-dim border border-border-card cursor-pointer hover:text-content transition-colors"
									onclick={() => showAddForm = false}
								>Cancel</button>
							</div>
						</div>
					{:else}
						<button
							class="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-transparent border border-dashed border-border-card cursor-pointer hover:bg-surface-card-hover hover:border-border-pill transition-all text-left font-mono mt-1"
							onclick={() => showAddForm = true}
						>
							<span class="text-content-dim text-sm">+</span>
							<span class="text-[0.8rem] text-content-dim">Add bookmark</span>
						</button>
					{/if}
				</div>

				{:else if activeTab === 'widgets'}
				<!-- ═══ WIDGETS TAB ═══ -->
				<div class="mb-4">
					<div class="text-[0.85rem] font-semibold text-content">Widgets</div>
					<div class="text-[0.7rem] text-content-dim mt-0.5">Enable or disable dashboard widgets.</div>
				</div>
				{@const widgets = [
					{ id: 'weather', name: 'Weather', desc: 'Temperature and conditions for your location', icon: '☀️' },
					{ id: 'news', name: 'News', desc: 'Headlines from your RSS feed', icon: '📰' },
					{ id: 'search', name: 'Search', desc: 'Quick search bar with keyboard shortcut', icon: '🔍' }
				]}
				{#each widgets as widget}
					<button
						class="flex items-center gap-3 w-full px-2 py-3 bg-transparent border-none border-b border-border-card text-left font-mono cursor-pointer hover:bg-surface-card-hover"
						onclick={() => toggleWidget(widget.id)}
					>
						<span class="text-base shrink-0">{widget.icon}</span>
						<div class="flex-1 min-w-0">
							<div class="text-[0.8rem] text-content font-medium">{widget.name}</div>
							<div class="text-[0.65rem] text-content-dim">{widget.desc}</div>
						</div>
						<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {enabledWidgets.has(widget.id) ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
							<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {enabledWidgets.has(widget.id) ? 'translate-x-4' : 'translate-x-0.5'}"></div>
						</div>
					</button>
				{/each}

				{:else if activeTab === 'integrations'}
				<!-- ═══ INTEGRATIONS TAB ═══ -->
				<IntegrationsPanel {iconStyle} />

				{/if}
				</div>
			</div>

		</div>
	</div>
{/if}

