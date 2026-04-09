<script>
	import { prefs } from '$lib/stores/prefs.js';
	import { adminApps } from '$lib/stores/adminApps.js';
	import Header from '$lib/components/Header.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import AppGrid from '$lib/components/AppGrid.svelte';

	import Footer from '$lib/components/Footer.svelte';
	import PrivacyTerms from '$lib/components/PrivacyTerms.svelte';
	import OnboardingModal from '$lib/components/OnboardingModal.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import WallpaperBackground from '$lib/components/WallpaperBackground.svelte';

	import DynamicFavicon from '$lib/components/DynamicFavicon.svelte';
	import InlineTip from '$lib/components/InlineTip.svelte';
	import ManageApps from '$lib/components/ManageApps.svelte';
	import PasswordChangePrompt from '$lib/components/PasswordChangePrompt.svelte';

	import { browser } from '$app/environment';

	let { data } = $props();
	let privacyOpen = $state(false);
	let onboarded = $state(false);
	let prefsSynced = $state(false);
	let guideApp = $state(null);
	let menuOpen = $state(false);
	let manageAppsOpen = $state(false);
	let searchQuery = $state('');

	import { buildAppsFromConfig } from '$lib/apps.js';
	import { getContext } from 'svelte';

	const siteConfig = getContext('config');
	const authEnabled = siteConfig?.auth?.enabled ?? false;
	const customizationEnabled = siteConfig?.customization?.enabled ?? false;
	const onboardingEnabled = siteConfig?.onboarding?.enabled ?? false;
	const wallpapersEnabled = siteConfig?.wallpapers?.enabled ?? false;
	const weatherConfigEnabled = siteConfig?.weather?.enabled ?? false;
	const tipsEnabled = siteConfig?.tips?.enabled ?? false;
	const privacyEnabled = siteConfig?.privacy?.enabled ?? false;

	const searchConfigEnabled = siteConfig?.search?.enabled ?? false;
	const newsConfigEnabled = siteConfig?.news?.enabled ?? false;

	// Widget visibility: config enables feature, user prefs toggle per-user
	const userWidgets = $derived(new Set($prefs.enabledWidgets || ['weather', 'news', 'search']));
	const weatherEnabled = $derived(weatherConfigEnabled && userWidgets.has('weather'));
	const searchEnabled = $derived(searchConfigEnabled && userWidgets.has('search'));
	const newsEnabled = $derived(newsConfigEnabled && userWidgets.has('news'));

	const { categories: appCategories, setupGuides } = buildAppsFromConfig(siteConfig?.apps);
	const allApps = appCategories.flatMap(cat => cat.apps);
	const tipApps = Object.fromEntries(
		allApps.filter(app => setupGuides[app.name]).map(app => [app.name, app])
	);

	const loggedIn = !!(data.authName);
	// No auth = always show dashboard (no login gate)
	const showDashboard = !authEnabled || loggedIn;

	// Dev mode: reset onboarding on every fresh load (no ?user param)
	if (browser && data.devMode && !loggedIn) {
		prefs.reset();
	}

	// Sync auth info into prefs on every authenticated load — wait for server state before rendering
	if (browser && loggedIn) {
		(async () => {
			prefs.update((p) => {
				return { ...p, name: data.authName, username: data.authUsername, firstLoginAt: p.firstLoginAt || new Date().toISOString() };
			});
			await prefs.syncFromServer();
			prefsSynced = true;
			adminApps.load();
		})();
	} else {
		prefsSynced = true;
	}

	$effect(() => {
		if (!onboardingEnabled || !authEnabled || (prefsSynced && $prefs.onboarded)) onboarded = true;
	});

	// Apply theme class to body
	const theme = $derived($prefs.theme || 'auto');
	$effect(() => {
		if (!browser) return;
		document.body.classList.remove('theme-light', 'theme-dark');
		if (theme === 'light') document.body.classList.add('theme-light');
		else if (theme === 'dark') document.body.classList.add('theme-dark');
	});

	// Silently refresh geolocation on each load to handle travel
	if (browser && weatherEnabled && $prefs.lat && $prefs.lon) {
		navigator.geolocation?.getCurrentPosition((pos) => {
			const dlat = Math.abs(pos.coords.latitude - $prefs.lat);
			const dlon = Math.abs(pos.coords.longitude - $prefs.lon);
			if (dlat > 0.1 || dlon > 0.1) {
				prefs.update((p) => ({ ...p, lat: pos.coords.latitude, lon: pos.coords.longitude }));
			}
		}, () => {});
	}

	function onOnboardingComplete() {
		onboarded = true;
	}
