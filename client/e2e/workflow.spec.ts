import { expect, test } from "@playwright/test";

test("discovery sampai unduh PRD", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/api/health")) {
      return route.fulfill({
        json: {
          status: "ok",
          timestamp: new Date().toISOString(),
          ai: { reachable: true, modelConfigured: true, modelAvailable: true }
        }
      });
    }
    if (url.endsWith("/api/chat")) {
      return route.fulfill({ json: { success: true, reply: "Siapa pengguna utama produk ini?" } });
    }
    if (url.endsWith("/api/generate-prd")) {
      return route.fulfill({
        json: {
          success: true,
          prdContent:
            "# Reservasi Klinik\n\n## 1. Overview & Objective\n\nMembantu pasien.\n\n## 2. User Personas & Pain Points\n\nPasien klinik.",
          productTitle: "Reservasi Klinik"
        }
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto("/");
  await page.getByLabel("Pesan discovery").fill("Aplikasi reservasi untuk pasien klinik");
  await page.getByRole("button", { name: /Kirim/ }).click();
  await expect(page.getByText("Siapa pengguna utama produk ini?")).toBeVisible();
  await page.getByRole("button", { name: "Generate PRD" }).click();
  await expect(page.getByRole("heading", { name: "1. Overview & Objective" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh .md" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("reservasi-klinik.md");
});
