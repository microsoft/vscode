/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ObservableMap } from '../../../../../../base/common/observable.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { UserSelectedTools } from '../../../common/participants/chatAgents.js';
import { IChatMode } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, ToolSet } from '../../../common/tools/languageModelToolsService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptFileRewriter } from '../../promptSyntax/promptFileRewriter.js';


type ToolEnablementStates = {
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
			if (entry instanceof ToolSet) {
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

export enum ToolsScope {
	Global,
	Session,
	Agent,
	Agent_ReadOnly,
}

export class ChatSelectedTools extends Disposable {

	private readonly _globalState: ObservableMemento<ToolEnablementStates>;

	private readonly _sessionStates = new ObservableMap<string, ToolEnablementStates | undefined>();

	constructor(
		private readonly _mode: IObservable<IChatMode>,
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

		this._globalState = this._store.add(globalStateMemento(StorageScope.PROFILE, StorageTarget.MACHINE, _storageService));
	}

	/**
	 * All tools and tool sets with their enabled state.
	 */
	public readonly entriesMap: IObservable<IToolAndToolSetEnablementMap> = derived(r => {
		const map = new Map<IToolData | ToolSet, boolean>();

		// look up the tools in the hierarchy: session > mode > global
		const currentMode = this._mode.read(r);
		let currentMap = this._sessionStates.observable.read(r).get(currentMode.id);
		if (!currentMap && currentMode.kind === ChatModeKind.Agent) {
			const modeTools = currentMode.customTools?.read(r);
			if (modeTools) {
				const target = currentMode.target?.read(r);
				currentMap = ToolEnablementStates.fromMap(this._toolsService.toToolAndToolSetEnablementMap(modeTools, target));
			}
		}
		if (!currentMap) {
			currentMap = this._globalState.read(r);
		}
		for (const tool of this._toolsService.toolsObservable.read(r)) {
			if (tool.canBeReferencedInPrompt) {
				map.set(tool, currentMap.tools.get(tool.id) !== false); // if unknown, it's enabled
			}
		}
		for (const toolSet of this._toolsService.toolSets.read(r)) {
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
			if (!(item instanceof ToolSet)) {
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
