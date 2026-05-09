import { create } from 'zustand'
import type { Account, Folder, Email, Rule, Tag, Settings, Stats } from '../types'

interface AppState {
  // Accounts
  accounts: Account[]
  setAccounts: (accounts: Account[]) => void

  // Folders
  folders: Folder[]
  setFolders: (folders: Folder[]) => void
  getFoldersByAccount: (accountId: number) => Folder[]

  // Selected state
  selectedAccountId: number | null
  setSelectedAccountId: (id: number | null) => void
  selectedFolderId: number | null
  setSelectedFolderId: (id: number | null) => void
  selectedEmailId: number | null
  setSelectedEmailId: (id: number | null) => void

  // Email list
  emails: Email[]
  setEmails: (emails: Email[]) => void
  totalEmails: number
  setTotalEmails: (total: number) => void

  // Email loading
  emailListLoading: boolean
  setEmailListLoading: (loading: boolean) => void
  emailBody: any
  setEmailBody: (body: any) => void

  // Rules
  rules: Rule[]
  setRules: (rules: Rule[]) => void

  // Tags
  tags: Tag[]
  setTags: (tags: Tag[]) => void

  // Settings
  settings: Partial<Settings>
  setSettings: (settings: Partial<Settings>) => void

  // Stats
  stats: Stats
  setStats: (stats: Stats) => void

  // UI state
  sidebarVisible: boolean
  setSidebarVisible: (visible: boolean) => void
  previewVisible: boolean
  setPreviewVisible: (visible: boolean) => void
  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  // Theme
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  // Sync state
  syncingAccounts: Set<number>
  setSyncing: (accountId: number, syncing: boolean) => void

  // Compose
  composeVisible: boolean
  setComposeVisible: (visible: boolean) => void
  replyToEmail: Email | null
  setReplyToEmail: (email: Email | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Accounts
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),

  // Folders
  folders: [],
  setFolders: (folders) => set({ folders }),
  getFoldersByAccount: (accountId) => get().folders.filter((f) => f.account_id === accountId),

  // Selected state
  selectedAccountId: null,
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  selectedFolderId: null,
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  selectedEmailId: null,
  setSelectedEmailId: (id) => set({ selectedEmailId: id }),

  // Email list
  emails: [],
  setEmails: (emails) => set({ emails }),
  totalEmails: 0,
  setTotalEmails: (total) => set({ totalEmails: total }),

  // Email loading
  emailListLoading: false,
  setEmailListLoading: (loading) => set({ emailListLoading: loading }),
  emailBody: null,
  setEmailBody: (body) => set({ emailBody: body }),

  // Rules
  rules: [],
  setRules: (rules) => set({ rules }),

  // Tags
  tags: [],
  setTags: (tags) => set({ tags }),

  // Settings
  settings: {},
  setSettings: (settings) => set({ settings }),

  // Stats
  stats: { totalEmails: 0, unreadEmails: 0, totalAccounts: 0, totalRules: 0 },
  setStats: (stats) => set({ stats }),

  // UI state
  sidebarVisible: true,
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  previewVisible: true,
  setPreviewVisible: (visible) => set({ previewVisible: visible }),
  sidebarWidth: 220,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),

  // Sync state
  syncingAccounts: new Set(),
  setSyncing: (accountId, syncing) =>
    set((state) => {
      const newSet = new Set(state.syncingAccounts)
      if (syncing) {
        newSet.add(accountId)
      } else {
        newSet.delete(accountId)
      }
      return { syncingAccounts: newSet }
    }),

  // Compose
  composeVisible: false,
  setComposeVisible: (visible) => set({ composeVisible: visible }),
  replyToEmail: null,
  setReplyToEmail: (email) => set({ replyToEmail: email }),
}))
