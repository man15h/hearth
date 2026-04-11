import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// Client-side cache of /api/integrations.
//
// Lazy: nothing fetched until something calls `load()` (typically the first
// time the Integrations tab opens). Result is cached in-memory; calls during
// in-flight loads share the same promise.

function createIntegrationsStore() {
	const state = writable({ loaded: false, loading: false, integrations: [] });
	let inflight = null;

	async function fetchAndSet() {
		try {
			const res = await fetch('/api/integrations');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			state.set({ loaded: true, loading: false, integrations: data.integrations || [] });
		} catch {
			state.set({ loaded: true, loading: false, integrations: [] });
		} finally {
			inflight = null;
		}
	}

	async function load({ force = false } = {}) {
		if (!browser) return;
		const cur = get(state);
		if (cur.loaded && !force) return;
		if (inflight) return inflight;
		state.update((s) => ({ ...s, loading: true }));
		inflight = fetchAndSet();
		return inflight;
	}

	async function save(integrationId, payload) {
		const res = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || `Save failed (${res.status})`);
		}
		const data = await res.json();
		// Patch the cached entry in place.
		state.update((s) => ({
			...s,
			integrations: s.integrations.map((it) =>
				it.id === integrationId ? { ...it, userState: data.userState } : it
			)
		}));
		return data;
	}

	async function disconnect(integrationId) {
		const res = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}`, { method: 'DELETE' });
		if (!res.ok) throw new Error(`Disconnect failed (${res.status})`);
		state.update((s) => ({
			...s,
			integrations: s.integrations.map((it) =>
				it.id === integrationId
					? { ...it, userState: { connected: false, config: {}, surfaces: {} } }
					: it
			)
		}));
	}

	async function test(integrationId, config) {
		const res = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/test`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ config })
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return { ok: false, message: err.error || `HTTP ${res.status}` };
		}
		return await res.json();
	}

	return {
		subscribe: state.subscribe,
		load,
		save,
		disconnect,
		test
	};
}

export const integrations = createIntegrationsStore();
