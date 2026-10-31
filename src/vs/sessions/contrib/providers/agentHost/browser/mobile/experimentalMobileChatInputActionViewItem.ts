/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IModePickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IModelPickerDelegate } from '../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';

/** The experimental composer uses a model label and chevron, without mode or provider icons. */
export class ExperimentalMobileChatInputActionViewItem extends BaseActionViewItem {
	private readonly renderDisposables = this._register(new DisposableStore());
	private trigger: HTMLElement | undefined;
	private showing = false;

	constructor(
		action: IAction,
		private readonly mode: IModePickerDelegate,
		private readonly model: IModelPickerDelegate,
		private readonly showSheet: (target: HTMLElement) => Promise<void>,
		registerModelPicker: () => IDisposable,
	) {
		super(undefined, action);
		this._register(registerModelPicker());
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.renderDisposables.clear();
		container.classList.add('chat-input-picker-item');
		const trigger = this.trigger = dom.append(container, dom.$('a.action-label.chat-phone-input-chip'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'dialog');
		trigger.setAttribute('aria-expanded', 'false');
		const label = dom.append(trigger, dom.$('span.chat-input-picker-label'));
		dom.append(trigger, renderIcon(Codicon.chevronDown)).classList.add('chat-phone-input-chip-chevron');
		this.renderDisposables.add(autorun(reader => {
			const mode = this.mode.currentMode.read(reader).label.read(reader);
			const name = this.model.currentModel.read(reader)?.metadata.name ?? localize('auto', "Auto");
			label.textContent = name;
			trigger.ariaLabel = localize('pick', "Pick Mode and Model, {0}, {1}", mode, name);
		}));
		this.renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ') {
				this.onClick(event);
			}
		}));
	}

	override onClick(event: dom.EventLike): void {
		dom.EventHelper.stop(event, true);
		void this.open().catch(onUnexpectedError);
	}

	override focus(): void {
		this.trigger?.focus();
	}

	private async open(): Promise<void> {
		if (!this.trigger || this.showing) {
			return;
		}
		this.showing = true;
		this.trigger.setAttribute('aria-expanded', 'true');
		try {
			await this.showSheet(this.trigger);
		} finally {
			this.showing = false;
			if (!this._store.isDisposed) {
				this.trigger.setAttribute('aria-expanded', 'false');
				this.trigger.focus();
			}
		}
	}
}
