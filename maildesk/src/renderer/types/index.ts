import type { ElectronAPI } from '@preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}

export interface Account {
  id: number
  email: string
  display_name: string
  provider: string
  imap_host: string
  imap_port: number
  imap_user: string
  imap_password: string
  imap_use_tls: number
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  smtp_use_tls: number
  oauth_provider?: string
  oauth_access_token?: string
  oauth_refresh_token?: string
  oauth_token_expires_at?: number
  sync_interval: number
  last_sync_at?: number
  enabled: number
  created_at: number
  updated_at: number
}

export interface Folder {
  id: number
  account_id: number
  remote_id: string
  name: string
  path: string
  parent_remote_id: string
  type: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'starred' | 'important' | 'mail'
  unread_count: number
  subscribed: number
}

export interface Email {
  id: number
  account_id: number
  folder_id: number
  uid: number
  message_id: string
  in_reply_to: string
  references_id: string
  subject: string
  from_name: string
  from_email: string
  to_list: string
  cc_list: string
  bcc_list: string
  date: number
  size: number
  has_attachments: number
  is_read: number
  is_starred: number
  is_draft: number
  is_sent: number
  priority: 'high' | 'normal' | 'low'
  snippet: string
  body_fetched: number
  folder_name?: string
  folder_path?: string
  tags?: Tag[]
}

export interface EmailBody {
  id: number
  email_id: number
  text_html: string
  text_plain: string
  fetched_at: number
}

export interface Attachment {
  id: number
  email_id: number
  filename: string
  content_type: string
  size: number
  part_id: string
  cid: string
  local_path: string
  downloaded: number
}

export interface Rule {
  id: number
  name: string
  conditions: RuleCondition[]
  actions: RuleAction[]
  priority: number
  enabled: number
  match_count: number
  is_template: number
  conditions_json: string
  actions_json: string
}

export interface RuleCondition {
  id: string
  field: 'subject' | 'from' | 'to' | 'body' | 'hasAttachment' | 'isRead' | 'isStarred' | 'priority' | 'accountId' | 'date' | 'size'
  operator: 'contains' | 'notContains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'regex'
  value: string | number | boolean
  groupOperator?: 'AND' | 'OR'
}

export interface RuleAction {
  id: string
  type: 'moveToFolder' | 'markRead' | 'markUnread' | 'star' | 'unstar' | 'addTag' | 'forward' | 'delete' | 'notify' | 'playSound'
  value?: string | number
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  language: string
  notification_enabled: string
  notification_sound: string
  dnd_enabled: string
  dnd_start: string
  dnd_end: string
  storage_limit: string
  retention_days: string
  auto_sync: string
  sync_interval: string
  preview_pane: string
  sidebar_width: string
}

export interface Stats {
  totalEmails: number
  unreadEmails: number
  totalAccounts: number
  totalRules: number
}

export interface FolderStats {
  name: string
  path: string
  email_count: number
  unread_count: number
}

export interface TopSender {
  from_email: string
  from_name: string
  count: number
}

export interface TrendData {
  day: string
  count: number
}
