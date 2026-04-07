import { json } from '@sveltejs/kit';
import { getSessionUser, isAdmin } from '$lib/server/session.js';
import { getAuth } from '$lib/server/config.js';
import { removeAdminApp } from '$lib/server/db.js';

export function DELETE({ cookies, url, params }) {
	const user = getSessionUser(cookies, url);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const authConfig = getAuth();
	if (!isAdmin(user, authConfig)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const deleted = removeAdminApp(params.id);
	if (!deleted) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
}
