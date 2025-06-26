/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, ObservableMap } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatMode } from '../common/chatModes.js';
import { ChatMode } from '../common/constants.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, ToolSet } from '../common/languageModelToolsService.js';
import { PromptFileRewriter } from './promptSyntax/promptFileRewriter.js';


/**
 * New tools and new tool sources that come in should generally be enabled until
 * the user disables them. To store things, we store only the tool sets and
 * individual tools that were disabled, so the new data sources that come in
 * are enabled, and new tools that come in for data sources not disabled are
 * also enabled.
 */
type StoredData = {
	readonly disabledToolSets?: readonly string[];
	readonly disabledTools?: readonly string[];
};

export enum ToolsScope {
	Global,
	Session,
	Mode
}

export class ChatSelectedTools extends Disposable {

	private readonly _selectedTools: ObservableMemento<IToolAndToolSetEnablementMap>;

	private readonly _sessionStates = new ObservableMap<string, IToolAndToolSetEnablementMap | undefined>();

	private readonly _allTools: IObservable<Readonly<IToolData>[]>;

	/**
	 * All enabled tools and tool sets.
	 */
	readonly entries: IObservable<ReadonlySet<IToolData | ToolSet>> = this.entriesMap.map(function (value) {
		const result = new Set<IToolData | ToolSet>();
		for (const [item, enabled] of value) {
			if (enabled) {
				result.add(item);
			}
		}
		return result;
	});

	constructor(
		private readonly _mode: IObservable<IChatMode>,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IStorageService _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const storedTools = observableMemento<IToolAndToolSetEnablementMap>({
			defaultValue: new Map(),
			toStorage: (value) => {
				const data = {
					disabledToolSets: [] as string[],
					disabledTools: [] as string[],
				};
				for (const [item, enabled] of value) {
					if (!enabled) {
						if (item instanceof ToolSet) {
							data.disabledToolSets.push(item.id);
						} else {
							data.disabledTools.push(item.id);
						}
					}
				}
				return JSON.stringify(data);
			},
			fromStorage: (value) => {
				const obj = JSON.parse(value) as StoredData;
				const map = new Map<IToolData | ToolSet, boolean>();
				if (!obj || !isObject(obj)) {
					return map;
				}
				if (Array.isArray(obj.disabledToolSets)) {
					for (const toolSetId of obj.disabledToolSets) {
						const toolset = this._toolsService.getToolSet(toolSetId);
						if (toolset) {
							map.set(toolset, false);
						}
					}
				}
				if (Array.isArray(obj.disabledTools)) {
					for (const toolId of obj.disabledTools) {
						const tool = this._toolsService.getTool(toolId);
						if (tool) {
							map.set(tool, false);
						}
					}
				}
				return map;
			},
			key: 'chat/selectedTools',
		});


		this._selectedTools = this._store.add(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, _storageService));
		this._allTools = observableFromEvent(_toolsService.onDidChangeTools, () => Array.from(_toolsService.getTools()));
	}

	/**
	 * All tools and tool sets with their enabled state.
	 */
	get entriesMap(): IObservable<IToolAndToolSetEnablementMap> {
		return derived(r => {
			const currentMode = this._mode.read(r);

			let currentMap = this._sessionStates.get(currentMode.id);
			let defaultEnablement = false;
			if (!currentMap && currentMode.kind === ChatMode.Agent && currentMode.customTools) {
				currentMap = this._toolsService.toToolAndToolSetEnablementMap(new Set(currentMode.customTools));
			}
			if (!currentMap) {
				currentMap = this._selectedTools.read(r);
				defaultEnablement = true;
			}

			// create a complete map of all tools and tool sets
			const map = new Map<IToolData | ToolSet, boolean>();
			const tools = this._allTools.read(r).filter(t => t.canBeReferencedInPrompt);
			for (const tool of tools) {
				map.set(tool, currentMap.get(tool) ?? defaultEnablement);
			}
			const toolSets = this._toolsService.toolSets.read(r);
			for (const toolSet of toolSets) {
				map.set(toolSet, currentMap.get(toolSet) ?? defaultEnablement);
			}
			return map;
		});
	}

	get entriesScope() {
		const mode = this._mode.get();
		if (this._sessionStates.has(mode.id)) {
			return ToolsScope.Session;
		}
		if (mode.kind === ChatMode.Agent && mode.customTools && mode.uri) {
			return ToolsScope.Mode;
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
		if (sessionOnly) {
			this._sessionStates.set(mode.id, enablementMap);
			return;
		}
		if (this._sessionStates.has(mode.id)) {
			this._sessionStates.set(mode.id, enablementMap);
			return;
		}
		if (mode.kind === ChatMode.Agent && mode.customTools && mode.uri) {
			// apply directly to mode.
			this.updateCustomModeTools(mode.uri, enablementMap);
			return;
		}
		this._selectedTools.set(enablementMap, undefined);
	}

	async updateCustomModeTools(uri: URI, enablementMap: IToolAndToolSetEnablementMap): Promise<void> {
		await this._instantiationService.createInstance(PromptFileRewriter).openAndRewriteTools(uri, enablementMap, CancellationToken.None);
	}

	asEnablementMap(): Map<IToolData, boolean> {
		const result = new Map<IToolData, boolean>();
		const map = this.entriesMap.get();

		const _set = (tool: IToolData, enabled: boolean) => {
			// ONLY disable a tool that isn't enabled yet
			const enabledNow = result.get(tool);
			if (enabled || !enabledNow) {
				result.set(tool, enabled);
			}
		};

		for (const [item, enabled] of map) {
			if (item instanceof ToolSet) {
				for (const tool of item.getTools()) {
					// Tools from an mcp tool set are explicitly enabled/disabled under the tool set.
					// Other toolsets don't show individual tools under the tool set and enablement just follows the toolset.
					const toolEnabled = item.source.type === 'mcp' ?
						map.get(tool) ?? enabled :
						enabled;
					_set(tool, toolEnabled);
				}
			} else {
				if (item.canBeReferencedInPrompt) {
					_set(item, enabled);
				}
			}
		}
		return result;
	}
}
