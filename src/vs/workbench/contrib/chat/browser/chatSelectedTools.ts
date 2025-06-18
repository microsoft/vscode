/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, ObservableMap, observableValue, transaction } from '../../../../base/common/observable.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatMode } from '../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolSet } from '../common/languageModelToolsService.js';


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

const storedTools = observableMemento<StoredData>({
	defaultValue: {},
	key: 'chat/selectedTools',
});

export class ChatSelectedTools extends Disposable {

	private readonly _selectedTools: ObservableMemento<StoredData>;

	private readonly _sessionSelectedTools = observableValue<StoredData>(this, {});

	private readonly _allTools: IObservable<Readonly<IToolData>[]>;

	/**
	 * All tools and tool sets with their enabled state.
	 */
	readonly entriesMap = new ObservableMap<ToolSet | IToolData, boolean>();

	/**
	 * All enabled tools and tool sets.
	 */
	readonly entries: IObservable<ReadonlySet<IToolData | ToolSet>> = this.entriesMap.observable.map(function (value) {
		const result = new Set<IToolData | ToolSet>();
		for (const [item, enabled] of value) {
			if (enabled) {
				result.add(item);
			}
		}
		return result;
	});

	constructor(
		mode: IObservable<ChatMode>,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._selectedTools = this._store.add(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService));

		this._allTools = observableFromEvent(_toolsService.onDidChangeTools, () => Array.from(_toolsService.getTools()));

		const disabledDataObs = derived(r => {
			const globalData = this._selectedTools.read(r);
			const sessionData = this._sessionSelectedTools.read(r);

			const toolSetIds = new Set<string>();
			const toolIds = new Set<string>();

			for (const data of [globalData, sessionData]) {
				if (data.disabledToolSets) {
					for (const id of data.disabledToolSets) {
						toolSetIds.add(id);
					}
				}
				if (data.disabledTools) {
					for (const id of data.disabledTools) {
						toolIds.add(id);
					}
				}
			}

			if (toolSetIds.size === 0 && toolIds.size === 0) {
				return undefined;
			}
			return { toolSetIds, toolIds };
		});

		this._store.add(autorun(r => {

			const tools = this._allTools.read(r).filter(t => t.canBeReferencedInPrompt);
			const toolSets = _toolsService.toolSets.read(r);

			const oldItems = new Set(this.entriesMap.keys());

			const disabledData = mode.read(r) === ChatMode.Agent
				? disabledDataObs.read(r)
				: undefined;

			transaction(tx => {

				for (const tool of tools) {
					const enabled = !disabledData || !disabledData.toolIds.has(tool.id);
					this.entriesMap.set(tool, enabled, tx);
					oldItems.delete(tool);
				}

				for (const toolSet of toolSets) {
					const enabled = !disabledData || !disabledData.toolSetIds.has(toolSet.id);
					this.entriesMap.set(toolSet, enabled, tx);
					oldItems.delete(toolSet);
				}

				for (const item of oldItems) {
					this.entriesMap.delete(item, tx);
				}
			});
		}));
	}

	resetSessionEnablementState() {
		this._sessionSelectedTools.set({}, undefined);
	}

	enable(toolSets: readonly ToolSet[], tools: readonly IToolData[], sessionOnly: boolean): void {
		const toolIds = new Set(tools.map(t => t.id));
		const toolsetIds = new Set(toolSets.map(t => t.id));

		const disabledTools = this._allTools.get().filter(tool => !toolIds.has(tool.id));
		const disabledToolSets = Array.from(this._toolsService.toolSets.get()).filter(toolset => !toolsetIds.has(toolset.id));

		this.disable(disabledToolSets, disabledTools, sessionOnly);
	}

	disable(disabledToolSets: readonly ToolSet[], disableTools: readonly IToolData[], sessionOnly: boolean): void {

		const target = sessionOnly
			? this._sessionSelectedTools
			: this._selectedTools;

		target.set({
			disabledToolSets: disabledToolSets.map(t => t.id),
			disabledTools: disableTools.map(t => t.id)
		}, undefined);
	}

	asEnablementMap(): Map<IToolData, boolean> {
		const result = new Map<IToolData, boolean>();
		const map = this.entriesMap;

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
					_set(tool, map.get(tool) ?? enabled); // tools from tool set can be explicitly set
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
