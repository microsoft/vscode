/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableFromEvent, ObservableMap } from '../../../../../../base/common/observable.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IChatMode } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { UserSelectedTools } from '../../../common/participants/chatAgents.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolSet, isToolSet } from '../../../common/tools/languageModelToolsService.js';
import { PromptFileRewriter } from '../../promptSyntax/promptFileRewriter.js';


// todo@connor4312/bhavyaus: make tools key off displayName so model-specific tool
// enablement can stick between models with different underlying tool definitions
export type ToolEnablementStates = {
	readonly toolSets: ReadonlyMap<string, boolean>;
	readonly tools: ReadonlyMap<string, boolean>;
};

type StoredDataV2 = {
	readonly version: 2;
	readonly toolSetEntries: [string, boolean][];
	readonly toolEntries: [string, boolean][];
};

type StoredDataV1 = {
	readonly version: undefined;
	readonly disabledToolSets?: string[];
	readonly disabledTools?: string[];
};

namespace ToolEnablementStates {
	export function fromMap(map: IToolAndToolSetEnablementMap): ToolEnablementStates {
		const toolSets: Map<string, boolean> = new Map(), tools: Map<string, boolean> = new Map();
		for (const [entry, enabled] of map.entries()) {
			if (isToolSet(entry)) {
				toolSets.set(entry.id, enabled);
			} else {
				tools.set(entry.id, enabled);
			}
		}
		return { toolSets, tools };
	}

	function isStoredDataV1(data: StoredDataV1 | StoredDataV2 | undefined): data is StoredDataV1 {
		return isObject(data) && data.version === undefined
			&& (data.disabledTools === undefined || Array.isArray(data.disabledTools))
			&& (data.disabledToolSets === undefined || Array.isArray(data.disabledToolSets));
	}

	function isStoredDataV2(data: StoredDataV1 | StoredDataV2 | undefined): data is StoredDataV2 {
		return isObject(data) && data.version === 2 && Array.isArray(data.toolSetEntries) && Array.isArray(data.toolEntries);
	}

	export function fromStorage(storage: string): ToolEnablementStates {
		try {
			const parsed = JSON.parse(storage);
			if (isStoredDataV2(parsed)) {
				return { toolSets: new Map(parsed.toolSetEntries), tools: new Map(parsed.toolEntries) };
			} else if (isStoredDataV1(parsed)) {
				const toolSetEntries = parsed.disabledToolSets?.map(id => [id, false] as [string, boolean]);
				const toolEntries = parsed.disabledTools?.map(id => [id, false] as [string, boolean]);
				return { toolSets: new Map(toolSetEntries), tools: new Map(toolEntries) };
			}
		} catch {
			// ignore
		}
		// invalid data
		return { toolSets: new Map(), tools: new Map() };
	}

	export function toStorage(state: ToolEnablementStates): string {
		const storageData: StoredDataV2 = {
			version: 2,
			toolSetEntries: Array.from(state.toolSets.entries()),
			toolEntries: Array.from(state.tools.entries())
		};
		return JSON.stringify(storageData);
	}
}

const agentHostSelectedToolsStorageKey = 'chat/agentHost/selectedTools';

/**
 * Read-only observable over the agent-host tool selection that reacts to *all* storage writes (local and external).
 *
 * {@link chatSelectedToolsAgentHostMemento} (like every {@link observableMemento}) only refreshes from storage on
 * external changes, so two memento instances in the same window do not see each other's writes. Long-lived consumers
 * that must reflect the picker's edits live (e.g. the agent-host active client service) should use this instead.
 */
export function observableAgentHostToolsState(storageService: IStorageService, store: DisposableStore): IObservable<ToolEnablementStates> {
	const read = (): ToolEnablementStates => {
		const raw = storageService.get(agentHostSelectedToolsStorageKey, StorageScope.PROFILE);
		return raw !== undefined ? ToolEnablementStates.fromStorage(raw) : { toolSets: new Map(), tools: new Map() };
	};
	return observableFromEvent(
		storageService.onDidChangeValue(StorageScope.PROFILE, agentHostSelectedToolsStorageKey, store),
		() => read()
	);
}

