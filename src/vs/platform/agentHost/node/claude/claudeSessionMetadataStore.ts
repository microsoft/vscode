/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { URI } from '../../../../base/common/uri.js';
import { ClaudePermissionMode, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { IAgentChatMetadata } from '../../common/agent.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { AgentSelection, ModelSelection } from '../../common/state/protocol/state.js';
import { AH_META_WORKSPACELESS_DB_KEY } from '../../common/state/sessionState.js';

/**
 * Read view of Claude's per-session DB overlay. SDK-supplied fields
 * (summary, cwd, timestamps) live on {@link SDKSessionInfo} and are
 * combined with the overlay in {@link ClaudeSessionMetadataStore.project}.
 */
export interface IClaudeSessionOverlay {
	readonly customizationDirectory?: URI;
	readonly model?: ModelSelection;
	readonly permissionMode?: ClaudePermissionMode;
	readonly agent?: AgentSelection;
	/**
	 * The full ordered working-directory set granted to this session (index 0 =
	 * the SDK process root / `cwd`, index 1..N = additional directories). Owned
	 * here because the SDK session catalog exposes only `cwd`, so a cold resume /
	 * remove-all / fork must recover the tail from this overlay. Absent for
	 * single-root sessions and external Claude CLI sessions (which have no
	 * overlay DB), so callers treat absence as single-root.
	 */
	readonly workingDirectories?: readonly URI[];
	/**
	 * Transport the session most recently materialized under (Phase 19).
	 * Forward-compat only — written at materialize time but NOT read for
	 * transport resolution in v1 (transport is resolved host-level). Lets a
	 * future per-session-transport feature land without a data migration.
	 */
	readonly transport?: 'proxy' | 'native';
}

/**
 * Write view: any subset of the overlay fields. Fields left `undefined`
 * are not touched (only-write-on-defined semantics). Pass `null` for
 * `agent` to clear a previously persisted selection.
 */
export interface IClaudeSessionOverlayUpdate {
	readonly customizationDirectory?: URI;
	readonly model?: ModelSelection;
	readonly permissionMode?: ClaudePermissionMode;
	readonly agent?: AgentSelection | null;
	readonly workingDirectories?: readonly URI[];
	readonly transport?: 'proxy' | 'native';
}

/**
 * Owns Claude's per-session metadata layer:
 *
 * - the three `_META_*` DB keys,
 * - the {@link ModelSelection} JSON codec used to persist the parallel
 *   `{ id, config }` shape,
 * - the read/write helpers that open a per-call DB ref,
 * - the projection from {@link SDKSessionInfo} + overlay onto the
 *   platform's {@link IAgentChatMetadata} shape (minus `chat`, which the
 *   caller attaches from its own exact-chat identity).
 *
 * The SDK is the source of truth for session existence; the overlay
 * merely decorates. External Claude CLI sessions have no overlay DB,
 * so {@link read} returns `{}` rather than throwing — every caller
 * must tolerate an empty overlay.
 */
export class ClaudeSessionMetadataStore {

	private static readonly KEY_CUSTOMIZATION_DIRECTORY = 'claude.customizationDirectory';
	private static readonly KEY_MODEL = 'claude.model';
	private static readonly KEY_PERMISSION_MODE = 'claude.permissionMode';
	private static readonly KEY_AGENT = 'claude.agent';
	private static readonly KEY_TRANSPORT = 'claude.transport';
	private static readonly KEY_WORKING_DIRECTORIES = 'claude.workingDirectories';

	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

	async hasKnownSession(session: URI): Promise<boolean> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return false;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[AH_META_WORKSPACELESS_DB_KEY]: true,
				'claude.external': true,
				[ClaudeSessionMetadataStore.KEY_CUSTOMIZATION_DIRECTORY]: true,
				[ClaudeSessionMetadataStore.KEY_MODEL]: true,
				[ClaudeSessionMetadataStore.KEY_PERMISSION_MODE]: true,
				[ClaudeSessionMetadataStore.KEY_AGENT]: true,
				[ClaudeSessionMetadataStore.KEY_TRANSPORT]: true,
				[ClaudeSessionMetadataStore.KEY_WORKING_DIRECTORIES]: true,
			});
			return Object.values(metadata).some(value => value !== undefined);
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Persist the supplied overlay fields to the per-session DB. Mirrors
	 * CopilotAgent's `_storeSessionMetadata` pattern
	 * (`copilotAgent.ts:1532`): single `openDatabase` ref, `Promise.all`
	 * batching, only-write-on-defined.
	 */
	async write(session: URI, fields: IClaudeSessionOverlayUpdate): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		const db = dbRef.object;
		try {
			const work: Promise<void>[] = [];
			if (fields.customizationDirectory) {
				work.push(db.setMetadata(ClaudeSessionMetadataStore.KEY_CUSTOMIZATION_DIRECTORY, fields.customizationDirectory.toString()));
			}
			if (fields.model) {
				work.push(db.setMetadata(ClaudeSessionMetadataStore.KEY_MODEL, serializeModelSelection(fields.model)));
			}
			if (fields.permissionMode) {
				work.push(db.setMetadata(ClaudeSessionMetadataStore.KEY_PERMISSION_MODE, fields.permissionMode));
			}
			if (fields.agent !== undefined) {
				work.push(db.setMetadata(
					ClaudeSessionMetadataStore.KEY_AGENT,
					fields.agent === null ? '' : JSON.stringify({ uri: fields.agent.uri }),
				));
			}
			if (fields.transport) {
				work.push(db.setMetadata(ClaudeSessionMetadataStore.KEY_TRANSPORT, fields.transport));
			}
			if (fields.workingDirectories) {
				work.push(db.setMetadata(
					ClaudeSessionMetadataStore.KEY_WORKING_DIRECTORIES,
					JSON.stringify(fields.workingDirectories.map(d => d.toString())),
				));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	/**
	 * Read all overlay fields from the per-session DB. Returns `{}` when
	 * no DB is present (external Claude CLI session, fresh install).
	 * Mirrors CopilotAgent's `_readSessionMetadata` (`copilotAgent.ts:1559`)
	 * — `tryOpenDatabase` so absence is not an error, single `Promise.all`
	 * for the parallel reads.
	 */
	async read(session: URI): Promise<IClaudeSessionOverlay> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [customizationDirectoryRaw, modelRaw, permissionModeRaw, agentRaw, transportRaw, workingDirectoriesRaw] = await Promise.all([
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_MODEL),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_PERMISSION_MODE),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_AGENT),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_TRANSPORT),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_WORKING_DIRECTORIES),
			]);
			return {
				customizationDirectory: customizationDirectoryRaw ? URI.parse(customizationDirectoryRaw) : undefined,
				model: parseModelSelection(modelRaw),
				permissionMode: narrowClaudePermissionMode(permissionModeRaw),
				agent: parseAgentSelection(agentRaw),
				transport: transportRaw === 'proxy' || transportRaw === 'native' ? transportRaw : undefined,
				workingDirectories: parseWorkingDirectories(workingDirectoriesRaw),
			};
		} finally {
			ref.dispose();
		}

	}

	/**
	 * Project an SDK-supplied {@link SDKSessionInfo} onto the platform's
	 * {@link IAgentChatMetadata} shape, minus `chat` — the caller attaches
	 * that from its own exact-chat identity. Pure projection — does not touch
	 * the DB. The per-session overlay no longer contributes any projected
	 * field, so it is not read here; the store is still consulted on the
	 * harness's internal restoration paths (see {@link read}).
	 */
	project(entry: SDKSessionInfo): Omit<IAgentChatMetadata, 'chat'> {
		return {
			startTime: entry.createdAt ?? entry.lastModified,
			modifiedTime: entry.lastModified,
			summary: entry.customTitle ?? entry.summary,
			workingDirectories: entry.cwd ? [URI.file(entry.cwd)] : undefined,
		};
	}
}

