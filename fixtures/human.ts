import type { BrowserContext, Locator, Page } from "@playwright/test";

/** Record mode: video capture, human pacing, visible cursor. */
export const RECORD = !!process.env.RECORD;

// A glide slow enough to follow with the eye, in small steps so the cursor
// overlay redraws smoothly rather than jumping.
const TRAVEL_MS = 640;
const STEP_MS = 16;

let position: { x: number; y: number } | null = null;

/** Pause only in record mode, to give the viewer time to follow. */
export async function pause(page: Page, ms: number): Promise<void> {
  if (RECORD) await page.waitForTimeout(ms);
}

/** Pause in record mode before the recorded page exists. */
export async function settle(ms: number): Promise<void> {
  if (RECORD) await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Start the pointer in the middle of the viewport, where a person would. */
export async function centerCursor(page: Page): Promise<void> {
  const size = page.viewportSize();
  if (!RECORD || !size) return;
  position = { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
  await page.mouse.move(position.x, position.y);
}

/**
 * Click like a person: glide the mouse to the target, settle briefly, click.
 * In test mode this is a plain locator click.
 */
export async function click(page: Page, locator: Locator): Promise<void> {
  if (!RECORD) {
    await locator.click();
    return;
  }
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }
  await glideTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

/** Focus a field with a human click, then type character by character. */
export async function type(page: Page, locator: Locator, text: string): Promise<void> {
  await click(page, locator);
  await pause(page, 250);
  await locator.pressSequentially(text, { delay: RECORD ? 280 : 0 });
}

/**
 * Type a pairing code into a row of single-character boxes, which advance
 * focus themselves as each character lands.
 */
export async function typeCode(page: Page, boxes: Locator, code: string): Promise<void> {
  await click(page, boxes.first());
  await pause(page, 250);
  for (const character of code) {
    await page.keyboard.type(character);
    await pause(page, 260);
  }
}

/**
 * In record mode, render a cursor dot that follows the (synthesized) mouse
 * and an expanding ripple on every click, so recordings read like a person
 * driving the app. No-op in test mode.
 */
export async function installCursor(context: BrowserContext): Promise<void> {
  if (!RECORD) return;
  await context.addInitScript(() => {
    const attach = () => {
      const style = document.createElement("style");
      style.textContent = `
        #__rec_cursor {
          position: fixed; top: 50%; left: 50%; width: 20px; height: 20px;
          border-radius: 50%; background: rgba(32, 33, 36, 0.4);
          border: 2px solid rgba(255, 255, 255, 0.95);
          box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
          z-index: 2147483647; pointer-events: none;
          transform: translate(-50%, -50%);
          transition: background 0.1s;
        }
        .__rec_ripple {
          position: fixed; border-radius: 50%;
          border: 2px solid rgba(66, 133, 244, 0.9);
          z-index: 2147483646; pointer-events: none;
          transform: translate(-50%, -50%);
          animation: __rec_ripple 0.45s ease-out forwards;
        }
        @keyframes __rec_ripple {
          from { width: 12px; height: 12px; opacity: 0.9; }
          to { width: 60px; height: 60px; opacity: 0; }
        }`;
      document.head.appendChild(style);
      const dot = document.createElement("div");
      dot.id = "__rec_cursor";
      document.body.appendChild(dot);
      window.addEventListener(
        "mousemove",
        (e) => {
          dot.style.left = `${e.clientX}px`;
          dot.style.top = `${e.clientY}px`;
        },
        true,
      );
      window.addEventListener(
        "mousedown",
        (e) => {
          dot.style.background = "rgba(66, 133, 244, 0.6)";
          const ripple = document.createElement("div");
          ripple.className = "__rec_ripple";
          ripple.style.left = `${e.clientX}px`;
          ripple.style.top = `${e.clientY}px`;
          document.body.appendChild(ripple);
          setTimeout(() => ripple.remove(), 500);
        },
        true,
      );
      window.addEventListener(
        "mouseup",
        () => {
          dot.style.background = "rgba(32, 33, 36, 0.4)";
        },
        true,
      );
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach);
    } else {
      attach();
    }
  });
}

async function glideTo(page: Page, x: number, y: number): Promise<void> {
  const from = position ?? { x, y };
  const steps = Math.max(1, Math.round(TRAVEL_MS / STEP_MS));
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    // Ease in and out, so the pointer accelerates away and settles on arrival.
    const eased =
      progress < 0.5 ? 2 * progress * progress : 1 - 2 * (1 - progress) * (1 - progress);
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    await page.waitForTimeout(STEP_MS);
  }
  position = { x, y };
}
