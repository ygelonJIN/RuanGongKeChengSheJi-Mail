import { contextBridge, ipcRenderer, IpcRendererEvent, shell } from 'electron'

export type Theme = 'light' | 'dark' | 'system'

const electronAPI = {
  // ========== Account Management ==========
  account: {
    getAll: () => ipcRenderer.invoke('account:getAll'),
    add: (config: any) => ipcRenderer.invoke('account:add', config),
    update: (id: number, config: any) => ipcRenderer.invoke('account:update', id, config),
    delete: (id: number) => ipcRenderer.invoke('account:delete', id),
    testConnection: (config: any) => ipcRenderer.invoke('account:testConnection', config),
    sync: (id: number) => ipcRenderer.invoke('account:sync', id),
    syncAll: () => ipcRenderer.invoke('account:syncAll'),
    getOAuthUrl: (provider: string) => ipcRenderer.invoke('account:getOAuthUrl', provider),
    handleOAuthCallback: (code: string, provider: string) => ipcRenderer.invoke('account:handleOAuthCallback', code, provider),
  },

  // ========== Folder Management ==========
  folder: {
    getAll: (accountId?: number) => ipcRenderer.invoke('folder:getAll', accountId),
    subscribe: (folderId: number, subscribed: boolean) => ipcRenderer.invoke('folder:subscribe', folderId, subscribed),
    create: (accountId: number, name: string, parentId?: number) => ipcRenderer.invoke('folder:create', accountId, name, parentId),
    delete: (folderId: number) => ipcRenderer.invoke('folder:delete', folderId),
  },

  // ========== Email Operations ==========
  email: {
    getList: (params: {
      accountId?: number
      folderId?: number
      search?: string
      page?: number
      pageSize?: number
      sortField?: string
      sortOrder?: 'asc' | 'desc'
    }) => ipcRenderer.invoke('email:getList', params),
    getById: (id: number) => ipcRenderer.invoke('email:getById', id),
    getBody: (id: number) => ipcRenderer.invoke('email:getBody', id),
    send: (data: any) => ipcRenderer.invoke('email:send', data),
    saveDraft: (data: any) => ipcRenderer.invoke('email:saveDraft', data),
    setRead: (ids: number[], read: boolean) => ipcRenderer.invoke('email:setRead', ids, read),
    setStar: (ids: number[], starred: boolean) => ipcRenderer.invoke('email:setStar', ids, starred),
    move: (ids: number[], targetFolderId: number) => ipcRenderer.invoke('email:move', ids, targetFolderId),
    delete: (ids: number[]) => ipcRenderer.invoke('email:delete', ids),
    permanentDelete: (ids: number[]) => ipcRenderer.invoke('email:permanentDelete', ids),
    search: (query: string, accountId?: number) => ipcRenderer.invoke('email:search', query, accountId),
    forward: (id: number, data: any) => ipcRenderer.invoke('email:forward', id, data),
    reply: (id: number, replyAll: boolean) => ipcRenderer.invoke('email:reply', id, replyAll),
    getAttachments: (id: number) => ipcRenderer.invoke('email:getAttachments', id),
    downloadAttachment: (attachmentId: number, savePath?: string) => ipcRenderer.invoke('email:downloadAttachment', attachmentId, savePath),
    exportEml: (emailId: number) => ipcRenderer.invoke('email:exportEml', emailId),
    exportMbox: (accountId?: number, folderId?: number) => ipcRenderer.invoke('email:exportMbox', accountId, folderId),
    addTag: (emailId: number, tagId: number) => ipcRenderer.invoke('email:addTag', emailId, tagId),
    removeTag: (emailId: number, tagId: number) => ipcRenderer.invoke('email:removeTag', emailId, tagId),
  },

  // ========== Rules ==========
  rule: {
    getAll: () => ipcRenderer.invoke('rule:getAll'),
    create: (rule: any) => ipcRenderer.invoke('rule:create', rule),
    update: (id: number, rule: any) => ipcRenderer.invoke('rule:update', id, rule),
    delete: (id: number) => ipcRenderer.invoke('rule:delete', id),
    test: (ruleId: number) => ipcRenderer.invoke('rule:test', ruleId),
    reorder: (orderedIds: number[]) => ipcRenderer.invoke('rule:reorder', orderedIds),
    exportRules: () => ipcRenderer.invoke('rule:export'),
    importRules: (json: string) => ipcRenderer.invoke('rule:import', json),
  },

  // ========== Tags ==========
  tag: {
    getAll: () => ipcRenderer.invoke('tag:getAll'),
    create: (name: string, color: string) => ipcRenderer.invoke('tag:create', name, color),
    update: (id: number, name: string, color: string) => ipcRenderer.invoke('tag:update', id, name, color),
    delete: (id: number) => ipcRenderer.invoke('tag:delete', id),
  },

  // ========== Statistics ==========
  stats: {
    getDashboard: () => ipcRenderer.invoke('stats:getDashboard'),
    getTrend: (days: number) => ipcRenderer.invoke('stats:getTrend', days),
    getTopSenders: (limit?: number) => ipcRenderer.invoke('stats:getTopSenders', limit),
    getFolderStats: () => ipcRenderer.invoke('stats:getFolderStats'),
    recordEmail: (accountId: number, type: 'received' | 'sent' | 'read') => ipcRenderer.invoke('stats:recordEmail', accountId, type),
  },

  // ========== Settings ==========
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: any) => ipcRenderer.invoke('settings:set', settings),
    getTheme: () => ipcRenderer.invoke('settings:getTheme'),
    setTheme: (theme: Theme) => ipcRenderer.invoke('settings:setTheme', theme),
    getStorageInfo: () => ipcRenderer.invoke('settings:getStorageInfo'),
    clearCache: () => ipcRenderer.invoke('settings:clearCache'),
    setRetention: (days: number) => ipcRenderer.invoke('settings:setRetention', days),
    exportData: (format: string) => ipcRenderer.invoke('settings:exportData', format),
    importData: (format: string, filePath: string) => ipcRenderer.invoke('settings:importData', format, filePath),
  },

  // ========== Notifications ==========
  notification: {
    getHistory: (page?: number, pageSize?: number) => ipcRenderer.invoke('notification:getHistory', page, pageSize),
    clearHistory: () => ipcRenderer.invoke('notification:clearHistory'),
  },

  // ========== Window / System ==========
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    openExternal: (url: string) => shell.openExternal(url),
  },

  // ========== Event Listeners ==========
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'menu:new-email', 'menu:add-account', 'menu:sync-all',
      'menu:account-settings', 'menu:check-updates', 'menu:about',
      'navigate', 'toggle-sidebar', 'toggle-preview',
      'theme:changed', 'theme:updated',
      'email:new-arrived', 'email:sync-progress',
      'account:sync-start', 'account:sync-complete', 'account:sync-error',
      'notification:clicked',
    ]
    if (validChannels.includes(channel)) {
      const subscription = (_event: IpcRendererEvent, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    return () => {}
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },

  // ========== App Info ==========
  getAppPath: () => ipcRenderer.invoke('app:getPath'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
