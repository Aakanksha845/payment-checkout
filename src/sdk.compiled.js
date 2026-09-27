/* DodoCheckout SDK — compiled from src/sdk.ts */
(function () {
  var CHECKOUT_ORIGIN = "https://claude.ai/artifact/8Us5zj9nRWm2iHnzEwRaBd";
  var CHECKOUT_ORIGIN_BASE = new URL(CHECKOUT_ORIGIN).origin; // scheme+host+port only
  var overlay = null, iframe = null, messageListener = null, readyTimeout = null;

  function teardown() {
    if (readyTimeout) clearTimeout(readyTimeout);
    if (messageListener) window.removeEventListener("message", messageListener);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.style.overflow = "";
    overlay = null; iframe = null; messageListener = null; readyTimeout = null;
  }

  function open(config) {
    if (!config || !config.productId) {
      config && config.onError && config.onError({ code: "invalid_config", message: "productId is required." });
      return;
    }
    if (overlay) return; // ignore a second open() while one is already active

    overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", background: "rgba(10,10,12,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: "2147483647",
    });

    iframe = document.createElement("iframe");
    iframe.src = CHECKOUT_ORIGIN;
    iframe.title = "Checkout";
    iframe.setAttribute("allow", "payment");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    Object.assign(iframe.style, {
      width: "min(420px, 92vw)", height: "min(640px, 92vh)",
      border: "none", borderRadius: "14px", background: "transparent",
    });

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    // Set a timeout for the checkout to send "ready" message
    readyTimeout = setTimeout(function () {
      if (overlay) {
        config.onError && config.onError({ code: "checkout_timeout", message: "Checkout failed to load. Please try again." });
        teardown();
      }
    }, 10000); // 10 second timeout

    messageListener = function (e) {
      // Only trust messages that actually came from the checkout's real
      // origin — e.origin is set by the browser itself and can't be spoofed
      // by the message content, unlike the `source` field below.
      if (e.origin !== CHECKOUT_ORIGIN_BASE) return;
      var data = e.data;
      if (!data || data.source !== "dodo-checkout") return;

      if (data.type === "ready") {
        // Clear the timeout since checkout loaded successfully
        if (readyTimeout) {
          clearTimeout(readyTimeout);
          readyTimeout = null;
        }
        iframe.contentWindow.postMessage({
          source: "dodo-sdk", type: "init",
          productId: config.productId, productName: config.productName, amount: config.amount, theme: config.theme,
        }, CHECKOUT_ORIGIN_BASE); // pinned target — won't deliver if the iframe ever navigates elsewhere
      } else if (data.type === "success") {
        config.onSuccess && config.onSuccess({ sessionId: data.sessionId });
      } else if (data.type === "error") {
        config.onError && config.onError({ code: data.code, message: data.message });
      } else if (data.type === "close") {
        config.onClose && config.onClose({ reason: data.reason });
        teardown();
      }
    };
    window.addEventListener("message", messageListener);
  }

  window.DodoCheckout = { open: open };
})();