/**
 * Tool reference names whose capability an agent-host backend (Copilot SDK / Claude / Codex) already provides natively
 * (file read/edit, literal file/text search, shell execution, web fetch). They stay available in the picker but default
 * OFF for agent-host sessions so the model isn't offered the same capability twice.
 *
 * VS Code tools with no backend equivalent are intentionally excluded so they stay on by default — notably `codebase`
 * (semantic/embeddings search, which the backend's literal grep/glob cannot replace) and the integrated-terminal
 * context tools `terminalLastCommand` / `terminalSelection` (the backend's shell tool only executes commands).
 */
const agentHostBackendToolReferenceNames: ReadonlySet<string> = new Set([
	// File read / navigation
	'readFile', 'listDirectory',
	// File edit / create
	'applyPatch', 'insertEdit', 'replaceString', 'multiReplaceString', 'createFile', 'createDirectory', 'editFiles',
	// Literal file / text search
	'fileSearch', 'textSearch',
	// Terminal / shell execution
	'runInTerminal', 'getTerminalOutput', 'sendToTerminal', 'killTerminal',
	// Web fetch
	'fetch',
]);

function isAgentHostDefaultDisabled(tool: IToolData): boolean {
	return tool.toolReferenceName !== undefined && agentHostBackendToolReferenceNames.has(tool.toolReferenceName);
}

/**
 * Computes tool/tool-set enablement for an agent-host session. Like the standard resolution but backend-provided tools
 * default OFF (opt-in). The result is kept consistent with the chat tool picker's `setChecked || perToolTrue` rendering:
 * a tool-set's value is the AND of its members, and a member is enabled only by an explicit choice (its own, or its set
 * being explicitly enabled) — a set being on by default does not force its backend-provided members on.
 */
export function computeAgentHostToolEnablement(toolsService: ILanguageModelToolsService, state: ToolEnablementStates, tools: readonly IToolData[], model: ILanguageModelChatMetadata | undefined, reader: IReader | undefined): IToolAndToolSetEnablementMap {
	const map = new Map<IToolData | IToolSet, boolean>();
	const isEnabled = (tool: IToolData, toolSetId: string | undefined): boolean => {
		if (toolSetId !== undefined) {
			const toolSetState = state.toolSets.get(toolSetId);
			if (toolSetState === true) {
				return true; // an explicitly enabled tool set turns on all of its members
			}
			if (toolSetState === false) {
				return state.tools.get(tool.id) === true; // an explicitly disabled tool set hides all members unless opted in
			}
		}
		const stored = state.tools.get(tool.id);
		if (stored !== undefined) {
			return stored;
		}
		return !isAgentHostDefaultDisabled(tool);
	};
	for (const tool of tools) {
		if (tool.canBeReferencedInPrompt) {
			map.set(tool, isEnabled(tool, undefined));
		}
	}
	for (const toolSet of toolsService.getToolSetsForModel(model, reader)) {
		let allEnabled = true;
		for (const member of toolSet.getTools(reader)) {
			const enabled = isEnabled(member, toolSet.id);
			map.set(member, enabled);
			allEnabled &&= enabled;
		}
		map.set(toolSet, allEnabled);
	}
	return map;
}

export enum ToolsScope {
	Global,
	Session,
	Agent,
	Agent_ReadOnly,
	AgentHost,
}

export class ChatSelectedTools extends Disposable {

	private readonly _globalState: ObservableMemento<ToolEnablementStates>;
	private readonly _agentHostState: ObservableMemento<ToolEnablementStates>;

	private readonly _sessionStates = new ObservableMap<string, ToolEnablementStates | undefined>();
	private readonly _currentTools: IObservable<readonly IToolData[]>;

	constructor(
		private readonly _mode: IObservable<IChatMode>,
		private readonly languageModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined>,
		private readonly _isAgentHostSession: IObservable<boolean>,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IStorageService _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const globalStateMemento = observableMemento<ToolEnablementStates>({
			key: 'chat/selectedTools',
			defaultValue: { toolSets: new Map(), tools: new Map() },
			fromStorage: ToolEnablementStates.fromStorage,
			toStorage: ToolEnablementStates.toStorage
		});
		const agentHostStateMemento = observableMemento<ToolEnablementStates>({
			key: agentHostSelectedToolsStorageKey,
			defaultValue: { toolSets: new Map(), tools: new Map() },
			fromStorage: ToolEnablementStates.fromStorage,
			toStorage: ToolEnablementStates.toStorage
		});

		this._globalState = this._store.add(globalStateMemento(StorageScope.PROFILE, StorageTarget.MACHINE, _storageService));
		this._agentHostState = this._store.add(agentHostStateMemento(StorageScope.PROFILE, StorageTarget.MACHINE, _storageService));
		this._currentTools = languageModel.map(lm =>
			_toolsService.observeTools(lm?.metadata)).map((o, r) => o.read(r));
	}

