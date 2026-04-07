<script>
	import { onMount } from 'svelte';

	let { headlines = [] } = $props();

	let currentIndex = $state(0);
	let phase = $state('visible');
	let displayItem = $state(null);

	$effect(() => {
		if (headlines.length) displayItem = normalizeItem(headlines[0]);
	});

	// Support both string[] and {title, link}[] formats
	function normalizeItem(item) {
		if (typeof item === 'string') return { title: item, link: null };
		return { title: item.title || '', link: item.link || null };
	}

	onMount(() => {
		const interval = setInterval(() => {
			if (headlines.length <= 1) return;
			const nextIdx = (currentIndex + 1) % headlines.length;

			phase = 'exiting';
			setTimeout(() => {
				displayItem = normalizeItem(headlines[nextIdx]);
				currentIndex = nextIdx;
				phase = 'entering';
				requestAnimationFrame(() => {
					requestAnimationFrame(() => { phase = 'visible'; });
				});
			}, 300);
		}, 10000);

		return () => clearInterval(interval);
	});
</script>

{#if headlines.length > 0 && displayItem}
	{@const Tag = displayItem.link ? 'a' : 'div'}
	<svelte:element
		this={Tag}
		href={displayItem.link || undefined}
		target={displayItem.link ? '_blank' : undefined}
		rel={displayItem.link ? 'noopener noreferrer' : undefined}
		class="flex items-center gap-2 glass-card rounded-full px-3.5 py-1.5 overflow-hidden no-underline {displayItem.link ? 'cursor-pointer hover:border-border-pill transition-colors' : ''}"
	>
		<span class="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
		<span class="news-text text-[0.7rem] text-content-dim truncate {phase}">{displayItem.title}</span>
	</svelte:element>
{/if}

<style>
	.news-text {
		transition: opacity 0.3s ease, transform 0.3s ease;
		opacity: 1;
		transform: translateY(0);
	}
	.news-text.exiting {
		opacity: 0;
		transform: translateY(4px);
	}
	.news-text.entering {
		opacity: 0;
		transform: translateY(-4px);
		transition: none;
	}
	.news-text.visible {
		opacity: 1;
		transform: translateY(0);
	}
</style>
