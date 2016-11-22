/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { SCMProvider, SCMDelegate, SCMResourceGroup } from 'vscode';
import { MainContext, MainThreadSCMShape } from './extHost.protocol';

export class ExtHostSCMProvider implements SCMProvider {

	private static ID_GEN = 0;
	private _id: number = ExtHostSCMProvider.ID_GEN++;

	constructor(
		private _proxy: MainThreadSCMShape,
		private _delegate: SCMDelegate
	) { }

	get id(): number {
		return this._id;
	}

	createResourceGroup(id: string, label: string): SCMResourceGroup {
		// throw new Error('JOAO not implemented');
		return null;
	}

	dispose(): void {
		// todo
	}
}

export class ExtHostSCM {

	private _proxy: MainThreadSCMShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
	}

	createSCMProvider(id: string, delegate: SCMDelegate): ExtHostSCMProvider {
		return new ExtHostSCMProvider(this._proxy, delegate);
	}
}
