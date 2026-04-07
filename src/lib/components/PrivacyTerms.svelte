<script>
	import { getContext } from 'svelte';

	const siteConfig = getContext('config');
	const brandName = siteConfig?.branding?.name || 'Hearth';
	const privacyConfig = siteConfig?.privacy || {};
	const sections = privacyConfig.sections || [];
	const lastUpdated = privacyConfig.last_updated || '';
	const privacyHtml = privacyConfig.html || null;

	let { open = $bindable(false), standalone = false } = $props();

	function portal(node) {
		document.body.appendChild(node);
		return { destroy() { if (node.parentNode) node.parentNode.removeChild(node); } };
	}
</script>

{#if open}
	<div
		use:portal
		class="fixed inset-0 bg-surface-overlay backdrop-blur-[6px] flex items-center justify-center z-[100] p-4 animate-fade-in"
		onclick={() => open = false}
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
		role="button"
		tabindex="-1"
	>
	<div class="glass-card rounded-2xl p-8 w-full max-w-[480px] max-h-[80vh] overflow-y-auto shadow-theme animate-modal-enter text-content-dim text-[0.78rem] leading-[1.7] relative" onclick={(e) => e.stopPropagation()}>
		<button class="absolute top-4 right-5 bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content" onclick={() => open = false}>&times;</button>
		<h2 class="text-base font-semibold text-content mb-1">Privacy & Terms</h2>
		{#if lastUpdated}
		<p class="opacity-50 text-[0.7rem]">Last updated: {lastUpdated}</p>
		{/if}

		{#if privacyHtml}
			<div class="privacy-md">{@html privacyHtml}</div>
		{:else}
			{#each sections as section}
				<h3 class="text-[0.8rem] font-semibold text-content mt-5 mb-1">{section.title}</h3>
				<ul class="pl-5 my-1">
					{#each section.items as item}
						<li class="mb-0.5">{item}</li>
					{/each}
				</ul>
			{/each}
		{/if}
	</div>
	</div>
{/if}

<style>
	.privacy-md :global(h1),
	.privacy-md :global(h2),
	.privacy-md :global(h3) {
		color: var(--text);
		font-weight: 600;
		margin-top: 1.25rem;
		margin-bottom: 0.25rem;
	}
	.privacy-md :global(h1) { font-size: 0.95rem; }
	.privacy-md :global(h2) { font-size: 0.85rem; }
	.privacy-md :global(h3) { font-size: 0.8rem; }
	.privacy-md :global(p) { margin: 0.5rem 0; }
	.privacy-md :global(ul) { padding-left: 1.25rem; margin: 0.25rem 0; }
	.privacy-md :global(li) { margin-bottom: 0.125rem; }
	.privacy-md :global(a) { color: var(--text-muted); text-decoration: underline; }
	.privacy-md :global(a:hover) { color: var(--text); }
	.privacy-md :global(strong) { color: var(--text); }
</style>

{#if !standalone}
<div class="flex items-center justify-center gap-2 pt-8 pb-4 text-[0.7rem] text-content-dim">
	<span>{brandName}</span>
	{#if privacyConfig.enabled}
	<span class="opacity-50">&middot;</span>
	<button class="bg-transparent border-none text-content-dim font-mono text-[0.7rem] cursor-pointer p-0 no-underline hover:text-content-dim" onclick={() => open = true}>Privacy & Terms</button>
	{/if}
</div>
{/if}
