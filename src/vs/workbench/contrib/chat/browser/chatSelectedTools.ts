/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, ObservableMap } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatMode } from '../common/chatModes.js';
import { ChatModeKind } from '../common/constants.js';
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

	private readonly _selectedTools: ObservableMemento<StoredData>;

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

		const storedTools = observableMemento<StoredData>({
			defaultValue: { disabledToolSets: [], disabledTools: [] },
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
			const map = new Map<IToolData | ToolSet, boolean>();

			const currentMode = this._mode.read(r);

			let currentMap = this._sessionStates.get(currentMode.id);
			const modeTools = currentMode.customTools?.read(r);
			if (!currentMap && currentMode.kind === ChatModeKind.Agent && modeTools) {
				currentMap = this._toolsService.toToolAndToolSetEnablementMap(modeTools);
			}
			if (currentMap) {
				for (const tool of this._allTools.read(r)) {
					if (tool.canBeReferencedInPrompt) {
						map.set(tool, currentMap.get(tool) === true); // false if not present
					}
				}
				for (const toolSet of this._toolsService.toolSets.read(r)) {
					map.set(toolSet, currentMap.get(toolSet) === true); // false if not present
				}
			} else {
				const currData = this._selectedTools.read(r);
				const disabledToolSets = new Set(currData.disabledToolSets ?? []);
				const disabledTools = new Set(currData.disabledTools ?? []);

				for (const tool of this._allTools.read(r)) {
					if (tool.canBeReferencedInPrompt) {
						map.set(tool, !disabledTools.has(tool.id));
					}
				}
				for (const toolSet of this._toolsService.toolSets.read(r)) {
					map.set(toolSet, !disabledToolSets.has(toolSet.id));
				}
			}
			return map;
		});
	}

	get entriesScope() {
		const mode = this._mode.get();
		if (this._sessionStates.has(mode.id)) {
			return ToolsScope.Session;
		}
		if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
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
		if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
			// apply directly to mode file.
			this.updateCustomModeTools(mode.uri.get(), enablementMap);
			return;
		}
		const storedData = { disabledToolSets: [] as string[], disabledTools: [] as string[] };
		for (const [item, enabled] of enablementMap) {
			if (!enabled) {
				if (item instanceof ToolSet) {
					storedData.disabledToolSets.push(item.id);
				} else {
					storedData.disabledTools.push(item.id);
				}
			}
		}
		this._selectedTools.set(storedData, undefined);
	}

	async updateCustomModeTools(uri: URI, enablementMap: IToolAndToolSetEnablementMap): Promise<void> {
		await this._instantiationService.createInstance(PromptFileRewriter).openAndRewriteTools(uri, enablementMap, CancellationToken.None);
	}

	public readonly enablementMap: IObservable<ReadonlyMap<IToolData, boolean>> = this.entriesMap.map((map, r) => {
		const result = new Map<IToolData, boolean>();

		const _set = (tool: IToolData, enabled: boolean) => {
			// ONLY disable a tool that isn't enabled yet
			const enabledNow = result.get(tool);
			if (enabled || !enabledNow) {
				result.set(tool, enabled);
			}
		};

		for (const [item, enabled] of map) {
			if (item instanceof ToolSet) {
				for (const tool of item.getTools(r)) {
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
	});
}
