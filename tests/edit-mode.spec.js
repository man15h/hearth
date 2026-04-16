import { test, expect } from '@playwright/test';

// Seed prefs + visit as demo user.
async function seed(page, extraPrefs = {}) {
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('hearth_prefs', JSON.stringify(p)), {
		onboarded: true,
		name: 'demo',
		username: 'demo',
		passwordVerified: true,
		...extraPrefs
	});
}

async function ready(page) {
	await page.waitForSelector('.grid-stack', { timeout: 10000 });
	await page.waitForTimeout(600); // GridStack async init + applyLayoutForColumn rAF
}

async function enterEdit(page) {
	await page.locator('button', { hasText: 'Edit layout' }).click();
	await page.waitForSelector('.app-tray', { timeout: 4000 });
}

async function exitEdit(page) {
	await page.locator('button', { hasText: 'Done' }).click();
	await page.waitForTimeout(300);
}

test.describe('iOS-style edit mode', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await seed(page);
		await page.goto('/?user=demo');
		await ready(page);
	});

	test('edit toggle shows tray, Done hides it', async ({ page }) => {
		await enterEdit(page);
		await expect(page.locator('.app-tray')).toBeVisible();
		await exitEdit(page);
		await expect(page.locator('.app-tray')).toHaveCount(0);
	});

	test('× button removes app and it appears in the tray', async ({ page }) => {
		await enterEdit(page);

		// Capture an app name we'll remove (first app in the grid).
		const firstApp = page.locator('.grid-stack-item a').first();
		const nameEl = firstApp.locator('span').first();
		const appName = (await nameEl.textContent())?.trim();
		expect(appName).toBeTruthy();

		// Click its × button.
		await firstApp.locator('.app-remove-x').click();
		await page.waitForTimeout(200);

		// Should now appear in the tray.
		const trayNames = await page.locator('.app-tray .app-tray-item span').allTextContents();
		expect(trayNames.map(s => s.trim())).toContain(appName);

		// And no longer in the grid.
		const gridNames = await page.locator('.grid-stack-item a span').allTextContents();
		expect(gridNames.map(s => s.trim())).not.toContain(appName);
	});

	test('tap-tray then tap-category places the app', async ({ page }) => {
		await enterEdit(page);

		// Remove one app so we have something in the tray.
		const firstApp = page.locator('.grid-stack-item a').first();
		const appName = (await firstApp.locator('span').first().textContent())?.trim();
		await firstApp.locator('.app-remove-x').click();
		await page.waitForTimeout(200);

		// Click the tray item → grid gets .picking.
		const tile = page.locator('.app-tray .app-tray-item', { hasText: appName });
		await tile.click();
		await expect(page.locator('.grid-stack.picking')).toHaveCount(1);

		// Click any non-bookmark category's overlay to place.
		const firstOverlay = page.locator('.grid-stack-item .edit-overlay').first();
		await firstOverlay.click();
		await page.waitForTimeout(200);

		// Tray no longer has it; grid has it back.
		const trayNames = await page.locator('.app-tray .app-tray-item span').allTextContents();
		expect(trayNames.map(s => s.trim())).not.toContain(appName);
		const gridNames = await page.locator('.grid-stack-item a span').allTextContents();
		expect(gridNames.map(s => s.trim())).toContain(appName);
	});

	test('Escape cancels the pickup', async ({ page }) => {
		await enterEdit(page);

		// Put something in the tray so we can pick it up.
		await page.locator('.grid-stack-item a').first().locator('.app-remove-x').click();
		await page.waitForTimeout(200);

		await page.locator('.app-tray .app-tray-item').first().click();
		await expect(page.locator('.grid-stack.picking')).toHaveCount(1);

		await page.keyboard.press('Escape');
		await expect(page.locator('.grid-stack.picking')).toHaveCount(0);
	});

	test('arrangement persists across reload', async ({ page }) => {
		await enterEdit(page);

		const firstApp = page.locator('.grid-stack-item a').first();
		const appName = (await firstApp.locator('span').first().textContent())?.trim();
		await firstApp.locator('.app-remove-x').click();
		await page.waitForTimeout(200);
		await exitEdit(page);

		// Verify prefs.categoryLayout was written.
		const layout = await page.evaluate(() => {
			const p = JSON.parse(localStorage.getItem('hearth_prefs') || '{}');
			return p.categoryLayout;
		});
		expect(Array.isArray(layout)).toBe(true);
		expect(layout.length).toBeGreaterThan(0);

		// Reload and confirm the removed app is still gone from the grid.
		await page.reload();
		await ready(page);
		const gridNames = await page.locator('.grid-stack-item a span').allTextContents();
		expect(gridNames.map(s => s.trim())).not.toContain(appName);
	});

	test('bookmarks category has no × badges and does not appear in tray', async ({ page }) => {
		// Seed a custom bookmark so Bookmarks category shows up.
		await seed(page, {
			customApps: [{ id: 'gh', name: 'GitHubBM', url: 'https://github.com', icon: 'github' }]
		});
		await page.goto('/?user=demo');
		await ready(page);
		await enterEdit(page);

		const bookmarksItem = page.locator('.grid-stack-item[gs-id="bookmarks"]');
		await expect(bookmarksItem).toBeVisible();
		// No × badges inside Bookmarks
		await expect(bookmarksItem.locator('.app-remove-x')).toHaveCount(0);

		// And "GitHubBM" never shows up in the tray.
		const trayNames = await page.locator('.app-tray .app-tray-item span').allTextContents();
		expect(trayNames.map(s => s.trim())).not.toContain('GitHubBM');
	});
});
