<script>
	import AppIcon from './AppIcon.svelte';

	let {
		providers = [],
		providerResults = {},
		query = '',
		webUrl = '',
		webParam = 'q',
		onclose = () => {}
	} = $props();

	// Build the per-provider rendering data once per state change.
	const sections = $derived(
		providers.map((p) => {
			const data = providerResults[p.providerId] || {};
			const results = data.results || [];
			return {
				provider: p,
				loading: !!data.loading,
				error: data.error || '',
				results,
				photoMode: results.length > 0 && results[0]?.meta?.kind === 'photo'
			};
		})
	);

	const anyLoading = $derived(sections.some((s) => s.loading));
	const anyResults = $derived(sections.some((s) => s.results.length > 0));

	const webHref = $derived(
		webUrl ? `${webUrl}${webUrl.includes('?') ? '&' : '?'}${webParam}=${encodeURIComponent(query)}` : ''
	);
</script>

<div class="absolute left-0 right-0 top-full mt-1 bg-surface-modal backdrop-blur-xl border border-border-card rounded-xl overflow-hidden z-20 shadow-theme max-h-[60vh] overflow-y-auto">
	{#each sections as section (section.provider.providerId)}
		<div class="border-b border-border-card last:border-b-0">
			<!-- Section header -->
			<div class="flex items-center gap-2 px-3 py-2 bg-surface-card/40">
				<AppIcon icon={section.provider.integrationIcon} name={section.provider.integrationName} size="w-3 h-3" />
				<span class="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-content-dim">
					{section.provider.integrationName} {section.provider.label}
				</span>
				{#if section.loading}
					<span class="text-[0.6rem] text-content-dim font-mono ml-1">searching…</span>
				{:else if section.results.length > 0}
					<span class="text-[0.6rem] text-content-dim font-mono ml-1">{section.results.length}</span>
				{/if}
			</div>

			{#if section.error}
				<div class="px-3 py-2 text-[0.7rem] text-red-300 font-mono">{section.error}</div>
			{:else if !section.loading && section.results.length === 0}
				<div class="px-3 py-2 text-[0.7rem] text-content-dim font-mono">No results</div>
			{:else if section.photoMode}
				<!-- Photo grid — small tiles, dense layout. -->
				<div class="grid grid-cols-6 max-md:grid-cols-4 gap-1 p-2">
					{#each section.results as item (item.id)}
						<a
							href={item.href}
							target="_blank"
							rel="noopener noreferrer"
							class="relative aspect-square rounded-md overflow-hidden bg-surface-card-strong group"
							title={item.title}
							onclick={onclose}
						>
							{#if item.thumbnail}
								<img
									src={item.thumbnail}
									alt={item.title}
									loading="lazy"
									class="absolute inset-0 w-full h-full object-cover"
									referrerpolicy="no-referrer"
								/>
							{/if}
							<div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors"></div>
						</a>
					{/each}
				</div>
			{:else}
				<!-- Generic list -->
				{#each section.results as item (item.id)}
					<a
						href={item.href}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-3 px-4 py-2 hover:bg-surface-card-hover transition-colors no-underline"
						onclick={onclose}
					>
						{#if item.thumbnail}
							<img src={item.thumbnail} alt="" loading="lazy" class="w-8 h-8 rounded object-cover shrink-0" referrerpolicy="no-referrer" />
						{/if}
						<span class="text-[0.8rem] text-content font-mono truncate flex-1">{item.title}</span>
					</a>
				{/each}
			{/if}
		</div>
	{/each}

	<!-- Web search footer -->
	{#if webHref}
		<a
			href={webHref}
			target="_blank"
			rel="noopener noreferrer"
			class="flex items-center gap-2 px-4 py-2.5 bg-surface-card/30 hover:bg-surface-card-hover transition-colors no-underline border-t border-border-card"
			onclick={onclose}
		>
			<svg class="w-3.5 h-3.5 text-content-dim shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
			<span class="text-[0.75rem] text-content-dim font-mono flex-1">Search the web for "<span class="text-content-muted">{query}</span>"</span>
			<kbd class="text-content-muted text-[0.55rem] bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card font-mono">↵</kbd>
		</a>
	{/if}

	{#if !anyResults && !anyLoading && sections.length === 0}
		<div class="px-4 py-3 text-[0.75rem] text-content-dim font-mono">Type to search…</div>
	{/if}
</div>
