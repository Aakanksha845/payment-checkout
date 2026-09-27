import React, { useState, useRef, useEffect, useCallback } from 'react';

type View = "form" | "processing" | "success" | "declined" | "error" | "unknown";
type ChargeResult =
  | { status: "success"; sessionId: string }
  | { status: "declined" }
  | { status: "error" }
  | { status: "unknown" };

interface InitPayload { productId: string; productName?: string; amount?: string; theme?: 'light' | 'dark'; }

function post(msg: Record<string, unknown>) {
  // In demo mode, also post to window itself
  window.postMessage({ source: "dodo-checkout", ...msg }, "*");
  // Also try parent for real iframe scenario
  if (window.parent !== window) {
    window.parent.postMessage({ source: "dodo-checkout", ...msg }, "*");
  }
}

function chargeCard(cardNumber: string, attemptCounts: Map<string, number>): ChargeResult {
  if (cardNumber === "4242424242424242") {
    return { status: "success", sessionId: "sess_" + Math.random().toString(36).slice(2, 12) };
  }
  if (cardNumber === "4000000000000002") {
    return { status: "declined" };
  }
  if (cardNumber === "4000000000000341") {
    const seen = attemptCounts.get(cardNumber) || 0;
    attemptCounts.set(cardNumber, seen + 1);
    return seen === 0 ? { status: "error" } : { status: "success", sessionId: "sess_" + Math.random().toString(36).slice(2, 12) };
  }
  if (cardNumber === "4000000000000119") {
    // Simulates network timeout/unknown state
    throw new Error("network_timeout");
  }
  throw new Error("unrecognized_card");
}

