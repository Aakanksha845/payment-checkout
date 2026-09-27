/**
 * DodoCheckout SDK
 * Drop this script into any page, then call DodoCheckout.open({ productId, ... }).
 * It opens the checkout in a sandboxed iframe overlay and relays status back
 * via callbacks. Card data never enters this script or the host page — it is
 * entered and processed entirely inside the checkout iframe's own origin.
 */

const CHECKOUT_ORIGIN = "https://claude.ai/artifact/8Us5zj9nRWm2iHnzEwRaBd";
const CHECKOUT_ORIGIN_BASE = new URL(CHECKOUT_ORIGIN).origin; // scheme+host+port only

type SuccessPayload = { sessionId: string };
type ClosePayload = { reason: "user" | "success" | "error" };
type ErrorPayload = { code: string; message: string };

interface DodoCheckoutConfig {
  productId: string;
  productName?: string;
  amount?: string;
  theme?: 'light' | 'dark';
  onSuccess?: (payload: SuccessPayload) => void;
  onClose?: (payload: ClosePayload) => void;
  onError?: (payload: ErrorPayload) => void;
}

interface CheckoutMessage {
  source: "dodo-checkout";
  type: "ready" | "success" | "error" | "close";
  sessionId?: string;
  code?: string;
  message?: string;
  reason?: ClosePayload["reason"];
}

let activeConfig: DodoCheckoutConfig | null = null;
let overlay: HTMLDivElement | null = null;
let iframe: HTMLIFrameElement | null = null;
let messageListener: ((e: MessageEvent) => void) | null = null;
let readyTimeout: number | null = null;

function teardown(): void {
  if (readyTimeout) clearTimeout(readyTimeout);
  if (messageListener) window.removeEventListener("message", messageListener);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  document.body.style.overflow = "";
  overlay = null;
  iframe = null;
  messageListener = null;
  readyTimeout = null;
  activeConfig = null;
}

function open(config: DodoCheckoutConfig): void {
  if (!config || !config.productId) {
    config?.onError?.({ code: "invalid_config", message: "productId is required." });
    return;
  }
  // Ignore a second open() call while one is already in flight — avoids
  // stacking overlays if a host page double-fires a click handler.
  if (overlay) return;

  activeConfig = config;

  overlay = document.createElement("div");
  overlay.setAttribute("role", "presentation");
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", background: "rgba(10,10,12,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: "2147483647",
  } as CSSStyleDeclaration);

  iframe = document.createElement("iframe");
  iframe.src = CHECKOUT_ORIGIN;
  iframe.title = "Checkout";
  iframe.setAttribute("allow", "payment");
  // sandbox: scripts + same-origin (for its own storage) + forms, but no
  // top-navigation and no popups — the checkout cannot redirect the host page.
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  Object.assign(iframe.style, {
    width: "min(420px, 92vw)", height: "min(640px, 92vh)",
    border: "none", borderRadius: "14px", background: "transparent",
  } as CSSStyleDeclaration);

  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // Set a timeout for the checkout to send "ready" message
  readyTimeout = window.setTimeout(() => {
    if (overlay) {
      config.onError?.({ code: "checkout_timeout", message: "Checkout failed to load. Please try again." });
      teardown();
    }
  }, 10000); // 10 second timeout

  messageListener = (e: MessageEvent<CheckoutMessage>) => {
    // Only trust messages that actually came from the checkout's real origin —
    // e.origin is set by the browser and can't be spoofed by message content,
    // unlike the `source` field below.
    if (e.origin !== CHECKOUT_ORIGIN_BASE) return;
    const data = e.data;
    if (!data || data.source !== "dodo-checkout") return;

    if (data.type === "ready") {
      // Clear the timeout since checkout loaded successfully
      if (readyTimeout) {
        clearTimeout(readyTimeout);
        readyTimeout = null;
      }
      iframe?.contentWindow?.postMessage(
        {
          source: "dodo-sdk",
          type: "init",
          productId: config.productId,
          productName: config.productName,
          amount: config.amount,
          theme: config.theme,
        },
        CHECKOUT_ORIGIN_BASE
      );
    } else if (data.type === "success") {
      config.onSuccess?.({ sessionId: data.sessionId! });
    } else if (data.type === "error") {
      config.onError?.({ code: data.code!, message: data.message! });
    } else if (data.type === "close") {
      config.onClose?.({ reason: data.reason! });
      teardown();
    }
  };

  window.addEventListener("message", messageListener);
}

(window as any).DodoCheckout = { open };
