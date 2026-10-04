<script>
	import { prefs } from '$lib/stores/prefs.js';

	// Where the weather widget gets its coordinates. Nothing is shown until the
	// user picks one: their device location, or a place they search for.

	let query = $state('');
	let results = $state([]);
	let status = $state('');
	let searching = $state(false);
	let locating = $state(false);

	const hasLocation = $derived(!!($prefs.lat && $prefs.lon));
	const current = $derived(
		!hasLocation
			? 'No location set — weather is hidden'
			: $prefs.locationSource === 'manual'
				? `Set to ${$prefs.locationName || 'a chosen place'}`
				: 'Using your device location'
	);

	function useDeviceLocation() {
		if (!navigator.geolocation) {
			status = 'This browser has no location support. Search for a place instead.';
			return;
		}
		locating = true;
		status = '';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				locating = false;
				prefs.update((p) => ({
					...p,
					lat: pos.coords.latitude,
					lon: pos.coords.longitude,
					locationSource: 'device',
					locationName: null
				}));
			},
			(err) => {
				locating = false;
				status = err.code === err.PERMISSION_DENIED
					? 'Location is blocked for this site. Allow it in your browser’s site settings, or search for a place.'
					: 'Couldn’t get your location. Try again, or search for a place.';
			},
			{ timeout: 15000 }
		);
	}

	async function search(e) {
		e.preventDefault();
		const q = query.trim();
		if (!q) return;
		searching = true;
		status = '';
		try {
			const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&format=json`);
			const d = await r.json();
			results = d.results || [];
			if (!results.length) status = `No places found for “${q}”.`;
		} catch {
			results = [];
			status = 'Place search failed. Check your connection and try again.';
		} finally {
			searching = false;
		}
	}

	function pick(place) {
		prefs.update((p) => ({
			...p,
			lat: place.latitude,
			lon: place.longitude,
			locationSource: 'manual',
			locationName: place.name
		}));
		results = [];
		query = '';
		status = '';
	}

	function clearLocation() {
		prefs.update((p) => ({ ...p, lat: null, lon: null, locationSource: null, locationName: null }));
		status = '';
	}

	const placeLabel = (r) => [r.name, r.admin1, r.country].filter(Boolean).join(', ');
</script>

<div class="px-2 pt-1 pb-3 border-b border-border-card font-mono">
	<div class="flex items-center gap-2 mb-2.5">
		<div class="flex-1 min-w-0 text-[0.7rem] {hasLocation ? 'text-content-muted' : 'text-content-dim'}">{current}</div>
		{#if hasLocation}
			<button
				class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content font-mono"
				onclick={clearLocation}
			>Clear</button>
		{/if}
	</div>
	<button
		class="w-full py-2 px-3 mb-2 rounded-lg text-[0.75rem] font-medium font-mono cursor-pointer bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-hover disabled:opacity-60 disabled:cursor-default"
		disabled={locating}
		onclick={useDeviceLocation}
	>{locating ? 'Locating…' : $prefs.locationSource === 'device' && hasLocation ? 'Update my location' : 'Use my location'}</button>
	<form class="flex gap-2" onsubmit={search}>
		<input
			class="flex-1 min-w-0 px-3 py-2 rounded-lg text-[0.75rem] font-mono bg-surface-input text-content border border-border-input placeholder:text-content-dim outline-none focus:border-border-pill"
			placeholder="Or search a city…"
			aria-label="Search for a place"
			bind:value={query}
		/>
		<button
			class="px-3 py-2 rounded-lg text-[0.75rem] font-mono cursor-pointer bg-transparent text-content border border-border-pill hover:bg-surface-card-hover disabled:opacity-60 disabled:cursor-default"
			disabled={searching || !query.trim()}
		>{searching ? '…' : 'Search'}</button>
	</form>
	{#if results.length}
		<ul class="mt-2 list-none p-0 m-0">
			{#each results as r (r.id)}
				<li>
					<button
						class="w-full px-3 py-2 rounded-lg text-left text-[0.75rem] font-mono text-content bg-transparent border-none cursor-pointer hover:bg-surface-card-hover"
						onclick={() => pick(r)}
					>{placeLabel(r)}</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if status}
		<p class="mt-2 mb-0 text-[0.7rem] text-content-muted" role="status">{status}</p>
	{/if}
</div>
