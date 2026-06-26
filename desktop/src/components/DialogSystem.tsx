import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react';

type DialogType = 'alert' | 'confirm';
type DialogSeverity = 'info' | 'warning' | 'danger' | 'success';

interface DialogOptions {
  title: string;
  message: ReactNode;
  type?: DialogType;
  severity?: DialogSeverity;
  confirmText?: string;
  cancelText?: string;
}

interface DialogContextType {
  alert: (options: Omit<DialogOptions, 'type'>) => Promise<void>;
  confirm: (options: Omit<DialogOptions, 'type'>) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [resolveFn, setResolveFn] = useState<((value: any) => void) | null>(null);

  const openDialog = useCallback((opts: DialogOptions) => {
    return new Promise<any>((resolve) => {
      setOptions(opts);
      setResolveFn(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const alert = useCallback((opts: Omit<DialogOptions, 'type'>) => {
    return openDialog({ ...opts, type: 'alert' });
  }, [openDialog]);

  const confirm = useCallback((opts: Omit<DialogOptions, 'type'>) => {
    return openDialog({ ...opts, type: 'confirm' });
  }, [openDialog]);

  const handleClose = (value: any) => {
    setIsOpen(false);
    setTimeout(() => {
      if (resolveFn) resolveFn(value);
      setOptions(null);
      setResolveFn(null);
    }, 200); // Wait for transition
  };

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      
      {/* Dialog Overlay */}
      <div 
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => {
          if (options?.type === 'alert') handleClose(undefined);
          if (options?.type === 'confirm') handleClose(false);
        }}
      >
        <div 
          className={`bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-200 ${
            isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="flex-shrink-0 mt-1">
                {options?.severity === 'danger' && <AlertCircle className="w-6 h-6 text-rose-500" />}
                {options?.severity === 'warning' && <AlertCircle className="w-6 h-6 text-amber-500" />}
                {options?.severity === 'success' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                {(!options?.severity || options.severity === 'info') && <Info className="w-6 h-6 text-indigo-400" />}
              </div>
              
              {/* Content */}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  {options?.title}
                </h3>
                <div className="text-sm text-slate-300 leading-relaxed">
                  {options?.message}
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="px-6 py-4 bg-slate-800/50 border-t border-slate-700/50 flex justify-end gap-3">
            {options?.type === 'confirm' && (
              <button
                onClick={() => handleClose(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors focus:outline-none"
              >
                {options.cancelText || 'Cancel'}
              </button>
            )}
            <button
              onClick={() => handleClose(options?.type === 'confirm' ? true : undefined)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none shadow-lg ${
                options?.severity === 'danger' 
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20' 
                  : options?.severity === 'warning'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/20'
              }`}
            >
              {options?.confirmText || 'OK'}
            </button>
          </div>
        </div>
      </div>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}
