import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Shell, PageHeader, Panel, ScoreMeter, StatusPill } from "@/components/Shell";
import { inspectImage, type ImageQuality } from "@/lib/image-check";
import { formatMrp, formatTimestamp, searchRegistry, verifyBarcode, type RegistryRecord, type Verdict } from "@/lib/registry";
import { recordVerification } from "@/lib/store";
import { playError, playForVerdict } from "@/lib/sound";
import { Upload, Sparkles, Check, X, ImageOff, Loader2, RotateCcw, ScanLine, ShieldCheck, ShieldAlert, ShieldQuestion, Flag } from "lucide-react";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "AI Packaging Analysis — BeautyVerify" },
      {
        name: "description",
        content:
          "Upload a product photo: the specimen gate rejects non-cosmetic images, and any accepted package is matched only against the authorised products registry.",
      },
      { property: "og:title", content: "AI Packaging Analysis — BeautyVerify" },
      {
        property: "og:description",
        content: "Deterministic packaging analysis — no simulated confidence scores, registry-only verification results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analysis,
});

type Stage =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "rejected"; quality: ImageQuality; timestamp: string }
  | { kind: "accepted"; quality: ImageQuality; timestamp: string }
  | { kind: "matching" }
  | { kind: "result"; verdict: Verdict; quality: ImageQuality };

const kindMeta = {
  verified: { icon: ShieldCheck, tone: "success", border: "border-success/40 bg-success/10", text: "text-success" },
  expired: { icon: ShieldAlert, tone: "warning", border: "border-warning/45 bg-warning/10", text: "text-warning-foreground" },
  counterfeit: { icon: ShieldAlert, tone: "danger", border: "border-destructive/50 bg-destructive/10", text: "text-destructive" },
  unknown: { icon: ShieldQuestion, tone: "muted", border: "border-border bg-secondary/40", text: "text-muted-foreground" },
} as const;

