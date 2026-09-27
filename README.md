# DodoCheckout — take-home submission

## How to run it

```bash
npm install
npm run dev
```

The demo will be available at `http://localhost:5173`. Click **Buy now** to open the checkout overlay.

**Stack:** React + TypeScript + Vite. The checkout app is a React component that can be embedded via the SDK script.

## Test cards

- `4242 4242 4242 4242` → succeeds
- `4000 0000 0000 0002` → declines
- `4000 0000 0000 0341` → fails once, then succeeds on retry (tracked per card number, in-memory, inside the checkout session)

## How the pieces talk to each other

Three main components:

1. **`src/sdk.ts`** — The embeddable script. Exposes `DodoCheckout.open(config)`. Plain TypeScript (no React) so it can be loaded by any merchant's site regardless of their framework. Compiles to `src/sdk.compiled.js` for distribution.

2. **`CheckoutApp.tsx`** — The checkout React component. Handles product display, email/card input, validation, and fake payment processing. Hosted on its own origin and loaded into an iframe by the SDK.

3. **`DemoApp.tsx`** — A fake storefront demonstrating the SDK integration. Shows a product card with a Buy button and logs all checkout callbacks in real-time.

**The conversation flow:**

1. Host page calls `DodoCheckout.open({ productId, productName, amount, theme, onSuccess, onClose, onError })`
2. SDK creates a full-screen overlay with a sandboxed `<iframe>` pointing at the checkout origin
3. Checkout iframe posts `{ source: 'dodo-checkout', type: 'ready' }` when mounted
4. SDK replies with `{ source: 'dodo-sdk', type: 'init', productId, productName, amount, theme }`
5. Checkout renders the product and collects payment details
6. On submit, checkout processes the fake payment and posts back:
   - `{ type: 'success', sessionId }` — Payment succeeded
   - `{ type: 'error', code, message }` — Payment declined or failed
   - `{ type: 'close', reason }` — User cancelled or flow completed
7. SDK translates these to the appropriate callback (`onSuccess`, `onError`, `onClose`) and tears down the overlay

**Security model:**

- Card number, expiry, and CVC are entered and processed only inside the checkout iframe's JS context
- These values are never serialized into postMessage, so the host page has no code path to observe them
- The iframe has a `sandbox` attribute without `allow-top-navigation` or `allow-popups`, preventing redirection or tab hijacking
- SDK validates message origins using `e.origin` (browser-set, unspoofable) to ensure messages only come from the expected checkout origin

## Decisions I went back and forth on

### 1. Theme: Host-controlled vs. Checkout-controlled

I initially considered letting the host page fully customize the checkout's appearance. However, I decided that a checkout should look consistent across all sites for buyer trust — the same way bank card network logos look identical regardless of which store you're in. 

The compromise: the host can pass a `theme` hint (`light` or `dark`), but the checkout controls the actual styling. This respects the host's color preference without allowing arbitrary customization that could undermine trust. In production, I'd expand this to support custom accent colors while keeping the layout and typography consistent.

### 2. Email validation: Real-time vs. Submit-only

I debated whether to validate email only on form submit or as the user types. Submit-only is simpler and less intrusive, but real-time validation provides better UX by catching errors immediately.

I chose real-time validation that shows an inline error message below the email field. This is less jarring than a form shake on submit and helps users correct mistakes faster. The validation regex is basic but sufficient for a demo — production would need more sophisticated email validation.

## What I'd explore next

Given the time constraints, here's what I'd prioritize next:

1. **Per-merchant origin registry** — The SDK pins its origin check, but the checkout accepts embedding from any origin. A production version would need a registry tying productIds to allowed merchant domains (similar to Stripe's publishable key domain restrictions).

2. **Enhanced card validation** — Add Luhn algorithm check, card brand detection (Visa/Mastercard/Amex), expiry date validation (not in the past), and CVC length validation by card type.

3. **Network failure handling** — Currently failures are simulated via test cards. A real version needs timeout handling and an explicit "we don't know if this went through" state for dropped connections — this is harder than a clean decline.

4. **Accessibility audit** — I implemented keyboard focus, `aria-live` on errors, and Escape-to-close. A full screen-reader pass through all state transitions and WCAG AA color contrast verification is still needed.

5. **SDK build pipeline** — Set up proper compilation from `sdk.ts` to `sdk.compiled.js` with minification and source maps for production distribution.

6. **Logo asset** — The checkout references `/logoFullNameLight.svg` which needs to be created or the reference removed.
