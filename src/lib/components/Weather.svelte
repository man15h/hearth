<script>
	import { WEATHER_MAP } from '$lib/constants.js';
	import AnimatedNumber from './AnimatedNumber.svelte';

	let { weatherData, locationName } = $props();

	const weatherInfo = $derived(
		weatherData ? (WEATHER_MAP[weatherData.code] || [null, 'Unknown']) : null
	);
</script>

{#if weatherData && weatherInfo}
	<div class="shrink-0 animate-fade-in text-right">
		<div class="flex items-center gap-2 justify-end">
			<div class="w-5 h-5 shrink-0 text-content-muted max-md:w-4 max-md:h-4">{@html weatherInfo[0]}</div>
			<span class="text-[1.5rem] max-md:text-[1.1rem] font-semibold text-content leading-none tracking-tight tabular-nums">
				<AnimatedNumber value={weatherData.temp} />&deg;
			</span>
		</div>
	</div>
{/if}
