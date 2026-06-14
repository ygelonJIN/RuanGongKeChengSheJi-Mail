import { create } from 'zustand'

export interface AppState {
  accounts: any[]
  folders: any[]
  emails: any[]
  rules: any[]
  stats: { totalEmails: number; unreadEmails: number; totalAccounts: number; totalRules: number }
  settings: Record<string, any>
  selectedAccountId: number | null
  selectedFolderId: string | number | null
  folderView: 'inbox' | 'starred' | 'sent' | 'archive' | 'trash' | 'all'
  setFolderView: (v: AppState['folderView']) => void
  selectedEmailId: number | null
  emailBody: any | null
  debug: { bodyRawBytes: number; bodySubject: string; bodyHtmlLength: number; bodyTextLength: number; bodyParts: number }
  mailChangeTick: number
  bumpMailChangeTick: () => void
  setAccounts: (v: any[]) => void
  setFolders: (v: any[]) => void
  setEmails: (v: any[]) => void
  setRules: (v: any[]) => void
  setStats: (v: any) => void
  setSettings: (v: Record<string, any>) => void
  setSelectedAccountId: (v: number | null) => void
  setSelectedFolderId: (v: string | number | null) => void
  setSelectedEmailId: (v: number | null) => void
  setEmailBody: (v: any | null) => void
  setDebug: (v: Partial<AppState['debug']>) => void
}

export const useAppStore = create<AppState>((set) => ({
  accounts: [],
  folders: [],
  emails: [],
  rules: [],
  stats: { totalEmails: 0, unreadEmails: 0, totalAccounts: 0, totalRules: 0 },
  settings: {},
  selectedAccountId: null,
  selectedFolderId: null,
  folderView: 'inbox',
  selectedEmailId: null,
  emailBody: null,
  debug: { bodyRawBytes: 0, bodySubject: '', bodyHtmlLength: 0, bodyTextLength: 0, bodyParts: 0 },
  mailChangeTick: 0,
  bumpMailChangeTick: () => set((s) => ({ mailChangeTick: s.mailChangeTick + 1 })),
  setAccounts: (v) => set({ accounts: v }),
  setFolders: (v) => set({ folders: v }),
  setEmails: (v) => set({ emails: v }),
  setRules: (v) => set({ rules: v }),
  setStats: (v) => set({ stats: v }),
  setSettings: (v) => set({ settings: v }),
  setSelectedAccountId: (v) => set({ selectedAccountId: v }),
  setSelectedFolderId: (v) => set({ selectedFolderId: v }),
  setFolderView: (v) => set({ folderView: v }),
  setSelectedEmailId: (v) => set({ selectedEmailId: v }),
  setEmailBody: (v) => set({ emailBody: v }),
  setDebug: (v) => set((s) => ({ debug: { ...s.debug, ...v } })),
}))
