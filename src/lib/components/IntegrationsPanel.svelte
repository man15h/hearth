<script>
	import { onMount } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import IntegrationCard from './IntegrationCard.svelte';

	let { iconStyle = 'colored' } = $props();

	onMount(() => {
		integrationsStore.load();
	});
</script>

<div>
	<div class="mb-4">
		<div class="text-[0.85rem] font-semibold text-content">Integrations</div>
		<div class="text-[0.7rem] text-content-dim mt-0.5">Connect your apps to search and interact with them from Hearth.</div>
	</div>

	{#if $integrationsStore.loading && !$integrationsStore.loaded}
		<div class="text-[0.75rem] text-content-dim font-mono px-1 py-2">Loading integrations…</div>
	{:else if $integrationsStore.integrations.length === 0}
		<div class="text-[0.75rem] text-content-dim font-mono px-1 py-2 leading-relaxed">
			No integrations enabled. Ask your administrator to add an
			<code class="text-content-muted">integrations:</code> section to <code class="text-content-muted">config.yml</code>.
		</div>
	{:else}
		<div class="flex flex-col gap-1">
			{#each $integrationsStore.integrations as integration (integration.id)}
				<IntegrationCard {integration} {iconStyle} />
			{/each}
		</div>
	{/if}
</div>
