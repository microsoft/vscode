/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { getErrorCode } from '../../../../base/common/errors.js';
import { basename, dirname, join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../log/common/log.js';

/**
 * Shared bulk metadata file the extension-host Copilot CLI keeps in the Copilot
 * home, trimmed to its newest 1000 sessions.
 */
export const EXTENSION_HOST_CLI_SHARED_BULK_FILE = 'vscode.session.metadata.cache.json';

/**
 * Older bulk metadata file the extension-host Copilot CLI kept in its
 * `globalStorage`, relative to the `User` folder of the install it ran in.
 */
export const EXTENSION_HOST_CLI_PER_INSTALL_BULK_FILE = ['globalStorage', 'github.copilot-chat', 'copilotcli', 'copilotcli.session.metadata.json'] as const;

export type LegacyBulkFileStatus = 'present' | 'missing' | 'invalid';

/** Counts from {@link restoreMissingLegacyMarkers}; no session identifiers or contents. */
export interface ILegacyMarkerFallbackResult {
	readonly sharedBulkFile: LegacyBulkFileStatus;
	readonly perInstallBulkFile: LegacyBulkFileStatus;
	readonly candidates: number;
	readonly notVSCode: number;
	readonly exists: number;
	readonly missingSessionDirectory: number;
	readonly written: number;
	readonly failed: number;
}

/** File operations the fallback uses; injectable for fault-injection tests. */
export type LegacyMarkerFallbackFileSystem = Pick<typeof fs, 'readFile' | 'stat' | 'writeFile' | 'link' | 'unlink'>;

interface ILegacyBulkEntry {
	readonly origin?: unknown;
	readonly modified?: unknown;
	readonly writtenToDisc?: unknown;
	readonly repositoryProperties?: unknown;
	readonly worktreeProperties?: unknown;
	readonly workspaceFolder?: unknown;
}

const SAFE_SESSION_ID = /^[\w.-]+$/;

/**
 * Writes the per-session marker (`markerFileName` in the session's folder under
 * `sessionStateRoot`) for every VS Code session the extension host recorded
 * only in its bulk metadata files, so the session can be discovered and
 * adopted when the extension's own backfill never ran on this machine.
 *
 * Mirrors that backfill: the newer `modified` wins when a session is in both
 * files; an entry qualifies by the same provenance rule as the marker check (an
 * explicit `origin` must be `vscode`, an origin-less one must carry VS Code
 * workspace properties); only sessions whose folder exists are written; and the
 * marker is created only when absent, so a marker any other writer created is
 * never replaced. The entry is written as stored, without `writtenToDisc`.
 *
 * A marker is published only by hard-linking a fully written temporary file, the
 * one create-only publication that is atomic. Where hard links are unsupported
 * (some FAT or network file systems) the session is not restored and is counted
 * as failed: it stays un-adoptable, as it was without this fallback.
 */
export async function restoreMissingLegacyMarkers(sessionStateRoot: string, sharedBulkFile: string, perInstallBulkFile: string | undefined, markerFileName: string, logService: ILogService, fileSystem: LegacyMarkerFallbackFileSystem = fs): Promise<ILegacyMarkerFallbackResult> {
	const [shared, perInstall] = await Promise.all([
		readBulkFile(sharedBulkFile, fileSystem),
		perInstallBulkFile ? readBulkFile(perInstallBulkFile, fileSystem) : Promise.resolve({ status: 'missing' as const, data: {} }),
	]);
	const candidates = new Map<string, unknown>();
	for (const data of [shared.data, perInstall.data]) {
		for (const [sessionId, entry] of Object.entries(data)) {
			const existing = candidates.get(sessionId);
			if (existing === undefined || modifiedOf(entry) > modifiedOf(existing)) {
				candidates.set(sessionId, entry);
			}
		}
	}
	const counts = { notVSCode: 0, exists: 0, missingSessionDirectory: 0, written: 0, failed: 0 };
	for (const [sessionId, entry] of candidates) {
		if (!isVSCodeBulkEntry(sessionId, entry)) {
			counts.notVSCode++;
			continue;
		}
		counts[await restoreMarker(join(sessionStateRoot, sessionId), markerFileName, entry, fileSystem, error => {
			if (counts.failed < 5) {
				logService.warn(`[Copilot] Failed to restore the extension-host marker of legacy session ${sessionId} from its bulk metadata`, error);
			}
		})]++;
	}
	return { sharedBulkFile: shared.status, perInstallBulkFile: perInstall.status, candidates: candidates.size, ...counts };
}

async function restoreMarker(sessionDirectory: string, markerFileName: string, entry: ILegacyBulkEntry, fileSystem: LegacyMarkerFallbackFileSystem, logFailure: (error: unknown) => void): Promise<'exists' | 'missingSessionDirectory' | 'written' | 'failed'> {
	try {
		if (!(await fileSystem.stat(sessionDirectory)).isDirectory()) {
			return 'missingSessionDirectory';
		}
	} catch (error) {
		if (isNotFound(error)) {
			return 'missingSessionDirectory';
		}
		logFailure(error);
		return 'failed';
	}
	const { writtenToDisc: _writtenToDisc, ...marker } = entry;
	try {
		return await writeFileIfAbsent(join(sessionDirectory, markerFileName), JSON.stringify(marker, null, 2), fileSystem) ? 'written' : 'exists';
	} catch (error) {
		if (isNotFound(error)) {
			return 'missingSessionDirectory';
		}
		logFailure(error);
		return 'failed';
	}
}

/**
 * Whether a bulk entry describes a session VS Code created, under an identifier
 * that is safe to use as a folder name. Mirrors the extension's backfill.
 */
function isVSCodeBulkEntry(sessionId: string, entry: unknown): entry is ILegacyBulkEntry {
	if (!SAFE_SESSION_ID.test(sessionId) || sessionId === '.' || sessionId === '..' || sessionId.startsWith('untitled:') || sessionId.startsWith('untitled-')) {
		return false;
	}
	if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
		return false;
	}
	const candidate = entry as ILegacyBulkEntry;
	if (candidate.origin !== undefined) {
		return candidate.origin === 'vscode';
	}
	return candidate.repositoryProperties !== undefined
		|| candidate.worktreeProperties !== undefined
		|| candidate.workspaceFolder !== undefined;
}

