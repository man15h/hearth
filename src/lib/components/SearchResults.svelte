<script>
	let { results = [], loading = false, error = '', query = '', onclose = () => {} } = $props();

	const photoMode = $derived(results.length > 0 && results[0]?.meta?.kind === 'photo');
</script>

<div class="absolute left-0 right-0 top-full mt-1 bg-surface-modal backdrop-blur-xl border border-border-card rounded-xl overflow-hidden z-20 shadow-theme max-h-[60vh] overflow-y-auto">
	{#if loading}
		<div class="px-4 py-3 text-[0.75rem] text-content-dim font-mono">Searching…</div>
	{:else if error}
		<div class="px-4 py-3 text-[0.75rem] text-red-300 font-mono">{error}</div>
	{:else if results.length === 0}
		<div class="px-4 py-3 text-[0.75rem] text-content-dim font-mono">
			{query ? `No results for "${query}"` : 'Type to search…'}
		</div>
	{:else if photoMode}
		<!-- Photo grid -->
		<div class="grid grid-cols-4 max-md:grid-cols-3 gap-1 p-2">
			{#each results as item (item.id)}
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
		{#each results as item (item.id)}
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
