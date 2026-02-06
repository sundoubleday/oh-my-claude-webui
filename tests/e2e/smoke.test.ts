import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('http://localhost:5757')
  await expect(page.locator('h1')).toBeVisible()
})

test('can navigate to chat', async ({ page }) => {
  await page.goto('http://localhost:5757')
  await page.click('text=Chat')
  await expect(page).toHaveURL(/.*chat/)
})
