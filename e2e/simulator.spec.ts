import { expect, test } from "@playwright/test";

test("монтаж жилы, отмена и восстановление проекта", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Блок питания DC/ }).click();
  await page.getByRole("button", { name: /Электрозамок/ }).click();
  await page.getByRole("button", { name: "Монтаж / клеммы", exact: true }).click();
  const ends = page.locator('circle[aria-label$="/pos"]');
  await ends.nth(0).click();
  await ends.nth(1).click();
  await page.getByRole("button", { name: "Добавить жилу", exact: true }).click();
  await page.getByLabel("Обрыв жилы").nth(1).check();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("strazh-sim.project.v1") ?? "{}").cables?.[0]?.cores?.[1]?.broken,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator('svg g[aria-label^="Устройство "]')).toHaveCount(2);
  await expect(page.locator("svg polyline")).toHaveCount(4);
  await page.getByRole("button", { name: /Устройство Электрозамок/ }).click();
  await page.getByRole("button", { name: "Копия", exact: true }).click();
  await expect(page.locator('svg g[aria-label^="Устройство "]')).toHaveCount(3);
  await page.getByRole("button", { name: "↶ Отменить", exact: true }).click();
  await expect(page.locator('svg g[aria-label^="Устройство "]')).toHaveCount(2);
});

test("пусконаладка одной двери через интерфейс контроллера", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Стенд одной двери", exact: true }).click();
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.getByRole("button", { name: "Устройство STR20-IP · пост охраны", exact: true }).click();
  await page.getByRole("button", { name: "Открыть веб-интерфейс", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Поиск устройств", exact: true }).click();
  await dialog.getByRole("button", { name: "Начать поиск", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await dialog.getByRole("button", { name: "Точки доступа", exact: true }).click();
  await dialog.getByRole("button", { name: "Создать точку", exact: true }).click();
  await expect(dialog.getByText("Точка доступа создана", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Сотрудники и карты", exact: true }).click();
  await dialog.getByLabel("Сотрудник", { exact: true }).fill("Тестовый сотрудник");
  await dialog.getByLabel("Дверь 1", { exact: true }).check();
  await dialog.getByRole("button", { name: "Добавить карту", exact: true }).click();
  await dialog.getByRole("button", { name: /Закрыть интерфейс/ }).click();
  await page.getByRole("button", { name: "Приложить карту", exact: true }).click();
  await expect(page.getByText("Замок отпущен", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Открыть дверь", exact: true }).click();
  await page.getByRole("button", { name: "Журнал", exact: true }).click();
  await expect(page.getByText("Дверной вход: open", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Мультиметр", exact: true }).click();
  await page.getByLabel("Красный щуп").selectOption(JSON.stringify({ deviceId: "psu", terminalId: "pos" }));
  await page.getByLabel("Чёрный щуп").selectOption(JSON.stringify({ deviceId: "psu", terminalId: "neg" }));
  await expect(page.locator("output")).toContainText("12.000 В");
  expect(errors).toEqual([]);
});

test("повреждённый импорт не заменяет текущий объект", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Готовый пример", exact: true }).click();
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Название проекта", { exact: true })).toHaveValue("Стенд · одна дверь");
});
