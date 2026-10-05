/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { chatCopiedLabel, chatCopiedToClipboardStatus, chatCopyFeedbackDuration } from '../../../../workbench/contrib/chat/browser/actions/chatCopyActions.js';

const copyActionClass = ThemeIcon.asClassName(Codicon.copy);
const copiedActionClass = ThemeIcon.asClassName(Codicon.check);

class SessionCopyAction extends Action {

	private readonly _reset = this._register(new MutableDisposable());
	private _hoverLabel: string | undefined;
	private _copyHoverLabel: string | undefined;

	get hoverLabel(): string | undefined {
		return this._hoverLabel;
	}

	set hoverLabel(value: string | undefined) {
		this._hoverLabel = value;
		if (value !== chatCopiedLabel) {
			this._copyHoverLabel = value;
		}
	}

	constructor(
		id: string,
		private readonly _copyLabel: string,
		private readonly _copy: () => void | Promise<void>,
	) {
		super(id, _copyLabel, copyActionClass);
	}

	override async run(): Promise<void> {
		await this._copy();
		this._hoverLabel = chatCopiedLabel;
		this.label = chatCopiedLabel;
		this.class = copiedActionClass;
		status(chatCopiedToClipboardStatus);
		this._reset.value = disposableTimeout(() => {
			this._hoverLabel = this._copyHoverLabel;
			this.label = this._copyLabel;
			this.class = copyActionClass;
		}, chatCopyFeedbackDuration);
	}
}

export function createSessionCopyAction(store: Pick<DisposableStore, 'add'>, id: string, label: string, copy: () => void | Promise<void>): Action {
	return store.add(new SessionCopyAction(id, label, copy));
}
