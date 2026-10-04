// GET /api/icon/:source/:name
//
// Same-origin cache in front of the public icon CDNs, so a dashboard load
// costs one round-trip to Hearth instead of ~40 to jsdelivr/simpleicons, and
// visitors' IPs and Referer never reach those CDNs. Only the three known
// sources and plain slugs are accepted: this is not an open proxy.

const SOURCES = {
	di: (name) => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${name}.svg`,
	si: (name) => `https://cdn.simpleicons.org/${name}`,
	lucide: (name) => `https://cdn.jsdelivr.net/npm/lucide-static/icons/${name}.svg`
};
const SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/i;
const MAX_ENTRIES = 500;
const TTL_MS = 24 * 60 * 60 * 1000;

// key → { status, body, type, ts }. Misses are cached too: simpleicons is
// tried as a mono fallback for every app and 404s for many of them.
const cache = new Map();

// Upstream SVGs are third-party content served from our origin; sandbox them
// so opening one directly can't run script as Hearth.
const SVG_HEADERS = {
	'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
	'x-content-type-options': 'nosniff'
};

export async function GET({ params, fetch }) {
	const toUrl = SOURCES[params.source];
	const name = params.name.replace(/\.svg$/i, '');
	if (!toUrl || !SLUG.test(name)) return new Response('Not found', { status: 404 });

	const key = `${params.source}:${name}`;
	let entry = cache.get(key);
	if (!entry || Date.now() - entry.ts > TTL_MS) {
		try {
			const res = await fetch(toUrl(name), { signal: AbortSignal.timeout(8000) });
			entry = res.ok
				? { status: 200, body: await res.arrayBuffer(), type: res.headers.get('content-type') || 'image/svg+xml', ts: Date.now() }
				: { status: 404, ts: Date.now() };
		} catch {
			// Don't cache network failures; serve a stale copy if there is one.
			if (!entry) return new Response('Icon unavailable', { status: 502 });
		}
		cache.delete(key);
		cache.set(key, entry);
		if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
	}

	if (entry.status !== 200) {
		return new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=3600' } });
	}
	return new Response(entry.body, {
		headers: {
			...SVG_HEADERS,
			'content-type': entry.type,
			'cache-control': 'public, max-age=86400, stale-while-revalidate=604800'
		}
	});
}
