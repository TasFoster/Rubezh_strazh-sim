import { expect, test } from "@playwright/test";
import { menuAction } from "./helpers";

test("сборка работает без сети после первого открытия", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
      );
  });
  await menuAction(page, "Проект", "Готовый пример");
  await expect(page.getByText("● Сохранено", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Название проекта", { exact: true })).toHaveValue("Стенд · одна дверь");
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.getByRole("button", { name: "Приложить карту", exact: true }).click();
  await expect(page.getByText("Замок отпущен", { exact: false })).toBeVisible();
});
