import { json } from '@sveltejs/kit';
import { getSessionUser, isAdmin } from '$lib/server/session.js';
import { getAuth } from '$lib/server/config.js';
import { getUserPrefs, upsertUserPrefs, mergeUserPrefs, getAdminApps } from '$lib/server/db.js';
export function GET({ cookies, url }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	return json({
		prefs: getUserPrefs(user.username),
		adminApps: getAdminApps()
	});
}
export async function PUT({ cookies, url, request }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	const text = await request.text();
	if (text.length > 65536) return json({ error: 'Payload too large' }, { status: 413 });
	let prefs;
	try { prefs = JSON.parse(text); }
	catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }
	upsertUserPrefs(user.username, prefs);
	return json({ ok: true });
}
export async function PATCH({ cookies, url, request }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	const text = await request.text();
	if (text.length > 65536) return json({ error: 'Payload too large' }, { status: 413 });
	let partial;
	try { partial = JSON.parse(text); }
	catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }
	const merged = mergeUserPrefs(user.username, partial);
	return json({ prefs: merged });
}
