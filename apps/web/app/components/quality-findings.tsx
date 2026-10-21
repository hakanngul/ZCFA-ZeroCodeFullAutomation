export type Findings = {
  summary: string;
  checked: number;
  items: {
    text: string;
    id?: string;
    impact?: string;
    target?: string;
    status?: number;
  }[];
  truncated?: boolean;
};

/** Summarized page-quality findings (console, links, accessibility). */
export function QualityFindings({ findings }: { findings?: Findings }) {
  if (!findings?.items.length) return null;
  return (
    <ul
      className="quality-findings"
      style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 13 }}
    >
      {findings.items.map((item, i) => (
        <li key={i}>
          {item.id && <code>{item.id}</code>}
          {item.impact && <em> {item.impact}</em>}
          {item.target && <code> {item.target}</code>} {item.text}
        </li>
      ))}
      {findings.truncated && <li>… daha fazla bulgu var</li>}
    </ul>
  );
}
