/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IBrowserViewDialog, IBrowserViewDialogResponse } from '../common/browserView.js';

interface IQueuedDialog {
	readonly request: IBrowserViewDialog;
	readonly respond: (response: IBrowserViewDialogResponse) => void;
	readonly isValid: () => boolean;
}

/** Queues browser dialogs until a user or agent answers them. */
export class BrowserViewDialogs extends Disposable {
	private readonly queue: IQueuedDialog[] = [];
	private clearing = false;
	private disposed = false;

	private readonly _onDidChangeDialog = this._register(new Emitter<IBrowserViewDialog | undefined>());
	readonly onDidChangeDialog = this._onDidChangeDialog.event;
	private readonly _onDidCloseDialog = this._register(new Emitter<{ dialog: IBrowserViewDialog; response: IBrowserViewDialogResponse }>());
	readonly onDidCloseDialog = this._onDidCloseDialog.event;

	get pendingDialog(): IBrowserViewDialog | undefined {
		return this.queue[0]?.request;
	}

	request(dialog: Omit<IBrowserViewDialog, 'requestId'>, respond: (response: IBrowserViewDialogResponse) => void, isValid: () => boolean = () => true): void {
		if (this.disposed || this.clearing) {
			respond({ accept: false });
			return;
		}
		this.queue.push({ request: { ...dialog, requestId: generateUuid() }, respond, isValid });
		if (this.queue.length === 1) {
			this._onDidChangeDialog.fire(this.pendingDialog);
		}
	}

	cancelInvalid(): void {
		this.settleDialogs(entry => !entry.isValid());
	}

	respond(requestId: string, response: IBrowserViewDialogResponse): boolean {
		this.cancelInvalid();
		const pending = this.queue[0];
		if (!pending || pending.request.requestId !== requestId) {
			return false;
		}
		if (!response || typeof response.accept !== 'boolean' ||
			(response.promptText !== undefined && typeof response.promptText !== 'string')) {
			throw new Error('Invalid browser dialog response');
		}
		if (pending.request.type === 'login' && response.accept && (typeof response.username !== 'string' || typeof response.password !== 'string')) {
			throw new Error('Invalid browser authentication response');
		}
		this.queue.shift();
		this._onDidCloseDialog.fire({ dialog: pending.request, response });
		this._onDidChangeDialog.fire(this.pendingDialog);
		pending.respond(response);
		return true;
	}

	settleAll(): void {
		this.settleDialogs(() => true);
	}

	settleJavaScriptDialogs(): void {
		this.settleDialogs(entry => entry.request.type !== 'login');
	}

	private settleDialogs(matches: (entry: IQueuedDialog) => boolean): void {
		this.clearing = true;
		const previous = this.pendingDialog;
		const pending = this.queue.filter(matches);
		for (const entry of pending) {
			this.queue.splice(this.queue.indexOf(entry), 1);
		}
		try {
			if (previous && previous !== this.pendingDialog) {
				this._onDidCloseDialog.fire({ dialog: previous, response: { accept: false } });
				this._onDidChangeDialog.fire(this.pendingDialog);
			}
			for (const dialog of pending) {
				dialog.respond({ accept: false });
			}
		} finally {
			this.clearing = false;
		}
	}

	override dispose(): void {
		this.disposed = true;
		this.settleAll();
		super.dispose();
	}
}
