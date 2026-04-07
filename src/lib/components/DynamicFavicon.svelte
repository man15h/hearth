<script>
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';

	const siteConfig = getContext('config');
	const favicon = siteConfig?.branding?.favicon || siteConfig?.branding?.logo;

	const defaultFavicon = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='4 4 24 24'><circle cx='16' cy='16' r='9' fill='none' stroke='white' stroke-width='1.5'/><circle cx='16' cy='16' r='3' fill='white'/></svg>`;

	$effect(() => {
		if (!browser) return;
		let link = document.querySelector('link[rel="icon"]');
		if (!link) {
			link = document.createElement('link');
			link.rel = 'icon';
			document.head.appendChild(link);
		}
		link.href = favicon || defaultFavicon;
	});
</script>
