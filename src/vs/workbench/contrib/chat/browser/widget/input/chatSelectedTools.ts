/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ObservableMap } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatMode } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { UserSelectedTools } from '../../../common/participants/chatAgents.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolSet, isToolSet } from '../../../common/tools/languageModelToolsService.js';
import { agentHostSelectedToolsStorageKey, computeAgentHostToolEnablement, ToolEnablementStates } from '../../../common/tools/chatToolSelectionState.js';
import { PromptFileRewriter } from '../../promptSyntax/promptFileRewriter.js';


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
	private readonly _isSessionsWindow: boolean;

	constructor(
		private readonly _mode: IObservable<IChatMode>,
		private readonly languageModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined>,
		private readonly _isAgentHostSession: IObservable<boolean>,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IStorageService _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._isSessionsWindow = environmentService.isSessionsWindow;

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
			return computeAgentHostToolEnablement(this._toolsService, currentMap, this._currentTools.read(r), lm, r, { isSessionsWindow: this._isSessionsWindow });
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
