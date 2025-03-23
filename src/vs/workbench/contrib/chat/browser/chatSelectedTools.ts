/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { reset } from '../../../../base/browser/dom.js';
import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILanguageModelToolsService, IToolData } from '../common/languageModelToolsService.js';

type StoredData = { all: boolean; ids?: string[] };

const storedTools = observableMemento<StoredData>({
	defaultValue: { all: true },
	key: 'chat/selectedTools',
});

export class ChatSelectedTools extends Disposable {

	private readonly _selectedTools: ObservableMemento<StoredData>;

	readonly tools: IObservable<IToolData[]>;

	readonly toolsActionItemViewItemProvider: IActionViewItemProvider;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instaService: IInstantiationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		this._selectedTools = this._register(storedTools(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService));

		const allTools = observableFromEvent(
			toolsService.onDidChangeTools,
			() => Array.from(toolsService.getTools()).filter(t => t.canBeReferencedInPrompt)
		);

		this.tools = derived(r => {
			const stored = this._selectedTools.read(r);
			const tools = allTools.read(r);
			if (stored.all) {
				return tools;
			}

			const ids = new Set(stored.ids);
			return tools.filter(t => ids.has(t.id));
		});

		const toolsCount = derived(r => {
			const count = allTools.read(r).length;
			const enabled = this.tools.read(r).length;
			return { count, enabled };
		});

		this.toolsActionItemViewItemProvider = (action, options) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}

			return instaService.createInstance(class extends MenuEntryActionViewItem {

				override render(container: HTMLElement): void {
					this.options.icon = false;
					this.options.label = true;
					container.classList.add('chat-mcp');
					super.render(container);
				}

				protected override updateLabel(): void {
					this._store.add(autorun(r => {
						assertType(this.label);

						const { enabled, count } = toolsCount.read(r);

						if (count === 0) {
							super.updateLabel();
							return;
						}

						const message = enabled !== count
							? localize('tool.1', "{0} {1} of {2}", '$(tools)', enabled, count)
							: localize('tool.0', "{0} {1}", '$(tools)', count);
						reset(this.label, ...renderLabelWithIcons(message));
					}));
				}

			}, action, { ...options, keybindingNotRenderedWithLabel: true });

		};
	}

	update(tools: readonly IToolData[]): void {
		this._selectedTools.set({ all: false, ids: tools.map(t => t.id) }, undefined);
	}

	reset(): void {
		this._selectedTools.set({ all: true }, undefined);
	}
}
