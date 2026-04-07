export async function GET({ params }) {
	const id = params.id.replace(/[^0-9]/g, '').padStart(4, '0');
	const upstream = `https://gitlab.com/dwt1/wallpapers/-/raw/master/${id}.jpg`;

	const res = await fetch(upstream);
	if (!res.ok) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(res.body, {
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
			'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
		}
	});
}
