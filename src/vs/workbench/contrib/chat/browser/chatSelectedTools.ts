/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, ObservableMap } from '../../../../base/common/observable.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatMode } from '../common/constants.js';
import { ILanguageModelToolsService, isIToolSet, IToolData, IToolSet } from '../common/languageModelToolsService.js';

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

	readonly entries: IObservable<{ toolSets: Iterable<IToolSet>; tools: Iterable<IToolData> }>;

	readonly value: ObservableMap<IToolData | IToolSet, boolean>;

	constructor(
		mode: IObservable<ChatMode>,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._selectedTools = this._store.add(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService));

		this._allTools = observableFromEvent(toolsService.onDidChangeTools, () => Array.from(toolsService.getTools()));

		this.value = new ObservableMap<IToolSet | IToolData, boolean>();

		const disabledDataObs = this._selectedTools.map(data => {
			return (data.disabledToolSets?.length || data.disabledTools?.length)
				? {
					toolSetIds: new Set(data.disabledToolSets),
					toolIds: new Set(data.disabledTools),
				}
				: undefined;
		});

		this._store.add(autorun(r => {

			const tools = new Set(this._allTools.read(r));
			const toolSets = toolsService.toolSets.read(r);
			for (const toolInSet of Iterable.flatMap(toolSets, t => t.tools.read(r))) {
				tools.delete(toolInSet);
			}

			const disabledData = mode.read(r) === ChatMode.Agent
				? disabledDataObs.read(r)
				: undefined;

			for (const tool of tools) {
				const enabled = !disabledData || !disabledData.toolIds.has(tool.id);
				this.value.set(tool, enabled);
			}

			for (const toolSet of toolSets) {
				const enabled = !disabledData || !disabledData.toolSetIds.has(toolSet.id);
				this.value.set(toolSet, enabled);
			}
		}));


		this.entries = derived(r => {
			const map = this.value.observable.read(r);
			const tools: IToolData[] = [];
			const toolSets: IToolSet[] = [];
			for (const [item, enabled] of map) {
				if (!enabled) {
					continue;
				}
				if (isIToolSet(item)) {
					toolSets.push(item);
				} else {
					tools.push(item);
				}
			}
			return { toolSets, tools };
		});
	}

	selectOnly(toolIds: readonly string[]): void {
		const uniqueTools = new Set(toolIds);

		const disabledTools = this._allTools.get().filter(tool => !uniqueTools.has(tool.id));

		this.update([], disabledTools);
	}

	update(disabledToolSets: readonly IToolSet[], disableTools: readonly IToolData[]): void {
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
			// ONLY disable a tool that isn't enable yet
			const enabledNow = result.get(tool);
			if (enabled || !enabledNow) {
				result.set(tool, enabled);
			}
		};

		for (const [item, enabled] of this.value) {
			if (isIToolSet(item)) {
				for (const tool of item.tools.get()) {
					_set(tool, enabled);
				}
			} else {
				_set(item, enabled);
			}
		}
		return result;
	}
}
