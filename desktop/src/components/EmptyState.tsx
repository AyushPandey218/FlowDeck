import React from 'react';
import { THEME } from '../config/theme';

interface ActionConfig {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  title: string;
  description: string;
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  illustration?: React.ComponentType<{ className?: string }>;
}

export default function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  illustration: Icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10 max-w-lg mx-auto my-6 space-y-4">
      {Icon && (
        <div className="bg-slate-900/60 p-4 rounded-full border border-slate-800/40 text-violet-400 shadow-inner">
          <Icon className="w-10 h-10" />
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className={THEME.title}>{title}</h3>
        <p className={THEME.textDesc}>{description}</p>
      </div>
      
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className={THEME.btnPrimary}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={THEME.btnSecondary}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
