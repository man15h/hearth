import { redirect } from '@sveltejs/kit';

export function GET({ cookies }) {
	cookies.delete('auth_name', { path: '/' });
	cookies.delete('auth_username', { path: '/' });
	cookies.delete('session', { path: '/' });
	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });
	redirect(302, '/');
}
