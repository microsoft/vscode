// Projects: groups of chats with shared instructions, knowledge files and a working folder.
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Project } from '../shared/types'
import { ExtractError, extractFile } from './extract'
import type { SecureStore } from './store'

export function createProject(store: SecureStore, input: { name: string; description?: string; cwd?: string }): Project {
  const now = Date.now()
  const p: Project = {
    id: randomUUID(),
    name: input.name.trim() || 'Untitled project',
    description: input.description?.trim() ?? '',
    instructions: '',
    ...(input.cwd ? { cwd: resolve(input.cwd) } : {}),
    files: [],
    createdAt: now,
    updatedAt: now
  }
  store.upsertProject(p)
  return p
}

export function updateProject(store: SecureStore, id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'cwd' | 'pinned'>>): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  // Pinning doesn't count as an edit, so it doesn't change "updated … ago" or the sort order.
  const pinOnly = Object.keys(patch).every((k) => k === 'pinned')
  const next = { ...p, ...patch, updatedAt: pinOnly ? p.updatedAt : Date.now() }
  store.upsertProject(next)
  return next
}

/**
 * Add files to the project's encrypted knowledge: text and code, Markdown, PDF, Word, PowerPoint
 * and Excel (their text is kept). Returns the project and any files that were skipped, with why.
 */
export async function addProjectFiles(store: SecureStore, id: string, paths: string[]): Promise<{ project: Project; skipped: string[] }> {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const contents = store.loadProjectFiles(id)
  const files = [...p.files]
  const skipped: string[] = []
  for (const path of paths) {
    const name = basename(path)
    try {
      const size = statSync(path).size
      let text: string
      try {
        text = await extractFile(path)
      } catch (e) {
        if (!(e instanceof ExtractError)) throw e
        skipped.push(`${name} (${e.message})`)
        continue
      }
      // Re-adding a file with the same name replaces it.
      const existing = files.find((f) => f.name === name)
      const fid = existing?.id ?? randomUUID()
      contents[fid] = text
      if (existing) Object.assign(existing, { size, addedAt: Date.now() })
      else files.push({ id: fid, name, size, addedAt: Date.now() })
    } catch (e) {
      skipped.push(`${name} (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  store.saveProjectFiles(id, contents)
  const next = { ...p, files, updatedAt: Date.now() }
  store.upsertProject(next)
  return { project: next, skipped }
}

/**
 * Give every chat in the project a folder to work in. The first one becomes the main folder
 * (where new chats start); the rest are opened to every chat too.
 */
export function addProjectDir(store: SecureStore, id: string, folder: string): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const path = resolve(folder)
  if (p.cwd === path || (p.dirs ?? []).includes(path)) return p
  const next = p.cwd ? { ...p, dirs: [...(p.dirs ?? []), path] } : { ...p, cwd: path }
  store.upsertProject({ ...next, updatedAt: Date.now() })
  return store.getProject(id)!
}

/** Take a folder off the project; removing the main folder makes the next one the main folder. */
export function removeProjectDir(store: SecureStore, id: string, folder: string): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const dirs = p.dirs ?? []
  const next = p.cwd === folder ? { ...p, cwd: dirs[0], dirs: dirs.slice(1) } : { ...p, dirs: dirs.filter((d) => d !== folder) }
  if (!next.cwd) delete next.cwd
  store.upsertProject({ ...next, updatedAt: Date.now() })
  return store.getProject(id)!
}

/** Make a folder the project's main folder (new chats start there). */
export function setProjectMainDir(store: SecureStore, id: string, folder: string): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const path = resolve(folder)
  store.upsertProject({ ...p, cwd: path, dirs: (p.dirs ?? []).filter((d) => d !== path), updatedAt: Date.now() })
  return store.getProject(id)!
}

/** Link a folder as knowledge: its notes and documents are read live, and Claude searches them. */
export function addProjectFolder(store: SecureStore, id: string, folder: string): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const path = resolve(folder)
  if ((p.folders ?? []).includes(path)) return p
  const next = { ...p, folders: [...(p.folders ?? []), path], updatedAt: Date.now() }
  store.upsertProject(next)
  return next
}

export function removeProjectFolder(store: SecureStore, id: string, folder: string): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const next = { ...p, folders: (p.folders ?? []).filter((f) => f !== folder), updatedAt: Date.now() }
  store.upsertProject(next)
  return next
}

export function removeProjectFile(store: SecureStore, id: string, fileId: string): Project {
  const p = store.getProject(id)
  if (!p) throw new Error('Unknown project')
  const contents = store.loadProjectFiles(id)
  delete contents[fileId]
  store.saveProjectFiles(id, contents)
  const next = { ...p, files: p.files.filter((f) => f.id !== fileId), updatedAt: Date.now() }
  store.upsertProject(next)
  return next
}
