/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { ModelPickerWidget } from './modelPickerWidget.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseDropdownMenuActionViewItem } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';

export interface IModelPickerDelegate {
	readonly onDidChangeModel: Event<ILanguageModelChatMetadataAndIdentifier>;
	setModel(model: ILanguageModelChatMetadataAndIdentifier): void;
	getModels(): ILanguageModelChatMetadataAndIdentifier[];
}

/**
 * Action view item for selecting a language model in the chat interface.
 */
export class ModelPickerActionItem extends BaseDropdownMenuActionViewItem {
	constructor(
		action: IAction,
		private currentModel: ILanguageModelChatMetadataAndIdentifier,
		private readonly delegate: IModelPickerDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		// Modify the original action with a different label and make it show the current model
		const actionWithLabel: IAction = {
			...action,
			label: currentModel.metadata.name,
			tooltip: localize('chat.modelPicker.label', "Pick Model"),
			run: () => { }
		};

		super(actionWithLabel, (container, labelRenderer) => {
			const widget = this.instantiationService.createInstance(
				ModelPickerWidget,
				container,
				labelRenderer,
				() => this.currentModel,
				() => this.delegate.getModels(),
				(model) => this.delegate.setModel(model)
			);
			this._register(widget);
			this._register(widget.onDidChangeModel(model => {
				this.currentModel = model;
				if (this.element) {
					this.renderLabel(this.element);
				}
			}));
			return widget;
		});

		// Listen for model changes from the delegate
		this._register(delegate.onDidChangeModel(model => {
			this.currentModel = model;
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		dom.reset(element, dom.$('span.chat-model-label', undefined, this.currentModel.metadata.name), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
