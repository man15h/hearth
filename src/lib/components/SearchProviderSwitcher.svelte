<script>
	import { onMount } from 'svelte';
	import AppIcon from './AppIcon.svelte';

	let { providers = [], activeId = null, onselect = () => {} } = $props();

	let open = $state(false);
	let rootEl;

	const active = $derived(providers.find((p) => p.id === activeId) || providers[0]);

	function handleClickOutside(e) {
		if (open && rootEl && !rootEl.contains(e.target)) open = false;
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	function pick(provider) {
		open = false;
		onselect(provider.id);
	}
</script>

<div class="relative shrink-0" bind:this={rootEl}>
	<button
		type="button"
		class="flex items-center gap-1.5 h-7 px-2 rounded-lg bg-transparent border border-border-card cursor-pointer hover:bg-surface-card-hover transition-colors"
		onclick={() => (open = !open)}
		title="Search provider"
	>
		{#if active?.icon}
			<AppIcon icon={active.icon} name={active.label} size="w-3 h-3" />
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-content-dim"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
		{/if}
		<span class="text-[0.65rem] text-content-dim font-mono max-md:hidden">{active?.label || 'Search'}</span>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-2.5 h-2.5 text-content-dim">
			<polyline points="6 9 12 15 18 9"/>
		</svg>
	</button>

	{#if open}
		<div class="absolute left-0 top-full mt-1 min-w-[160px] bg-surface-modal backdrop-blur-xl border border-border-card rounded-lg overflow-hidden z-20 shadow-theme">
			{#each providers as provider}
				<button
					type="button"
					class="flex items-center gap-2 w-full px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors text-left {provider.id === activeId ? 'bg-surface-card-strong' : ''}"
					onclick={() => pick(provider)}
				>
					{#if provider.icon}
						<AppIcon icon={provider.icon} name={provider.label} size="w-3 h-3" />
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-content-dim shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					{/if}
					<span class="text-[0.7rem] text-content font-mono flex-1">{provider.label}</span>
					{#if provider.id === activeId}
						<span class="text-[0.6rem] text-content-dim">✓</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
