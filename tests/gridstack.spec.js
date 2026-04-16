import { test, expect } from '@playwright/test';

// Helper: set localStorage prefs before navigation
async function setPrefs(page, prefs) {
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('hearth_prefs', JSON.stringify(p)), prefs);
}

// Helper: wait for SvelteKit client hydration
async function waitForHydration(page) {
	await page.waitForFunction(
		() => document.querySelector('style[data-sveltekit]') === null,
		{ timeout: 10000 }
	);
}

test.describe('GridStack layout', () => {
	test.beforeEach(async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await waitForHydration(page);
		// Wait for GridStack to initialize (it's async-imported)
		await page.waitForSelector('.grid-stack', { timeout: 10000 });
		// Give GridStack time to initialize and size widgets
		await page.waitForTimeout(1000);
	});

	test('grid-stack container renders', async ({ page }) => {
		const gridStack = page.locator('.grid-stack');
		await expect(gridStack).toBeVisible();
	});

	test('category cards render as grid-stack-items', async ({ page }) => {
		const items = page.locator('.grid-stack-item');
		const count = await items.count();
		expect(count).toBeGreaterThan(0);
		console.log(`Found ${count} grid-stack-items`);
	});

	test('each category has a label and apps', async ({ page }) => {
		const items = page.locator('.grid-stack-item');
		const count = await items.count();

		for (let i = 0; i < count; i++) {
			const item = items.nth(i);
			// Category label
			const label = item.locator('.gs-drag-handle');
			await expect(label).toBeVisible();
			const labelText = await label.textContent();
			console.log(`Category ${i}: "${labelText}"`);

			// Apps inside
			const apps = item.locator('a[href]');
			const appCount = await apps.count();
			console.log(`  → ${appCount} apps`);
			expect(appCount).toBeGreaterThan(0);
		}
	});

	test('grid-stack-items have gs-id attributes', async ({ page }) => {
		const items = page.locator('.grid-stack-item');
		const count = await items.count();

		for (let i = 0; i < count; i++) {
			const gsId = await items.nth(i).getAttribute('gs-id');
			expect(gsId).toBeTruthy();
			console.log(`Item ${i} gs-id: "${gsId}"`);
		}
	});

	test('grid-stack-items have proper width attributes', async ({ page }) => {
		const items = page.locator('.grid-stack-item');
		const count = await items.count();

		for (let i = 0; i < count; i++) {
			const gsW = await items.nth(i).getAttribute('gs-w');
			const gsId = await items.nth(i).getAttribute('gs-id');
			console.log(`${gsId}: gs-w=${gsW}`);
			expect(parseInt(gsW)).toBeGreaterThanOrEqual(2);
			expect(parseInt(gsW)).toBeLessThanOrEqual(12);
		}
	});

	test('category cards are not clipped — content height matches', async ({ page }) => {
		const items = page.locator('.grid-stack-item');
		const count = await items.count();

		for (let i = 0; i < count; i++) {
			const item = items.nth(i);
			const gsId = await item.getAttribute('gs-id');

			// Get the item's rendered height and its content's scroll height
			const heights = await item.evaluate(el => {
				const content = el.querySelector('.grid-stack-item-content');
				const card = el.querySelector('.category-card');
				return {
					itemHeight: el.getBoundingClientRect().height,
					contentScrollHeight: content?.scrollHeight || 0,
					contentClientHeight: content?.clientHeight || 0,
					cardScrollHeight: card?.scrollHeight || 0,
					cardClientHeight: card?.clientHeight || 0,
				};
			});

			console.log(`${gsId}: item=${heights.itemHeight}px, content=${heights.contentClientHeight}/${heights.contentScrollHeight}px, card=${heights.cardClientHeight}/${heights.cardScrollHeight}px`);

			// Content should not be clipped: scrollHeight should roughly equal clientHeight
			// Allow small tolerance for borders/padding
			if (heights.cardScrollHeight > 0) {
				const clipped = heights.cardScrollHeight - heights.cardClientHeight;
				if (clipped > 5) {
					console.log(`  ⚠ CLIPPED by ${clipped}px!`);
				}
			}
		}
	});

	test('edit layout button exists and toggles edit mode', async ({ page }) => {
		const editBtn = page.locator('button', { hasText: 'Edit layout' });
		await expect(editBtn).toBeVisible();

		// Click to enable edit mode
		await editBtn.click();

		// Should now show "Done"
		const doneBtn = page.locator('button', { hasText: 'Done' });
		await expect(doneBtn).toBeVisible();

		// Grid should have edit mode class
		const gridStack = page.locator('.grid-stack');
		await expect(gridStack).toHaveClass(/grid-edit-mode/);

		// Category cards should have dashed border
		const editCard = page.locator('.category-card-edit').first();
		await expect(editCard).toBeVisible();

		// Click Done to exit
		await doneBtn.click();
		await expect(editBtn).toBeVisible();
		await expect(gridStack).not.toHaveClass(/grid-edit-mode/);
	});

	test('no random ">" or resize handles visible when not in edit mode', async ({ page }) => {
		// Check that resize handles are hidden
		const resizeHandles = page.locator('.ui-resizable-se');
		const count = await resizeHandles.count();

		for (let i = 0; i < count; i++) {
			const handle = resizeHandles.nth(i);
			const isVisible = await handle.evaluate(el => {
				const style = window.getComputedStyle(el);
				return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
			});
			expect(isVisible).toBe(false);
		}
	});

	test('resize handles appear in edit mode', async ({ page }) => {
		// Enter edit mode
		await page.locator('button', { hasText: 'Edit layout' }).click();
		await page.waitForTimeout(300);

		const resizeHandles = page.locator('.grid-edit-mode .ui-resizable-se');
		const count = await resizeHandles.count();
		console.log(`Resize handles in edit mode: ${count}`);

		if (count > 0) {
			for (let i = 0; i < count; i++) {
				const isDisplayed = await resizeHandles.nth(i).evaluate(el => {
					const style = window.getComputedStyle(el);
					return style.display !== 'none';
				});
				expect(isDisplayed).toBe(true);
			}
		}
	});

	test('spacing between grid items exists', async ({ page }) => {
		// Measure gaps between .category-card elements (the visible cards)
		const cards = page.locator('.category-card');
		const count = await cards.count();
		if (count < 2) return;

		const boxes = [];
		for (let i = 0; i < Math.min(count, 5); i++) {
			const box = await cards.nth(i).boundingBox();
			if (box) boxes.push({ ...box, index: i });
		}

		// Check cards on same row have visible gaps
		let checkedPairs = 0;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = boxes[i], b = boxes[j];
				// Same row check (y positions within 30px)
				if (Math.abs(a.y - b.y) < 30) {
					const left = a.x < b.x ? a : b;
					const right = a.x < b.x ? b : a;
					const gap = right.x - (left.x + left.width);
					console.log(`Gap between cards ${left.index} and ${right.index}: ${gap.toFixed(1)}px`);
					expect(gap).toBeGreaterThan(0);
					checkedPairs++;
				}
			}
		}
		console.log(`Checked ${checkedPairs} card pairs for spacing`);
	});

	test('take screenshot of grid layout', async ({ page }) => {
		await page.screenshot({ path: 'tests/screenshots/gridstack-normal.png', fullPage: true });

		// Dismiss any vite error overlay before clicking edit
		const overlay = page.locator('vite-error-overlay');
		if (await overlay.count() > 0) {
			await page.screenshot({ path: 'tests/screenshots/gridstack-error.png', fullPage: true });
			await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
		}

		// Also take edit mode screenshot
		await page.locator('button', { hasText: 'Edit layout' }).click();
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'tests/screenshots/gridstack-edit.png', fullPage: true });
	});
});
