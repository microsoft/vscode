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
import { localize } from '../../../../nls.js';

const COPY_FEEDBACK_DURATION = 1200;
const copyActionClass = ThemeIcon.asClassName(Codicon.copy);
const copiedActionClass = ThemeIcon.asClassName(Codicon.check);
const copiedActionLabel = localize('sessionCopyAction.copied', "Copied");

class SessionCopyAction extends Action {

	private readonly _reset = this._register(new MutableDisposable());

	constructor(
		id: string,
		private readonly _copyLabel: string,
		private readonly _copy: () => void | Promise<void>,
	) {
		super(id, _copyLabel, copyActionClass);
	}

	override async run(): Promise<void> {
		await this._copy();
		this.label = copiedActionLabel;
		this.class = copiedActionClass;
		status(localize('sessionCopyAction.copiedToClipboard', "Copied to clipboard"));
		this._reset.value = disposableTimeout(() => {
			this.label = this._copyLabel;
			this.class = copyActionClass;
		}, COPY_FEEDBACK_DURATION);
	}
}

export function createSessionCopyAction(store: DisposableStore, id: string, label: string, copy: () => void | Promise<void>): Action {
	return store.add(new SessionCopyAction(id, label, copy));
}
