/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Radio } from '../../../../../../../base/browser/ui/radio/radio.js';
import { Switch } from '../../../../../../../base/browser/ui/toggle/switch.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { getModelConfigProperty, getModelConfigValueLabel, IModelConfigurationAccess, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';

export interface IAutoRowOptions {
	readonly autoModel: ILanguageModelChatMetadataAndIdentifier;
	readonly configurationAccess: IModelConfigurationAccess;
	readonly isEnabled: () => boolean;
	readonly onToggle: (enabled: boolean) => void;
}

/**
 * The Auto row pinned below the model list: a switch that turns automatic model
 * selection on, and the tiers it routes by.
 *
 * The switch keeps one position whether or not the tiers are showing, so turning Auto
 * on does not move the control the user just aimed at.
 */
export class ModelPickerAutoRow extends DisposableStore {

	readonly element = dom.$('.chat-model-picker-auto-row');

	private readonly _renderDisposables = this.add(new DisposableStore());
	private readonly _toggle: Switch;
	private readonly _tierContainer: HTMLElement;
	private readonly _description: HTMLElement;
	private _tierControl: Radio | undefined;

	constructor(private readonly _options: IAutoRowOptions) {
		super();

		const main = dom.append(this.element, dom.$('.chat-model-picker-auto-main'));
		dom.append(main, dom.$('.chat-model-picker-auto-label', undefined, _options.autoModel.metadata.name));

		this._toggle = this.add(new Switch({
			ariaLabel: localize('chat.modelPicker.autoToggle', "Choose a model automatically"),
			checked: _options.isEnabled(),
		}));
		main.appendChild(this._toggle.domNode);
		this.add(this._toggle.onChange(checked => _options.onToggle(checked)));

		// The label and the gap beside it flip the switch too, the way a row carrying a
		// standalone toggle does. The switch stops its own clicks from reaching here.
		this.add(dom.addDisposableListener(main, dom.EventType.CLICK, () => {
			if (this._toggle.disabled) {
				return;
			}
			this._toggle.checked = !this._toggle.checked;
			_options.onToggle(this._toggle.checked);
		}));
		// Pressing the strip must not move focus out of the list, which would blur the
		// popup and dismiss it before the click lands.
		this.add(dom.addDisposableGenericMouseDownListener(main, e => e.preventDefault()));

		this._tierContainer = dom.append(this.element, dom.$('.chat-model-picker-auto-tiers'));
		this._description = dom.append(this.element, dom.$('.chat-model-picker-auto-description'));
		// The description is inert text, so pressing it must not dismiss the popup either.
		// The tiers are left alone: their buttons take focus of their own accord.
		this.add(dom.addDisposableGenericMouseDownListener(this._description, e => e.preventDefault()));
		this.render();
	}

	/** Re-reads the selection and tier so the row matches the current state. */
	render(): void {
		const enabled = this._options.isEnabled();
		this.element.classList.toggle('enabled', enabled);
		this._toggle.checked = enabled;

		const tier = getModelConfigProperty(this._options.autoModel, this._options.configurationAccess, MODEL_CONFIG_GROUP_EFFORT);
		const values = tier?.schema.enum ?? [];
		dom.clearNode(this._tierContainer);
		this._renderDisposables.clear();
		this._tierControl = undefined;

		if (enabled && tier && values.length > 1) {
			const control = this._renderDisposables.add(new Radio({
				ariaLabel: tier.schema.title ?? localize('chat.modelPicker.autoTier', "Optimize for"),
				className: 'segmented',
				arrowKeyBehavior: 'focus',
				items: values.map((value, index) => ({
					text: getModelConfigValueLabel(tier.schema, value),
					tooltip: tier.schema.enumDescriptions?.[index],
					isActive: value === tier.value,
				})),
			}));
			this._renderDisposables.add(control.onDidSelect(async index => {
				await this._options.configurationAccess.setModelConfiguration(this._options.autoModel.identifier, { [tier.key]: values[index] });
				this.render();
				// Rebuilt, so focus has to land on the control that replaced this one.
				this._tierControl?.focusActiveItem();
			}));
			this._tierContainer.appendChild(control.domNode);
			this._tierControl = control;
		}

		const selectedIndex = values.indexOf(tier?.value);
		const tierDescription = enabled && selectedIndex >= 0 ? tier?.schema.enumDescriptions?.[selectedIndex] : undefined;
		// Auto's own detail stays put; the tier description joins it rather than replacing it.
		const detail = this._options.autoModel.metadata.detail;
		const parts = [detail, tierDescription].filter(part => !!part);
		this._description.textContent = parts.join(' · ');
		this._description.classList.toggle('hidden', parts.length === 0);
	}
}