function Analysis() {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback((file: File | undefined) => {
    if (!file) return;
    setStage({ kind: "idle" });
    setLabel("");
    setPending(file);
    setFileName(file.name);
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }, []);

  /** Step 1 — specimen gate. No score is produced here, ever. */
  const runGate = useCallback(async () => {
    if (!pending) return;
    setStage({ kind: "checking" });
    const [quality] = await Promise.all([inspectImage(pending), new Promise((r) => setTimeout(r, 1200))]);
    const timestamp = new Date().toISOString();
    if (!quality.ok) {
      setStage({ kind: "rejected", quality, timestamp });
      playError();
      // A rejected specimen is still an audited verification attempt.
      recordVerification(verifyBarcode(""), "Image");
      return;
    }
    setStage({ kind: "accepted", quality, timestamp });
  }, [pending]);

  /** Step 2 — registry lookup using the values read off the package. */
  const runMatch = useCallback(
    (query: string, quality: ImageQuality) => {
      const q = query.trim();
      if (!q) return;
      setStage({ kind: "matching" });
      setTimeout(() => {
        const matches: RegistryRecord[] = searchRegistry(q);
        // Only an exact single registry record can produce a result.
        const verdict = matches.length === 1 ? verifyBarcode(matches[0].barcodeNumber) : verifyBarcode(q);
        setStage({ kind: "result", verdict, quality });
        recordVerification(verdict, "Image");
        playForVerdict(verdict.kind);
      }, 700);
    },
    [],
  );

  const reset = () => {
    setPreview(null);
    setFileName(null);
    setPending(null);
    setLabel("");
    setStage({ kind: "idle" });
  };

  const quality = stage.kind === "accepted" || stage.kind === "rejected" || stage.kind === "result" ? stage.quality : null;

  return (
    <Shell>
      <PageHeader
        eyebrow="AI Analysis"
        title="Packaging analysis, without invented scores"
        subtitle="The specimen gate first decides whether the photo contains a cosmetic package. Anything else — person, animal, chair, vehicle, food, document, screenshot or blank frame — is rejected at 0%. Accepted packages are matched only against the authorised products registry."
        actions={<StatusPill label="No simulated confidence" className="text-primary border-primary/30 bg-primary/10" />}
      />

      <div className="container mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-2 gap-6">
        <Panel title="Product specimen" subtitle="JPG or PNG, full package in frame">
          <div className="p-5 sm:p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                accept(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className="relative aspect-video rounded-2xl border-2 border-dashed border-border grid place-items-center overflow-hidden cursor-pointer hover:border-primary/50 transition bg-secondary/30"
            >
              {preview ? (
                <>
                  <img src={preview} alt="Uploaded product specimen preview" className="absolute inset-0 size-full object-contain" />
                  {stage.kind === "checking" && (
                    <div className="absolute inset-0 bg-background/40">
                      <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-glow animate-[bv-scan_1.8s_ease-in-out_infinite]" />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center px-6">
                  <Upload className="size-8 mx-auto mb-3 text-primary" />
                  <div className="text-sm font-medium">Drop product image or browse</div>
                  <div className="text-xs text-muted-foreground mt-1">Front label visible, even lighting</div>
                </div>
              )}
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => accept(e.target.files?.[0])} />

            {fileName && <div className="mt-3 text-xs text-muted-foreground truncate">{fileName}</div>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={runGate}
                disabled={!pending || stage.kind === "checking" || stage.kind === "matching"}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full bg-gradient-primary text-primary-foreground font-semibold shadow-glow transition disabled:opacity-30"
              >
                {stage.kind === "checking" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {stage.kind === "checking" ? "Checking specimen…" : "Start AI analysis"}
              </button>
              {(preview || stage.kind !== "idle") && (
                <button
                  onClick={reset}
                  aria-label="Reset analysis"
                  className="size-12 rounded-full border border-border grid place-items-center text-muted-foreground hover:bg-secondary transition"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}
            </div>

            {(stage.kind === "accepted" || stage.kind === "matching" || stage.kind === "result") && quality && (
              <div className="mt-6 rounded-2xl border border-border bg-background/40 p-4">
                <label htmlFor="bv-label" className="text-sm font-medium">
                  Registry lookup — read the label
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the barcode number, product name or brand printed on the package. Values are matched verbatim against the registry; nothing is guessed.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    id="bv-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runMatch(label, quality)}
                    placeholder="e.g. 8904320509653 or Velvet Matte Lipstick"
                    className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-input bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => runMatch(label, quality)}
                    disabled={!label.trim() || stage.kind === "matching"}
                    className="shrink-0 px-5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-30"
                  >
                    Match
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Results are registry lookups presented as a verification recommendation — the app never estimates authenticity from an image alone.
            </p>
          </div>
          <style>{`@keyframes bv-scan { 0%{top:0} 50%{top:100%} 100%{top:0} }`}</style>
        </Panel>

        <div className="space-y-6">
          {(stage.kind === "checking" || stage.kind === "matching") && <AnalysisSkeleton matching={stage.kind === "matching"} />}

          {stage.kind === "idle" && (
            <Panel>
              <div className="p-12 text-center text-muted-foreground">
                <ScanLine className="size-10 mx-auto mb-4 opacity-50" />
                <div className="text-sm">Analysis output appears here.</div>
              </div>
            </Panel>
          )}

          {stage.kind === "rejected" && <RejectedCard quality={stage.quality} timestamp={stage.timestamp} />}

          {stage.kind === "accepted" && (
            <Panel title="Specimen accepted" subtitle="No score is produced until the registry is matched">
              <div className="p-6 space-y-3 text-sm">
                <FindingRow pass label="Cosmetic package detected" detail={stage.quality.reason} />
                <FindingRow
                  pass
                  label="Frame resolution"
                  detail={`${stage.quality.width}×${stage.quality.height} accepted for label reading`}
                />
                <FindingRow
                  pass={false}
                  label="Registry match"
                  detail="Pending — enter the barcode, product name or brand printed on the package."
                />
                <p className="text-xs text-muted-foreground pt-2">Checked {formatTimestamp(stage.timestamp)}</p>
              </div>
            </Panel>
          )}

          {stage.kind === "result" && <VerdictCard verdict={stage.verdict} quality={stage.quality} />}
        </div>
      </div>
    </Shell>
  );
}

function AnalysisSkeleton({ matching }: { matching: boolean }) {
  return (
    <Panel title={matching ? "Matching registry" : "Validating specimen"} subtitle={matching ? "Exact lookup in products.csv" : "Deciding whether a cosmetic package is present"}>
      <div className="p-6 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-secondary animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded bg-secondary animate-pulse" style={{ width: `${40 + i * 8}%` }} />
              <div className="h-2 rounded bg-secondary/70 animate-pulse" style={{ width: `${60 + i * 5}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RejectedCard({ quality, timestamp }: { quality: ImageQuality; timestamp: string }) {
  return (
    <section className="rounded-2xl border-2 border-destructive/50 bg-destructive/10 p-6 sm:p-8 shadow-elegant animate-in fade-in slide-in-from-bottom-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="size-14 rounded-2xl bg-destructive grid place-items-center text-destructive-foreground">
            <ImageOff className="size-7" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-destructive">Analysis stopped</div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">No Valid Cosmetic Product Detected</h2>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-semibold tabnum text-destructive">0%</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Trust Score</div>
        </div>
      </div>

      <div className="mt-5 grid sm:grid-cols-2 gap-3 text-xs">
        <Field label="Status" value="Unverified" />
        <Field label="Registry status" value="Not In Registry" />
        <Field label="Trust score" value="0%" />
        <Field label="Analysed at" value={formatTimestamp(timestamp)} />
      </div>

      <div className="mt-5 space-y-3">
        <FindingRow pass={false} label="Cosmetic product detection" detail={quality.reason} />
        <FindingRow pass={false} label="Packaging assessment" detail="Skipped — verification cannot continue without a cosmetic package." />
        <FindingRow pass={false} label="Registry lookup" detail="Not attempted — no product identity to look up." />
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        Photograph the front of the cosmetic package with the label filling most of the frame, then run the analysis again.
      </p>
    </section>
  );
}

function VerdictCard({ verdict: r, quality }: { verdict: Verdict; quality: ImageQuality }) {
  const meta = kindMeta[r.kind];
  return (
    <>
      <section className={`rounded-2xl border-2 p-6 sm:p-8 shadow-elegant animate-in fade-in slide-in-from-bottom-3 ${meta.border}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className={`size-14 rounded-2xl grid place-items-center bg-background/50 ${meta.text}`}>
              <meta.icon className="size-7" />
            </span>
            <div>
              <div className={`text-[10px] uppercase tracking-[0.24em] ${meta.text}`}>{r.statusLabel}</div>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">{r.headline}</h2>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-3xl sm:text-4xl font-semibold tabnum ${meta.text}`}>{r.trustScore}%</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Trust Score</div>
          </div>
        </div>

        <div className="mt-5">
          <ScoreMeter score={r.trustScore} tone={meta.tone} />
        </div>

        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <Field label="Product ID" value={r.productId !== null ? `#${r.productId}` : "—"} />
          <Field label="Product name" value={r.productName} />
          <Field label="Brand name" value={r.brandName} />
          <Field label="Category" value={r.record?.category ?? "—"} />
          <Field label="Barcode number" value={r.barcode || "—"} />
          <Field label="Batch number" value={r.record?.batchNumber ?? "—"} />
          <Field label="Manufacturing date" value={r.record?.manufacturingDate ?? "—"} />
          <Field label="Expiry date" value={r.record?.expiryDate ?? "—"} />
          <Field label="Country of origin" value={r.record?.countryOfOrigin ?? "—"} />
          <Field label="Manufacturer" value={r.record ? r.record.manufacturer : "—"} />
          <Field label="MRP" value={r.record ? formatMrp(r.record.mrp) : "—"} />
          <Field label="Status" value={r.displayStatus} />
          <Field label="Trust score" value={`${r.trustScore}%`} />
          <Field label="Registry status" value={r.registryStatus} />
          <Field label="Analysed at" value={formatTimestamp(r.timestamp)} />
        </div>

        <p className="mt-5 text-sm text-muted-foreground">{r.reason}</p>
        <p className="mt-2 text-sm">{r.recommendation}</p>

        {r.kind !== "verified" && (
          <Link
            to="/reports"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 py-3 rounded-full bg-destructive text-destructive-foreground font-semibold transition hover:opacity-90"
          >
            <Flag className="size-4" /> Report this product
          </Link>
        )}
      </section>

      <Panel title="Analysis trail" subtitle="Specimen gate then registry lookup — nothing else">
        <div className="p-6 space-y-3">
          <FindingRow pass label="Cosmetic package detected" detail={quality.reason} />
          <FindingRow
            pass={r.record !== null}
            label="Registry match"
            detail={r.record ? `Authorised record #${r.record.productId} in products.csv` : "No matching record in products.csv"}
          />
          <FindingRow
            pass={r.kind === "verified"}
            label="Registry status"
            detail={`${r.displayStatus} · ${r.registryStatus}`}
          />
        </div>
      </Panel>
    </>
  );
}

function FindingRow({ pass, label, detail }: { pass: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 size-5 shrink-0 rounded-full grid place-items-center ${pass ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
        {pass ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabnum truncate">{value}</div>
    </div>
  );
}
