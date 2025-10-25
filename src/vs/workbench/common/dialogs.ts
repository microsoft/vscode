/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../base/common/async.js';
import { Event, Emitter } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IDialogArgs, IDialogResult } from '../../platform/dialogs/common/dialogs.js';

export interface IDialogViewItem {
	readonly args: IDialogArgs;

	close(result?: IDialogResult | Error): void;
}

export interface IDialogHandle {
	readonly item: IDialogViewItem;
	readonly result: Promise<IDialogResult | undefined>;
}

export interface IDialogsModel {

	readonly onWillShowDialog: Event<void>;
	readonly onDidShowDialog: Event<void>;

	readonly dialogs: IDialogViewItem[];

	show(dialog: IDialogArgs): IDialogHandle;
}

export class DialogsModel extends Disposable implements IDialogsModel {

	readonly dialogs: IDialogViewItem[] = [];

	private readonly _onWillShowDialog = this._register(new Emitter<void>());
	readonly onWillShowDialog = this._onWillShowDialog.event;

	private readonly _onDidShowDialog = this._register(new Emitter<void>());
	readonly onDidShowDialog = this._onDidShowDialog.event;

	show(dialog: IDialogArgs): IDialogHandle {
		const promise = new DeferredPromise<IDialogResult | undefined>();

		const item: IDialogViewItem = {
			args: dialog,
			close: result => {
				this.dialogs.splice(0, 1);
				if (result instanceof Error) {
					promise.error(result);
				} else {
					promise.complete(result);
				}
				this._onDidShowDialog.fire();
			}
		};

		this.dialogs.push(item);
		this._onWillShowDialog.fire();

		return {
			item,
			result: promise.p
		};
	}
}
