<script>
	import { onMount, getContext } from 'svelte';

	const siteConfig = getContext('config');
	const searchConfig = siteConfig?.search || { enabled: true, url: 'https://www.google.com/search', param: 'q' };

	let { query = $bindable('') } = $props();
	let inputEl;

	onMount(() => {
		function onKeydown(e) {
			if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
				e.preventDefault();
				inputEl?.focus();
			}
			if (e.key === 'Escape' && document.activeElement === inputEl) {
				query = '';
				inputEl.blur();
			}
		}
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});

	function handleSubmit(e) {
		// If query matches an app, don't submit to external search — AppGrid handles it
		// Only submit to external search if there's actual text
		if (!query.trim()) e.preventDefault();
	}
</script>

<form class="flex items-center rounded-xl px-4 mb-3 transition-all duration-200 focus-within:border-border-pill focus-within:ring-1 focus-within:ring-border-pill/40" style="background: var(--card-bg); border: 1px solid var(--divider);" action={searchConfig.url} method="GET" target="_blank" onsubmit={handleSubmit}>
	<svg class="text-content-dim shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
	<input
		bind:this={inputEl}
		bind:value={query}
		type="text"
		name={searchConfig.param || 'q'}
		class="w-full h-[44px] bg-transparent border-none text-content text-[0.85rem] px-3 outline-none font-mono"
		placeholder="Search apps, jump to..."
		autocomplete="off"
	>
	{#if query}
		<button type="button" class="text-content-dim text-sm bg-transparent border-none cursor-pointer hover:text-content px-1" onclick={() => { query = ''; inputEl?.focus(); }}>&times;</button>
	{:else}
		<kbd class="text-content-muted text-[0.6rem] bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card font-mono shrink-0">/</kbd>
	{/if}
</form>
