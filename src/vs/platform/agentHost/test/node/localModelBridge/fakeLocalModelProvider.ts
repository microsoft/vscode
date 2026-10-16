/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotRequestHandler } from '@github/copilot-sdk';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { NullLogService } from '../../../../log/common/log.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { LOCAL_MODEL_SENTINEL_PROVIDER_NAME, type ILocalModelStatusV1, type ILocalTurnExecution } from '../../../common/localModel.js';
import type { ProtectedResourceMetadata } from '../../../common/state/protocol/state.js';
import type { ILocalModelDirectRequestWait, ILocalModelLiveConfig, ILocalModelModelRow, ILocalModelProvider, ILocalModelSessionConfigContribution } from '../../../node/copilot/localModelBridge/localModelProvider.js';
import { createNodeShimLocalModelProviderHost, type IShimLocalModelProviderHost } from '../../../node/copilot/localModelBridge/shim/shimLocalModelProvider.js';

/** A direct-selection row for MAI, as the shim would publish it. */
export const MAI_ROW: ILocalModelModelRow = {
	id: 'mai-code-1.1-flash',
	name: 'Example Flash 1.0',
	familyId: 'mai-code-1.1-flash-local',
	contentId: 'mai-content-1',
	active: true,
	maxContextWindow: 262144,
	maxPromptTokens: 180224,
	maxOutputTokens: 81920,
};

/** The sentinel config the shim contributes for {@link rows}. */
export function createSentinelContribution(rows: readonly ILocalModelModelRow[]): ILocalModelSessionConfigContribution {
	return rows.length === 0 ? { providers: [], models: [] } : {
		providers: [{ name: LOCAL_MODEL_SENTINEL_PROVIDER_NAME, type: 'openai', wireApi: 'completions', baseUrl: 'http://on-device.vscode.invalid/v1', modelProvider: 'llama_cpp' }],
		models: rows.map(row => ({ id: row.id, provider: LOCAL_MODEL_SENTINEL_PROVIDER_NAME, name: row.name, maxContextWindowTokens: row.maxContextWindow, maxPromptTokens: row.maxPromptTokens, maxOutputTokens: row.maxOutputTokens })),
	};
}

/**
 * Scriptable {@link ILocalModelProvider} for Agent Host session tests. Records
 * every call the session code makes in {@link calls}; transitions resolve.
 */
export class FakeLocalModelProvider extends Disposable implements ILocalModelProvider {

	readonly status = observableValue<ILocalModelStatusV1>(this, { schemaVersion: 1, device: { confidence: 'unknown' }, runtime: {}, catalog: { state: 'ready', registries: { azureml: 'ready' } }, families: [], useInAuto: true });
	private readonly _onDidChangeModelRows = this._register(new Emitter<void>());
	readonly onDidChangeModelRows = this._onDidChangeModelRows.event;
	private readonly _onDidDirectRequestWait = this._register(new Emitter<ILocalModelDirectRequestWait>());
	readonly onDidDirectRequestWait = this._onDidDirectRequestWait.event;

	readonly calls: string[] = [];
	/** The aggregate {@link endTurn} returns. */
	turnExecution: ILocalTurnExecution | undefined;

	private _rows: readonly ILocalModelModelRow[];
	private _generation = 0;

	constructor(rows: readonly ILocalModelModelRow[] = [], readonly requestHandler: CopilotRequestHandler | undefined = undefined) {
		super();
		this._rows = rows;
	}

	/** Replaces the installed rows and fires {@link onDidChangeModelRows}. */
	setRows(rows: readonly ILocalModelModelRow[]): void {
		this._rows = rows;
		this._onDidChangeModelRows.fire();
	}

	/** Reports a direct request waiting for its model or a slot, as the request handler does. */
	fireDirectRequestWait(event: ILocalModelDirectRequestWait): void {
		this._onDidDirectRequestWait.fire(event);
	}

	getModelRows(): readonly ILocalModelModelRow[] {
		return this._rows;
	}

	contributeSessionConfig(): ILocalModelSessionConfigContribution {
		return createSentinelContribution(this._rows);
	}

	beginTurn(sessionId: string): number {
		const generation = ++this._generation;
		this.calls.push(`beginTurn:${sessionId}:${generation}`);
		return generation;
	}

	endTurn(sessionId: string, generation: number): ILocalTurnExecution | undefined {
		this.calls.push(`endTurn:${sessionId}:${generation}`);
		return this.turnExecution;
	}

	setSessionDirectFamily(sessionId: string, familyId: string | undefined): void {
		this.calls.push(`setSessionDirectFamily:${sessionId}:${familyId ?? '-'}`);
	}

	onAutoSessionStarted(): void {
		this.calls.push('onAutoSessionStarted');
	}

	updateLiveConfig(config: ILocalModelLiveConfig): void {
		this.calls.push(`updateLiveConfig:${config.enabled}`);
	}

	async setUp(): Promise<void> { }
	async update(): Promise<void> { }
	async remove(): Promise<void> { }
	cancel(): void { }
	pause(): void { }
	async resume(): Promise<void> { }
	async retry(): Promise<void> { }
	async makeActive(): Promise<void> { }
	async setContextSize(familyId: string, contextTokens: number): Promise<void> {
		this.calls.push(`setContextSize:${familyId}:${contextTokens}`);
	}
	async start(): Promise<void> { }
	async stop(): Promise<void> { }
	async stopPrevious(): Promise<void> { }
	async updateRuntime(): Promise<void> { }
	async refreshCatalog(): Promise<void> { }
	contributeProtectedResources(): readonly ProtectedResourceMetadata[] { return []; }
	authenticate(): boolean { return false; }
	onAccountChanged(): void { }
}

/**
 * A {@link IShimLocalModelProviderHost} whose first discovery step (the device
 * probe) never completes, so a `ShimLocalModelProvider` on it never detects,
 * downloads or launches anything. For tests of the provider's configuration,
 * protected resources and request handler installation.
 */
export function createIdleShimLocalModelProviderHost(): IShimLocalModelProviderHost {
	const storage = new Map<string, unknown>();
	return {
		...createNodeShimLocalModelProviderHost({
			requestService: { request: () => Promise.reject(new Error('No network in tests')) },
			storage: {
				get: <T>(key: string) => storage.get(key) as T | undefined,
				set: <T>(key: string, value: T) => { storage.set(key, value); },
			},
			telemetry: NullTelemetryService,
			log: new NullLogService(),
			copilotHome: '/idle-local-model/copilot',
			userDataPath: '/idle-local-model/user-data',
			homeDir: '/idle-local-model/home',
			tempDir: '/idle-local-model/temp',
			resolveCapiBaseUrls: async () => [],
			onDidChangeCapiAccounts: Event.None,
			productVersion: '1.2.3',
			env: {},
		}),
		gpuProbe: { probe: () => new Promise(() => { }) },
	};
}
