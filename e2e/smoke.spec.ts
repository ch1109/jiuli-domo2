import { expect, test } from "@playwright/test";

test("开发服务器可访问基线页面", async ({ request }) => {
  const response = await request.get("/");

  expect(response.ok()).toBe(true);
  await expect(response).toBeOK();
  expect(await response.text()).toContain("九立新流程 Demo");
});
