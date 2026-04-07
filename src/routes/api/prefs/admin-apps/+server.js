import { json } from '@sveltejs/kit';
import { getSessionUser, isAdmin } from '$lib/server/session.js';
import { getAuth } from '$lib/server/config.js';
import { getAdminApps, addAdminApp } from '$lib/server/db.js';

export function GET({ cookies, url }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	return json({ adminApps: getAdminApps() });
}

export async function POST({ cookies, url, request }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const authConfig = getAuth();
	if (!isAdmin(user, authConfig)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	let app;
	try { app = await request.json(); }
	catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

	if (!app.name || !app.url) {
		return json({ error: 'name and url required' }, { status: 400 });
	}

	// Validate URL scheme to prevent javascript: XSS
	try {
		const parsed = new URL(app.url);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return json({ error: 'URL must use http or https' }, { status: 400 });
		}
	} catch {
		return json({ error: 'Invalid URL' }, { status: 400 });
	}

	const id = crypto.randomUUID();
	addAdminApp({ ...app, id }, user.username);
	return json({ ok: true, id }, { status: 201 });
}
