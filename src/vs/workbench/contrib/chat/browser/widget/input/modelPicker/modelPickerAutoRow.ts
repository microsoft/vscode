/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Radio } from '../../../../../../../base/browser/ui/radio/radio.js';
import { Switch } from '../../../../../../../base/browser/ui/toggle/switch.js';
import { Sequencer } from '../../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
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

/** Auto's routing tiers remain available while off; activating a tier also enables Auto. */
export class ModelPickerAutoRow extends DisposableStore {

	readonly element = dom.$('.chat-model-picker-auto-row');

	private readonly _renderDisposables = this.add(new DisposableStore());
	private readonly _toggle: Switch;
	private readonly _tierContainer: HTMLElement;
	private readonly _description: HTMLElement;
	private readonly _tierChanges = new Sequencer();
	private _tierControl: Radio | undefined;
	private _toggleVersion = 0;

	constructor(private readonly _options: IAutoRowOptions) {
		super();

		const main = dom.append(this.element, dom.$('.chat-model-picker-auto-main'));
		dom.append(main, dom.$('.chat-model-picker-auto-label', undefined, _options.autoModel.metadata.name));

		this._toggle = this.add(new Switch({
			ariaLabel: localize('chat.modelPicker.autoToggle', "Choose a model automatically"),
			checked: _options.isEnabled(),
		}));
		main.appendChild(this._toggle.domNode);
		this.add(this._toggle.onChange(checked => this._toggleAuto(checked)));

		// The label and the gap beside it flip the switch too, the way a row carrying a
		// standalone toggle does. The switch stops its own clicks from reaching here.
		this.add(dom.addDisposableListener(main, dom.EventType.CLICK, () => {
			if (this._toggle.disabled) {
				return;
			}
			this._toggle.checked = !this._toggle.checked;
			this._toggleAuto(this._toggle.checked);
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
		if (this.isDisposed) {
			return;
		}
		const focusedTier = this._getFocusedTier();
		const enabled = this._options.isEnabled();
		if (this._toggle.checked !== enabled) {
			this._toggleVersion++;
		}
		this.element.classList.toggle('enabled', enabled);
		this._toggle.checked = enabled;

		const tier = getModelConfigProperty(this._options.autoModel, this._options.configurationAccess, MODEL_CONFIG_GROUP_EFFORT);
		const values = tier?.schema.enum ?? [];
		const selectedIndex = Math.max(0, values.indexOf(tier?.value));
		dom.clearNode(this._tierContainer);
		this._renderDisposables.clear();
		this._tierControl = undefined;

		if (tier && values.length > 1) {
			const control = this._renderDisposables.add(new Radio({
				ariaLabel: tier.schema.title ?? localize('chat.modelPicker.autoTier', "Optimize for"),
				className: 'segmented',
				arrowKeyBehavior: 'focus',
				items: values.map((value, index) => ({
					text: getModelConfigValueLabel(tier.schema, value),
					tooltip: tier.schema.enumDescriptions?.[index],
					isActive: index === selectedIndex,
				})),
			}));
			this._renderDisposables.add(control.onDidActivate(index => {
				const toggleVersion = this._toggleVersion;
				this._tierChanges.queue(() => this._activateTier(tier.key, values[index], toggleVersion)).catch(onUnexpectedError);
			}));
			this._tierContainer.appendChild(control.domNode);
			this._tierControl = control;
			if (focusedTier >= 0) {
				control.focusItem(focusedTier);
			}
		}

		const tierDescription = tier?.schema.enumDescriptions?.[selectedIndex];
		// Auto's own detail stays put; the tier description joins it rather than replacing it.
		const detail = this._options.autoModel.metadata.detail;
		const parts = [detail, tierDescription].filter(part => !!part);
		this._description.textContent = parts.join(' · ');
		this._description.classList.toggle('hidden', parts.length === 0);
	}

	private _getFocusedTier(): number {
		return this._tierControl?.optionElements.findIndex(element => dom.isActiveElement(element)) ?? -1;
	}

	private _toggleAuto(enabled: boolean): void {
		this._toggleVersion++;
		this._options.onToggle(enabled);
	}

	private async _activateTier(key: string, value: unknown, toggleVersion: number): Promise<void> {
		if (this.isDisposed) {
			return;
		}
		let focusedTier = -1;
		try {
			await this._options.configurationAccess.setModelConfiguration(this._options.autoModel.identifier, { [key]: value });
			if (this.isDisposed) {
				return;
			}
			focusedTier = this._getFocusedTier();
			if (toggleVersion === this._toggleVersion && !this._options.isEnabled()) {
				this._toggleAuto(true);
			}
		} finally {
			this.render();
			if (!this.isDisposed && focusedTier >= 0) {
				this._tierControl?.focusItem(focusedTier);
			}
		}
	}
}
