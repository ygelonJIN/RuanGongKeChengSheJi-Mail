import { useAppStore } from '../stores/appStore'

export async function refreshMailList(): Promise<void> {
  const api = window.electronAPI
  if (!api) return

  const { folderView, selectedFolderId, folders, setEmails } = useAppStore.getState()
  const inboxFolder = folders.find((folder) => folder.type === 'inbox')
  const archiveFolder = folders.find((folder) => folder.type !== 'inbox' && folder.type !== 'sent' && folder.type !== 'trash')
  const trashFolder = folders.find((folder) => folder.type === 'trash')
  const sentFolder = folders.find((folder) => folder.type === 'sent')

  const params: any = { pageSize: 30, view: folderView }
  if (folderView === 'archive' && archiveFolder?.id) params.folderId = archiveFolder.id
  else if (folderView === 'sent' && sentFolder?.id) params.folderId = sentFolder.id
  else if (folderView === 'trash' && trashFolder?.id) params.folderId = trashFolder.id
  else if (folderView === 'inbox' && inboxFolder?.id) params.folderId = inboxFolder.id
  else if (typeof selectedFolderId === 'number') params.folderId = selectedFolderId

  const list = await api.email.getList(params)
  setEmails(list?.emails || [])
}
