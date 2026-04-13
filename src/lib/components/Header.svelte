<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';
	import Weather from './Weather.svelte';
	import NewsPill from './NewsPill.svelte';
	import { DAYS, MONTHS, WEATHER_TTL, FALLBACK_LAT, FALLBACK_LON, WEATHER_MAP } from '$lib/constants.js';
	let { lat, lon, hasLocation, showWeather = true, headlines = [] } = $props();

	const siteConfig = getContext('config');
	const weatherConfig = siteConfig?.weather || {};
	const defaultLat = weatherConfig.default_lat || FALLBACK_LAT;
	const defaultLon = weatherConfig.default_lon || FALLBACK_LON;

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
		const day = DAYS[d.getDay()];
		const month = MONTHS[d.getMonth()];
		const date = d.getDate();
		const year = d.getFullYear();
		return `${day}, ${month} ${date}, ${year}`;
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
		if (!showWeather) return;
		const useLat = lat || defaultLat;
		const useLon = lon || defaultLon;

		fetchWeather(useLat, useLon).then(d => { weatherData = d; });
		fetchLocation(useLat, useLon).then(n => { locationName = n; });
	});

	onMount(() => {
		const timer = setInterval(() => { now = new Date(); }, 60000);
		return () => clearInterval(timer);
	});
</script>

<div class="mb-8">
	<!-- Clock + Weather row -->
	<div class="flex justify-between items-end">
		<h1 class="text-[4rem] font-medium text-content tracking-tighter leading-[0.85] max-md:text-[3rem] max-xs:text-[2.5rem] tabular-nums">{formatTime()}</h1>
		<div class="flex flex-col items-end gap-2">
			{#if showWeather}<Weather {weatherData} {locationName} />{/if}
			{#if headlines.length > 0}<NewsPill {headlines} />{/if}
		</div>
	</div>
	<!-- Date (left) + Weather desc (right) -->
	<div class="flex justify-between items-baseline mt-1.5 max-md:mt-1">
		<div class="text-[0.65rem] font-medium uppercase tracking-[0.25em] text-content-muted">{formatDate()}</div>
		{#if weatherData}
			<div class="text-[0.6rem] max-md:text-[0.5rem] font-medium uppercase tracking-[0.15em] text-content-muted text-right">
				<span class="max-md:hidden">{(WEATHER_MAP[weatherData.code] || [null, 'Unknown'])[1]}</span>{#if locationName}<span class="max-md:hidden"> · </span><span>{locationName}</span>{/if}
			</div>
		{/if}
	</div>
</div>
