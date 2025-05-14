/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatMode } from '../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../common/languageModelToolsService.js';

/**
 * New tools and new tool sources that come in should generally be enabled until
 * the user disables them. To store things, we store only the buckets and
 * individual tools that were disabled, so the new data sources that come in
 * are enabled, and new tools that come in for data sources not disabled are
 * also enabled.
 */
type StoredData = { disabledBuckets?: /* ToolDataSource.toKey */ readonly string[]; disabledTools?: readonly string[] };

const storedTools = observableMemento<StoredData>({
	defaultValue: {},
	key: 'chat/selectedTools',
});

export class ChatSelectedTools extends Disposable {

	private readonly _selectedTools: ObservableMemento<StoredData>;

	readonly tools: IObservable<IToolData[]>;

	private readonly _allTools: IObservable<Readonly<IToolData>[]>;

	constructor(
		mode: IObservable<ChatMode>,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instaService: IInstantiationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._selectedTools = this._register(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService));

		this._allTools = observableFromEvent(toolsService.onDidChangeTools, () => Array.from(toolsService.getTools()));

		const disabledData = this._selectedTools.map(data => {
			return (data.disabledBuckets?.length || data.disabledTools?.length) && {
				buckets: new Set(data.disabledBuckets),
				toolIds: new Set(data.disabledTools),
			};
		});

		this.tools = derived(r => {
			const tools = this._allTools.read(r);
			if (mode.read(r) !== ChatMode.Agent) {
				return tools;
			}
			const disabled = disabledData.read(r);
			if (!disabled) {
				return tools;
			}
			return tools.filter(t =>
				!(disabled.toolIds.has(t.id) || disabled.buckets.has(ToolDataSource.toKey(t.source)))
			);
		});
	}

	selectOnly(toolIds: readonly string[]): void {
		const uniqueTools = new Set(toolIds);

		const disabledTools = this._allTools.get().filter(tool => !uniqueTools.has(tool.id));

		this.update([], disabledTools);
	}

	update(disableBuckets: readonly ToolDataSource[], disableTools: readonly IToolData[]): void {
		this._selectedTools.set({
			disabledBuckets: disableBuckets.map(ToolDataSource.toKey),
			disabledTools: disableTools.map(t => t.id)
		}, undefined);
	}

	asEnablementMap(): Map<IToolData, boolean> {
		const result = new Map<IToolData, boolean>();
		const enabledTools = new Set(this.tools.get().map(t => t.id));
		for (const tool of this._allTools.get()) {
			if (tool.canBeReferencedInPrompt) {
				result.set(tool, enabledTools.has(tool.id));
			}
		}
		return result;
	}
}
