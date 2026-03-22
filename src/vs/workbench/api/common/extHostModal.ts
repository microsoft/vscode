/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostModalShape, MainContext, MainThreadModalShape } from './extHost.protocol.js';

let handleCounter = 0;

class ModalPanel implements vscode.ModalPanel {

	private _html: string = '';
	private readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;
	private _isDisposed = false;

	constructor(
		private readonly _handle: number,
		private readonly _proxy: MainThreadModalShape
	) { }

	get html(): string {
		return this._html;
	}

	set html(value: string) {
		if (this._isDisposed) {
			return;
		}
		this._html = value;
		this._proxy.$setModalPanelHtml(this._handle, value);
	}

	dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._proxy.$disposeModalPanel(this._handle);
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	/** Called from the main thread when the user closes the panel from the UI. */
	notifyDisposed(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}
}

export class ExtHostModal implements ExtHostModalShape {

	private readonly _proxy: MainThreadModalShape;
	private readonly _panels = new Map<number, ModalPanel>();
	private readonly _toDispose = new DisposableStore();

	constructor(rpcProtocol: IExtHostRpcService) {
		this._proxy = rpcProtocol.getProxy(MainContext.MainThreadModal);
	}

	createModalPanel(options: vscode.ModalPanelOptions): vscode.ModalPanel {
		const handle = handleCounter++;
		const width = options.width ?? 600;
		const height = options.height ?? 400;

		this._proxy.$createModalPanel(handle, { title: options.title, width, height });

		const panel = new ModalPanel(handle, this._proxy);
		this._panels.set(handle, panel);

		// Clean up our map entry when the panel is disposed from either side
		const sub = panel.onDidDispose(() => {
			this._panels.delete(handle);
			sub.dispose();
		});

		return panel;
	}

	$onModalPanelDisposed(handle: number): void {
		const panel = this._panels.get(handle);
		if (panel) {
			panel.notifyDisposed();
			this._panels.delete(handle);
		}
	}

	dispose(): void {
		this._toDispose.dispose();
	}
}
