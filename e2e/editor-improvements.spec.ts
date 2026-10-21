import { expect, test } from "@playwright/test";
import { menuAction } from "./helpers";

test("компактная панель и меню доступны с клавиатуры", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator(".topbar button,.toolbar button")).toHaveCount(7);
  await menuAction(page, "Проект", "Готовый пример");
  const device = page.getByRole("button", { name: "Устройство STR20-IP · пост охраны", exact: true });
  await device.click();
  const trigger = page.getByRole("button", { name: "Проект", exact: true });
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Новый объект", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Открыть", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(device).toHaveAttribute("aria-pressed", "true");
  await menuAction(page, "Помощь", "Справка");
  await expect(page.getByRole("dialog", { name: "Справка симулятора" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("карточки раздвигаются при перетаскивании, провода перестраиваются и отменяются", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await menuAction(page, "Проект", "Готовый пример");
  await page.getByLabel("Режим редактора").selectOption("wiring");
  await page.getByRole("button", { name: "Весь объект", exact: true }).click();
  const wires = page.locator("polyline[data-core-id]");
  await expect(wires).toHaveCount(18);
  const before = await wires.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("points")));
  const reader = page.getByRole("button", { name: "Устройство Считыватель · вход", exact: true });
  const module = page.getByRole("button", { name: "Устройство STR-1AP · дверь 1", exact: true });
  const source = await reader.locator("rect").first().boundingBox(),
    target = await module.locator("rect").first().boundingBox();
  if (!source || !target) throw new Error("Карточки не видны");
  await page.mouse.move(source.x + source.width / 2, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 25, { steps: 5 });
  await page.mouse.up();
  const moved = await reader.locator("rect").first().boundingBox();
  if (!moved) throw new Error("Карточка потеряна");
  expect(
    moved.x + moved.width <= target.x ||
      moved.x >= target.x + target.width ||
      moved.y + moved.height <= target.y ||
      moved.y >= target.y + target.height,
  ).toBe(true);
  await expect(page.locator("polyline[data-route-warning]")).toHaveCount(0);
  const after = await wires.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("points")));
  expect(after).not.toEqual(before);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect
    .poll(() => wires.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("points"))))
    .toEqual(before);
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.getByRole("button", { name: "Приложить карту", exact: true }).click();
  await expect(page.getByText("Замок отпущен", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test("смена этажа отменяет незавершённый провод, Delete в окне не удаляет устройство", async ({ page }) => {
  await page.goto("/");
  await menuAction(page, "Проект", "Готовый пример");
  await page.getByLabel("Режим редактора").selectOption("wiring");
  await page.getByRole("button", { name: "Клемма psu/pos", exact: true }).click();
  await expect(page.getByText("Выберите вторую клемму · Esc — отмена", { exact: true })).toBeVisible();
  await menuAction(page, "Вид", "Добавить этаж");
  await expect(page.getByText("Выберите вторую клемму · Esc — отмена", { exact: true })).toHaveCount(0);
  await page.getByLabel("Этаж", { exact: true }).selectOption("floor_1");
  await menuAction(page, "Симуляция", "STR20-IP · пост охраны");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Сеть", exact: true }).focus();
  await page.keyboard.press("Delete");
  await expect(page.locator('svg g[aria-label^="Устройство "]')).toHaveCount(7);
});

test("ручной узел сохраняет форму автомаршрута и обратное переключение", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Блок питания DC/ }).click();
  await page.getByRole("button", { name: /Электрозамок/ }).click();
  await page.getByLabel("Режим редактора").selectOption("wiring");
  const ends = page.locator('circle[aria-label$="/pos"]');
  await ends.nth(0).click();
  await ends.nth(1).click();
  await page.getByRole("button", { name: "Весь объект", exact: true }).click();
  const point = await page.locator("polyline[data-core-id]").evaluate((node: SVGPolylineElement) => {
    const points = [...node.points],
      matrix = node.getScreenCTM();
    if (!matrix) throw new Error("Нет матрицы SVG");
    let length = 0,
      middle = new DOMPoint();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (!a || !b) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > length) {
        length = distance;
        middle = new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    }
    const result = middle.matrixTransform(matrix);
    return { x: result.x, y: result.y };
  });
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.getByLabel("Прокладка кабеля")).toHaveValue("manual");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("strazh-sim.project.v1") ?? "{}").cables?.[0]?.route?.length),
    )
    .toBeGreaterThan(0);
  await page.getByLabel("Прокладка кабеля").selectOption("auto");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("strazh-sim.project.v1") ?? "{}").cables?.[0]?.routing),
    )
    .toBe("auto");
  await page.reload();
  await expect(page.locator("polyline[data-core-id]")).toHaveCount(1);
  await expect(page.locator("polyline[data-route-warning]")).toHaveCount(0);
});

test("последняя правка сохраняется при немедленной перезагрузке", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Название проекта", { exact: true }).fill("Последняя правка");
  await page.reload();
  await expect(page.getByLabel("Название проекта", { exact: true })).toHaveValue("Последняя правка");
});

test("проверка карты защищает сохранение, окно остаётся в границах после уменьшения", async ({ page }) => {
  await page.goto("/");
  await menuAction(page, "Проект", "Готовый пример");
  await menuAction(page, "Симуляция", "STR20-IP · пост охраны");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Сотрудники и карты", exact: true }).click();
  await dialog.getByLabel("Сотрудник", { exact: true }).fill("Новый сотрудник");
  await dialog.getByLabel("Код карты", { exact: true }).fill("constructor");
  await dialog.getByLabel("Дверь 1", { exact: true }).check();
  await dialog.getByRole("button", { name: "Добавить карту", exact: true }).click();
  await expect(
    dialog.getByText("Проверьте код карты и выберите существующую точку доступа", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Код карты", { exact: true }).fill("1002");
  await dialog.getByRole("button", { name: "Добавить карту", exact: true }).click();
  await expect(dialog.getByText("Карта добавлена", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 700 });
  const bounds = await dialog.boundingBox();
  if (!bounds) throw new Error("Окно скрыто");
  expect(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1024 && bounds.y + bounds.height <= 700).toBe(
    true,
  );
});

test("редактор не перезаписывает сохранение, изменённое другой вкладкой", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("● Сохранено", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key = "strazh-sim.project.v1",
      project = JSON.parse(localStorage.getItem(key) ?? "{}");
    project.name = "Правки из другой вкладки";
    localStorage.setItem(key, JSON.stringify(project));
  });
  await page.getByLabel("Название проекта", { exact: true }).fill("Мои правки");
  await expect(page.getByRole("alert")).toContainText("Проект изменён в другой вкладке");
  await page.reload();
  await expect(page.getByLabel("Название проекта", { exact: true })).toHaveValue("Правки из другой вкладки");
});

test("два одинаковых контроллера имеют разные имена и отдельные окна", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  const controller = page.locator(".palette").getByRole("button", { name: /Контроллер STR20-IP/ });
  await controller.click();
  await controller.click();
  await menuAction(page, "Симуляция", "Контроллер STR20-IP 2");
  await expect(page.getByRole("dialog", { name: "Веб-интерфейс Контроллер STR20-IP 2", exact: true })).toBeVisible();
  await menuAction(page, "Симуляция", "Контроллер STR20-IP");
  await expect(page.getByRole("dialog")).toHaveCount(2);
  expect(errors).toEqual([]);
});
