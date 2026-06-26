import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-slate-950/50 border ${isOpen ? 'border-violet-500/60 ring-2 ring-violet-500/20' : 'border-slate-800/80'} text-slate-200 text-sm rounded-xl py-2.5 px-4 outline-none transition-all flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-700'}`}
      >
        <div className="flex items-center gap-3 truncate">
          {selectedOption?.icon}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-violet-400' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto custom-scrollbar">
          <div className="p-1">
            {options.length === 0 && (
              <div className="py-3 px-4 text-sm text-slate-500 text-center">No options available</div>
            )}
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm transition-colors ${
                  value === option.value
                    ? 'bg-violet-500/20 text-violet-300 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                {option.icon && (
                  <div className={`${value === option.value ? 'text-violet-400' : 'text-slate-400'}`}>
                    {option.icon}
                  </div>
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {value === option.value && <Check size={16} className="text-violet-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
