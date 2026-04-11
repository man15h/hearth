<script>
	import { onMount, getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import SearchProviderSwitcher from './SearchProviderSwitcher.svelte';
	import SearchResults from './SearchResults.svelte';

	const siteConfig = getContext('config');
	const searchConfig = siteConfig?.search || { enabled: true, url: 'https://www.google.com/search', param: 'q' };

	let { query = $bindable('') } = $props();
	let inputEl;

	// ── Provider model ──────────────────────────────────────────
	// "providers" merges the legacy `search:` fallback (id=`web`) with any
	// connected integration search providers (id=`<integrationId>:<key>`).
	// When the list has length 1 and that 1 is `web`, the bar behaves
	// EXACTLY as it did before this PR — no switcher, form submit only.

	const webProvider = $derived(
		searchConfig?.enabled !== false
			? {
					id: 'web',
					label: 'Web',
					mode: 'redirect',
					redirectUrl: searchConfig.url,
					redirectParam: searchConfig.param || 'q',
					icon: null
			  }
			: null
	);

	const integrationProviders = $derived.by(() => {
		const out = [];
		for (const it of $integrationsStore.integrations) {
			if (!it.userState?.connected) continue;
			if (it.userState?.surfaces?.search === false) continue;
			if (!(it.availableSurfaces || []).includes('search')) continue;
			for (const [key, prov] of Object.entries(it.searchProviders || {})) {
				out.push({
					id: `${it.id}:${key}`,
					label: `${it.name} ${prov.label}`.trim(),
					mode: prov.mode,
					icon: it.icon
				});
			}
		}
		return out;
	});

	const providers = $derived(
		[webProvider, ...integrationProviders].filter(Boolean)
	);

	const showSwitcher = $derived(providers.length > 1);

	const activeProviderId = $derived(
		providers.find((p) => p.id === $prefs.searchProvider)?.id || providers[0]?.id || null
	);

	const activeProvider = $derived(providers.find((p) => p.id === activeProviderId) || providers[0] || null);

	// Load the integrations registry once on mount so the switcher and
	// inline-mode providers are visible without requiring focus first.
	// The fetch is a no-op on subsequent mounts thanks to the store's
	// in-memory cache; users with no integrations enabled get an empty
	// list (and the switcher stays hidden — see `showSwitcher`).
	let triedLoad = false;
	function ensureIntegrationsLoaded() {
		if (triedLoad) return;
		triedLoad = true;
		integrationsStore.load();
	}

	function selectProvider(id) {
		prefs.update((p) => ({ ...p, searchProvider: id }));
	}

	// ── Inline-mode search dispatch ─────────────────────────────
	let inlineResults = $state([]);
	let inlineLoading = $state(false);
	let inlineError = $state('');
	let inlineOpen = $state(false);
	let debounceTimer = null;
	let lastDispatched = '';

	function closeInline() {
		inlineOpen = false;
	}

	function dispatchInlineSearch(provider, q) {
		clearTimeout(debounceTimer);
		const trimmed = (q || '').trim();
		if (!trimmed) {
			inlineResults = [];
			inlineError = '';
			inlineLoading = false;
			return;
		}
		debounceTimer = setTimeout(async () => {
			inlineLoading = true;
			inlineError = '';
			lastDispatched = trimmed;
			try {
				const res = await fetch('/api/search', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ provider: provider.id, query: trimmed, limit: 24 })
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					throw new Error(err.error || `HTTP ${res.status}`);
				}
				const data = await res.json();
				if (lastDispatched === trimmed) {
					inlineResults = data.results || [];
				}
			} catch (err) {
				if (lastDispatched === trimmed) {
					inlineError = err.message || 'Search failed';
					inlineResults = [];
				}
			} finally {
				if (lastDispatched === trimmed) inlineLoading = false;
			}
		}, 250);
	}

	$effect(() => {
		if (activeProvider?.mode === 'inline') {
			dispatchInlineSearch(activeProvider, query);
		} else {
			inlineResults = [];
			inlineLoading = false;
			inlineError = '';
		}
	});

	onMount(() => {
		ensureIntegrationsLoaded();
		function onKeydown(e) {
			if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
				e.preventDefault();
				inputEl?.focus();
			}
			if (e.key === 'Escape' && document.activeElement === inputEl) {
				query = '';
				inlineOpen = false;
				inputEl.blur();
			}
		}
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});

	function handleSubmit(e) {
		// Inline providers don't form-submit — results are already in the dropdown.
		if (activeProvider?.mode === 'inline') {
			e.preventDefault();
			return;
		}
		if (!query.trim()) {
			e.preventDefault();
		}
	}

	function handleFocus() {
		ensureIntegrationsLoaded();
		if (activeProvider?.mode === 'inline') inlineOpen = true;
	}

	function handleInput() {
		if (activeProvider?.mode === 'inline') inlineOpen = true;
	}
</script>

<div class="relative mb-3">
	<form
		class="flex items-center gap-2 rounded-xl px-3 transition-all duration-200 focus-within:border-border-pill focus-within:ring-1 focus-within:ring-border-pill/40"
		style="background: var(--card-bg); border: 1px solid var(--divider);"
		action={activeProvider?.mode === 'redirect' ? activeProvider.redirectUrl : undefined}
		method="GET"
		target="_blank"
		onsubmit={handleSubmit}
	>
		{#if showSwitcher}
			<SearchProviderSwitcher providers={providers} activeId={activeProviderId} onselect={selectProvider} />
		{:else}
			<svg class="text-content-dim shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
		{/if}

		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			name={activeProvider?.mode === 'redirect' ? activeProvider.redirectParam : 'q'}
			class="w-full h-[44px] bg-transparent border-none text-content text-[0.85rem] px-1 outline-none font-mono"
			placeholder={activeProvider?.mode === 'inline' ? `Search ${activeProvider.label.toLowerCase()}…` : 'Search apps, jump to...'}
			autocomplete="off"
			onfocus={handleFocus}
			oninput={handleInput}
		/>

		{#if query}
			<button type="button" class="text-content-dim text-sm bg-transparent border-none cursor-pointer hover:text-content px-1" onclick={() => { query = ''; inputEl?.focus(); }}>&times;</button>
		{:else}
			<kbd class="text-content-muted text-[0.6rem] bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card font-mono shrink-0">/</kbd>
		{/if}
	</form>

	{#if inlineOpen && activeProvider?.mode === 'inline' && query.trim()}
		<SearchResults
			results={inlineResults}
			loading={inlineLoading}
			error={inlineError}
			query={query}
			onclose={closeInline}
		/>
	{/if}
</div>
