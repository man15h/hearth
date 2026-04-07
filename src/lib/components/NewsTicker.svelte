<script>
	let { headlines = [] } = $props();

	function normalize(item) {
		if (typeof item === 'string') return { title: item, link: null };
		return { title: item.title || '', link: item.link || null };
	}

	const items = $derived(headlines.map(normalize));
</script>

{#if items.length > 0}
	<div class="ticker-wrap overflow-hidden mb-2" style="-webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent); mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);">
		<div class="ticker-track whitespace-nowrap text-[0.7rem] text-content-dim" style="--duration: {Math.max(80, items.length * 18)}s">
			{#each [0, 1] as copy}
				{#each items as item, i}
					{#if i > 0 || copy > 0}<span class="mx-4 text-content-dim/30">·</span>{/if}
					{#if item.link}
						<a href={item.link} target="_blank" rel="noopener noreferrer" class="text-content-dim no-underline hover:text-content-muted transition-colors">{item.title}</a>
					{:else}
						<span>{item.title}</span>
					{/if}
				{/each}
			{/each}
		</div>
	</div>
{/if}

<style>
	.ticker-track {
		display: inline-flex;
		align-items: center;
		animation: crawl var(--duration, 80s) linear infinite;
	}
	@keyframes crawl {
		from { transform: translateX(0); }
		to { transform: translateX(-50%); }
	}
	.ticker-wrap:hover .ticker-track {
		animation-play-state: paused;
	}
</style>
