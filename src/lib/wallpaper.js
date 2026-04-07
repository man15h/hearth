export const TOTAL_WALLPAPERS = 326;

export function getTodayWallpaperId() {
	const now = new Date();
	const dayOfYear = Math.floor((Date.now() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
	return String(((dayOfYear % TOTAL_WALLPAPERS) + 1)).padStart(4, '0');
}

export function getWallpaperUrl(wallpaperId) {
	const id = wallpaperId || getTodayWallpaperId();
	return `/api/wallpaper/${String(id).padStart(4, '0')}`;
}

export function getWallpaperThumbUrl(wallpaperId) {
	const id = wallpaperId || getTodayWallpaperId();
	return `/api/wallpaper/${String(id).padStart(4, '0')}/thumb`;
}
