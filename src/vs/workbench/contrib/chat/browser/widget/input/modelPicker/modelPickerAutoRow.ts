/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Switch } from '../../../../../../../base/browser/ui/toggle/switch.js';
import { toAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';

export interface IAutoRowOptions {
	readonly autoModel: ILanguageModelChatMetadataAndIdentifier;
	/** Accessible name of the switch. Defaults to describing Auto. */
	readonly toggleAriaLabel?: string;
	readonly isEnabled: () => boolean;
	readonly onToggle: (enabled: boolean) => void;
	readonly onShowDetails?: () => void;
}

/** A compact routing-model footer row; configuration is available through its details action. */
export class ModelPickerAutoRow extends DisposableStore {

	readonly element = dom.$('.chat-model-picker-auto-row');

	private readonly _toggle: Switch;
	private readonly _description: HTMLElement;

	constructor(private readonly _options: IAutoRowOptions) {
		super();

		const main = dom.append(this.element, dom.$('.chat-model-picker-auto-main'));
		dom.append(main, dom.$('.chat-model-picker-auto-label', undefined, _options.autoModel.metadata.name));

		if (_options.onShowDetails) {
			const container = dom.append(main, dom.$('.chat-model-picker-auto-actions'));
			const actions = this.add(new ActionBar(container));
			actions.push(toAction({
				id: 'chat.modelPicker.details',
				label: localize('chat.modelPicker.modelDetails', "{0} Details", _options.autoModel.metadata.name),
				class: ThemeIcon.asClassName(Codicon.info),
				run: () => _options.onShowDetails?.(),
			}), { icon: true, label: false });
			this.add(dom.addDisposableListener(container, dom.EventType.CLICK, e => e.stopPropagation()));
		}

		this._toggle = this.add(new Switch({
			ariaLabel: _options.toggleAriaLabel ?? localize('chat.modelPicker.autoToggle', "Choose a model automatically"),
			checked: _options.isEnabled(),
		}));
		main.appendChild(this._toggle.domNode);
		this.add(this._toggle.onChange(checked => this._options.onToggle(checked)));

		// The label and the gap beside it flip the switch too, the way a row carrying a
		// standalone toggle does. The switch stops its own clicks from reaching here.
		this.add(dom.addDisposableListener(main, dom.EventType.CLICK, () => {
			if (this._toggle.disabled) {
				return;
			}
			this._toggle.checked = !this._toggle.checked;
			this._options.onToggle(this._toggle.checked);
		}));
		// Pressing the strip must not move focus out of the list, which would blur the
		// popup and dismiss it before the click lands.
		this.add(dom.addDisposableGenericMouseDownListener(main, e => e.preventDefault()));

		this._description = dom.append(this.element, dom.$('.chat-model-picker-auto-description'));
		// The description is inert text, so pressing it must not dismiss the popup either.
		this.add(dom.addDisposableGenericMouseDownListener(this._description, e => e.preventDefault()));
		this.render();
	}

	focus(): void {
		this._toggle.domNode.focus();
	}

	/** Re-reads the selection so the switch matches the current state. */
	render(): void {
		if (this.isDisposed) {
			return;
		}
		const enabled = this._options.isEnabled();
		this.element.classList.toggle('enabled', enabled);
		this._toggle.checked = enabled;

		const detail = this._options.autoModel.metadata.detail;
		this._description.textContent = detail ?? '';
		this._description.classList.toggle('hidden', !detail);
	}
}
