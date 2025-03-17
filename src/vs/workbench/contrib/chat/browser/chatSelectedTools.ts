/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { reset } from '../../../../base/browser/dom.js';
import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelToolsService, IToolData } from '../common/languageModelToolsService.js';

export class ChatSelectedTools extends Disposable {

	private readonly _selectedTools = observableValue<IToolData[] | undefined>(this, undefined);

	readonly tools: IObservable<IToolData[]>;

	readonly toolsActionItemViewItemProvider: IActionViewItemProvider;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instaService: IInstantiationService
	) {
		super();

		const allTools = observableFromEvent(
			toolsService.onDidChangeTools,
			() => Array.from(toolsService.getTools()).filter(t => t.canBeReferencedInPrompt)
		);

		this.tools = derived(r => {
			const custom = this._selectedTools.read(r);
			return custom ?? allTools.read(r);
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

	update(tools: IToolData[]): void {
		this._selectedTools.set(tools, undefined);
	}

	reset(): void {
		this._selectedTools.set(undefined, undefined);
	}
}
