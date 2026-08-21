/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../base/browser/ui/button/button.js';
import { IAction } from '../../base/common/actions.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { IObservable, autorun } from '../../base/common/observable.js';
import { localize } from '../../nls.js';
import { FileKind } from '../../platform/files/common/files.js';
import { ChatPillActionViewItemBase, type IChatPillEntry } from './chatPills.js';
import { ResourceLabels } from './labels.js';

/**
 * A pill showing a single resource as a themed file icon and name. The
 * surrounding row must opt into `show-file-icons` for the icon to paint.
 */
export class ChatResourcePillActionViewItem extends ChatPillActionViewItemBase {

	protected override get itemModifierClass(): string { return 'chat-resource-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-resource-pill-button'; }

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly _entry: IObservable<IChatPillEntry | undefined>,
		private readonly _resourceLabels: ResourceLabels,
	) {
		super(undefined, action, options);
	}

	protected override renderContent(button: Button): void {
		const label = this._register(this._resourceLabels.create(button.element));
		this._register(autorun(reader => {
			const entry = this._entry.read(reader);
			if (entry?.resource) {
				label.setResource({ resource: entry.resource, name: entry.label }, { fileKind: FileKind.FILE });
			}
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	protected override getTooltip(): string {
		const entry = this._entry.get();
		return entry?.tooltip ?? (entry ? localize('chatResourcePill.open', "Open {0}", entry.label) : this._action.label);
	}

	protected override getAriaLabel(): string | undefined {
		return this._entry.get()?.ariaLabel ?? super.getAriaLabel();
	}

	protected override onDidClickButton(): void {
		try {
			this._entry.get()?.open();
		} catch (error) {
			onUnexpectedError(error);
		}
	}
}
