/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

export const IAgentHostToolSetEnablementService = createDecorator<IAgentHostToolSetEnablementService>('agentHostToolSetEnablementService');

/**
 * The Copilot CLI agent-host session type. Tool enablement is scoped per session type; this is the
 * only target for the Chat Customizations → Tools section today.
 */
export const AGENT_HOST_COPILOT_CLI_SESSION_TYPE = 'agent-host-copilotcli';

/**
 * Tool / tool-set enablement state. Both maps are keyed by id and store only deviations from the
 * default ("enabled"). A tool's effective state resolves child → parent → default:
 * `tools[toolId] ?? toolSets[setId] ?? true`. Storing the tool-set default (rather than every
 * member) lets a disabled group also cover member tools that register later.
 */
export interface IToolEnablementState {
	readonly toolSets: ReadonlyMap<string, boolean>;
	readonly tools: ReadonlyMap<string, boolean>;
}

export type TriState = boolean | 'mixed';

/** Whether `toolId`, as a member of `toolSetId`, is effectively enabled. */
export function isToolEnabledInSet(state: IToolEnablementState, toolSetId: string, toolId: string): boolean {
	return state.tools.get(toolId) ?? state.toolSets.get(toolSetId) ?? true;
}

/** Aggregate tri-state of a tool set, derived from its member tools' effective states. */
export function getToolSetTriState(state: IToolEnablementState, toolSetId: string, toolIds: readonly string[]): TriState {
	let anyOn = false;
	let anyOff = false;
	for (const toolId of toolIds) {
		if (isToolEnabledInSet(state, toolSetId, toolId)) {
			anyOn = true;
		} else {
			anyOff = true;
		}
		if (anyOn && anyOff) {
			return 'mixed';
		}
	}
	return anyOn;
}

/** The subset of a tool set needed to count its enabled tools. {@link IToolSet} satisfies this shape. */
export interface ICountableToolSet {
	readonly id: string;
	readonly deprecated?: boolean;
	getTools(reader?: IReader): Iterable<{ readonly id: string }>;
}

/** Counts the enabled tools across the non-deprecated tool sets surfaced in Chat Customizations → Tools. */
export function countEnabledCustomizationTools(toolSets: Iterable<ICountableToolSet>, state: IToolEnablementState, reader?: IReader): number {
	const enabled = new Set<string>();
	for (const ts of toolSets) {
		if (ts.deprecated) {
			continue;
		}
		for (const tool of ts.getTools(reader)) {
			if (isToolEnabledInSet(state, ts.id, tool.id)) {
				enabled.add(tool.id);
			}
		}
	}
	return enabled.size;
}

/**
 * Per-session-type tool / tool-set enablement for the Chat Customizations → Tools section,
 * persisted profile-wide. Settings are consumed by the agent host (the only target for Tools
 * customizations today).
 */
export interface IAgentHostToolSetEnablementService {
	readonly _serviceBrand: undefined;

	/** Observable enablement state for `sessionType`. Missing keys default to enabled. */
	observe(sessionType: string): IObservable<IToolEnablementState>;

	/** Current enablement state for `sessionType`. */
	getState(sessionType: string): IToolEnablementState;

	/** Enable/disable a whole tool set; clears any per-tool overrides for its members. */
	setToolSetEnabled(sessionType: string, toolSetId: string, toolIds: readonly string[], enabled: boolean): void;

	/** Enable/disable a single tool within `toolSetId`. */
	setToolEnabled(sessionType: string, toolSetId: string, toolId: string, enabled: boolean): void;
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
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY, storeForListener)(() => {
			this._state.set(this._load(), undefined);
		}));
	}

	observe(sessionType: string): IObservable<IToolEnablementState> {
		return derived(reader => this._state.read(reader).get(sessionType) ?? EMPTY_STATE);
	}

	getState(sessionType: string): IToolEnablementState {
		return this._state.get().get(sessionType) ?? EMPTY_STATE;
	}

	setToolSetEnabled(sessionType: string, toolSetId: string, toolIds: readonly string[], enabled: boolean): void {
		const state = this.getState(sessionType);
		const toolSets = new Map(state.toolSets);
		const tools = new Map(state.tools);
		// Default is enabled, so an enabled set is the absence of an entry.
		if (enabled) {
			toolSets.delete(toolSetId);
		} else {
			toolSets.set(toolSetId, false);
		}
		// The set toggle is authoritative: drop any per-tool overrides so members follow it.
		for (const toolId of toolIds) {
			tools.delete(toolId);
		}
		this._setState(sessionType, { toolSets, tools });
	}

	setToolEnabled(sessionType: string, toolSetId: string, toolId: string, enabled: boolean): void {
		const state = this.getState(sessionType);
		const tools = new Map(state.tools);
		// Keep storage sparse: only record overrides that differ from the set's default.
		const setDefault = state.toolSets.get(toolSetId) ?? true;
		if (enabled === setDefault) {
			tools.delete(toolId);
		} else {
			tools.set(toolId, enabled);
		}
		this._setState(sessionType, { toolSets: state.toolSets, tools });
	}

	private _setState(sessionType: string, next: IToolEnablementState): void {
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
