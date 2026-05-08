/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'node:os';
import * as vscode from 'vscode';

/**
 * Single record persisted for every workspace the user has explicitly trusted
 * for Son of Anton agent operations. The trust grant is in addition to (not
 * a replacement for) VS Code's platform-level workspace-trust system: even
 * with an entry here, agents stay disabled if `vscode.workspace.isTrusted`
 * returns `false`.
 */
export interface TrustedFolderEntry {
	readonly folderPath: string;
	readonly grantedAt: number;
	/** Username from `os.userInfo()` at grant time — kept for audit purposes. */
	readonly grantedBy: string;
}

/** Hard cap on the persisted list. Older entries are pruned first. */
export const TRUSTED_FOLDERS_MAX = 100;

/** GlobalState key the entries are persisted under. */
export const TRUSTED_FOLDERS_GLOBAL_KEY = 'sota.trustedFolders';

/** Configuration key mirroring the persisted list (user-visible / editable). */
export const TRUSTED_FOLDERS_CONFIG_KEY = 'sota.trustedFolders';

/**
 * Tracks Son of Anton's per-workspace consent to operate the agent stack.
 *
 * Persistence model: the source of truth is `globalState[sota.trustedFolders]`
 * (a `TrustedFolderEntry[]`). The user-facing setting `sota.trustedFolders`
 * (an array of plain folder paths) is treated as an *additive* mirror so the
 * user can audit / hand-edit it without going through the UI; on
 * construction we merge those paths into the entry list. We never write the
 * setting back from this class — the user owns it.
 *
 * The class is deliberately small and synchronous: trust decisions need to
 * fire on every chat turn, so the hot path is an in-memory `Map` lookup
 * keyed on the absolute folder path.
 */
export class TrustedFolders implements vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	private readonly entries = new Map<string, TrustedFolderEntry>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly globalState: vscode.Memento) {
		this.hydrate();

		// React to user edits in `sota.trustedFolders` — they should take
		// effect without a window reload. We treat the configuration as an
		// additive merge: paths the user removes from the setting do *not*
		// implicitly revoke entries already in globalState (revoke is a
		// deliberate UX action), but new paths added via settings.json are
		// promoted to full entries here.
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(TRUSTED_FOLDERS_CONFIG_KEY)) {
					this.mergeFromConfig();
				}
			}),
		);
	}

	/** True when `folderPath` has a recorded Son of Anton trust grant. */
	isTrusted(folderPath: string): boolean {
		return this.entries.has(folderPath);
	}

	/** Newest-first list of all persisted trust entries. */
	list(): ReadonlyArray<TrustedFolderEntry> {
		return [...this.entries.values()].sort((a, b) => b.grantedAt - a.grantedAt);
	}

	/**
	 * Grant Son of Anton trust for `folderPath` and persist it. Idempotent —
	 * granting an already-trusted folder refreshes the timestamp so it falls
	 * off the prune horizon last.
	 */
	grant(folderPath: string): void {
		const entry: TrustedFolderEntry = {
			folderPath,
			grantedAt: Date.now(),
			grantedBy: safeUsername(),
		};
		this.entries.set(folderPath, entry);
		this.prune();
		this.persist();
		this._onDidChange.fire();
	}

	/** Drop trust for `folderPath`. No-op if it wasn't trusted. */
	revoke(folderPath: string): void {
		if (!this.entries.delete(folderPath)) {
			return;
		}
		this.persist();
		this._onDidChange.fire();
	}

	/**
	 * True only when **both** VS Code's platform trust *and* Son of Anton's
	 * per-workspace consent are granted for the active first workspace
	 * folder. Returns `false` when there is no workspace folder open — the
	 * caller is responsible for deciding whether a folder-less window should
	 * still allow chat (the `AgentBridge` gate treats it as "chat-only mode
	 * permitted").
	 */
	isFullyTrusted(): boolean {
		if (!vscode.workspace.isTrusted) {
			return false;
		}
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return false;
		}
		return this.isTrusted(folder.uri.fsPath);
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
		this._onDidChange.dispose();
	}

	private hydrate(): void {
		const stored = this.globalState.get<unknown>(TRUSTED_FOLDERS_GLOBAL_KEY);
		if (Array.isArray(stored)) {
			for (const raw of stored) {
				const entry = coerceEntry(raw);
				if (entry) {
					this.entries.set(entry.folderPath, entry);
				}
			}
		}
		this.mergeFromConfig();
	}

	private mergeFromConfig(): void {
		const cfg = vscode.workspace.getConfiguration().get<unknown>(TRUSTED_FOLDERS_CONFIG_KEY);
		if (!Array.isArray(cfg)) {
			return;
		}
		let added = false;
		for (const raw of cfg) {
			if (typeof raw !== 'string' || raw.length === 0) {
				continue;
			}
			if (!this.entries.has(raw)) {
				this.entries.set(raw, {
					folderPath: raw,
					grantedAt: Date.now(),
					grantedBy: safeUsername(),
				});
				added = true;
			}
		}
		if (added) {
			this.prune();
			this.persist();
			this._onDidChange.fire();
		}
	}

	private prune(): void {
		if (this.entries.size <= TRUSTED_FOLDERS_MAX) {
			return;
		}
		// Drop oldest entries first.
		const sorted = [...this.entries.values()].sort((a, b) => a.grantedAt - b.grantedAt);
		const toRemove = sorted.length - TRUSTED_FOLDERS_MAX;
		for (let i = 0; i < toRemove; i++) {
			this.entries.delete(sorted[i].folderPath);
		}
	}

	private persist(): void {
		const payload = [...this.entries.values()];
		void this.globalState.update(TRUSTED_FOLDERS_GLOBAL_KEY, payload);
	}
}

function coerceEntry(raw: unknown): TrustedFolderEntry | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const candidate = raw as Partial<TrustedFolderEntry>;
	if (typeof candidate.folderPath !== 'string' || candidate.folderPath.length === 0) {
		return undefined;
	}
	const grantedAt = typeof candidate.grantedAt === 'number' ? candidate.grantedAt : Date.now();
	const grantedBy = typeof candidate.grantedBy === 'string' ? candidate.grantedBy : 'unknown';
	return {
		folderPath: candidate.folderPath,
		grantedAt,
		grantedBy,
	};
}

function safeUsername(): string {
	try {
		return os.userInfo().username || 'unknown';
	} catch {
		// `os.userInfo()` can throw on systems where `getuid()` returns a uid
		// without a passwd entry (rare CI containers). The audit field is
		// best-effort, so degrade silently.
		return 'unknown';
	}
}
