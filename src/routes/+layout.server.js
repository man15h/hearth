import { getClientConfig } from '$lib/server/config.js';

export async function load() {
	return {
		config: await getClientConfig()
	};
}
