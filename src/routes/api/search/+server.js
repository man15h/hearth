import { json } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/session.js';
import { getAdapter } from '$lib/server/integrations/index.js';
import { getConnection } from '$lib/server/integrations/store.js';

// POST /api/search   body: { provider, query, limit? }
//
// `provider` is the colon-joined "<integrationId>:<providerKey>" string
// chosen by the user (e.g. "immich:photos"). The dispatcher resolves the
// adapter, loads the user's stored credentials, and invokes the adapter's
// query() function. Adapters never see another user's data — the connection
// is keyed on the session username.

export async function POST({ cookies, url, request, fetch }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	let body;
	try {
		const text = await request.text();
		if (text.length > 4096) return json({ error: 'Payload too large' }, { status: 413 });
		body = JSON.parse(text);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const provider = String(body?.provider || '');
	const query = String(body?.query || '');
	const limit = Number.isFinite(body?.limit) ? Math.min(Math.max(body.limit, 1), 50) : 20;

	const [integrationId, providerKey] = provider.split(':');
	if (!integrationId || !providerKey) {
		return json({ error: 'provider must look like "<integration>:<provider>"' }, { status: 400 });
	}

	const adapter = getAdapter(integrationId);
	if (!adapter) return json({ error: 'Unknown integration' }, { status: 404 });

	const searchProvider = adapter.searchProviders?.[providerKey];
	if (!searchProvider) return json({ error: 'Unknown search provider' }, { status: 404 });

	const conn = await getConnection(user.username, adapter.id);
	if (!conn?.connected) {
		return json({ error: 'Integration not connected' }, { status: 409 });
	}

	try {
		const result = await searchProvider.query({
			config: conn.config,
			query,
			limit,
			fetch
		});
		return json({ results: result?.results || [] });
	} catch (err) {
		return json({ error: `Search failed: ${err.message}` }, { status: 502 });
	}
}
