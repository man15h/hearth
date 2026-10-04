<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Weather from './Weather.svelte';
	import NewsPill from './NewsPill.svelte';
	import { DAYS, MONTHS, WEATHER_TTL } from '$lib/constants.js';
	// No lat/lon means the user hasn't chosen a location: weather stays hidden.
	// placeName is set for a manually chosen place, which needs no reverse lookup.
	let { lat, lon, placeName = '', showWeather = true, headlines = [], onweatherclick = null } = $props();

	let weatherData = $state(null);
	let locationName = $state('');
	let now = $state(new Date());

	const WEATHER_CACHE_KEY = 'weather_cache';

	function formatTime() {
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	function formatDate() {
		const d = now;
		const day = DAYS[d.getDay()].slice(0, 3);
		const month = MONTHS[d.getMonth()].slice(0, 3);
		const date = d.getDate();
		return `${day} · ${month} ${date}`;
	}

	async function fetchWeather(lat, lon) {
		if (browser) {
			const cached = localStorage.getItem(WEATHER_CACHE_KEY);
			if (cached) {
				const c = JSON.parse(cached);
				if (c.lat === lat && c.lon === lon && Date.now() - c.ts < WEATHER_TTL) return c.data;
			}
		}
		try {
			const r = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
			);
			const d = await r.json();
			const data = { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code };
			if (browser) {
				localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), lat, lon, data }));
			}
			return data;
		} catch {
			return null;
		}
	}

	async function fetchLocation(lat, lon) {
		if (browser) {
			const cached = localStorage.getItem('weather_location');
			if (cached) {
				const c = JSON.parse(cached);
				if (c.lat === lat && c.lon === lon) return c.name;
			}
		}
		try {
			const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`);
			const d = await r.json();
			const addr = d.address || {};
			let name = addr.city || addr.town || addr.village || addr.county || '';
			name = name.replace(/\s+(Municipal Corporation|District|Tehsil|Taluk|Block)$/i, '');
			if (name && browser) {
				localStorage.setItem('weather_location', JSON.stringify({ lat, lon, name }));
			}
			return name;
		} catch {
			return '';
		}
	}

	$effect(() => {
		weatherData = null;
		locationName = '';
		if (!showWeather || !lat || !lon) return;
		let stale = false;
		fetchWeather(lat, lon).then(d => { if (!stale) weatherData = d; });
		if (placeName) locationName = placeName;
		else fetchLocation(lat, lon).then(n => { if (!stale) locationName = n; });
		return () => { stale = true; };
	});

	let headerEl;
	onMount(() => {
		const timer = setInterval(() => { now = new Date(); }, 60000);
		// Toggle a blurred backdrop on the sticky header only once the
		// page has scrolled a bit — keeps the at-rest top-of-page clean.
		const onScroll = () => headerEl?.classList.toggle('is-stuck', window.scrollY > 8);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			clearInterval(timer);
			window.removeEventListener('scroll', onScroll);
		};
	});
</script>

<!-- Compact status-bar header: a single mono row with time · date on the
     left and weather/location on the right. Clock is the anchor but no
     longer the visual hero — the search palette below is. -->
<div bind:this={headerEl} class="dashboard-header mb-8 max-md:mb-6 flex justify-between items-center gap-3 text-[0.85rem] max-md:text-[0.75rem] font-mono tracking-[0.12em] uppercase">
	<div class="flex items-baseline gap-3 min-w-0 flex-wrap">
		<span class="text-[1.35rem] max-md:text-[1.1rem] font-semibold text-content tabular-nums tracking-tight normal-case">{formatTime()}</span>
		<span class="text-content-muted">{formatDate()}</span>
	</div>
	<div class="flex items-center gap-3 shrink-0">
		{#if headlines.length > 0}<NewsPill {headlines} />{/if}
		{#if showWeather && lat && lon}<Weather {weatherData} {locationName} onclick={onweatherclick} />{/if}
	</div>
</div>
