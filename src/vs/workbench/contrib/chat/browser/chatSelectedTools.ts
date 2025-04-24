/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from '../../../../base/browser/dom.js';
import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
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

	readonly toolsActionItemViewItemProvider: IActionViewItemProvider & { onDidRender: Event<void> };

	private allTools: IObservable<Readonly<IToolData>[]>;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instaService: IInstantiationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._selectedTools = this._register(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService));

		this.allTools = observableFromEvent(
			toolsService.onDidChangeTools,
			() => Array.from(toolsService.getTools()).filter(t => t.supportsToolPicker)
		);

		const disabledData = this._selectedTools.map(data => {
			return (data.disabledBuckets?.length || data.disabledTools?.length) && {
				buckets: new Set(data.disabledBuckets),
				toolIds: new Set(data.disabledTools),
			};
		});

		this.tools = derived(r => {
			const disabled = disabledData.read(r);
			const tools = this.allTools.read(r);
			if (!disabled) {
				return tools;
			}

			return tools.filter(t =>
				!(disabled.toolIds.has(t.id) || disabled.buckets.has(ToolDataSource.toKey(t.source)))
			);
		});

		const toolsCount = derived(r => {
			const count = this.allTools.read(r).length;
			const enabled = this.tools.read(r).length;
			return { count, enabled };
		});

		const onDidRender = this._store.add(new Emitter<void>());

		this.toolsActionItemViewItemProvider = Object.assign(
			(action: IAction, options: IActionViewItemOptions) => {
				if (!(action instanceof MenuItemAction)) {
					return undefined;
				}

				return instaService.createInstance(class extends MenuEntryActionViewItem {

					override render(container: HTMLElement): void {
						this.options.icon = false;
						this.options.label = true;
						container.classList.add('chat-mcp', 'chat-attachment-button');
						super.render(container);
					}

					protected override updateLabel(): void {
						this._store.add(autorun(r => {
							assertType(this.label);

							const { enabled, count } = toolsCount.read(r);

							const message = count === 0
								? '$(tools)'
								: enabled !== count
									? localize('tool.1', "{0} {1} of {2}", '$(tools)', enabled, count)
									: localize('tool.0', "{0} {1}", '$(tools)', count);

							reset(this.label, ...renderLabelWithIcons(message));

							if (this.element?.isConnected) {
								onDidRender.fire();
							}
						}));
					}

				}, action, { ...options, keybindingNotRenderedWithLabel: true });
			},
			{ onDidRender: onDidRender.event }
		);
	}

	/**
	 * Select only the provided tools unselecting the rest.
	 *
	 * @param tools Set of tool IDs to select.
	 */
	public selectOnly(
		tools: readonly string[],
	): void {
		const allTools = this.allTools.get();
		const uniqueTools = new Set(tools);

		const disabledTools = allTools.filter((tool) => {
			return (uniqueTools.has(tool.id) === false);
		});

		this.update([], disabledTools);
	}

	update(disableBuckets: readonly ToolDataSource[], disableTools: readonly IToolData[]): void {
		this._selectedTools.set({
			disabledBuckets: disableBuckets.map(ToolDataSource.toKey),
			disabledTools: disableTools.map(t => t.id)
		}, undefined);
	}
}
