import type { Page } from "@playwright/test";
export async function menuAction(page: Page, menu: string, action: string) {
  await page.getByRole("button", { name: menu, exact: true }).click();
  await page.getByRole("menu", { name: menu, exact: true }).getByText(action, { exact: true }).click();
}