export default function CheckoutApp() {
  const [view, setView] = useState<View>("form");
  const [product, setProduct] = useState<InitPayload>({ productId: "", productName: "Product", amount: "$0.00" });
  const [theme, setTheme] = useState<'light' | 'dark' | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardNumberError, setCardNumberError] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [expiryCvcError, setExpiryCvcError] = useState("");
  const [shake, setShake] = useState(false);
  const [prevExpiryLength, setPrevExpiryLength] = useState(0);

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const chargeCache = useRef(new Map<string, ChargeResult>()).current;
  const attemptCounts = useRef(new Map<string, number>()).current;

  const handleClose = useCallback(() => {
    post({ type: "close", reason: "user" });
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      // For demo mode, accept messages from window itself
      if (!data || data.source !== "dodo-sdk") return;
      if (data.type === "init" && typeof data.productId === "string") {
        setProduct({
          productId: data.productId,
          productName: typeof data.productName === "string" ? data.productName : "Product",
          amount: typeof data.amount === "string" ? data.amount : "$0.00",
        });
        if (data.theme === 'light' || data.theme === 'dark') {
          setTheme(data.theme);
        }
      }
    }
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && view !== "processing") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view, handleClose]);

  function triggerShake() { setShake(true); setTimeout(() => setShake(false), 320); }

  function applyResult(result: ChargeResult) {
    if (result.status === "success") {
      setView("success");
      post({ type: "success", sessionId: result.sessionId });
    } else if (result.status === "declined") {
      setView("declined");
      post({ type: "error", code: "card_declined", message: "The card was declined by the issuing bank." });
    } else {
      setView("error");
      post({ type: "error", code: "processing_failed", message: "The payment could not be processed. No charge was made." });
    }
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\s/g, "");
    setEmail(value);
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError("");
    }
  }

  function handleExpiryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawValue = e.target.value.replace(/\D/g, "");
    const isDeleting = rawValue.length < prevExpiryLength;
    
    if (isDeleting && rawValue.length <= 2) {
      setExpiry(rawValue);
    } else if (rawValue.length >= 2) {
      setExpiry(rawValue.slice(0, 2) + "/" + rawValue.slice(2, 4));
    } else {
      setExpiry(rawValue);
    }
    
    setPrevExpiryLength(rawValue.length);
  }

  function handleCvcChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, "").slice(0, 3);
    setCvc(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setCardNumberError("");
    setExpiryCvcError("");
    const digits = cardNumber.replace(/\s+/g, "");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Please enter a valid email address"); triggerShake(); return; }
    if (digits.length !== 16) { setCardNumberError("Enter a valid 16-digit card number"); triggerShake(); return; }
    if (!expiry || !cvc) { setExpiryCvcError("Enter the expiry and CVC"); triggerShake(); return; }

    if (chargeCache.has(idempotencyKey)) {
      applyResult(chargeCache.get(idempotencyKey)!);
      return;
    }
    if (view === "processing") return;

    setView("processing");
    setTimeout(() => {
      try {
        const result = chargeCard(digits, attemptCounts);
        chargeCache.set(idempotencyKey, result);
        applyResult(result);
      } catch (err) {
        if (err instanceof Error && err.message === "network_timeout") {
          // Simulate network timeout - we don't know if payment went through
          setView("unknown");
          post({ type: "error", code: "network_timeout", message: "Network timeout. Payment status unknown." });
        } else {
          setView("form");
          setCardNumberError("Unrecognized test card. Use one of the provided test numbers");
          triggerShake();
        }
      }
    }, 900);
  }

  function startNewAttempt() {
    setIdempotencyKey(crypto.randomUUID());
    setEmailError("");
    setCardNumberError("");
    setExpiryCvcError("");
    setView("form");
  }

  function formatCard(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }

  return (
    <div className={"card" + (shake ? " shake" : "")} data-theme={theme}>
      {view !== "success" && view !== "declined" && view !== "error" && (
        <div>
          <div className="logo-container">
            <img src="/logoFullNameLight.svg" alt="Logo" className="logo" />
          </div>
          <div className="brand"><span className="dot"></span><span>Secure checkout</span></div>
          <h1>{product.productName}</h1>
          <p className="amount">{product.amount} <small>USD</small></p>

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" placeholder="you@example.com"
              value={email} onChange={handleEmailChange} required />
            {emailError && <p className="error-text">{emailError}</p>}

            <label htmlFor="cardNumber">Card number</label>
            <input id="cardNumber" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242"
              value={cardNumber} onChange={e => setCardNumber(formatCard(e.target.value))} required maxLength={19} />
            {cardNumberError && <p className="error-text">{cardNumberError}</p>}

            <div className="row">
              <div>
                <label htmlFor="expiry">Expiry</label>
                <input id="expiry" autoComplete="cc-exp" placeholder="MM / YY"
                  value={expiry} onChange={handleExpiryChange} required maxLength={5} />
              </div>
              <div>
                <label htmlFor="cvc">CVC</label>
                <input id="cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123"
                  value={cvc} onChange={handleCvcChange} required maxLength={3} />
              </div>
            </div>
            {expiryCvcError && <p className="error-text">{expiryCvcError}</p>}

            <button className="pay" type="submit" disabled={view === "processing"}>
              {view === "processing" ? <span className="spinner"></span> : `Pay ${product.amount}`}
            </button>
            <button className="cancel" type="button" onClick={handleClose}>Cancel</button>
          </form>
        </div>
      )}

      {view === "success" && (
        <div className="state-panel success">
          <div className="logo-container">
            <img src="/logoFullNameLight.svg" alt="Logo" className="logo" />
          </div>
          <div className="icon">✓</div>
          <h2>Payment successful</h2>
          <p>You're all set. A receipt is on its way.</p>
          <button className="btn-primary" style={{width:"100%"}} onClick={() => post({ type: "close", reason: "success" })}>Done</button>
        </div>
      )}

      {view === "declined" && (
        <div className="state-panel declined">
          <div className="logo-container">
            <img src="/logoFullNameLight.svg" alt="Logo" className="logo" />
          </div>
          <div className="icon">✕</div>
          <h2>Card declined</h2>
          <p>Your bank declined this card. Try a different one.</p>
          <div className="btn-row">
            <button className="btn-secondary" onClick={() => post({ type: "close", reason: "user" })}>Cancel</button>
            <button className="btn-primary" onClick={() => { setCardNumber(""); startNewAttempt(); }}>Use another card</button>
          </div>
        </div>
      )}

      {view === "error" && (
        <div className="state-panel error">
          <div className="logo-container">
            <img src="/logoFullNameLight.svg" alt="Logo" className="logo" />
          </div>
          <div className="icon">!</div>
          <h2>Payment didn't go through</h2>
          <p>Something interrupted the payment. No charge was made — you can safely retry.</p>
          <div className="btn-row">
            <button className="btn-secondary" onClick={() => post({ type: "close", reason: "user" })}>Cancel</button>
            <button className="btn-primary" onClick={startNewAttempt}>Try again</button>
          </div>
        </div>
      )}

      {view === "unknown" && (
        <div className="state-panel error">
          <div className="logo-container">
            <img src="/logoFullNameLight.svg" alt="Logo" className="logo" />
          </div>
          <div className="icon">?</div>
          <h2>Payment status unknown</h2>
          <p>We couldn't complete the request due to a network issue. The payment may have been processed — please check your email or contact support.</p>
          <div className="btn-row">
            <button className="btn-secondary" onClick={() => post({ type: "close", reason: "user" })}>Close</button>
            <button className="btn-primary" onClick={() => { setCardNumber(""); startNewAttempt(); }}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
