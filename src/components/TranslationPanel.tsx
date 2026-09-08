import "./TranslationPanel.css";

interface TranslationPanelProps {
  visible: boolean;
  rows: [string, string][];
  sentence: string;
}

export function TranslationPanel({ visible, rows, sentence }: TranslationPanelProps) {
  return (
    <div className={`translationPanel ${visible ? "is-visible" : ""}`} aria-hidden={!visible}>
      <div className="translationPanel__heading mono">TRANSLATION</div>
      <div className="translationPanel__rows">
        {rows.map(([from, to]) => (
          <div className="translationPanel__row mono" key={from}>
            <span>{from}</span>
            <span className="translationPanel__arrow">→</span>
            <span className="translationPanel__to">{to}</span>
          </div>
        ))}
      </div>
      <p className="translationPanel__sentence">{sentence}</p>
    </div>
  );
}
