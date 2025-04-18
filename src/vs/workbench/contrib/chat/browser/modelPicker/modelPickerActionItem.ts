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
import { Codicon } from '../../../../../base/common/codicons.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';

export interface IModelPickerDelegate {
	readonly onDidChangeModel: Event<ILanguageModelChatMetadataAndIdentifier>;
	setModel(model: ILanguageModelChatMetadataAndIdentifier): void;
	getModels(): ILanguageModelChatMetadataAndIdentifier[];
}

/**
 * Action view item for selecting a language model in the chat interface.
 */
export class ModelPickerActionItem extends ActionViewItem {
	private widget: ModelPickerWidget | undefined;

	constructor(
		action: IAction,
		private readonly currentModel: ILanguageModelChatMetadataAndIdentifier,
		private readonly delegate: IModelPickerDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		// Modify the original action with a different label and make it show the current model
		const actionWithLabel: IAction = {
			...action,
			label: currentModel.metadata.name,
			tooltip: localize('chat.modelPicker.label', "Pick Model"),
			run: () => { /* Will be overridden by our click handler */ }
		};

		super(undefined, actionWithLabel, { label: true });

		// Listen for model changes from the delegate
		this._register(delegate.onDidChangeModel(model => {
			this.action.label = model.metadata.name;
			this.updateLabel();
		}));
	}

	/**
	 * Override rendering of the label to include the dropdown indicator
	 */
	protected override updateLabel(): void {
		if (this.label) {
			// Reset the label element with the current model name and a dropdown indicator
			dom.reset(this.label,
				dom.$('span.chat-model-label', undefined, this.action.label),
				...renderLabelWithIcons(`$(${Codicon.chevronDown.id})`)
			);
		}
	}

	/**
	 * Override rendering to add CSS classes and initialize the widget
	 */
	override render(container: HTMLElement): void {
		super.render(container);

		// Add classes for styling this element
		container.classList.add('chat-modelPicker-item');

		// Create the model picker widget that will be shown when clicked
		this.widget = this.instantiationService.createInstance(
			ModelPickerWidget,
			this.currentModel,
			() => this.delegate.getModels(),
			(model) => this.delegate.setModel(model)
		);

		// Register event handlers
		this._register(this.widget.onDidChangeModel(model => {
			this.action.label = model.metadata.name;
			this.updateLabel();
		}));
	}

	/**
	 * Override the onClick to show our picker widget
	 */
	override onClick(event: MouseEvent): void {
		if (!this.widget) {
			return;
		}

		// Show the model picker at the current position
		this.widget.showAt({
			x: event.clientX,
			y: event.clientY
		});

		event.stopPropagation();
		event.preventDefault();
	}

	/**
	 * Set aria label attributes on the element
	 */
	protected setAriaLabelAttributes(element: HTMLElement): void {
		element.setAttribute('aria-label', localize('chatModelPicker', "Chat Model: {0}", this.action.label));
		element.setAttribute('aria-haspopup', 'true');
		element.setAttribute('role', 'button');
	}
}
