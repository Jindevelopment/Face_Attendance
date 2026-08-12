// 화면들이 공유하는 표현 요소.
//
// 이전에는 각 페이지가 인라인 style 객체로 색·간격을 직접 적었다. 같은 성격의 요소가
// 화면마다 조금씩 달라졌고, 색 하나 바꾸려면 모든 페이지를 뒤져야 했다.
// 값은 app/globals.css 의 토큰에 있고, 여기서는 클래스만 조합한다.

import Link from "next/link";

export function PageHeader({ title, desc, action }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "", ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return <input className={`input ${props.className ?? ""}`} {...props} />;
}

export function Button({ variant = "primary", size, block, children, ...rest }) {
  const cls = [
    "btn",
    `btn-${variant}`,
    size === "lg" ? "btn-lg" : "",
    block ? "btn-block" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Alert({ type = "info", children }) {
  // type "plain" 은 테두리만 있는 안내. 경고색을 남발하면 진짜 오류가 묻힌다.
  const cls = type === "plain" ? "alert" : `alert alert-${type}`;
  return <div className={cls}>{children}</div>;
}

export function Badge({ variant, children }) {
  return <span className={variant ? `badge badge-${variant}` : "badge"}>{children}</span>;
}

export function Stat({ label, value, variant }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div
        className="stat-value"
        style={variant ? { color: `var(--${variant})` } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// 데이터가 없을 때. 표만 비워두면 고장 난 것처럼 보이므로,
// 다음에 무엇을 하면 되는지 함께 보여준다.
export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      {title && <div className="empty-title">{title}</div>}
      {children}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// 로그인/가입처럼 폼 하나만 있는 화면의 공통 껍데기.
export function AuthCard({ title, desc, children, footer, backTo }) {
  return (
    <div className="page-narrow">
      <h1 className="page-title">{title}</h1>
      {desc && <p className="page-desc" style={{ marginBottom: 26 }}>{desc}</p>}
      <div className="card">{children}</div>
      {footer && (
        <p style={{ marginTop: 18, fontSize: 13, color: "var(--text-dim)" }}>{footer}</p>
      )}
      {backTo && (
        <p style={{ marginTop: 14, fontSize: 12.5 }}>
          <Link href={backTo.href} style={{ color: "var(--text-faint)" }}>
            ← {backTo.label}
          </Link>
        </p>
      )}
    </div>
  );
}

export function DataTable({ columns, rows, empty }) {
  if (!rows || rows.length === 0) return empty ?? null;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._key ?? i}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}
