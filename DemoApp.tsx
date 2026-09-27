import { useState, useEffect } from 'react';
import CheckoutApp from './CheckoutApp';

interface LogEntry { tag: "success" | "error" | "close"; text: string; time: string; }

export default function DemoApp() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);

  function addLog(tag: LogEntry["tag"], text: string) {
    setLog(prev => [{ tag, text, time: new Date().toLocaleTimeString() }, ...prev]);
  }

  function handleBuy() {
    setShowCheckout(true);
  }

  function handleClose() {
    setShowCheckout(false);
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.source !== "dodo-checkout") return;
      if (data.type === "ready") {
        // Send init message when checkout is ready
        window.postMessage({
          source: "dodo-sdk",
          type: "init",
          productId: "prod_123",
          productName: "Field Notebook, dot grid",
          amount: "$24.00",
        }, "*");
      } else if (data.type === "close") {
        handleClose();
        addLog("close", `Checkout closed (${data.reason || "user"})`);
      } else if (data.type === "success") {
        addLog("success", `Payment successful - Session: ${data.sessionId}`);
      } else if (data.type === "error") {
        addLog("error", `${data.code}: ${data.message}`);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      {showCheckout && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483647,
        }}>
          <CheckoutApp />
        </div>
      )}
      <div className="wrap">
        <header>
          <h1>Fernweh Studio</h1>
          <p>Demo storefront — this page is a stand-in for any site embedding DodoCheckout.</p>
        </header>
        <div className="grid">
          <div className="product">
            <div className="swatch"></div>
            <h2>Field Notebook, dot grid</h2>
            <p className="desc">A5, 160 pages, stitched binding. The one you keep refilling instead of replacing.</p>
            <p className="price">$24.00</p>
            <button className="buy" onClick={handleBuy}>Buy now</button>
            <p className="cards-hint">
              Test cards — <code>4242 4242 4242 4242</code> succeeds · <code>4000 0000 0000 0002</code> declines ·{" "}
              <code>4000 0000 0000 0341</code> fails once, then succeeds on retry ·{" "}
              <code>4000 0000 0000 0119</code> simulates network timeout (unknown state).
            </p>
          </div>
          <div className="log-panel">
            <h3>Callback log</h3>
            <div className="log">
              {log.length === 0
                ? <div className="empty">Nothing yet — click Buy to open the checkout.</div>
                : log.map((e, i) => (
                    <div className="entry" key={i}>
                      <span className={"tag " + e.tag}>{e.tag}</span>{e.text}{" "}
                      <span style={{ color: "var(--sub)" }}>· {e.time}</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
