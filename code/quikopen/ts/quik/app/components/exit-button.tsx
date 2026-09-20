/**
 * Process exit (UI ×). Posts token from the page query string so only this
 * overlay's HTTP process is closed.
 */
import { useState } from "react";

export function ExitButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function token(): string {
    return new URL(window.location.href).searchParams.get("token") ?? "";
  }

  async function onClose(): Promise<void> {
    if (busy) return;
    const value = token();
    if (!value) {
      setError("missing token");
      return;
    }
    setBusy(true);
    try {
      await fetch("/__quik/exit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
    } catch {
      setError("exit failed");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="quik-exit"
      aria-label="Close viewer"
      title="Close"
      className="quik-exit"
      disabled={busy}
      onClick={() => {
        void onClose();
      }}
    >
      ×{error ? <span className="quik-exit-err">{error}</span> : null}
    </button>
  );
}
