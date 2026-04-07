import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'hearth_prefs';

function loadPrefs() {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
	} catch {
		return {};
	}
}

function saveLocal(prefs) {
	if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

let debounceTimer = null;
let serverSyncEnabled = false;

function debouncedServerSync(prefs) {
	if (!serverSyncEnabled || !browser) return;
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		// Strip session fields — those come from cookies, not prefs
		const { name, username, groups, ...serverPrefs } = prefs;
		fetch('/api/prefs', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(serverPrefs)
		}).catch(() => { /* silent fail — localStorage is the fallback */ });
	}, 300);
}

function createPrefsStore() {
	const { subscribe, set: _set, update: _update } = writable(loadPrefs());

	return {
		subscribe,
		set(value) {
			saveLocal(value);
			debouncedServerSync(value);
			_set(value);
		},
		update(fn) {
			_update((current) => {
				const next = fn(current);
				saveLocal(next);
				debouncedServerSync(next);
				return next;
			});
		},
		reset() {
			if (browser) {
				// Preserve theme preference across logout for login page
				try {
					const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
					if (p?.theme) localStorage.setItem('hearth_theme', p.theme);
				} catch {}
				localStorage.removeItem(STORAGE_KEY);
				localStorage.removeItem('weather_cache');
				localStorage.removeItem('weather_location');
			}
			_set({});
		},

		/** Pull prefs from server, merge over localStorage. One-time on mount. */
		async syncFromServer() {
			if (!browser) return;
			try {
				const res = await fetch('/api/prefs');
				if (!res.ok) return; // no auth or server error — stay localStorage-only

				const data = await res.json();
				const serverPrefs = data.prefs || {};
				const localPrefs = loadPrefs();

				// Migration: if server is empty but local has data, seed the server
				if (Object.keys(serverPrefs).length === 0 && Object.keys(localPrefs).length > 0) {
					const { name, username, groups, adminApps, ...toSync } = localPrefs;
					await fetch('/api/prefs', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(toSync)
					}).catch(() => {});
					serverSyncEnabled = true;
					return; // local prefs are already correct
				}

				// Merge: server wins, but keep local-only fields if server doesn't have them
				const merged = { ...localPrefs, ...serverPrefs };
				saveLocal(merged);
				_set(merged);
				serverSyncEnabled = true;
			} catch {
				// Server unreachable — localStorage-only mode
			}
		}
	};
}

export const prefs = createPrefsStore();
