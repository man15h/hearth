<script>
	import { onMount, getContext } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import SearchResults from './SearchResults.svelte';

	const siteConfig = getContext('config');
	const searchConfig = siteConfig?.search || { enabled: true, url: 'https://www.google.com/search', param: 'q' };

	let { query = $bindable(''), apps = [], onEditLayout = null } = $props();
	let inputEl;
	let containerEl;

	// ── Provider model — unified search ───────────────────────────
	// There is no provider switcher. The form's submit target is the
	// configured web search (Enter key fires it in a new tab). Every
	// connected integration that exposes inline-mode search providers
	// AND has the user's `surfaces.search` toggle on runs automatically
	// on every keystroke; results land in the dropdown below the bar.
	//
	// This matches the iPhone Spotlight model: one box, one experience,
	// no clicks to switch contexts.

	const inlineProviders = $derived.by(() => {
		const out = [];
		for (const it of $integrationsStore.integrations) {
			if (!it.userState?.connected) continue;
			if (it.userState?.surfaces?.search === false) continue;
			if (!(it.availableSurfaces || []).includes('search')) continue;
			for (const [key, prov] of Object.entries(it.searchProviders || {})) {
				if (prov.mode !== 'inline') continue;
				out.push({
					providerId: `${it.id}:${key}`,
					integrationId: it.id,
					integrationName: it.name,
					integrationIcon: it.icon,
					providerKey: key,
					label: prov.label,
					searchUrl: it.operatorDefaults?.url || it.userState?.config?.url || null
				});
			}
		}
		return out;
	});

	const hasInlineProviders = $derived(inlineProviders.length > 0);

	// Lazy-load the integrations registry once on mount so the inline
	// providers list is populated without requiring focus first.
	let triedLoad = false;
	function ensureIntegrationsLoaded() {
		if (triedLoad) return;
		triedLoad = true;
		integrationsStore.load();
	}

	// ── Inline-mode search dispatch ───────────────────────────────
	// One results bucket per provider. Keyed by providerId so multiple
	// providers in the future render as separate sections in the dropdown.
	let providerResults = $state({}); // providerId → { results, loading, error }
	let inlineOpen = $state(false);
	let debounceTimer = null;
	let lastDispatched = '';

	function closeInline() {
		inlineOpen = false;
	}

	async function fireOneProvider(provider, q) {
		providerResults = {
			...providerResults,
			[provider.providerId]: { ...(providerResults[provider.providerId] || {}), loading: true, error: '' }
		};
		try {
			const res = await fetch('/api/search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: provider.providerId, query: q, limit: 24 })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error || `HTTP ${res.status}`);
			}
			const data = await res.json();
			if (lastDispatched !== q) return; // a newer query has overtaken us
			providerResults = {
				...providerResults,
				[provider.providerId]: {
					results: data.results || [],
					loading: false,
					error: ''
				}
			};
		} catch (err) {
			if (lastDispatched !== q) return;
			providerResults = {
				...providerResults,
				[provider.providerId]: {
					results: [],
					loading: false,
					error: err.message || 'Search failed'
				}
			};
		}
	}

	function dispatchSearch(q) {
		clearTimeout(debounceTimer);
		const trimmed = (q || '').trim();
		if (!trimmed) {
			providerResults = {};
			return;
		}
		debounceTimer = setTimeout(() => {
			lastDispatched = trimmed;
			for (const provider of inlineProviders) {
				fireOneProvider(provider, trimmed);
			}
		}, 250);
	}

	$effect(() => {
		if (hasInlineProviders) {
			dispatchSearch(query);
		} else {
			providerResults = {};
		}
	});

	// Close on click outside
	onMount(() => {
		ensureIntegrationsLoaded();

		function onClickOutside(e) {
			if (inlineOpen && containerEl && !containerEl.contains(e.target)) {
				inlineOpen = false;
			}
		}
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
		document.addEventListener('mousedown', onClickOutside);
		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.removeEventListener('mousedown', onClickOutside);
		};
	});

	function handleSubmit(e) {
		// Enter key on the form → web search in a new tab. Behavior preserved
		// from pre-integrations Hearth: empty query is a no-op, otherwise the
		// browser does a normal form submit to the configured search URL.
		if (!query.trim()) e.preventDefault();
	}

	function handleFocus() {
		ensureIntegrationsLoaded();
		inlineOpen = true;
	}

	function handleInput() {
		inlineOpen = true;
	}
</script>

<div class="relative" bind:this={containerEl}>
	<form
		class="flex items-center rounded-xl px-4 transition-all duration-200 focus-within:border-border-pill focus-within:ring-1 focus-within:ring-border-pill/40"
		style="background: var(--card-bg); border: 1px solid var(--divider);"
		action={searchConfig.url}
		method="GET"
		target="_blank"
		onsubmit={handleSubmit}
	>
		<svg class="text-content-dim shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			name={searchConfig.param || 'q'}
			class="w-full h-[44px] bg-transparent border-none text-content text-[0.85rem] px-3 outline-none font-mono"
			placeholder="Search apps, jump to..."
			autocomplete="off"
			onfocus={handleFocus}
			oninput={handleInput}
		/>

		{#if query}
			<button type="button" class="text-content-dim text-sm bg-transparent border-none cursor-pointer hover:text-content px-1" onclick={() => { query = ''; inputEl?.focus(); }}>&times;</button>
		{:else}
			<kbd class="text-content-muted text-[0.6rem] bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card font-mono shrink-0">/</kbd>
		{/if}
		{#if onEditLayout}
			<button
				type="button"
				onclick={(e) => { e.preventDefault(); e.stopPropagation(); onEditLayout(); }}
				aria-label="Edit home screen"
				title="Rearrange apps"
				class="ml-2 pl-2 border-l border-border-card text-content-dim hover:text-content transition-colors duration-150 flex items-center justify-center shrink-0 bg-transparent cursor-pointer"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="7" height="7" rx="1.5"/>
					<rect x="14" y="3" width="7" height="7" rx="1.5"/>
					<rect x="3" y="14" width="7" height="7" rx="1.5"/>
					<path d="M14 17.5h7M17.5 14v7"/>
				</svg>
			</button>
		{/if}
	</form>

	{#if inlineOpen && query.trim()}
		<SearchResults
			{apps}
			providers={inlineProviders}
			providerResults={providerResults}
			query={query}
			{searchConfig}
			onclose={closeInline}
		/>
	{/if}
</div>
