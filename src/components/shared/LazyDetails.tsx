import React from 'react';

interface LazyDetailsProps {
  summary: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  renderContent: () => React.ReactNode;
}

export const LazyDetails: React.FC<LazyDetailsProps> = ({ summary, className, style, renderContent }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <details
      className={className}
      style={style}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>{summary}</summary>
      {isOpen && renderContent()}
    </details>
  );
};
