/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { IManagedHoverContent } from '../../../../../../base/browser/ui/hover/hover.js';
import { getBaseLayerHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ModelPickerWidget } from './chatModelPicker.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';

/**
 * Enhanced action view item for selecting a language model in the chat interface.
 *
 * Wraps a {@link ModelPickerWidget} and adapts it for use in an action bar,
 * providing curated model suggestions, upgrade prompts, and grouped layout.
 */
export class EnhancedModelPickerActionItem extends BaseActionViewItem {
	private readonly _pickerWidget: ModelPickerWidget;
	private readonly _managedHover = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		delegate: IModelPickerDelegate,
		private readonly pickerOptions: IChatInputPickerOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action);

		this._pickerWidget = this._register(instantiationService.createInstance(ModelPickerWidget, delegate));
		this._pickerWidget.setSelectedModel(delegate.currentModel.get());

		// Sync delegate → widget when model list or selection changes externally
		this._register(autorun(t => {
			const model = delegate.currentModel.read(t);
			this._pickerWidget.setSelectedModel(model);
			this._updateTooltip();
		}));

		// Sync widget → delegate when user picks a model
		this._register(this._pickerWidget.onDidChangeSelection(model => delegate.setModel(model)));
	}

	override render(container: HTMLElement): void {
		this._pickerWidget.render(container);
		this.element = this._pickerWidget.domNode;
		this._updateTooltip();
		container.classList.add('chat-input-picker-item');
	}

	private _getAnchorElement(): HTMLElement {
		if (this.element && getActiveWindow().document.contains(this.element)) {
			return this.element;
		}
		return this.pickerOptions.getOverflowAnchor?.() ?? this.element!;
	}

	public openModelPicker(): void {
		this._showPicker();
	}

	public show(): void {
		this._showPicker();
	}

	private _showPicker(): void {
		this._pickerWidget.show(this._getAnchorElement());
	}

	private _updateTooltip(): void {
		if (!this.element) {
			return;
		}
		const hoverContent = this._getHoverContents();
		if (typeof hoverContent === 'string' && hoverContent) {
			this._managedHover.value = getBaseLayerHoverDelegate().setupManagedHover(
				getDefaultHoverDelegate('mouse'),
				this.element,
				hoverContent
			);
		} else {
			this._managedHover.clear();
		}
	}

	private _getHoverContents(): IManagedHoverContent | undefined {
		let label = localize('chat.modelPicker.label', "Pick Model");
		const keybindingLabel = this.keybindingService.lookupKeybinding(this._action.id, this._contextKeyService)?.getLabel();
		if (keybindingLabel) {
			label += ` (${keybindingLabel})`;
		}
		const { statusIcon, tooltip } = this._pickerWidget.selectedModel?.metadata || {};
		return statusIcon && tooltip ? `${label} • ${tooltip}` : label;
	}
}
