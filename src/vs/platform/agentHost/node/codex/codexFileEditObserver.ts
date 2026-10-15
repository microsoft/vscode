/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, type IReference } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { IAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import type { ToolResultFileEditContent } from '../../common/state/sessionState.js';
import { FileEditTracker } from '../shared/fileEditTracker.js';
import { parseCodexApplyPatch, type ICodexPatchFile } from './codexApplyPatch.js';
import type { ICodexEditTrackingHook } from './codexEditTrackingServer.js';

interface ITrackedPatch {
	readonly tracker: FileEditTracker;
	readonly files: readonly ICodexPatchFile[];
	readonly patch: string;
	readonly input: ICodexEditTrackingHook;
	readonly context: ICodexEditContext;
	readonly result: DeferredPromise<ToolResultFileEditContent[]>;
	readonly started: Promise<void>;
	completing: boolean;
	claimed: boolean;
}

export interface ICodexEditContext {
	readonly turnId: string;
	readonly chatUri: string;
	readonly isSubagent: boolean;
	readonly mode?: string;
	readonly clientContext?: IAgentHostClientTelemetryContext;
}

/** Owns a chat's snapshot lifetime and correlates pre/post hooks with file-change completion. */
export class CodexFileEditObserver extends Disposable {
	private readonly _patches = new Map<string, ITrackedPatch>();

	constructor(
		private readonly _storage: string,
		private readonly _owner: () => string,
		private readonly _database: IReference<ISessionDatabase>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentEditAttributionService private readonly _attributionService: IAgentEditAttributionService,
	) {
		super();
		this._register(_database);
	}

	async start(input: ICodexEditTrackingHook, context: ICodexEditContext): Promise<void> {
		await Promise.all([...this._patches.values()].filter(entry => entry.completing).map(entry => entry.result.p));
		if (this._patches.has(input.toolCallId)) {
			throw new Error(`Duplicate Codex edit hook: ${input.toolCallId}`);
		}
		const { files, patch } = parseCodexApplyPatch(input.patch, input.cwd);
		this._logService.trace(`[CodexFileEditObserver] Starting snapshot: turn=${context.turnId} toolCall=${input.toolCallId} tool=${input.toolName} files=${files.length}`);
		// A tracker per invocation isolates concurrent patches that touch the same path.
		const tracker = this._instantiationService.createInstance(FileEditTracker, this._storage, this._owner, this._database.object, CODEX_AGENT_PROVIDER_ID);
		const started = Promise.all(files.map(file => tracker.trackEditStart(file.path, context.mode, file))).then(() => { });
		this._patches.set(input.toolCallId, { tracker, files, patch, input, context, started, result: new DeferredPromise<ToolResultFileEditContent[]>(), completing: false, claimed: false });
		await started;
	}

	async complete(toolCallId: string, patch?: string): Promise<void> {
		const entry = this._patches.get(toolCallId);
		if (!entry || entry.completing || entry.result.isSettled) {
			return;
		}
		entry.completing = true;
		try {
			const applied = patch !== undefined ? parseCodexApplyPatch(patch, entry.input.cwd) : { files: entry.files, patch: entry.patch };
			if (applied.files.length !== entry.files.length || applied.files.some((file, index) =>
				file.path !== entry.files[index].path || file.kind !== entry.files[index].kind || file.originalPath !== entry.files[index].originalPath)) {
				this._logService.warn(`[CodexFileEditObserver] A hook changed the patch's file targets after the before-snapshot: ${toolCallId}`);
				await entry.result.complete([]);
				return;
			}
			await entry.started;
			await Promise.all(entry.files.map(file => entry.tracker.completeEdit(file.path)));
			if (this._store.isDisposed || entry.result.isSettled) {
				await entry.result.complete([]);
				return;
			}
			const edits = await Promise.all(entry.files.map(file => entry.tracker.takeCompletedEdit(
				entry.context.turnId, toolCallId, file.path, 'apply_patch', applied.patch,
				entry.input.model, entry.context.isSubagent, entry.context.clientContext, entry.context.chatUri,
			)));
			this._logService.trace(`[CodexFileEditObserver] Completed snapshot: turn=${entry.context.turnId} toolCall=${toolCallId} files=${edits.filter(edit => edit !== undefined).length}`);
			await entry.result.complete(edits.filter(edit => edit !== undefined));
		} catch (error) {
			await entry.result.complete([]);
			throw error;
		}
	}

	takeResult(toolCallId: string, success: boolean): Promise<ToolResultFileEditContent[]> | undefined {
		const entry = this._patches.get(toolCallId);
		if (!entry) {
			return undefined;
		}
		entry.claimed = success;
		if (!success || entry.input.toolName === 'Bash') {
			void this.complete(toolCallId).catch(error => this._logService.warn('[CodexFileEditObserver] Failed to capture completed patch', error));
		}
		return entry.result.p;
	}

	endTurn(turnId?: string): void {
		for (const [toolCallId, entry] of this._patches) {
			if (turnId !== undefined && entry.input.turnId !== turnId) {
				continue;
			}
			if (!entry.result.isSettled && !entry.completing) {
				if (entry.claimed) {
					this._logService.warn(`[CodexFileEditObserver] Missing post-tool snapshot for ${toolCallId}`);
				}
				void entry.result.complete([]);
			}
			this._patches.delete(toolCallId);
		}
	}

	override dispose(): void {
		this.endTurn();
		void this._attributionService.flushSession(this._storage).catch(error => this._logService.warn('[CodexFileEditObserver] Failed to flush attribution', error));
		super.dispose();
	}
}
