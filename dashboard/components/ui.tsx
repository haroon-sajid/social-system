import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { STATUS_DOT, STATUS_LABEL, STATUS_STYLE, type VariantStatus } from "@/lib/platforms";

export function PageHeader({ title, description, actions, crumbs }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-5 space-y-1.5">
      {crumbs && (
        <nav className="flex items-center gap-1 text-[13px] text-slate-500" aria-label="Breadcrumb">
          {crumbs.map((c) => (
            <span key={c.href} className="flex items-center gap-1">
              <Link href={c.href} className="hover:text-brand-700">{c.label}</Link>
              <Icon name="chevronRight" size={13} className="text-slate-400" />
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {/* Two-tone headline: light lead-in, dark emphasis via <strong> */}
          <h2 className="text-[28px] font-medium leading-tight tracking-[-0.025em] text-slate-400 [&_strong]:font-semibold [&_strong]:text-slate-900">{title}</h2>
          {description && <div className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-slate-500">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status, className = "" }: { status: VariantStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]} ${status === "publishing" ? "animate-pulse" : ""}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon: IconName; title: string; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const TONES = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: "info" as IconName, iconColor: "text-sky-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "alert" as IconName, iconColor: "text-amber-600" },
  danger: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: "alert" as IconName, iconColor: "text-rose-600" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "check" as IconName, iconColor: "text-emerald-600" },
};

export function Callout({ tone = "info", title, children, onClose, className = "" }: {
  tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; onClose?: () => void; className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`flex gap-3 rounded-lg border px-3.5 py-3 text-sm ${t.box} ${className}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={t.icon} size={18} className={`mt-px shrink-0 ${t.iconColor}`} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className="whitespace-pre-line break-words">{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="-m-1 h-6 w-6 shrink-0 rounded p-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/** Card with a header (title, description, optional action), body and optional tinted footer. */
export function Panel({ title, desc, action, footer, children, className = "", bodyClass = "" }: {
  title: ReactNode; desc?: ReactNode; action?: ReactNode; footer?: ReactNode; children?: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(18,19,22,0.03)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {desc && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{desc}</p>}
        </div>
        {action}
      </div>
      {/* Body grows, so panels side by side in a grid end at the same height */}
      {children !== undefined && <div className={`flex-1 ${bodyClass}`}>{children}</div>}
      {footer && <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-5">{footer}</div>}
    </section>
  );
}

export function StatTile({ label, value, hint, href, active, accent }: {
  label: string; value: ReactNode; hint?: ReactNode; href?: string; active?: boolean; accent?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        {accent && <span className={`h-2 w-2 rounded-full ${accent}`} />}
        {label}
      </div>
      <div className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-2.5 text-xs text-slate-500">{hint}</div>}
    </>
  );
  const cls = `block rounded-2xl border bg-white px-5 py-4 shadow-[0_1px_2px_rgba(18,19,22,0.03)] transition ${active ? "border-brand-300 ring-4 ring-brand-500/10" : "border-slate-200/80"}`;
  return href ? <Link href={href} className={`${cls} hover:border-slate-300`}>{body}</Link> : <div className={cls}>{body}</div>;
}
