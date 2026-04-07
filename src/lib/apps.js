// Apps module — builds categories, defaults, and setup guides from config data.
// On the server, config is loaded from YAML. On the client, it's passed via page data.

export function buildAppsFromConfig(appsConfig) {
	const categories = (appsConfig || []).map(cat => ({
		label: cat.category,
		apps: (cat.items || []).map(item => ({
			id: item.id,
			name: item.name,
			url: item.url,
			icon: resolveIcon(item.icon, item.icon_mono, item.brandColor, item.brandFg, item.brandExplicit),
			selfHosted: item.self_hosted || false,
			adminOnly: item.admin_only || false,
			default: item.default_visible !== false,
			ios: item.app_store?.ios || null,
			android: item.app_store?.android || null,
			extension: item.browser_extension || null,
			subtitle: item.setup_guide?.subtitle || null
		}))
	}));

	const defaultAppIds = categories
		.flatMap(cat => cat.apps)
		.filter(app => app.default !== false)
		.map(app => app.id);

	const setupGuides = {};
	for (const cat of appsConfig || []) {
		for (const item of cat.items || []) {
			if (item.setup_guide) {
				setupGuides[item.name] = {
					title: `${item.name} Setup`,
					subtitle: item.setup_guide.subtitle || item.name,
					steps: item.setup_guide.steps || []
				};
			}
		}
	}

	return { categories, defaultAppIds, setupGuides };
}

const DI_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg';
const SI_CDN = 'https://cdn.simpleicons.org';

// dashboard-icons slug → simpleicons slug (for names that differ)
const diToSimpleIcon = {
	'claude-ai': 'claude',
	'google-drive': 'googledrive',
	'google-maps': 'googlemaps',
	'apple-music': 'applemusic',
	'proton-mail': 'protonmail',
	'visual-studio-code': 'visualstudiocode',
	'paperless-ngx': 'paperlessngx',
	'uptime-kuma': 'uptimekuma',
};

// Resolve a single icon string to a URL
function resolveUrl(str) {
	if (!str) return null;
	if (str.startsWith('http') || str.startsWith('/')) return str;
	const name = str.replace(/^(di|si|sh):/, '');
	const prefix = str.match(/^(di|si|sh):/)?.[1] || 'di';
	if (prefix === 'si') return `${SI_CDN}/${diToSimpleIcon[name] || name}`;
	return `${DI_CDN}/${name}.svg`;
}

export function resolveIcon(icon, iconMono, brandColor, brandFg, brandExplicit) {
	if (!icon) return { colored: null, mono: null, hasMono: false, brandColor: null, brandFg: null, brandExplicit: false };

	// Object format: { colored: "url", mono: "url" }
	if (typeof icon === 'object') {
		return { colored: icon.colored || null, mono: icon.mono || icon.colored || null, hasMono: !!icon.mono, fallback: null, brandColor: brandColor || null, brandFg: brandFg || null, brandExplicit: !!brandExplicit };
	}

	// Full URL or absolute path
	if (icon.startsWith('http') || icon.startsWith('/')) {
		const mono = iconMono ? resolveUrl(iconMono) : null;
		return { colored: icon, mono: mono || icon, hasMono: !!iconMono, fallback: null, brandColor: brandColor || null, brandFg: brandFg || null, brandExplicit: !!brandExplicit };
	}

	const name = icon.replace(/^(di|si|sh):/, '');
	const colored = resolveUrl(icon);

	// Mono: explicit icon_mono > Simple Icons fallback
	let mono, hasMono;
	if (iconMono) {
		mono = resolveUrl(iconMono);
		hasMono = true;
	} else {
		const siSlug = diToSimpleIcon[name] || name;
		mono = `${SI_CDN}/${siSlug}`;
		hasMono = true; // SI may or may not have it — handleIconError covers failures
	}

	return {
		colored,
		mono,
		hasMono,
		fallback: colored,
		brandColor: brandColor || null,
		brandFg: brandFg || null,
		brandExplicit: !!brandExplicit
	};
}