function modifiedOf(entry: unknown): number {
	const modified = entry && typeof entry === 'object' ? (entry as ILegacyBulkEntry).modified : undefined;
	return typeof modified === 'number' ? modified : 0;
}

async function readBulkFile(path: string, fileSystem: LegacyMarkerFallbackFileSystem): Promise<{ status: LegacyBulkFileStatus; data: Record<string, unknown> }> {
	let raw: string;
	try {
		raw = await fileSystem.readFile(path, 'utf8');
	} catch (error) {
		return { status: isNotFound(error) ? 'missing' : 'invalid', data: {} };
	}
	try {
		const data: unknown = JSON.parse(raw);
		return data && typeof data === 'object' && !Array.isArray(data)
			? { status: 'present', data: data as Record<string, unknown> }
			: { status: 'invalid', data: {} };
	} catch {
		return { status: 'invalid', data: {} };
	}
}

function isNotFound(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Creates `path` with its complete contents only if it does not exist yet, so a
 * concurrent writer (the extension, which overwrites its markers in place, its
 * backfill, another host) always wins and no reader ever sees a partial marker.
 * Returns `false` if it already exists. The contents go to a temporary file
 * that is hard-linked into place, which publishes the whole file or fails with
 * `EEXIST`. Where hard links are unsupported this throws and leaves the marker
 * untouched: an exclusive create would expose the file before it is written,
 * so a concurrent update could be overwritten, or deleted on cleanup.
 */
async function writeFileIfAbsent(path: string, content: string, fileSystem: LegacyMarkerFallbackFileSystem): Promise<boolean> {
	// Most markers already exist after the extension's backfill; checking first avoids a temporary file for each.
	try {
		await fileSystem.stat(path);
		return false;
	} catch (error) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error;
		}
	}
	const temp = join(dirname(path), `.${basename(path)}.${generateUuid()}.tmp`);
	try {
		await fileSystem.writeFile(temp, content, { flag: 'wx' });
		try {
			await fileSystem.link(temp, path);
			return true;
		} catch (error) {
			if (getErrorCode(error) === 'EEXIST') {
				return false;
			}
			throw error;
		}
	} finally {
		await fileSystem.unlink(temp).catch(() => undefined);
	}
}
