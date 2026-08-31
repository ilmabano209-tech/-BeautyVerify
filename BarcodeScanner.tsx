import { useEffect, useId, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";

/**
 * Continuous live scanner. It never stops after a detection: the camera keeps
 * streaming and every newly decoded payload (barcode or QR) is reported to the
 * parent, which owns the verification step.
 */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (text: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState<string>("");
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const regionId = `bv-qr-region-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const recentDetections = useRef(new Map<string, number>());
  const detectRef = useRef(onDetected);
  detectRef.current = onDetected;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(regionId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
          ],
          verbose: false,
        });
        scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              // Linear product barcodes need substantially more horizontal
              // space than QR codes. Keep nearly the full camera width in the
              // decode region so a code visible in the preview is not cropped.
              width: Math.max(180, Math.floor(viewfinderWidth * 0.94)),
              height: Math.max(120, Math.floor(viewfinderHeight * 0.72)),
            }),
            aspectRatio: 1.3333,
          },
          (decodedText) => {
            const payload = decodedText.trim();
            if (!payload) return;

            // html5-qrcode reports the same visible symbol every frame. Keep
            // scanning, but create only one verification while a product is
            // held in frame. Different codes are still forwarded immediately.
            const now = Date.now();
            const lastDetectedAt = recentDetections.current.get(payload) ?? 0;
            if (now - lastDetectedAt < 30000) return;
            recentDetections.current.set(payload, now);
            for (const [code, detectedAt] of recentDetections.current) {
              if (now - detectedAt > 120000) recentDetections.current.delete(code);
            }
            console.info("[BARCODE DETECTED]", payload);
            console.info("[CAMERA] Forwarding detected value to verification callback");
            detectRef.current(payload);
          },
          () => {},
        );
        if (cancelled) {
          await scanner.stop().catch(() => {});
          scanner.clear();
          return;
        }
        setStatus("live");
        console.info("[CAMERA] Camera stream opened and scanner is live");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(
          e instanceof Error && /permission|denied|NotAllowed/i.test(e.message)
            ? "Camera permission was denied. Allow camera access in your browser settings and try again."
            : "No camera stream available on this device. You can enter the barcode number manually instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      }
    };
  }, [regionId]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10">
      <div id={regionId} className="w-full min-h-64 [&_video]:w-full [&_video]:h-auto [&_video]:object-cover" />

      {status === "live" && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-6 sm:inset-10 rounded-xl border-2 border-emerald-400/70" />
          <div className="absolute left-6 right-6 sm:left-10 sm:right-10 h-0.5 bg-emerald-400 shadow-[0_0_16px_2px_rgba(52,211,153,0.9)] animate-[bv-scan_2.2s_ease-in-out_infinite]" />
          <div className="absolute top-3 left-0 right-0 flex justify-center">
            <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15 text-emerald-300 text-[10px] uppercase tracking-[0.18em]">
              Scanning continuously
            </span>
          </div>
        </div>
      )}

      {status === "starting" && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 text-white/80 text-sm gap-2 p-6 text-center">
          <Loader2 className="size-6 animate-spin" />
          Requesting camera access…
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center">
          <div className="text-white/80 text-sm space-y-3 max-w-xs">
            <CameraOff className="size-7 mx-auto text-red-400" />
            <p>{error}</p>
            <button onClick={onClose} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition">
              Close scanner
            </button>
          </div>
        </div>
      )}

      {status !== "error" && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
          <button onClick={onClose} className="px-4 py-2 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white text-xs font-medium hover:bg-black/80 transition">
            Stop camera
          </button>
        </div>
      )}

      <style>{`@keyframes bv-scan { 0%,100% { top: 15%; } 50% { top: 82%; } }`}</style>
    </div>
  );
}
