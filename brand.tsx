import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, PageHeader, Panel, StatCard, StatusPill, ScoreMeter } from "@/components/Shell";
import { brandSummaries, registry, statusTone, isValidEan13, formatMrp } from "@/lib/registry";
import { useHistory, useReports } from "@/lib/store";
import { Building2, Package, ShieldCheck, Flag } from "lucide-react";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "Brand Portal — BeautyVerify" },
      { name: "description", content: "Brand-side view of registry SKUs, barcode integrity, verification volume and counterfeit reports." },
      { property: "og:title", content: "Brand Portal — BeautyVerify" },
      { property: "og:description", content: "Manage registry SKUs and monitor counterfeit activity per brand." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Brand,
});

function Brand() {
  const [brand, setBrand] = useState(brandSummaries[0]?.name ?? "");
  const history = useHistory();
  const reports = useReports();

  const skus = registry.filter((r) => r.brandName === brand);
  const summary = brandSummaries.find((b) => b.name === brand);
  const scans = history.filter((h) => h.brandName === brand);
  const brandReports = reports.filter((r) => r.brandName === brand);

  return (
    <Shell>
      <PageHeader
        eyebrow="Brand Portal"
        title="Registry management"
        subtitle="Every SKU, barcode and integrity signal for the selected brand, sourced from the authorised registry."
        actions={
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            aria-label="Select brand"
            className="px-4 py-2.5 rounded-full border border-input bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {brandSummaries.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="container mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Package} label="Registered SKUs" value={skus.length} />
        <StatCard icon={ShieldCheck} label="Authorised" value={summary?.authentic ?? 0} tone="success" />
        <StatCard icon={Building2} label="Registry integrity" value={`${summary?.integrity ?? 0}%`} tone="warning" />
        <StatCard icon={Flag} label="Consumer reports" value={brandReports.length} tone="danger" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 pb-16 grid lg:grid-cols-2 gap-6">
        <Panel title="SKU ledger" subtitle={`${brand} barcodes on file`}>
          <div className="divide-y divide-border">
            {skus.map((s) => (
              <div key={s.barcodeNumber} className="px-5 sm:px-6 py-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.productName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.category} · {formatMrp(s.mrp)} · batch {s.batchNumber} · exp {s.expiryDate}
                  </div>
                  <div className="text-xs text-muted-foreground tabnum truncate">
                    {s.barcodeNumber} · {isValidEan13(s.barcodeNumber) ? "GS1 checksum valid" : "GS1 checksum invalid"} · trust {s.trustScore}%
                  </div>
                </div>
                <StatusPill label={s.status} className={statusTone[s.status]} />
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Integrity score" subtitle="Share of authorised records across this brand">
            <div className="p-6">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-sm text-muted-foreground">{brand}</span>
                <span className="text-2xl font-semibold tabnum">{summary?.integrity ?? 0}%</span>
              </div>
              <ScoreMeter score={summary?.integrity ?? 0} tone={(summary?.integrity ?? 0) === 100 ? "success" : "danger"} />
            </div>
          </Panel>

          <Panel title="Verification activity" subtitle={`${scans.length} scan${scans.length === 1 ? "" : "s"} recorded for this brand`}>
            {scans.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No verifications recorded for this brand yet.</div>
            ) : (
              <div className="divide-y divide-border max-h-72 overflow-auto">
                {scans.slice(0, 12).map((s) => (
                  <div key={s.id} className="px-5 sm:px-6 py-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground tabnum truncate">
                      {s.barcode} · {s.source}
                    </div>
                    <span className={`text-sm font-semibold tabnum ${s.kind === "verified" ? "text-success" : "text-destructive"}`}>
                      {s.trustScore}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
