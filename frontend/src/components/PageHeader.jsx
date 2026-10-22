export default function PageHeader({ title, subtitle, eyebrow, actions }) {
  return <div className="page-header">
    <div className="page-header-copy">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>;
}
