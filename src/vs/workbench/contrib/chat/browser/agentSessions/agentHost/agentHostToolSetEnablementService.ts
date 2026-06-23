/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IToolEnablementState } from '../../widget/input/toolEnablementHelpers.js';

export const IAgentHostToolSetEnablementService = createDecorator<IAgentHostToolSetEnablementService>('agentHostToolSetEnablementService');

/**
 * The Copilot CLI agent-host session type. Tool enablement in the Agents window is scoped
 * per session type; this is the primary one and is used for the Agents-window tool counters.
 */
export const AGENT_HOST_COPILOT_CLI_SESSION_TYPE = 'agent-host-copilotcli';

/**
 * Per-session-type tool / tool-set enablement, mirroring how plugins/skills/instructions/MCP
 * customizations are scoped per session type today.
 *
 * The state shape matches {@link ChatSelectedTools} (a `toolSets` map and a `tools` map);
 * default is enabled, so only explicit `false` (and per-tool `true` overrides) are persisted.
 */
export interface IAgentHostToolSetEnablementService {
	readonly _serviceBrand: undefined;

	/** Observable enablement state for `sessionType`. Missing keys default to enabled. */
	observe(sessionType: string): IObservable<IToolEnablementState>;

	/** Returns the current enablement state for `sessionType`. */
	getState(sessionType: string): IToolEnablementState;

	/** Replaces the enablement state for `sessionType`. */
	setState(sessionType: string, next: IToolEnablementState): void;
}

const STORAGE_KEY = 'chat.agentHost.toolSetEnablement';
const EMPTY_STATE: IToolEnablementState = { toolSets: new Map(), tools: new Map() };

interface IStoredShape {
	readonly [sessionType: string]: {
		readonly toolSets?: { readonly [id: string]: boolean };
		readonly tools?: { readonly [id: string]: boolean };
	};
}

export class AgentHostToolSetEnablementService extends Disposable implements IAgentHostToolSetEnablementService {
	declare readonly _serviceBrand: undefined;

	private readonly _state: ISettableObservable<ReadonlyMap<string, IToolEnablementState>>;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._state = observableValue('agentHostToolSetEnablement', this._load());
		const storeForListener = this._register(new DisposableStore());
		this._storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY, storeForListener)(() => {
			this._state.set(this._load(), undefined);
		});
	}

	observe(sessionType: string): IObservable<IToolEnablementState> {
		return derived(reader => this._state.read(reader).get(sessionType) ?? EMPTY_STATE);
	}

	getState(sessionType: string): IToolEnablementState {
		return this._state.get().get(sessionType) ?? EMPTY_STATE;
	}

	setState(sessionType: string, next: IToolEnablementState): void {
		const current = new Map(this._state.get());
		if (next.toolSets.size === 0 && next.tools.size === 0) {
			current.delete(sessionType);
		} else {
			current.set(sessionType, { toolSets: new Map(next.toolSets), tools: new Map(next.tools) });
		}
		this._state.set(current, undefined);
		this._save(current);
	}

	private _load(): ReadonlyMap<string, IToolEnablementState> {
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return new Map();
		}
		try {
			const parsed = JSON.parse(raw) as IStoredShape;
			const out = new Map<string, IToolEnablementState>();
			for (const [sessionType, entry] of Object.entries(parsed)) {
				const toolSets = new Map<string, boolean>();
				const tools = new Map<string, boolean>();
				for (const [id, value] of Object.entries(entry.toolSets ?? {})) {
					toolSets.set(id, value);
				}
				for (const [id, value] of Object.entries(entry.tools ?? {})) {
					tools.set(id, value);
				}
				if (toolSets.size > 0 || tools.size > 0) {
					out.set(sessionType, { toolSets, tools });
				}
			}
			return out;
		} catch {
			return new Map();
		}
	}

	private _save(state: ReadonlyMap<string, IToolEnablementState>): void {
		if (state.size === 0) {
			this._storageService.remove(STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		const out: Record<string, { toolSets: Record<string, boolean>; tools: Record<string, boolean> }> = {};
		for (const [sessionType, entry] of state) {
			out[sessionType] = {
				toolSets: Object.fromEntries(entry.toolSets),
				tools: Object.fromEntries(entry.tools),
			};
		}
		this._storageService.store(STORAGE_KEY, JSON.stringify(out), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

registerSingleton(IAgentHostToolSetEnablementService, AgentHostToolSetEnablementService, InstantiationType.Delayed);
