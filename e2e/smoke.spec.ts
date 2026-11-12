import { expect, test } from "@playwright/test";

// Runs against the app without provider keys, so no YouTube or Twitch calls.
test("loads with the search box and an empty stream wall", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: /Search channels/ })).toBeDisabled();
  await expect(page.locator("main[data-stream-wall]")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("keeps the stream wall rendered for a channels URL param", async ({ page }) => {
  // Unconfigured, so the id is never looked up and no player iframe loads.
  await page.goto("/?channels=UCaaaaaaaaaaaaaaaaaaaaaa");

  await expect(page.locator("main[data-stream-wall]")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});
