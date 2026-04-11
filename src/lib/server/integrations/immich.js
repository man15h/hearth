// Immich integration adapter.
//
// Surfaces in this PR:
//   - searchProviders.photos — POSTs to /api/search/smart, returns thumbnails
//
// Reserved for follow-ups (not wired):
//   - widgets (recent photos, on-this-day, etc.)

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'immich',
	name: 'Immich',
	icon: 'di:immich',
	description: 'Photo library with smart search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Immich URL',
			required: true,
			placeholder: 'https://immich.example.com',
			help: 'Base URL of your Immich server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: 'Account Settings → API Keys'
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		try {
			const res = await fetch(`${stripTrailingSlash(config.url)}/api/server/ping`, {
				method: 'GET',
				headers: { 'x-api-key': config.apiKey, accept: 'application/json' }
			});
			if (!res.ok) {
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			// /api/server/ping returns { res: 'pong' } on success.
			// We follow up with /api/users/me to confirm the API key is actually valid
			// (ping is unauthenticated on some Immich versions).
			const meRes = await fetch(`${stripTrailingSlash(config.url)}/api/users/me`, {
				method: 'GET',
				headers: { 'x-api-key': config.apiKey, accept: 'application/json' }
			});
			if (meRes.status === 401 || meRes.status === 403) {
				return { ok: false, message: 'API key rejected by Immich' };
			}
			if (!meRes.ok) {
				return { ok: false, message: `Auth check failed: ${meRes.status}` };
			}
			const me = await meRes.json().catch(() => null);
			const who = me?.email || me?.name || 'Immich user';
			return { ok: true, message: `Connected as ${who}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		photos: {
			label: 'Photos',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const res = await fetch(`${base}/api/search/smart`, {
					method: 'POST',
					headers: {
						'x-api-key': config.apiKey,
						'content-type': 'application/json',
						accept: 'application/json'
					},
					body: JSON.stringify({
						query: trimmed,
						size: Math.min(limit || 20, 50)
					})
				});
				if (!res.ok) {
					throw new Error(`Immich search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = data?.assets?.items || [];
				return {
					results: items.map((asset) => ({
						id: asset.id,
						title: asset.originalFileName || asset.id,
						thumbnail: `${base}/api/assets/${asset.id}/thumbnail?size=preview`,
						href: `${base}/photos/${asset.id}`,
						meta: {
							kind: 'photo',
							takenAt: asset.fileCreatedAt || asset.localDateTime || null
						}
					}))
				};
			}
		}
	},

	widgets: {}
};

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

export default adapter;
