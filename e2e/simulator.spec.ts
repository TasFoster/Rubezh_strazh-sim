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
  await expect(page.getByText("Дверь открыта", { exact: true })).toBeVisible();
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

test("редактор сохраняет план, калибровку, геометрию и этажи", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type=file][accept="image/png,image/jpeg"]').setInputFiles({
    name: "plan.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator("svg image")).toHaveCount(1);
  const canvas = page.locator("svg.workbench");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas");
  await page.getByRole("button", { name: "Выбрать две точки", exact: true }).click();
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 300, box.y + 100);
  await page.getByRole("button", { name: "Применить масштаб", exact: true }).click();
  await page.getByLabel("Инструмент плана").selectOption("wall");
  await page.mouse.click(box.x + 100, box.y + 180);
  await page.mouse.click(box.x + 400, box.y + 180);
  await page.getByLabel("Инструмент плана").selectOption("door");
  await page.mouse.click(box.x + 200, box.y + 180);
  await page.getByLabel("Инструмент плана").selectOption("room");
  await page.mouse.click(box.x + 100, box.y + 280);
  await page.getByLabel("Название помещения", { exact: true }).fill("Пост охраны");
  await page.getByRole("button", { name: "Добавить этаж", exact: true }).click();
  await page.getByRole("button", { name: /Блок питания DC/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("strazh-sim.project.v1") ?? "{}").plan?.floors?.length),
    )
    .toBe(2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("strazh-sim.project.v1") ?? "{}"));
  expect(stored.plan.metersPerUnit).toBe(0.05);
  expect(stored.plan.walls).toHaveLength(1);
  expect(stored.plan.doors).toHaveLength(1);
  expect(stored.plan.rooms[0].name).toBe("Пост охраны");
  expect(stored.devices[0].floorId).not.toBe("floor_1");
});

test("невалидное редактирование не перезаписывает сохранённый проект", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Готовый пример", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("strazh-sim.project.v1") ?? "{}").name))
    .toBe("Стенд · одна дверь");
  await page.getByLabel("Название проекта", { exact: true }).fill("");
  await expect(page.getByRole("alert")).toContainText("Проект не сохранён");
  await page.reload();
  await expect(page.getByLabel("Название проекта", { exact: true })).toHaveValue("Стенд · одна дверь");
});

test("повреждённое автосохранение остаётся доступным для восстановления", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("strazh-sim.project.v1", '{"version":999}'));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Сохранённый проект повреждён");
  await page.waitForTimeout(500); // Перекрывает интервал автосохранения и проверяет отсутствие перезаписи.
  expect(await page.evaluate(() => localStorage.getItem("strazh-sim.project.v1"))).toBe('{"version":999}');
});

test("турникет: задание оценивает полный проход и экспортирует отчёт", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Задания", exact: true }).click();
  const lesson = page.getByRole("region", { name: "Учебное задание" });
  await lesson.getByLabel("Выберите задание").selectOption("turnstile");
  await lesson.getByRole("button", { name: "Начать задание", exact: true }).click();
  await lesson.getByRole("button", { name: "Скрыть", exact: true }).click();
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.getByRole("button", { name: "Приложить карту", exact: true }).click();
  await page.getByRole("button", { name: "Начать проход", exact: true }).click();
  await page.getByRole("button", { name: "Завершить проход", exact: true }).click();
  await page.getByRole("button", { name: "Нажать кнопку", exact: true }).click();
  await page.getByRole("button", { name: "Отпустить кнопку", exact: true }).click();
  await page.getByRole("button", { name: "Задания", exact: true }).click();
  await expect(lesson.getByText("Все условия выполнены", { exact: true })).toBeVisible({ timeout: 10000 });
  const download = page.waitForEvent("download");
  await lesson.getByRole("button", { name: "Скачать отчёт", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("strazh-training-report.json");
});
