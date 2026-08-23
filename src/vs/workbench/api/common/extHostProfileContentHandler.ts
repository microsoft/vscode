/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { isString } from '../../../base/common/types.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ISaveProfileResult } from '../../services/userDataProfile/common/userDataProfile.js';
import type * as vscode from 'vscode';
import { ExtHostProfileContentHandlersShape, IMainContext, MainContext, MainThreadProfileContentHandlersShape } from './extHost.protocol.js';


export class ExtHostProfileContentHandlers implements ExtHostProfileContentHandlersShape {

	private readonly proxy: MainThreadProfileContentHandlersShape;

	private readonly handlers = new Map<string, vscode.ProfileContentHandler>();

	constructor(
		mainContext: IMainContext,
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadProfileContentHandlers);
	}

	registerProfileContentHandler(
		extension: IExtensionDescription,
		id: string,
		handler: vscode.ProfileContentHandler,
	): vscode.Disposable {
		checkProposedApiEnabled(extension, 'profileContentHandlers');
		if (this.handlers.has(id)) {
			throw new Error(`Handler with id '${id}' already registered`);
		}

		this.handlers.set(id, handler);
		this.proxy.$registerProfileContentHandler(id, handler.name, handler.description, extension.identifier.value);

		return toDisposable(() => {
			this.handlers.delete(id);
			this.proxy.$unregisterProfileContentHandler(id);
		});
	}

	async $saveProfile(id: string, name: string, content: string, token: CancellationToken): Promise<ISaveProfileResult | null> {
		const handler = this.handlers.get(id);
		if (!handler) {
			throw new Error(`Unknown handler with id: ${id}`);
		}

		return handler.saveProfile(name, content, token);
	}

	async $readProfile(id: string, idOrUri: string | UriComponents, token: CancellationToken): Promise<string | null> {
		const handler = this.handlers.get(id);
		if (!handler) {
			throw new Error(`Unknown handler with id: ${id}`);
		}

		return handler.readProfile(isString(idOrUri) ? idOrUri : URI.revive(idOrUri), token);
	}
}
