import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { getConfig } from './config.js';

let db = null;
let stmts = null;

function ensureInit() {
	if (stmts || db === false) return; // already initialized or disabled

	const config = getConfig();
	const dbConfig = config.database || {};

	if (dbConfig.enabled === false) {
		db = false; // mark as disabled
		console.log('[hearth] Database disabled in config — using localStorage-only mode');
		return;
	}

	try {
		const DB_PATH = process.env.DATABASE_PATH || dbConfig.path || './data/hearth.db';
		mkdirSync(dirname(DB_PATH), { recursive: true });

		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');

		db.exec(`
		  CREATE TABLE IF NOT EXISTS user_prefs (
		    username     TEXT PRIMARY KEY,
		    prefs_json   TEXT NOT NULL DEFAULT '{}',
		    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
		  );

		  CREATE TABLE IF NOT EXISTS admin_apps (
		    id           TEXT PRIMARY KEY,
		    name         TEXT NOT NULL,
		    url          TEXT NOT NULL,
		    icon         TEXT,
		    category     TEXT NOT NULL DEFAULT 'Custom',
		    internal     INTEGER NOT NULL DEFAULT 0,
		    sort_order   INTEGER NOT NULL DEFAULT 0,
		    added_by     TEXT NOT NULL,
		    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
		  );
		`);

		stmts = {
			getPrefs: db.prepare('SELECT prefs_json FROM user_prefs WHERE username = ?'),
			upsertPrefs: db.prepare(`
				INSERT INTO user_prefs (username, prefs_json, updated_at)
				VALUES (?, ?, datetime('now'))
				ON CONFLICT(username) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = datetime('now')
			`),
			getAdminApps: db.prepare('SELECT * FROM admin_apps ORDER BY sort_order, created_at'),
			addAdminApp: db.prepare(`
				INSERT INTO admin_apps (id, name, url, icon, category, internal, sort_order, added_by)
				VALUES (@id, @name, @url, @icon, @category, @internal, @sort_order, @added_by)
			`),
			removeAdminApp: db.prepare('DELETE FROM admin_apps WHERE id = ?'),
			getMaxSortOrder: db.prepare('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM admin_apps')
		};

		console.log('[hearth] SQLite database initialized');
	} catch (err) {
		db = false;
		console.log('[hearth] SQLite failed to initialize:', err.message);
	}
}

export function getUserPrefs(username) {
	ensureInit();
	if (!stmts) return {};
	const row = stmts.getPrefs.get(username);
	if (!row) return {};
	try { return JSON.parse(row.prefs_json); }
	catch { return {}; }
}

export function upsertUserPrefs(username, prefs) {
	ensureInit();
	if (!stmts) return;
	stmts.upsertPrefs.run(username, JSON.stringify(prefs));
}

export function mergeUserPrefs(username, partial) {
	ensureInit();
	if (!stmts) return partial;
	const existing = getUserPrefs(username);
	const merged = { ...existing, ...partial };
	upsertUserPrefs(username, merged);
	return merged;
}

export function getAdminApps() {
	ensureInit();
	if (!stmts) return [];
	return stmts.getAdminApps.all().map(row => ({
		id: row.id,
		name: row.name,
		url: row.url,
		icon: row.icon,
		category: row.category,
		self_hosted: !!row.internal,
		sort_order: row.sort_order,
		added_by: row.added_by
	}));
}

export function addAdminApp(app, addedBy) {
	ensureInit();
	if (!stmts) return;
	const maxOrder = stmts.getMaxSortOrder.get().max_order;
	stmts.addAdminApp.run({
		id: app.id || crypto.randomUUID(),
		name: app.name,
		url: app.url,
		icon: app.icon || null,
		category: app.category || 'Custom',
		internal: app.self_hosted ? 1 : 0,
		sort_order: maxOrder + 1,
		added_by: addedBy
	});
}

export function removeAdminApp(id) {
	ensureInit();
	if (!stmts) return false;
	const result = stmts.removeAdminApp.run(id);
	return result.changes > 0;
}

export function isDatabaseEnabled() {
	ensureInit();
	return !!stmts;
}
