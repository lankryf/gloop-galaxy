import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function pilot(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.locator('input[name="pilot"]').fill(name);
  await page.locator(".rooms li").first().click();
  await page.locator(".join").click();
  await expect(page.locator(".roster")).toContainText(name);
  return page;
}

function shipPosition(page: Page, shipId: number): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const ship = window.gloop?.buffer.latest?.entities.find((e) => e.id === id);
    return ship ? { x: ship.x, y: ship.y } : null;
  }, shipId);
}

test.describe("two players in one room", () => {
  let olek: Page;
  let marta: Page;

  test.beforeEach(async ({ browser }) => {
    olek = await pilot(browser, "Olek");
    marta = await pilot(browser, "Marta");
  });

  test.afterEach(async () => {
    await olek.context().close();
    await marta.context().close();
  });

  test("both see each other in the roster", async () => {
    await expect(olek.locator(".roster")).toContainText("Marta");
    await expect(marta.locator(".roster")).toContainText("Olek");
  });

  test("the other player sees my ship move within 500 ms", async () => {
    const shipId = await olek.evaluate(() => window.gloop?.shipId ?? 0);
    await expect.poll(() => shipPosition(marta, shipId)).not.toBeNull();
    const before = await shipPosition(marta, shipId);
    await olek.keyboard.down("ArrowUp");
    const started = Date.now();
    await expect
      .poll(
        async () => {
          const now = await shipPosition(marta, shipId);
          return before && now ? Math.hypot(now.x - before.x, now.y - before.y) : 0;
        },
        { timeout: 500, intervals: [20] },
      )
      .toBeGreaterThan(2);
    expect(Date.now() - started).toBeLessThan(500);
    await olek.keyboard.up("ArrowUp");
  });

  test("chat messages reach the other player", async () => {
    await olek.keyboard.press("Enter");
    await olek.locator(".chat-input").fill("привіт, Марто");
    await olek.locator(".chat-input").press("Enter");
    await expect(marta.locator(".chat-log")).toContainText("привіт, Марто");
  });
});
