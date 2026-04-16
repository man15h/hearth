import { test, expect } from '@playwright/test';

// Seed prefs + per-column saved layouts, then visit as demo user.
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

async function waitForGrid(page) {
	await page.waitForSelector('.grid-stack', { timeout: 10000 });
	// GridStack is async-imported; give it a beat to init + run applyLayoutForColumn
	await page.waitForTimeout(600);
}

async function getItemWidths(page) {
	return await page.evaluate(() => {
		const items = Array.from(document.querySelectorAll('.grid-stack-item'));
		return items.map(el => ({
			id: el.getAttribute('gs-id'),
			w: el.gridstackNode?.w,
			attrW: el.getAttribute('gs-w'),
			innerCols: el.querySelector('.app-grid-inner')?.style.getPropertyValue('--cols') || null
		}));
	});
}

async function getGridColumn(page) {
	return await page.evaluate(() => {
		const el = document.querySelector('.grid-stack');
		return el?.gridstack?.getColumn() ?? null;
	});
}

test.describe('GridStack breakpoint behavior', () => {
	test('desktop (1440) loads with 12-col layout', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await seed(page);
		await page.goto('/?user=demo');
		await waitForGrid(page);

		const cols = await getGridColumn(page);
		expect(cols).toBe(12);
	});

	test('tablet (1000) loads with 6-col layout', async ({ page }) => {
		await page.setViewportSize({ width: 1000, height: 900 });
		await seed(page);
		await page.goto('/?user=demo');
		await waitForGrid(page);

		const cols = await getGridColumn(page);
		expect(cols).toBe(6);
	});

	test('mobile (500) loads with 4-col layout', async ({ page }) => {
		await page.setViewportSize({ width: 500, height: 900 });
		await seed(page);
		await page.goto('/?user=demo');
		await waitForGrid(page);

		const cols = await getGridColumn(page);
		expect(cols).toBe(4);
	});

	test('no saved layout → mobile widths stay within column count', async ({ page }) => {
		await page.setViewportSize({ width: 500, height: 900 });
		await seed(page);
		await page.goto('/?user=demo');
		await waitForGrid(page);

		const widths = await getItemWidths(page);
		for (const item of widths) {
			expect(item.w, `tile ${item.id} must fit in 4 cols`).toBeLessThanOrEqual(4);
			expect(item.w, `tile ${item.id} w > 0`).toBeGreaterThan(0);
			// --cols should match the gridstack w
			expect(String(item.w)).toBe(item.innerCols);
		}
	});

	test('saved per-column layout honored — desktop uses "12" layout', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });

		// Seed a distinctive saved layout for 12 cols
		await seed(page, {
			gridLayouts: {
				'12': [
					{ id: 'tools', x: 0, y: 0, w: 6, h: 100 },
					{ id: 'storage', x: 6, y: 0, w: 6, h: 100 }
				],
				'4': [
					{ id: 'tools', x: 0, y: 0, w: 4, h: 100 },
					{ id: 'storage', x: 0, y: 100, w: 4, h: 100 }
				]
			}
		});
		await page.goto('/?user=demo');
		await waitForGrid(page);

		const widths = await getItemWidths(page);
		const tools = widths.find(w => w.id === 'tools');
		const storage = widths.find(w => w.id === 'storage');
		expect(tools, 'tools tile must exist').toBeDefined();
		expect(storage, 'storage tile must exist').toBeDefined();
		expect(tools.w).toBe(6);
		expect(storage.w).toBe(6);
	});

	test('crossing breakpoint re-applies saved layout for new column count', async ({ page }) => {
		// Start desktop
		await page.setViewportSize({ width: 1440, height: 900 });

		await seed(page, {
			gridLayouts: {
				'12': [
					{ id: 'tools', x: 0, y: 0, w: 8, h: 100 }
				],
				'4': [
					{ id: 'tools', x: 0, y: 0, w: 4, h: 100 }
				]
			}
		});
		await page.goto('/?user=demo');
		await waitForGrid(page);

		let widths = await getItemWidths(page);
		let tools = widths.find(w => w.id === 'tools');
		expect(tools, 'tools tile must exist on desktop').toBeDefined();
		expect(tools.w, 'desktop w=8').toBe(8);

		// Shrink to mobile — crosses two breakpoints
		await page.setViewportSize({ width: 500, height: 900 });
		// Wait for the 150ms debounce in onWindowResize, plus applyLayoutForColumn rAF
		await page.waitForTimeout(800);

		widths = await getItemWidths(page);
		tools = widths.find(w => w.id === 'tools');
		expect(tools, 'tools tile must still exist on mobile').toBeDefined();
		expect(tools.w, 'mobile w should flip to 4').toBe(4);
		expect(tools.innerCols, '--cols should follow').toBe('4');
	});
});
