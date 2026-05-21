/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { URI } from '../../../../base/common/uri.js';
import { ClaudePermissionMode, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { AgentProvider, AgentSession, IAgentSessionMetadata } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';

/**
 * Read view of Claude's per-session DB overlay. SDK-supplied fields
 * (summary, cwd, timestamps) live on {@link SDKSessionInfo} and are
 * combined with the overlay in {@link ClaudeSessionMetadataStore.project}.
 */
export interface IClaudeSessionOverlay {
	readonly customizationDirectory?: URI;
	readonly model?: ModelSelection;
	readonly permissionMode?: ClaudePermissionMode;
}

/**
 * Write view: any subset of the overlay fields. Fields left `undefined`
 * are not touched (only-write-on-defined semantics).
 */
export interface IClaudeSessionOverlayUpdate {
	readonly customizationDirectory?: URI;
	readonly model?: ModelSelection;
	readonly permissionMode?: ClaudePermissionMode;
}

/**
 * Owns Claude's per-session metadata layer:
 *
 * - the three `_META_*` DB keys,
 * - the {@link ModelSelection} JSON codec used to persist the parallel
 *   `{ id, config }` shape,
 * - the read/write helpers that open a per-call DB ref,
 * - the projection from {@link SDKSessionInfo} + overlay onto the
 *   platform's {@link IAgentSessionMetadata} shape.
 *
 * One instance per {@link ClaudeAgent}: the {@link AgentProvider} id
 * passed at construction is the one stamped on every projected URI.
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

	constructor(
		private readonly _provider: AgentProvider,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

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
			const [customizationDirectoryRaw, modelRaw, permissionModeRaw] = await Promise.all([
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_MODEL),
				ref.object.getMetadata(ClaudeSessionMetadataStore.KEY_PERMISSION_MODE),
			]);
			return {
				customizationDirectory: customizationDirectoryRaw ? URI.parse(customizationDirectoryRaw) : undefined,
				model: parseModelSelection(modelRaw),
				permissionMode: narrowClaudePermissionMode(permissionModeRaw),
			};
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Combine an SDK-supplied {@link SDKSessionInfo} with this store's
	 * read overlay into the platform's {@link IAgentSessionMetadata} shape.
	 * Pure projection — does not touch the DB.
	 */
	project(entry: SDKSessionInfo, overlay: IClaudeSessionOverlay): IAgentSessionMetadata {
		return {
			session: AgentSession.uri(this._provider, entry.sessionId),
			startTime: entry.createdAt ?? entry.lastModified,
			modifiedTime: entry.lastModified,
			summary: entry.customTitle ?? entry.summary,
			workingDirectory: entry.cwd ? URI.file(entry.cwd) : undefined,
			customizationDirectory: overlay.customizationDirectory,
			model: overlay.model,
		};
	}
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
