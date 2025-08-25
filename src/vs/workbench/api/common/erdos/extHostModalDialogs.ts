/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extHostProtocol from './extHost.erdos.protocol.js';

export class ExtHostModalDialogs implements extHostProtocol.ExtHostModalDialogsShape {

	private readonly _proxy: extHostProtocol.MainThreadModalDialogsShape;

	constructor(
		mainContext: extHostProtocol.IMainErdosContext
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainErdosContext.MainThreadModalDialogs);
	}

	public showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Promise<boolean> {
		return this._proxy.$showSimpleModalDialogPrompt(title, message, okButtonTitle, cancelButtonTitle);
	}

	public showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Promise<null> {
		return this._proxy.$showSimpleModalDialogMessage(title, message, okButtonTitle);
	}

}