import React, { useEffect, useState, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Layers, Plus, Play, Folder, Globe, Volume2, VolumeX, Lock, Trash2, Edit3, X, Check, ShieldAlert, Monitor, Minimize2, Keyboard } from 'lucide-react';
import { THEME } from '../config/theme';
import EmptyState from '../components/EmptyState';
import CustomSelect from '../components/CustomSelect';
import { useToast } from '../components/ToastSystem';

interface Action {
  id: string;
  categoryId: string;
  name: string;
  actionType: string;
  payload: string | null;
  icon: string | null;
  orderIndex: number;
}

interface Category {
  id: string;
  pageId: string;
  name: string;
  orderIndex: number;
}

interface Page {
  id: string;
  name: string;
  orderIndex: number;
  categories: Category[];
}

const ACTION_TEMPLATES = [
  { name: 'Google Chrome', actionType: 'OPEN_APP', payload: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', icon: 'chrome' },
  { name: 'Microsoft Edge', actionType: 'OPEN_APP', payload: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', icon: 'chrome' },
  { name: 'VS Code', actionType: 'OPEN_APP', payload: '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe', icon: 'vscode' },
  { name: 'Discord', actionType: 'OPEN_APP', payload: '%LOCALAPPDATA%\\Discord\\Update.exe --processStart Discord.exe', icon: 'discord' },
  { name: 'Spotify', actionType: 'OPEN_APP', payload: '%APPDATA%\\Spotify\\Spotify.exe', icon: 'spotify' },
  { name: 'Steam', actionType: 'OPEN_APP', payload: 'C:\\Program Files (x86)\\Steam\\Steam.exe', icon: 'steam' },
  { name: 'File Explorer', actionType: 'OPEN_APP', payload: 'explorer.exe', icon: 'folder' },
  { name: 'Google Search', actionType: 'OPEN_URL', payload: 'https://www.google.com', icon: 'globe' },
  { name: 'Lock PC', actionType: 'LOCK_PC', payload: '', icon: 'lock' },
  { name: 'Volume Up', actionType: 'VOLUME_UP', payload: '', icon: 'volume' },
  { name: 'Volume Down', actionType: 'VOLUME_DOWN', payload: '', icon: 'volume' },
  { name: 'Mute Toggle', actionType: 'TOGGLE_MUTE', payload: '', icon: 'mute' },
  { name: 'Hide All Windows', actionType: 'HIDE_ALL_WINDOWS', payload: '', icon: 'minimize' },
  { name: 'Close All Windows', actionType: 'CLOSE_ALL_WINDOWS', payload: '', icon: 'close_all' },
  { name: 'Cycle Through Desktops (Next)', actionType: 'SWITCH_DESKTOP', payload: 'right', icon: 'desktop' },
  { name: 'Cycle Through Desktops (Prev)', actionType: 'SWITCH_DESKTOP', payload: 'left', icon: 'desktop' },
];

const ChromeLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" className={props.className} fill="none" {...props}>
    <path fill="#4285F4" d="M12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z" />
    <path fill="#DB4437" d="M12 2a10 10 0 0 0-8.7 5l4.35 7.53a4.5 4.5 0 0 1 1.83-2.5 4.5 4.5 0 0 1 2.52-.73H22A10 10 0 0 0 12 2Z" />
    <path fill="#FFCD40" d="M22 12a10 10 0 0 0-5-8.66l-4.35 7.53a4.5 4.5 0 0 1 .73 2.53 4.5 4.5 0 0 1-1.88 3.63L7 21.65A10 10 0 0 0 22 12Z" />
    <path fill="#0F9D58" d="M12 22a10 10 0 0 0 8.66-5l-4.35-7.53a4.5 4.5 0 0 1-2.56 1 4.5 4.5 0 0 1-3.61-1.85L5.8 13A10 10 0 0 0 12 22Z" />
    <circle cx="12" cy="12" r="4.5" fill="#FFF" />
    <circle cx="12" cy="12" r="3.5" fill="#4285F4" />
  </svg>
);

const VSCodeLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" className={props.className} fill="none" {...props}>
    <path fill="#007ACC" d="M23.9 6.5l-3-2.8a.63.63 0 0 0-.8 0L12 11.2l-4-3.7-6.2-4.3c-.3-.2-.7-.1-.9.2L.1 4.6c-.1.2-.1.5 0 .7l4.5 4.1-4.5 4.1c-.1.2-.1.5 0 .7l.8 1.2c.2.3.6.4.9.2l6.2-4.3 4 3.7 8.1 7.5c.2.2.6.2.8 0l3-2.8c.2-.2.2-.6 0-.8l-9.1-8.4 9.1-8.4c.2-.2.2-.6 0-.8z"/>
  </svg>
);

const DiscordLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" className={props.className} fill="#5865F2" {...props}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.577 4.37a.071.071 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.873-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z" />
  </svg>
);

const SpotifyLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" className={props.className} fill="#1DB954" {...props}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.59 14.42c-.18.29-.56.38-.85.2-2.34-1.43-5.28-1.75-8.75-.96-.33.07-.66-.14-.74-.47-.07-.33.14-.66.47-.74 3.79-.86 7.02-.5 9.66 1.11.3.18.39.56.21.86zm1.22-2.73c-.22.37-.7.49-1.07.27-2.68-1.65-6.78-2.13-9.95-1.17-.42.13-.86-.11-.99-.53-.13-.42.11-.86.53-.99 3.62-1.1 8.13-.57 11.2 1.32.37.23.49.7.28 1.1zm.1-2.82C14.47 8.7 8.74 8.5 5.37 9.53c-.52.16-1.08-.14-1.24-.66-.16-.52.14-1.08.66-1.24 3.86-1.17 10.18-.95 14.2 1.44.47.28.62.89.34 1.36-.28.47-.89.62-1.36.34z" />
  </svg>
);

const SteamLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" className={props.className} fill="#00ADEE" {...props}>
    <path d="M12 .002a12 12 0 0 0-11.83 9.9l5.632 2.327a3.483 3.483 0 0 1 6.368-.135l4.526-6.634a1.886 1.886 0 1 1 .655.228l-6.52 4.45c.095.323.146.666.146 1.02a4.42 4.42 0 0 1-4.42 4.42 4.4 4.4 0 0 1-2.457-.75L1.836 12.98A12 12 0 1 0 12 .002zm5.79 6.273a.858.858 0 1 0 0 1.716.858.858 0 0 0 0-1.716z" />
  </svg>
);

const getIconComponent = (iconKey: string | null) => {
  if (iconKey && (iconKey.startsWith('data:') || iconKey.length > 50)) {
    return (props: any) => (
      <img src={iconKey} className={`${props.className || 'w-4 h-4'} object-contain rounded`} alt="app-icon" />
    );
  }
  switch (iconKey) {
    case 'chrome':
      return ChromeLogo;
    case 'vscode':
      return VSCodeLogo;
    case 'discord':
      return DiscordLogo;
    case 'spotify':
      return SpotifyLogo;
    case 'steam':
      return SteamLogo;
    case 'folder':
      return Folder;
    case 'volume':
      return Volume2;
    case 'mute':
      return VolumeX;
    case 'lock':
      return Lock;
    case 'minimize':
      return Minimize2;
    case 'close_all':
      return X;
    case 'desktop':
      return Monitor;
    case 'keyboard':
      return Keyboard;
    case 'globe':
    default:
      return Globe;
  }
};

interface InstalledApp {
  name: string;
  path: string;
  icon: string;
  category: string;
}