function parseAgentSelection(raw: string | undefined): AgentSelection | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const value: { uri?: unknown } = JSON.parse(raw);
		if (value && typeof value === 'object' && typeof value.uri === 'string') {
			return { uri: value.uri };
		}
	} catch {
		// fall through
	}
	return undefined;
}

function parseWorkingDirectories(raw: string | undefined): readonly URI[] | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const value: unknown = JSON.parse(raw);
		if (Array.isArray(value)) {
			const dirs = value.filter((d): d is string => typeof d === 'string').map(d => URI.parse(d));
			return dirs.length > 0 ? dirs : undefined;
		}
	} catch {
		// fall through
	}
	return undefined;
}

function serializeModelSelection(model: ModelSelection): string {
	return JSON.stringify(model);
}

function parseModelSelection(raw: string | undefined): ModelSelection | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const value: { id?: unknown; config?: unknown } | string | number | boolean | null = JSON.parse(raw);
		if (value && typeof value === 'object' && typeof value.id === 'string') {
			const result: ModelSelection = { id: value.id };
			if (value.config && typeof value.config === 'object') {
				const config: Record<string, string> = {};
				for (const [key, configValue] of Object.entries(value.config)) {
					if (typeof configValue === 'string') {
						config[key] = configValue;
					}
				}
				if (Object.keys(config).length > 0) {
					result.config = config;
				}
			}
			return result;
		}
	} catch {
		// Older session metadata stored the raw model id as a plain string.
	}
	return { id: raw };
}
