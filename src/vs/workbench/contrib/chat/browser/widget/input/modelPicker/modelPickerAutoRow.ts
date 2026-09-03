/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Switch } from '../../../../../../../base/browser/ui/toggle/switch.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { IModelConfigurationAccess } from './modelPickerActionItem.js';
import { getModelConfigProperty, getModelConfigValueLabel, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';
import { SegmentedControl } from './modelPickerSegmentedControl.js';

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
	private _tierControl: SegmentedControl | undefined;

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

		// Below the switch rather than beside it, so revealing the tiers cannot push the
		// switch out from under the pointer.
		this._tierContainer = dom.append(this.element, dom.$('.chat-model-picker-auto-tiers'));
		this._description = dom.append(this.element, dom.$('.chat-model-picker-auto-description'));
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
			const control = this._renderDisposables.add(new SegmentedControl({
				ariaLabel: tier.schema.title ?? localize('chat.modelPicker.autoTier', "Optimize for"),
				options: values.map((value, index) => ({
					label: getModelConfigValueLabel(tier.schema, value),
					description: tier.schema.enumDescriptions?.[index],
					checked: value === tier.value,
				})),
				onSelect: async index => {
					await this._options.configurationAccess.setModelConfiguration(this._options.autoModel.identifier, { [tier.key]: values[index] });
					this.render();
					// Rebuilt, so focus has to land on the control that replaced this one.
					this._tierControl?.focusChecked();
				},
			}));
			this._tierContainer.appendChild(control.domNode);
			this._tierControl = control;
		}

		const selectedIndex = values.indexOf(tier?.value);
		const tierDescription = enabled && selectedIndex >= 0 ? tier?.schema.enumDescriptions?.[selectedIndex] : undefined;
		// The offer belongs to Auto itself, so it stays put while the tier description
		// joins it rather than replacing it.
		const detail = this._options.autoModel.metadata.detail;
		const parts = [detail, tierDescription].filter(part => !!part);
		this._description.textContent = parts.join(' · ');
		this._description.classList.toggle('hidden', parts.length === 0);
	}
}
