/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import {TPromise} from 'vs/base/common/winjs.base';
import {Disposable} from 'vs/workbench/api/node/extHostTypes';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {MainContext, ExtHostExplorersShape, MainThreadExplorersShape} from './extHost.protocol';

export class ExtHostExplorers extends ExtHostExplorersShape {
	private _proxy: MainThreadExplorersShape;

	private _treeContentProviders: { [treeContentProviderId: string]: vscode.TreeContentProvider; };

	constructor(threadService: IThreadService) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._treeContentProviders = Object.create(null);
	}

	public registerTreeContentProvider(provider: vscode.TreeContentProvider): vscode.Disposable {
		const treeContentProviderId = provider.id;

		if (this._treeContentProviders[treeContentProviderId]) {
			throw new Error(`TreeContentProvider with id '${provider.id} already registered`);
		}

		this._treeContentProviders[treeContentProviderId] = provider;
		this._proxy.$registerTreeContentProvider(treeContentProviderId);

		return new Disposable(() => {
			if (delete this._treeContentProviders[treeContentProviderId]) {
				this._proxy.$unregisterTreeContentProvider(treeContentProviderId);
			}
		});
	}

	$provideTextDocumentContent(treeContentProviderId: string): vscode.ITree {
		const provider = this._treeContentProviders[treeContentProviderId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${treeContentProviderId}'`);
		}

		return provider.provideTreeContent();
	}
}
