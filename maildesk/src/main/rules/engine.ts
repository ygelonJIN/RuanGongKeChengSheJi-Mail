import log from 'electron-log'
import { getDb } from '../database'

export interface RuleCondition {
  field: 'subject' | 'from' | 'to' | 'body' | 'hasAttachment' | 'isRead' | 'isStarred' | 'priority' | 'accountId' | 'date' | 'size'
  operator: 'contains' | 'notContains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'regex'
  value: string | number | boolean
  groupOperator?: 'AND' | 'OR'
}

export interface RuleAction {
  type: 'moveToFolder' | 'markRead' | 'markUnread' | 'star' | 'unstar' | 'addTag' | 'forward' | 'delete' | 'notify' | 'playSound'
  value?: string | number
}

export async function executeRules(emailId: number): Promise<void> {
  const db = getDb()
  const email = db.prepare('SELECT * FROM emails WHERE id=?').get(emailId) as any
  if (!email) return

  const rules = db.prepare('SELECT * FROM rules WHERE enabled=1 ORDER BY priority ASC').all() as any[]

  for (const rule of rules) {
    const conditions: RuleCondition[] = JSON.parse(rule.conditions_json || '[]')
    const actions: RuleAction[] = JSON.parse(rule.actions_json || '[]')

    if (matchesConditions(email, conditions)) {
      log.info(`Rule "${rule.name}" matched for email ${emailId}`)

      for (const action of actions) {
        await executeAction(action, emailId, email.account_id)
      }

      db.prepare('UPDATE rules SET match_count=match_count+1 WHERE id=?').run(rule.id)
    }
  }
}

function matchesConditions(email: any, conditions: RuleCondition[]): boolean {
  if (conditions.length === 0) return false

  return conditions.every(cond => {
    return evaluateSingleCondition(email, cond)
  })
}

function evaluateSingleCondition(email: any, cond: RuleCondition): boolean {
  const value = getFieldValue(email, cond.field)
  const condValue = cond.value

  switch (cond.operator) {
    case 'contains':
      return String(value).toLowerCase().includes(String(condValue).toLowerCase())
    case 'notContains':
      return !String(value).toLowerCase().includes(String(condValue).toLowerCase())
    case 'equals':
      return String(value).toLowerCase() === String(condValue).toLowerCase()
    case 'notEquals':
      return String(value).toLowerCase() !== String(condValue).toLowerCase()
    case 'startsWith':
      return String(value).toLowerCase().startsWith(String(condValue).toLowerCase())
    case 'endsWith':
      return String(value).toLowerCase().endsWith(String(condValue).toLowerCase())
    case 'greaterThan':
      return Number(value) > Number(condValue)
    case 'lessThan':
      return Number(value) < Number(condValue)
    case 'regex':
      try {
        const regex = new RegExp(String(condValue), 'i')
        return regex.test(String(value))
      } catch {
        return false
      }
    default:
      return true
  }
}

function getFieldValue(email: any, field: string): any {
  switch (field) {
    case 'subject': return email.subject
    case 'from': return email.from_email
    case 'to': return email.to_list
    case 'body': return email.snippet
    case 'hasAttachment': return !!email.has_attachments
    case 'isRead': return !!email.is_read
    case 'isStarred': return !!email.is_starred
    case 'priority': return email.priority
    case 'accountId': return email.account_id
    case 'date': return email.date
    case 'size': return email.size
    default: return ''
  }
}

async function executeAction(action: RuleAction, emailId: number, accountId: number): Promise<void> {
  const db = getDb()

  switch (action.type) {
    case 'moveToFolder':
      if (action.value) {
        const folder = db.prepare('SELECT * FROM folders WHERE account_id=? AND name=?').get(accountId, action.value) as any
        if (folder) {
          db.prepare('UPDATE emails SET folder_id=? WHERE id=?').run(folder.id, emailId)
        }
      }
      break

    case 'markRead':
      db.prepare('UPDATE emails SET is_read=1 WHERE id=?').run(emailId)
      break

    case 'markUnread':
      db.prepare('UPDATE emails SET is_read=0 WHERE id=?').run(emailId)
      break

    case 'star':
      db.prepare('UPDATE emails SET is_starred=1 WHERE id=?').run(emailId)
      break

    case 'unstar':
      db.prepare('UPDATE emails SET is_starred=0 WHERE id=?').run(emailId)
      break

    case 'addTag':
      if (action.value) {
        db.prepare('INSERT OR IGNORE INTO email_tags (email_id, tag_id) VALUES (?, ?)').run(emailId, action.value)
      }
      break

    case 'delete':
      const trashFolder = db.prepare("SELECT * FROM folders WHERE account_id=? AND type='trash' LIMIT 1").get(accountId) as any
      if (trashFolder) {
        db.prepare('UPDATE emails SET folder_id=? WHERE id=?').run(trashFolder.id, emailId)
      }
      break

    default:
      break
  }
}

export function createDefaultRules(): void {
  const db = getDb()
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM rules').get() as any)?.c || 0
  if (existingCount > 0) return

  const defaultRules = [
    {
      name: '周报识别',
      conditions: [{ field: 'subject', operator: 'contains', value: '周报' }],
      actions: [{ type: 'addTag', value: 1 }, { type: 'notify' }],
      priority: 1,
      enabled: 1,
    },
    {
      name: '发票识别',
      conditions: [{ field: 'subject', operator: 'contains', value: '发票' }],
      actions: [{ type: 'markRead' }],
      priority: 2,
      enabled: 1,
    },
  ]

  const stmt = db.prepare('INSERT INTO rules (name, conditions_json, actions_json, priority, enabled) VALUES (?, ?, ?, ?, ?)')
  try {
    db.run('BEGIN TRANSACTION')
    for (const rule of defaultRules) {
      stmt.run(rule.name, JSON.stringify(rule.conditions), JSON.stringify(rule.actions), rule.priority, rule.enabled)
    }
    db.run('COMMIT')
  } catch (e) {
    try { db.run('ROLLBACK') } catch {}
    log.error('Failed to insert default rules:', e)
  }
}