</script>

{#if authEnabled && !loggedIn}
	<!-- Login screen (only when auth is enabled) -->
	<OnboardingModal oncomplete={onOnboardingComplete} authName={data.authName} authUsername={data.authUsername} devMode={data.devMode} />
{:else if showDashboard && prefsSynced}
	<!-- Password change gate (only when auth + password_change_url configured) -->
	{#if authEnabled}
		<PasswordChangePrompt />
	{/if}
	<!-- Dashboard -->
	{#if wallpapersEnabled && theme === 'auto' && ($prefs.wallpaperEnabled !== false)}
		<WallpaperBackground wallpaperId={$prefs.wallpaperId || null} />
	{/if}
<DynamicFavicon />
	<div class="w-full max-w-[1200px] px-16 pb-16 pt-[calc(2.5rem+env(safe-area-inset-top,0px))] max-lg:px-12 max-md:px-5 max-md:pt-[calc(1.5rem+env(safe-area-inset-top,0px))] max-md:max-w-full max-xs:px-4 max-xs:pt-[calc(1.25rem+env(safe-area-inset-top,0px))] {$prefs.iconStyle === 'grayed' ? 'grayed-widgets' : ''} {wallpapersEnabled && theme === 'auto' && $prefs.wallpaperEnabled !== false ? 'wallpaper-active' : ''}">
		<div class="opacity-0 animate-fade-in [animation-fill-mode:both]">
			<Header lat={$prefs.lat} lon={$prefs.lon} hasLocation={!!($prefs.lat && $prefs.lon)} showWeather={weatherEnabled} headlines={newsEnabled ? data.news : []} />

		</div>
		{#if searchEnabled}
			<div class="opacity-0 animate-fade-in-up [animation-fill-mode:both] [animation-delay:75ms] relative z-30">
				<SearchBar bind:query={searchQuery} />
			</div>
		{/if}
		<div class="opacity-0 animate-fade-in-up [animation-fill-mode:both] [animation-delay:150ms] relative z-20">
			<AppGrid isAdmin={data.isAdmin} bind:guideApp search={searchQuery} />
		</div>
		{#if tipsEnabled}
			<div class="opacity-0 animate-fade-in [animation-fill-mode:both] [animation-delay:250ms]">
				<InlineTip onsetup={(appName) => { guideApp = tipApps[appName] || null; }} />
			</div>
		{/if}
		<div class="opacity-0 animate-fade-in [animation-fill-mode:both] [animation-delay:300ms]">
			<Footer onOpenPrivacy={privacyEnabled ? () => privacyOpen = true : null} />
		</div>
	</div>
	{#if privacyEnabled}
		<PrivacyTerms bind:open={privacyOpen} standalone />
	{/if}
	<SettingsButton bind:open={menuOpen} onmanageapps={customizationEnabled ? () => manageAppsOpen = true : null} showAuth={authEnabled} />
	{#if customizationEnabled}
		<ManageApps bind:open={manageAppsOpen} isAdmin={data.isAdmin} />
	{/if}
	<InstallPrompt />

	<!-- Post-login onboarding (only when auth + onboarding enabled) -->
	{#if authEnabled && onboardingEnabled && !onboarded}
		<OnboardingModal oncomplete={onOnboardingComplete} authName={data.authName} authUsername={data.authUsername} devMode={data.devMode} />
	{/if}
{/if}
