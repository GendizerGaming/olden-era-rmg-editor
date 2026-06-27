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
      onToggle={(e) => {
        // React simulates bubbling for onToggle, so a nested <details> toggle
        // also fires here with e.target = the child. Only react to our own
        // toggle, otherwise collapsing a child collapses this parent.
        if (e.target === e.currentTarget) {
          setIsOpen((e.currentTarget as HTMLDetailsElement).open);
        }
      }}
    >
      <summary>{summary}</summary>
      {isOpen && renderContent()}
    </details>
  );
};