	/**
	 * All tools and tool sets with their enabled state.
	 * Tools are filtered based on the current model context.
	 */
	public readonly entriesMap: IObservable<IToolAndToolSetEnablementMap> = derived(r => {
		const map = new Map<IToolData | IToolSet, boolean>();
		const lm = this.languageModel.read(r)?.metadata;
		const isAgentHost = this._isAgentHostSession.read(r);

		// look up the tools in the hierarchy: session > mode > global
		const currentMode = this._mode.read(r);
		let currentMap = this._sessionStates.observable.read(r).get(currentMode.id);
		if (!currentMap && !isAgentHost && currentMode.kind === ChatModeKind.Agent) {
			const modeTools = currentMode.customTools?.read(r);
			if (modeTools) {
				currentMap = ToolEnablementStates.fromMap(this._toolsService.toToolAndToolSetEnablementMap(modeTools, lm));
			}
		}
		if (!currentMap) {
			currentMap = isAgentHost ? this._agentHostState.read(r) : this._globalState.read(r);
		}

		if (isAgentHost) {
			// Agent-host sessions default backend-provided tools off; resolution lives in a shared helper so the
			// exposed client tools stay in sync with what the picker shows.
			return computeAgentHostToolEnablement(this._toolsService, currentMap, this._currentTools.read(r), lm, r);
		}

		// Use getTools with contextKeyService to filter tools by current model
		for (const tool of this._currentTools.read(r)) {
			if (tool.canBeReferencedInPrompt) {
				map.set(tool, currentMap.tools.get(tool.id) !== false); // if unknown, it's enabled
			}
		}
		for (const toolSet of this._toolsService.getToolSetsForModel(lm, r)) {
			const toolSetEnabled = currentMap.toolSets.get(toolSet.id) !== false; // if unknown, it's enabled
			map.set(toolSet, toolSetEnabled);
			for (const tool of toolSet.getTools(r)) {
				map.set(tool, toolSetEnabled || currentMap.tools.get(tool.id) === true); // if unknown, use toolSetEnabled
			}
		}
		return map;
	});

	public readonly userSelectedTools: IObservable<UserSelectedTools> = derived(r => {
		// extract a map of tool ids
		const result: UserSelectedTools = {};
		const map = this.entriesMap.read(r);
		for (const [item, enabled] of map) {
			if (!isToolSet(item)) {
				result[item.id] = enabled;
			}
		}
		return result;
	});

	get entriesScope() {
		const mode = this._mode.get();
		if (this._sessionStates.has(mode.id)) {
			return ToolsScope.Session;
		}
		if (this._isAgentHostSession.get()) {
			return ToolsScope.AgentHost;
		}
		if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
			return mode.source?.storage !== PromptsStorage.extension ? ToolsScope.Agent : ToolsScope.Agent_ReadOnly;
		}
		return ToolsScope.Global;
	}

	get currentMode(): IChatMode {
		return this._mode.get();
	}

	resetSessionEnablementState() {
		const mode = this._mode.get();
		this._sessionStates.delete(mode.id);
	}

	set(enablementMap: IToolAndToolSetEnablementMap, sessionOnly: boolean): void {
		const mode = this._mode.get();
		if (sessionOnly || this._sessionStates.has(mode.id)) {
			this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
			return;
		}
		if (this._isAgentHostSession.get()) {
			this._agentHostState.set(ToolEnablementStates.fromMap(enablementMap), undefined);
			return;
		}
		if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
			if (mode.source?.storage !== PromptsStorage.extension) {
				// apply directly to mode file.
				this.updateCustomModeTools(mode.uri.get(), enablementMap);
				return;
			} else {
				// can not write to extensions, store
				this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
				return;
			}
		}
		this._globalState.set(ToolEnablementStates.fromMap(enablementMap), undefined);
	}

	private async updateCustomModeTools(uri: URI, enablementMap: IToolAndToolSetEnablementMap): Promise<void> {
		await this._instantiationService.createInstance(PromptFileRewriter).openAndRewriteTools(uri, enablementMap, CancellationToken.None);
	}
}
