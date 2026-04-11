<script>
	import AppIcon from './AppIcon.svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';

	let { integration, iconStyle = 'colored' } = $props();

	// Local form state — seeded from server-known values + operator defaults
	function seedConfig() {
		const out = {};
		for (const f of integration.configSchema) {
			const known = integration.userState?.config?.[f.key];
			const opDefault = integration.operatorDefaults?.[f.key];
			out[f.key] = known ?? opDefault ?? '';
		}
		return out;
	}

	function seedSurfaces() {
		const out = {};
		for (const surface of integration.availableSurfaces || []) {
			out[surface] = !!integration.userState?.surfaces?.[surface];
		}
		return out;
	}

	let formConfig = $state(seedConfig());
	let formSurfaces = $state(seedSurfaces());
	let expanded = $state(!integration.userState?.connected);
	let testStatus = $state(null); // null | { ok, message }
	let testing = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let dirty = $state(false);

	const connected = $derived(!!integration.userState?.connected);
	const hasSearch = $derived((integration.availableSurfaces || []).includes('search'));
	const hasWidgets = $derived((integration.availableSurfaces || []).includes('widgets'));

	function markDirty() {
		dirty = true;
		testStatus = null;
		saveError = '';
	}

	async function runTest() {
		testing = true;
		testStatus = null;
		try {
			testStatus = await integrationsStore.test(integration.id, formConfig);
		} finally {
			testing = false;
		}
	}

	async function runSave() {
		saving = true;
		saveError = '';
		try {
			// If we haven't tested yet on a fresh connect, run test() first so the
			// "search auto-on after successful test" rule fires correctly.
			if (!connected && !testStatus?.ok) {
				const res = await integrationsStore.test(integration.id, formConfig);
				testStatus = res;
				if (!res.ok) {
					saveError = res.message || 'Test failed — fix credentials before saving';
					return;
				}
			}
			// Auto-enable search on first successful save (rule from iter 4).
			const willConnectFresh = !connected;
			const surfacesToSave = { ...formSurfaces };
			if (willConnectFresh && hasSearch && surfacesToSave.search !== false) {
				surfacesToSave.search = true;
				formSurfaces = surfacesToSave;
			}
			await integrationsStore.save(integration.id, { config: formConfig, surfaces: surfacesToSave });
			dirty = false;
		} catch (err) {
			saveError = err.message || 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function runDisconnect() {
		if (!connected) return;
		if (!confirm(`Disconnect ${integration.name}? Stored credentials will be removed.`)) return;
		saving = true;
		try {
			await integrationsStore.disconnect(integration.id);
			formConfig = seedConfig();
			formSurfaces = seedSurfaces();
			testStatus = null;
			dirty = false;
		} finally {
			saving = false;
		}
	}

	async function toggleSurface(surface) {
		// Toggling a surface on a connected integration writes immediately —
		// no Save button needed because credentials aren't changing.
		if (!connected) {
			formSurfaces = { ...formSurfaces, [surface]: !formSurfaces[surface] };
			return;
		}
		const next = { ...formSurfaces, [surface]: !formSurfaces[surface] };
		formSurfaces = next;
		try {
			await integrationsStore.save(integration.id, {
				config: integration.userState.config, // bullets — server keeps existing
				surfaces: next
			});
		} catch (err) {
			// Roll back on failure
			formSurfaces = { ...formSurfaces, [surface]: !formSurfaces[surface] };
			saveError = err.message || 'Failed to update surface';
		}
	}
</script>

<div class="border border-border-card rounded-xl overflow-hidden bg-surface-card/30">
	<!-- Header -->
	<button
		class="flex items-center gap-3 w-full px-3 py-2.5 bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors text-left"
		onclick={() => (expanded = !expanded)}
	>
		<AppIcon icon={integration.icon} name={integration.name} size="w-3.5 h-3.5" wrapSize="w-6 h-6" {iconStyle} wrap />
		<div class="flex-1 min-w-0">
			<div class="text-[0.8rem] text-content font-medium">{integration.name}</div>
			<div class="text-[0.65rem] text-content-dim truncate">{integration.description}</div>
		</div>
		{#if connected}
			<span class="text-[0.6rem] font-mono uppercase tracking-wider text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-400/30">Connected</span>
		{:else}
			<span class="text-[0.6rem] font-mono uppercase tracking-wider text-content-dim px-1.5 py-0.5 rounded border border-border-card">Off</span>
		{/if}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-content-dim transition-transform {expanded ? 'rotate-180' : ''}">
			<polyline points="6 9 12 15 18 9"/>
		</svg>
	</button>

	{#if expanded}
		<div class="px-3 pb-3 pt-1 border-t border-border-card space-y-3">
			<!-- Connection form -->
			<div class="space-y-2">
				<div class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim">Connection</div>
				{#each integration.configSchema as field}
					<label class="block">
						<span class="block text-[0.7rem] text-content-dim mb-1">{field.label}{field.required ? ' *' : ''}</span>
						<input
							type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'}
							bind:value={formConfig[field.key]}
							placeholder={field.placeholder}
							oninput={markDirty}
							class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill"
							autocomplete="off"
							spellcheck="false"
						/>
						{#if field.help}
							<span class="block text-[0.6rem] text-content-dim mt-1">{field.help}</span>
						{/if}
					</label>
				{/each}

				<!-- Test result -->
				{#if testStatus}
					<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded {testStatus.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}">
						{testStatus.ok ? '✓' : '✗'} {testStatus.message}
					</div>
				{/if}
				{#if saveError}
					<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">
						{saveError}
					</div>
				{/if}

				<div class="flex gap-2 pt-1">
					<button
						class="py-1.5 px-3 rounded-lg text-[0.75rem] font-mono bg-transparent text-content-dim border border-border-card cursor-pointer hover:text-content transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						disabled={testing}
						onclick={runTest}
					>{testing ? 'Testing…' : 'Test'}</button>
					<button
						class="py-1.5 px-3 rounded-lg text-[0.75rem] font-mono bg-surface-card-strong text-content border border-border-card cursor-pointer hover:bg-surface-card-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						disabled={saving || (!dirty && connected)}
						onclick={runSave}
					>{saving ? 'Saving…' : connected ? 'Save' : 'Connect'}</button>
				</div>
			</div>

			<!-- Surface toggles — only when operator enabled them -->
			{#if (hasSearch || hasWidgets) && connected}
				<div class="space-y-2 pt-2 border-t border-border-card">
					<div class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim">Use for</div>
					{#if hasSearch}
						<button
							class="flex items-center justify-between w-full bg-transparent border-none cursor-pointer text-left py-1"
							onclick={() => toggleSurface('search')}
						>
							<span class="text-[0.75rem] text-content-muted">Search provider</span>
							<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {formSurfaces.search ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {formSurfaces.search ? 'translate-x-4' : 'translate-x-0.5'}"></div>
							</div>
						</button>
					{/if}
					{#if hasWidgets}
						<div class="flex items-center justify-between py-1 opacity-50" title="Coming in a future release">
							<span class="text-[0.75rem] text-content-muted">Widgets <span class="text-[0.6rem] text-content-dim">— coming soon</span></span>
							<div class="w-9 h-5 rounded-full bg-surface-toggle-off relative shrink-0">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow translate-x-0.5"></div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if connected}
				<div class="pt-2 border-t border-border-card">
					<button
						class="text-[0.65rem] text-red-400/70 bg-transparent border-none cursor-pointer hover:text-red-300 transition-colors font-mono"
						onclick={runDisconnect}
					>Remove connection</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
