import "./CornerLabels.css";

export function CornerLabels({ lines }: { lines: string[] }) {
  return (
    <div className="cornerLabels mono" aria-hidden="true">
      {lines.map((line) => (
        <div className="cornerLabels__line" key={line}>
          {line}
        </div>
      ))}
    </div>
  );
}
