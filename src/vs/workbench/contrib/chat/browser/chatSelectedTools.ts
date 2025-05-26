/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableFromEvent, ObservableMap, transaction } from '../../../../base/common/observable.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatMode } from '../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolSet, ToolDataSource } from '../common/languageModelToolsService.js';

/**
 * New tools and new tool sources that come in should generally be enabled until
 * the user disables them. To store things, we store only the tool sets and
 * individual tools that were disabled, so the new data sources that come in
 * are enabled, and new tools that come in for data sources not disabled are
 * also enabled.
 */
type StoredData = {
	disabledToolSets?: readonly string[];
	disabledTools?: readonly string[];
};

const storedTools = observableMemento<StoredData>({
	defaultValue: {},
	key: 'chat/selectedTools',
});

export class ChatSelectedTools extends Disposable {

	private readonly _selectedTools: ObservableMemento<StoredData>;

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
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._selectedTools = this._store.add(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService));

		this._allTools = observableFromEvent(toolsService.onDidChangeTools, () => Array.from(toolsService.getTools()));

		const disabledDataObs = this._selectedTools.map(data => {
			return (data.disabledToolSets?.length || data.disabledTools?.length)
				? {
					toolSetIds: new Set(data.disabledToolSets),
					toolIds: new Set(data.disabledTools),
				}
				: undefined;
		});

		this._store.add(autorun(r => {

			const sourceByTool = new Map<IToolData, ToolDataSource>();

			for (const tool of this._allTools.read(r)) {
				if (!tool.canBeReferencedInPrompt) {
					continue;
				}
				sourceByTool.set(tool, tool.source);
			}

			const toolSets = toolsService.toolSets.read(r);

			for (const toolSet of toolSets) {

				if (!toolSet.isHomogenous.read(r)) {
					// only homogenous tool sets can shallow tools
					continue;
				}

				for (const toolInSet of toolSet.getTools(r)) {
					const source = sourceByTool.get(toolInSet);
					if (source && ToolDataSource.equals(source, toolInSet.source)) {
						sourceByTool.delete(toolInSet);
					}
				}
			}

			const oldItems = new Set(this.entriesMap.keys());

			const disabledData = mode.read(r) === ChatMode.Agent
				? disabledDataObs.read(r)
				: undefined;

			transaction(tx => {

				for (const tool of sourceByTool.keys()) {
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

	selectOnly(toolIds: readonly string[]): void {
		const uniqueTools = new Set(toolIds);

		const disabledTools = this._allTools.get().filter(tool => !uniqueTools.has(tool.id));

		this.update([], disabledTools);
	}

	update(disabledToolSets: readonly ToolSet[], disableTools: readonly IToolData[]): void {
		this._selectedTools.set({
			disabledToolSets: disabledToolSets.map(t => t.id),
			disabledTools: disableTools.map(t => t.id)
		}, undefined);
	}

	asEnablementMap(): Map<IToolData, boolean> {
		const result = new Map<IToolData, boolean>();

		const _set = (tool: IToolData, enabled: boolean) => {
			if (!tool.canBeReferencedInPrompt) {
				return;
			}
			// ONLY disable a tool that isn't enabled yet
			const enabledNow = result.get(tool);
			if (enabled || !enabledNow) {
				result.set(tool, enabled);
			}
		};

		for (const [item, enabled] of this.entriesMap) {
			if (item instanceof ToolSet) {
				for (const tool of item.getTools()) {
					_set(tool, enabled);
				}
			} else {
				_set(item, enabled);
			}
		}
		return result;
	}
}