export default function Actions() {
  const [pages, setPages] = useState<Page[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [activePageId, setActivePageId] = useState<string>('');
  const [draggedActionId, setDraggedActionId] = useState<string | null>(null);

  const toast = useToast();

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // App discovery catalog
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [searchAppQuery, setSearchAppQuery] = useState('');
  const [showAppDropdown, setShowAppDropdown] = useState(false);
  const [isRefreshingApps, setIsRefreshingApps] = useState(false);

  // Modals and operations
  const [showActionModal, setShowActionModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [editAction, setEditAction] = useState<Action | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');

  // Creation prompts
  const [showPagePrompt, setShowPagePrompt] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [showCategoryPrompt, setShowCategoryPrompt] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Form states (for actions)
  const [name, setName] = useState('');
  const [actionType, setActionType] = useState('OPEN_APP');
  const [payload, setPayload] = useState('');
  const [icon, setIcon] = useState('chrome');
  
  // Smart URL states
  const [selectedBrowser, setSelectedBrowser] = useState('');
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [urlMetadata, setUrlMetadata] = useState<{title?: string, domain?: string, favicon?: string} | null>(null);

  const loadInstalledApps = () => {
    invoke<InstalledApp[]>('get_installed_applications')
      .then((data) => {
        setInstalledApps(data);
      })
      .catch((err) => console.error('Failed to load installed apps:', err));
  };

  const filteredInstalledApps = useMemo(() => {
    const q = searchAppQuery.toLowerCase().trim();
    if (!q) return installedApps;
    return installedApps.filter(app =>
      app.name.toLowerCase().includes(q) || app.category.toLowerCase().includes(q)
    );
  }, [installedApps, searchAppQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setShowAppDropdown(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);


  const handlePayloadChange = (val: string) => {
    setPayload(val);
    const lower = val.toLowerCase();
    
    // Don't overwrite smart URL favicons or custom string icons when typing
    const isBase64Icon = icon.startsWith('data:');
    
    if (lower.includes('chrome.exe') || lower.includes('msedge.exe')) {
      setIcon('chrome');
    } else if (lower.includes('code.exe') || lower.includes('vscode')) {
      setIcon('vscode');
    } else if (lower.includes('discord.exe')) {
      setIcon('discord');
    } else if (lower.includes('spotify.exe')) {
      setIcon('spotify');
    } else if (lower.includes('steam.exe')) {
      setIcon('steam');
    } else if (lower.includes('explorer.exe') || (!lower.endsWith('.exe') && (lower.includes('\\') || lower.includes('/')))) {
      setIcon('folder');
    } else if (!isBase64Icon && (actionType === 'OPEN_URL' || lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('www.') || lower.includes('.com') || lower.includes('.org') || lower.includes('.net'))) {
      setIcon('globe');
    }
  };

  // Test action feedback states
  const [feedback, setFeedback] = useState<{ [actionId: string]: { success: boolean; message: string } }>({});

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce search term changes by 200ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchTerm);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Ref to track last auto-fetched name to prevent overwriting user edits
  const lastAutoNameRef = useRef('');

  // Smart URL Metadata Debouncer
  useEffect(() => {
    // Basic check: has a dot, no spaces, length > 3
    const isUrlLike = actionType === 'OPEN_URL' && payload.length > 3 && payload.includes('.') && !payload.includes(' ');
    
    if (isUrlLike) {
      const handler = setTimeout(() => {
        setIsFetchingMetadata(true);
        let fetchUrl = payload;
        if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
          fetchUrl = 'https://' + fetchUrl;
        }
        
        invoke<{title?: string, domain: string, favicon?: string}>('fetch_url_metadata', { url: fetchUrl })
          .then((res) => {
            setUrlMetadata(res);
            // Only overwrite if they haven't manually typed a name yet or it matches old fetched title
            setName((prev) => {
              if (!prev || prev === res.domain || prev === lastAutoNameRef.current) {
                const newName = res.title || res.domain;
                lastAutoNameRef.current = newName;
                return newName;
              }
              return prev;
            });
            setIcon((prev) => {
              const defaultIcons = ['chrome', 'vscode', 'discord', 'spotify', 'steam', 'folder', 'volume', 'mute', 'lock', 'minimize', 'close_all', 'desktop', 'globe'];
              if (res.favicon && (!prev || defaultIcons.includes(prev) || prev.startsWith('data:'))) {
                return res.favicon;
              }
              return prev;
            });
            setIsFetchingMetadata(false);
          })
          .catch((err) => {
            console.error("Failed to fetch URL metadata:", err);
            setIsFetchingMetadata(false);
          });
      }, 800);
      return () => clearTimeout(handler);
    }
  }, [payload, actionType]);

  // Focus Ctrl+F and Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const input = document.getElementById('action-search-input');
        if (input) {
          (input as HTMLInputElement).focus();
          (input as HTMLInputElement).select();
        }
      } else if (e.key === 'Escape') {
        setSearchTerm('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // O(n) filtering inside useMemo
  const matchedActionIds = useMemo(() => {
    const query = debouncedSearchQuery.toLowerCase().trim();
    if (!query) return null;
    const set = new Set<string>();

    const categoryMap = new Map<string, any>();
    const pageMap = new Map<string, any>();
    pages.forEach(p => {
      pageMap.set(p.id, p);
      p.categories.forEach(c => {
        categoryMap.set(c.id, c);
      });
    });

    actions.forEach(action => {
      const matchesName = action.name.toLowerCase().includes(query);
      const matchesType = action.actionType.toLowerCase().includes(query);
      const category = categoryMap.get(action.categoryId);
      const matchesCategory = category ? category.name.toLowerCase().includes(query) : false;
      const page = category ? pageMap.get(category.pageId) : null;
      const matchesPage = page ? page.name.toLowerCase().includes(query) : false;

      if (matchesName || matchesType || matchesCategory || matchesPage) {
        set.add(action.id);
      }
    });

    return set;
  }, [actions, pages, debouncedSearchQuery]);

  const loadLayoutAndActions = () => {
    // Fetch hierarchical pages/categories
    invoke<Page[]>('get_layout')
      .then((data) => {
        setPages(data);
        if (data.length > 0 && !activePageId) {
          setActivePageId(data[0].id);
        }
      })
      .catch((err) => console.error('Failed to load layout:', err));

    // Fetch flat action configurations
    invoke<Action[]>('get_actions')
      .then((data) => {
        setActions(data);
      })
      .catch((err) => console.error('Failed to load actions:', err));
  };

  useEffect(() => {
    loadLayoutAndActions();
  }, []);

  // Page CRUD
  const handleAddPage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPageName.trim()) return;

    invoke('add_page', { name: newPageName })
      .then(() => {
        setNewPageName('');
        setShowPagePrompt(false);
        loadLayoutAndActions();
      })
      .catch((err) => toast.error('Failed to add page: ' + err));
  };

  const handleDeletePage = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Control Page',
      message: 'Are you sure you want to delete this page and all its categories?',
      onConfirm: () => {
        invoke('delete_page', { id })
          .then(() => {
            setActivePageId('');
            loadLayoutAndActions();
            toast.success('Page deleted successfully');
          })
          .catch((err) => toast.error('Failed to delete page: ' + err));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Category CRUD
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !activePageId) return;

    invoke('add_category', { pageId: activePageId, name: newCategoryName })
      .then(() => {
        setNewCategoryName('');
        setShowCategoryPrompt(false);
        loadLayoutAndActions();
      })
      .catch((err) => toast.error('Failed to add category: ' + err));
  };

  const handleDeleteCategory = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Category Column',
      message: 'Are you sure you want to delete this category and all its actions?',
      onConfirm: () => {
        invoke('delete_category', { id })
          .then(() => {
            loadLayoutAndActions();
            toast.success('Category deleted successfully');
          })
          .catch((err) => toast.error('Failed to delete category: ' + err));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Action Add/Edit Modal helpers
  const openAddActionModal = (categoryId: string) => {
    setEditAction(null);
    setTargetCategoryId(categoryId);
    setName('');
    setActionType('OPEN_APP');
    setPayload('');
    setIcon('chrome');
    setSelectedBrowser('');
    setUrlMetadata(null);
    setSearchAppQuery('');
    setShowActionModal(true);
    loadInstalledApps();
  };

  const openEditActionModal = (act: Action) => {
    setEditAction(act);
    setTargetCategoryId(act.categoryId);
    setName(act.name);
    setActionType(act.actionType);
    setIcon(act.icon || 'chrome');
    setSelectedBrowser('');
    setUrlMetadata(null);
    
    if (act.actionType === 'OPEN_URL') {
      try {
        const parsed = JSON.parse(act.payload || '{}');
        if (parsed.url) {
          setPayload(parsed.url);
          setSelectedBrowser(parsed.browser || '');
        } else {
          setPayload(act.payload || '');
        }
      } catch {
        setPayload(act.payload || '');
      }
    } else {
      setPayload(act.payload || '');
      if (act.actionType === 'OPEN_APP') {
        setSearchAppQuery(act.name);
      } else {
        setSearchAppQuery('');
      }
    }
    
    setShowActionModal(true);
    loadInstalledApps();
  };

  const handleUseTemplate = (tmpl: { name: string; actionType: string; payload: string; icon: string }) => {
    setName(tmpl.name);
    setActionType(tmpl.actionType);
    setPayload(tmpl.payload || '');
    setIcon(tmpl.icon || 'chrome');
    if (tmpl.actionType === 'OPEN_APP') {
      setSearchAppQuery(tmpl.name);
    } else {
      setSearchAppQuery('');
    }
    setShowTemplatesModal(false);
  };

  const handleSaveAction = (e: React.FormEvent) => {
    e.preventDefault();
    
    let payloadVal = '';
    if (actionType === 'OPEN_APP' || actionType === 'SWITCH_DESKTOP' || actionType === 'HOTKEY') {
      payloadVal = payload;
    } else if (actionType === 'OPEN_URL') {
      if (selectedBrowser) {
        payloadVal = JSON.stringify({ url: payload, browser: selectedBrowser });
      } else {
        payloadVal = payload; // Raw URL string
      }
    }
    
    if (editAction) {
      invoke('update_action', {
        args: {
          id: editAction.id,
          categoryId: targetCategoryId,
          name,
          actionType,
          payload: payloadVal || null,
          icon,
        }
      })
        .then(() => {
          setShowActionModal(false);
          loadLayoutAndActions();
          toast.success('Action updated successfully');
        })
        .catch((err) => toast.error('Failed to update action: ' + err));
    } else {
      invoke('add_action', {
        args: {
          categoryId: targetCategoryId,
          name,
          actionType,
          payload: payloadVal || null,
          icon,
        }
      })
        .then(() => {
          setShowActionModal(false);
          loadLayoutAndActions();
          toast.success('Action created successfully');
        })
        .catch((err) => toast.error('Failed to add action: ' + err));
    }
  };

  const handleDeleteAction = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Button Action',
      message: 'Are you sure you want to delete this action?',
      onConfirm: () => {
        invoke('delete_action', { id })
          .then(() => {
            loadLayoutAndActions();
            toast.success('Action deleted successfully');
          })
          .catch((err) => toast.error('Failed to delete action: ' + err));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Drag and Drop implementation (HTML5 API with React state bypass for WebView2 limitations)
  const handleDragStart = (e: React.DragEvent, actionId: string) => {
    setDraggedActionId(actionId);
    e.dataTransfer.setData('text/plain', actionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedActionId(null);
  };

  const handleDragOverCategory = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragOverCard = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnCategory = async (e: React.DragEvent, catId: string) => {
    e.preventDefault();
    const actionId = draggedActionId || e.dataTransfer.getData('text/plain');
    setDraggedActionId(null);
    if (!actionId) return;

    const actionToMove = actions.find(a => a.id === actionId);
    if (!actionToMove) return;

    if (actionToMove.categoryId === catId) return;

    const catActions = actions.filter(a => a.categoryId === catId);
    const nextIndex = catActions.length > 0 ? Math.max(...catActions.map(a => a.orderIndex)) + 1 : 0;

    try {
      await invoke('move_action', { actionId, categoryId: catId, orderIndex: nextIndex });
      loadLayoutAndActions();
    } catch (err) {
      toast.error('Failed to move action: ' + err);
    }
  };

  const handleDropOnCard = async (e: React.DragEvent, targetCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = draggedActionId || e.dataTransfer.getData('text/plain');
    setDraggedActionId(null);
    if (!draggedId || draggedId === targetCardId) return;

    const draggedAction = actions.find(a => a.id === draggedId);
    const targetAction = actions.find(a => a.id === targetCardId);
    if (!draggedAction || !targetAction) return;

    const targetCatId = targetAction.categoryId;
    const targetIndex = targetAction.orderIndex;

    try {
      await invoke('move_action', { actionId: draggedId, categoryId: targetCatId, orderIndex: targetIndex });

      const categoryActions = actions.filter(a => a.categoryId === targetCatId && a.id !== draggedId);
      const sortedIds = categoryActions.map(a => a.id);
      
      const insertIndex = categoryActions.findIndex(a => a.orderIndex >= targetIndex);
      if (insertIndex === -1) {
        sortedIds.push(draggedId);
      } else {
        sortedIds.splice(insertIndex, 0, draggedId);
      }

      await invoke('reorder_actions', { ids: sortedIds });
      loadLayoutAndActions();
    } catch (err) {
      toast.error('Failed to reorder: ' + err);
    }
  };

  const handleTestAction = (id: string) => {
    setFeedback((prev) => ({ ...prev, [id]: { success: true, message: 'Running test...' } }));
    
    invoke('test_action', { id })
      .then(() => {
        setFeedback((prev) => ({
          ...prev,
          [id]: { success: true, message: 'Success' },
        }));
        setTimeout(() => {
          setFeedback((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 3000);
      })
      .catch((err) => {
        setFeedback((prev) => ({
          ...prev,
          [id]: { success: false, message: String(err) },
        }));
      });
  };

  const activePage = pages.find(p => p.id === activePageId);

  return (
    <div className="space-y-6">
      {/* Upper header segment */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={THEME.title}>Dashboard Builder</h1>
          <p className={THEME.subtitle}>Organize and rearrange your layouts for paired companions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              id="action-search-input"
              type="text"
              placeholder="Search actions (Ctrl+F)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950/50 border border-slate-800/85 text-slate-200 text-xs rounded-xl py-2.5 px-4 pr-9 outline-none focus:border-violet-500/60 w-[500px] transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                type="button"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowPagePrompt(true)}
            className={THEME.btnPrimary}
          >
            <Plus className="w-4 h-4" />
            <span>New Page</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation for pages */}
      <div className="flex border-b border-slate-900/60 pb-1 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {pages.map((p) => {
            const isActive = p.id === activePageId;
            return (
              <button
                key={p.id}
                onClick={() => setActivePageId(p.id)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-violet-600/15 border-t border-x border-violet-500/30 text-violet-300 shadow-md shadow-violet-950/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
        
        {activePage && (
          <button
            onClick={() => handleDeletePage(activePage.id)}
            className="text-xs font-semibold text-rose-400/80 hover:text-rose-400 px-3 py-1.5 rounded-lg hover:bg-rose-950/15 border border-transparent hover:border-rose-900/20 cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Page</span>
          </button>
        )}
      </div>

      {/* Active Page categories content */}
      {activePage ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {activePage.name} Categories Layout
            </h3>
            <button
              onClick={() => setShowCategoryPrompt(true)}
              className={THEME.btnSecondary}
            >
              <Plus className="w-4 h-4" />
              <span>Add Category Column</span>
            </button>
          </div>

          {activePage.categories.length === 0 ? (
            <EmptyState
              title="No Layout Columns"
              description="This page is currently blank. Create category columns to start placing action buttons."
              primaryAction={{
                label: "Add Category Column",
                onClick: () => setShowCategoryPrompt(true)
              }}
              secondaryAction={{
                label: "Layout Guide",
                onClick: () => toast.success("Categories display as vertical columns on desktop and swipe sections on mobile. You can group related buttons like 'Launchers' or 'Audio' together.")
              }}
              illustration={Layers}
            />
          ) : (
            <div className="flex flex-col gap-8">
              {activePage.categories
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((cat) => {
                  const catActions = actions
                    .filter((a) => a.categoryId === cat.id && (matchedActionIds === null || matchedActionIds.has(a.id)))
                    .sort((a, b) => a.orderIndex - b.orderIndex);

                  return (
                    <div
                      key={cat.id}
                      onDragOver={handleDragOverCategory}
                      onDrop={(e) => handleDropOnCategory(e, cat.id)}
                      className="flex flex-col gap-4"
                    >
                      {/* Category Header */}
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-violet-400" />
                          <h3 className="font-semibold text-base text-slate-200">{cat.name}</h3>
                          <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full ml-2">
                            {catActions.length} action{catActions.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/20 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Actions List (Grid) */}
                      <div 
                        className="grid gap-4"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
                      >
                        {catActions.map((act) => {
                          const IconComp = getIconComponent(act.icon);
                          const testState = feedback[act.id];
                          const isBase64Icon = act.icon && (act.icon.startsWith('data:') || act.icon.length > 50);
                          const isCustomIcon = act.icon && !isBase64Icon && !['chrome', 'vscode', 'discord', 'spotify', 'steam', 'folder', 'volume', 'mute', 'lock', 'minimize', 'close_all', 'desktop', 'globe', 'keyboard', 'monitor', 'play', 'sun'].includes(act.icon);

                          const humanDescription = act.actionType === 'OPEN_APP' ? 'Launches Application' : 
                                                   act.actionType === 'OPEN_URL' ? 'Opens Website' : 
                                                   act.actionType === 'LOCK_PC' ? 'Locks Screen' :
                                                   act.actionType === 'TOGGLE_MUTE' ? 'Toggles Audio Mute' :
                                                   act.actionType === 'VOLUME_UP' ? 'Increases Volume' :
                                                   act.actionType === 'VOLUME_DOWN' ? 'Decreases Volume' :
                                                   act.actionType === 'SWITCH_DESKTOP' ? 'Switches Desktop' :
                                                   act.actionType === 'HIDE_ALL_WINDOWS' ? 'Hides All Windows' :
                                                   act.actionType === 'CLOSE_ALL_WINDOWS' ? 'Closes All Windows' :
                                                   'System Action';

                          return (
                            <div
                              key={act.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, act.id)}
                              onDragEnd={handleDragEnd}
                              onDragOver={handleDragOverCard}
                              onDrop={(e) => handleDropOnCard(e, act.id)}
                              className="group relative bg-slate-900/35 border border-slate-800/60 p-4 rounded-2xl hover:border-violet-500/40 transition-all duration-300 cursor-grab active:cursor-grabbing hover:bg-slate-900/80 hover:shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:scale-[1.02] flex flex-col items-center text-center gap-3 h-[130px] justify-center"
                            >
                              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                                {isBase64Icon ? (
                                  <img src={act.icon!} className="w-11 h-11 object-contain rounded-lg drop-shadow-sm" alt="app-icon" />
                                ) : isCustomIcon ? (
                                  <span className="text-4xl leading-none">{act.icon}</span>
                                ) : (
                                  <IconComp className="w-9 h-9 text-violet-400" />
                                )}
                              </div>
                              <div className="w-full">
                                <h4 className="text-sm font-semibold text-slate-100 truncate w-full px-1">{act.name}</h4>
                                <p className="text-[10px] text-slate-400 truncate w-full px-1 mt-0.5">
                                  {humanDescription}
                                </p>
                              </div>

                              {/* Test Status Overlay */}
                              {testState && (
                                <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] flex items-center justify-center gap-1 px-2 py-0.5 rounded-full w-[90%] truncate shadow-md ${
                                  testState.success
                                    ? 'bg-emerald-500/90 text-white'
                                    : 'bg-rose-500/90 text-white'
                                }`}>
                                  {testState.success ? <Check className="w-2.5 h-2.5 shrink-0" /> : <ShieldAlert className="w-2.5 h-2.5 shrink-0" />}
                                  <span className="truncate">{testState.message}</span>
                                </div>
                              )}

                              {/* Hover Toolbar */}
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-200">
                                <button
                                  onClick={() => handleTestAction(act.id)}
                                  className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors shadow-sm"
                                  title="Test Action"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openEditActionModal(act)}
                                  className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition-colors shadow-sm"
                                  title="Edit Action"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAction(act.id)}
                                  className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors shadow-sm"
                                  title="Delete Action"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Add Action Tile OR Empty State */}
                        {catActions.length === 0 ? (
                          <div className="col-span-full py-8 flex flex-col items-center justify-center border border-dashed border-slate-800/60 rounded-2xl bg-slate-950/30">
                            <Folder className="w-8 h-8 text-slate-600 mb-2" />
                            <h4 className="text-sm font-semibold text-slate-300">No actions yet</h4>
                            <p className="text-xs text-slate-500 mb-4">Add your first action to this category</p>
                            <button
                              onClick={() => openAddActionModal(cat.id)}
                              className="bg-violet-600 text-white hover:bg-violet-500 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-violet-900/20"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Add Action</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openAddActionModal(cat.id)}
                            className="bg-slate-900/20 border border-dashed border-slate-800/60 p-4 rounded-2xl hover:border-violet-500/40 hover:bg-violet-500/5 transition-all duration-300 cursor-pointer flex flex-col items-center text-center gap-3 h-[130px] justify-center group"
                          >
                            <div className="w-10 h-10 rounded-full bg-slate-800/50 group-hover:bg-violet-500/20 flex items-center justify-center transition-colors">
                              <Plus className="w-5 h-5 text-slate-400 group-hover:text-violet-400" />
                            </div>
                            <span className="text-xs font-semibold text-slate-400 group-hover:text-violet-300">Add Action</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title="No Control Pages Available"
          description="Dashboard layouts are organized into separate pages. To start mapping buttons, you need to create your first page."
          primaryAction={{
            label: "Create First Page",
            onClick: () => setShowPagePrompt(true)
          }}
          secondaryAction={{
            label: "How it works",
            onClick: () => toast.success("Pages let you categorize your layouts (e.g. Work, Gaming). Each page can contain multiple columns (Categories) of buttons.")
          }}
          illustration={Layers}
        />
      )}

      {/* Prompts Overlay Modals */}
      {showPagePrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAddPage} className={`${THEME.panel} w-full max-w-md space-y-4`}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-900">
              <span className="font-semibold text-white">Create New Page</span>
              <button type="button" onClick={() => setShowPagePrompt(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className={THEME.label}>Page Name</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Work, Gaming, Servers"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                className={THEME.input}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowPagePrompt(false)} className={THEME.btnSecondary}>
                Cancel
              </button>
              <button type="submit" className={THEME.btnPrimary}>
                Create Page
              </button>
            </div>
          </form>
        </div>
      )}

      {showCategoryPrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAddCategory} className={`${THEME.panel} w-full max-w-md space-y-4`}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-900">
              <span className="font-semibold text-white">Create New Category Column</span>
              <button type="button" onClick={() => setShowCategoryPrompt(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className={THEME.label}>Category Name</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Browsers, Audio Controls"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className={THEME.input}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCategoryPrompt(false)} className={THEME.btnSecondary}>
                Cancel
              </button>
              <button type="submit" className={THEME.btnPrimary}>
                Create Category
              </button>
            </div>
          </form>
        </div>
      )}

      {showTemplatesModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className={`${THEME.panel} w-full max-w-2xl space-y-4 max-h-[85vh] flex flex-col`}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-900 shrink-0">
              <span className="font-semibold text-white">Select Action Template</span>
              <button type="button" onClick={() => setShowTemplatesModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto pr-1 flex-1 py-1">
              {ACTION_TEMPLATES.map((tmpl) => {
                const IconComponent = getIconComponent(tmpl.icon);
                return (
                  <button
                    key={tmpl.name}
                    onClick={() => handleUseTemplate(tmpl)}
                    className="flex items-center gap-3 bg-slate-950/45 hover:bg-slate-900 border border-slate-900/60 hover:border-slate-800 p-3 rounded-xl text-left cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="bg-slate-900 p-2 rounded-lg">
                      <IconComponent className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">{tmpl.name}</h4>
                      <p className="text-[9px] font-mono text-slate-500 uppercase mt-0.5">{tmpl.actionType}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showActionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveAction} className={`${THEME.panel} w-full max-w-lg space-y-4`}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-900">
              <span className="font-semibold text-white">
                {editAction ? 'Edit Action' : 'Create Custom Action'}
              </span>
              <button type="button" onClick={() => setShowActionModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={THEME.label}>Action Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spotify Play"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={THEME.input}
                />
              </div>

              <div>
                <label className={THEME.label}>Action Type</label>
                  <CustomSelect
                  value={actionType}
                  onChange={(val) => {
                    setActionType(val);
                    if (val === 'OPEN_URL' && (!icon || icon === 'chrome')) {
                      // Handled by handlePayloadChange
                    }
                  }}
                  options={[
                    { value: 'OPEN_APP', label: 'Open Desktop App' },
                    { value: 'OPEN_URL', label: 'Open Web URL' },
                    { value: 'HOTKEY', label: 'Custom Keyboard Shortcut' },
                    { value: 'VOLUME_UP', label: 'Volume Up' },
                    { value: 'VOLUME_DOWN', label: 'Volume Down' },
                    { value: 'TOGGLE_MUTE', label: 'Mute Toggle' },
                    { value: 'LOCK_PC', label: 'Lock Host PC' },
                    { value: 'HIDE_ALL_WINDOWS', label: 'Hide All Windows (Show Desktop)' },
                    { value: 'CLOSE_ALL_WINDOWS', label: 'Close All Windows' },
                    { value: 'SWITCH_DESKTOP', label: 'Cycle Through Desktops' },
                  ]}
                />
              </div>
            </div>

            {actionType === 'OPEN_APP' && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-1">
                  <label className={THEME.label}>Select Installed Application</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRefreshingApps(true);
                      invoke<InstalledApp[]>('refresh_installed_applications')
                        .then((data) => {
                          setInstalledApps(data);
                          setIsRefreshingApps(false);
                        })
                        .catch((err) => {
                          console.error(err);
                          setIsRefreshingApps(false);
                        });
                    }}
                    className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold cursor-pointer"
                  >
                    {isRefreshingApps ? 'Scanning...' : 'Refresh App Catalog'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Search installed app (e.g. Chrome, Steam...)"
                    value={searchAppQuery}
                    onChange={(e) => {
                      setSearchAppQuery(e.target.value);
                      setShowAppDropdown(true);
                    }}
                    onFocus={() => setShowAppDropdown(true)}
                    className={THEME.input}
                  />
                  {payload && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchAppQuery('');
                        setPayload('');
                        setIcon('chrome');
                      }}
                      className="px-3 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs rounded-xl cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {showAppDropdown && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                    {filteredInstalledApps.length === 0 ? (
                      <div className="text-[11px] text-slate-500 text-center py-4">
                        No applications found matching "{searchAppQuery}"
                      </div>
                    ) : (
                      filteredInstalledApps.map((app) => (
                        <button
                          key={app.path}
                          type="button"
                          onClick={() => {
                            setName(app.name);
                            setPayload(app.path);
                            if (app.icon) {
                              setIcon(app.icon);
                            } else {
                              setIcon('chrome');
                            }
                            setSearchAppQuery(app.name);
                            setShowAppDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 hover:bg-slate-900/60 p-2 rounded-lg text-left cursor-pointer transition-all duration-150"
                        >
                          <div className="w-6 h-6 rounded bg-slate-900 flex items-center justify-center border border-slate-800/40 overflow-hidden shrink-0">
                            {app.icon ? (
                              <img src={app.icon} className="w-5 h-5 object-contain" alt={app.name} />
                            ) : (
                              <span className="text-[10px] text-slate-500">App</span>
                            )}
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-semibold text-slate-200 block truncate">{app.name}</span>
                            <span className="text-[8px] font-mono text-slate-500 block truncate">{app.path}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {payload && (
                  <div className="text-[10px] font-mono text-violet-400 bg-violet-950/20 border border-violet-900/30 px-3 py-2 rounded-xl mt-2 truncate">
                    Selected Path: <span className="text-slate-300">{payload}</span>
                  </div>
                )}
              </div>
            )}

            {actionType === 'OPEN_URL' && (
              <div className="space-y-4">
                <div>
                  <label className={THEME.label}>URL Link</label>
                  <input
                    type="text"
                    required
                    placeholder="https://example.com"
                    value={payload}
                    onChange={(e) => handlePayloadChange(e.target.value)}
                    className={THEME.input}
                  />
                </div>
                
                <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
                  <h4 className="text-xs font-semibold text-slate-300 mb-3">Smart URL Configuration</h4>
                  
                  {isFetchingMetadata ? (
                    <div className="text-xs text-violet-400 flex items-center gap-2 mb-3">
                      <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-violet-400"></span>
                      Retrieving website metadata...
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div>
                      <label className={THEME.label}>Open With (Browser Selection)</label>
                      <CustomSelect
                        value={selectedBrowser}
                        onChange={(val) => setSelectedBrowser(val)}
                        placeholder="Default Browser (System Default)"
                        options={[
                          { value: '', label: 'Default Browser (System Default)' },
                          ...installedApps.filter(app => app.category === 'Browsers').map(browser => ({
                            value: browser.path,
                            label: browser.name
                          }))
                        ]}
                      />
                    </div>

                    {(payload.startsWith('http') || (payload.length > 3 && payload.includes('.') && !payload.includes(' '))) && (
                      <div className="pt-3 border-t border-slate-800">
                        <label className={THEME.label}>Action Preview</label>
                        <div className="bg-slate-950/50 border border-slate-900/60 p-3 flex items-center gap-3 rounded-lg mt-1">
                          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800">
                            {icon && icon.startsWith('data:') ? (
                              <img src={icon} alt="favicon" className="w-5 h-5 object-contain" />
                            ) : (
                              <Globe className="w-4 h-4 text-violet-400" />
                            )}
                          </div>
                          <div className="truncate">
                            <h5 className="text-sm font-semibold text-slate-100 truncate">{name || 'Website Name'}</h5>
                            <p className="text-[10px] text-slate-500 truncate">
                              Opens {urlMetadata?.domain || 'url'} {selectedBrowser ? 'in selected browser' : 'in default browser'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {actionType === 'SWITCH_DESKTOP' && (
              <div>
                <label className={THEME.label}>Cycle Direction</label>
                <CustomSelect
                  value={payload || 'right'}
                  onChange={(val) => setPayload(val)}
                  options={[
                    { value: 'right', label: 'Next Desktop → (Ctrl + Win + Right)' },
                    { value: 'left', label: '← Previous Desktop (Ctrl + Win + Left)' },
                  ]}
                />
              </div>
            )}

            {actionType === 'HOTKEY' && (
              <div>
                <label className={THEME.label}>Keyboard Shortcut (Macro)</label>
                <div className="flex flex-col gap-3 p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl mt-1">
                  <div className="flex gap-2">
                    {['Ctrl', 'Shift', 'Alt', 'Win'].map(mod => {
                      const isActive = (payload || '').includes(mod);
                      return (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => {
                            const currentParts = payload ? payload.split('+').map(p => p.trim()).filter(Boolean) : [];
                            const mainKey = currentParts.filter(p => !['Ctrl', 'Shift', 'Alt', 'Win'].includes(p));
                            const currentMods = ['Ctrl', 'Shift', 'Alt', 'Win'].filter(m => (payload || '').includes(m));
                            
                            let nextMods = [...currentMods];
                            if (isActive) {
                              nextMods = nextMods.filter(m => m !== mod);
                            } else {
                              nextMods.push(mod);
                            }
                            
                            // Keep specific order: Ctrl, Shift, Alt, Win, then MainKey
                            const orderedMods = ['Ctrl', 'Shift', 'Alt', 'Win'].filter(m => nextMods.includes(m));
                            setPayload([...orderedMods, ...mainKey].join('+'));
                            if (!icon || icon === 'chrome') setIcon('keyboard');
                          }}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            isActive 
                              ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' 
                              : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {mod}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    required
                    readOnly
                    placeholder="Click here and press a key (e.g. S, Enter, F1)..."
                    value={payload ? payload.split('+').filter(p => !['Ctrl', 'Shift', 'Alt', 'Win'].includes(p.trim())).join('+') : ''}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
                      
                      let keyName = e.key;
                      if (keyName.length === 1) keyName = keyName.toUpperCase();
                      if (keyName === ' ') keyName = 'Space';
                      
                      if (keyName === 'Backspace' || keyName === 'Delete') {
                        // Clear the main key
                        const currentMods = ['Ctrl', 'Shift', 'Alt', 'Win'].filter(m => (payload || '').includes(m));
                        setPayload(currentMods.join('+'));
                        return;
                      }

                      const currentMods = ['Ctrl', 'Shift', 'Alt', 'Win'].filter(m => (payload || '').includes(m));
                      setPayload([...currentMods, keyName].join('+'));
                      if (!icon || icon === 'chrome') setIcon('keyboard');
                    }}
                    className={`${THEME.input} cursor-pointer text-violet-400 font-mono text-center focus:ring-violet-500/50 bg-slate-950`}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 text-center">
                  Toggle the modifiers above, then click the input and press your main key. (Press Backspace to clear main key).
                </p>
              </div>
            )}

            <div>
              <label className={THEME.label}>Icon Key Mapping</label>
              <div className="flex gap-3">
                <CustomSelect
                  value={
                    icon && (icon.startsWith('data:') || icon.length > 50)
                      ? 'real_app_icon'
                      : ['chrome', 'vscode', 'discord', 'spotify', 'steam', 'folder', 'volume', 'mute', 'lock', 'minimize', 'close_all', 'desktop', 'globe', 'monitor', 'keyboard', 'play', 'sun'].includes(icon)
                      ? icon
                      : 'custom'
                  }
                  onChange={(val) => {
                    if (val === 'custom') {
                      setIcon('⭐');
                    } else if (val === 'real_app_icon') {
                      const matched = installedApps.find(app => app.path === payload);
                      if (matched && matched.icon) {
                        setIcon(matched.icon);
                      } else {
                        setIcon('chrome');
                      }
                    } else {
                      setIcon(val);
                    }
                  }}
                  className="flex-1"
                  options={[
                    ...(icon && (icon.startsWith('data:') || icon.length > 50) ? [{ value: 'real_app_icon', label: 'Real Application Icon' }] : []),
                    { value: 'chrome', label: 'Google Chrome Logo' },
                    { value: 'vscode', label: 'VS Code Logo' },
                    { value: 'discord', label: 'Discord Logo' },
                    { value: 'spotify', label: 'Spotify Logo' },
                    { value: 'steam', label: 'Steam Logo' },
                    { value: 'folder', label: 'Folder / Explorer' },
                    { value: 'volume', label: 'Volume Controls' },
                    { value: 'mute', label: 'Mute Control' },
                    { value: 'lock', label: 'Lock Control' },
                    { value: 'minimize', label: 'Minimize / Show Desktop' },
                    { value: 'close_all', label: 'Close All / Exit' },
                    { value: 'desktop', label: 'Virtual Desktop / Monitor' },
                    { value: 'keyboard', label: 'Keyboard / Macro' },
                    { value: 'globe', label: 'General Web / Globe' },
                    { value: 'custom', label: 'Custom Character / Emoji...' },
                  ]}
                />
                {icon && !icon.startsWith('data:') && icon.length <= 50 && !['chrome', 'vscode', 'discord', 'spotify', 'steam', 'folder', 'volume', 'mute', 'lock', 'minimize', 'close_all', 'desktop', 'globe', 'keyboard', 'monitor', 'play', 'sun'].includes(icon) && (
                  <input
                    type="text"
                    required
                    placeholder="e.g. ⭐, 🔇, A"
                    maxLength={4}
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    className="w-32 bg-slate-950/50 border border-slate-800/80 text-slate-205 text-sm rounded-xl py-2.5 px-4 outline-none focus:border-violet-500/60"
                  />
                )}
                {icon && (icon.startsWith('data:') || icon.length > 50) && (
                  <div className="w-11 h-11 bg-slate-950/50 border border-slate-800 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                    <img src={icon} className="w-6 h-6 object-contain" alt="preview" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowActionModal(false)} className={THEME.btnSecondary}>
                Cancel
              </button>
              <button type="submit" className={THEME.btnPrimary}>
                {editAction ? 'Save Changes' : 'Create Action'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Confirm Dialog */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{
              backgroundColor: 'rgba(2, 6, 23, 0.95)',
              borderColor: 'rgba(30, 41, 59, 0.8)',
              borderWidth: 1,
              boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-950/30 border border-rose-900/30 shrink-0 mt-0.5">
                <Trash2 className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{confirmModal.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 border border-rose-500/30 rounded-xl cursor-pointer transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
