/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { UnsupportedProtocolVersionErrorData } from './protocol/errors.js';

/**
 * Name of the JSON-RPC method that, when invoked on an agent host spawned
 * by the VS Code CLI, asks the CLI to check for a server upgrade and
 * restart the running server if a newer build is available.
 *
 * Servers advertise this method through {@link UnsupportedProtocolVersionErrorMeta.vscodeUpgradeMethod}
 * in the `_meta` payload of an `UnsupportedProtocolVersion` error so the
 * client can offer an "Update server" action without hard-coding the method
 * name on the renderer side.
 */
export const VSCODE_UPGRADE_METHOD = '_vscodeUpgrade' as const;

/**
 * Status payload returned by the {@link VSCODE_UPGRADE_METHOD} RPC. The
 * agent host server forwards the CLI's `POST /upgrade` response back to
 * the client unchanged, so the UI can describe what happened (e.g.
 * "already on the latest version" vs "upgrade scheduled, please reconnect").
 */
export interface IVscodeUpgradeResult {
	/** Whether the CLI accepted the request without an internal error. */
	readonly ok: boolean;
	/** Whether the running server is older than the latest known release. */
	readonly upgradeNeeded?: boolean;
	/**
	 * Whether the CLI committed to actually performing the upgrade. When
	 * `true`, the client SHOULD reconnect after at least
	 * {@link restartDelayMs} milliseconds; the existing transport will be
	 * torn down by the CLI.
	 */
	readonly upgradeStarted?: boolean;
	/** Commit of the currently running server, or `null` if no server is running. */
	readonly runningCommit?: string | null;
	/** Latest known release commit at the time of the call. */
	readonly latestCommit?: string;
	/**
	 * Milliseconds the client should wait before attempting to reconnect.
	 * The CLI deliberately delays the kill+restart so this HTTP response
	 * can drain back through the proxy first; reconnecting immediately
	 * would land on the still-running pre-upgrade server. Populated only
	 * when {@link upgradeStarted} is `true`.
	 */
	readonly restartDelayMs?: number;
	/** Human-readable error when {@link ok} is `false`. */
	readonly error?: string;
}

/**
 * Optional `_meta` side-channel on the `UnsupportedProtocolVersion` error
 * data payload. Servers that are spawned by the VS Code CLI populate this
 * to let the renderer offer a one-click upgrade flow; servers without a
 * managing CLI omit it.
 *
 * The MCP `_meta` convention is followed: this is an open-ended record so
 * future versions can carry additional fields without bumping the wire
 * shape of the error.
 */
export interface UnsupportedProtocolVersionErrorMeta {
	/**
	 * JSON-RPC method name the client MAY invoke on the same transport to
	 * ask the server to upgrade itself. Currently always {@link VSCODE_UPGRADE_METHOD}.
	 */
	readonly vscodeUpgradeMethod?: string;
}

/**
 * `UnsupportedProtocolVersionErrorData` augmented with the local `_meta`
 * extension used by VS Code-hosted agent hosts.
 *
 * Kept out of the auto-generated `errors.ts` so the synced types stay
 * untouched. Read at runtime as a best-effort field — older servers
 * simply won't set it.
 */
export interface UnsupportedProtocolVersionErrorDataEx extends UnsupportedProtocolVersionErrorData {
	readonly _meta?: UnsupportedProtocolVersionErrorMeta;
}
