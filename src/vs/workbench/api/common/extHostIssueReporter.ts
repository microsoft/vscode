/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IssueUriRequestHandler } from 'vscode';
import { CancellationToken } from 'vs/base/common/cancellation';
import { UriComponents } from 'vs/base/common/uri';
import { ExtHostIssueReporterShape, IMainContext, MainContext, MainThreadIssueReporterShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';

export class ExtHostIssueReporter implements ExtHostIssueReporterShape {
	private _IssueUriRequestHandlers: Map<string, IssueUriRequestHandler> = new Map();

	private readonly _proxy: MainThreadIssueReporterShape;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadIssueReporter);
	}

	async $getIssueReporterUri(extensionId: string, token: CancellationToken): Promise<UriComponents> {
		if (this._IssueUriRequestHandlers.size === 0) {
			throw new Error('No issue request handlers registered');
		}

		const provider = this._IssueUriRequestHandlers.get(extensionId);
		if (!provider) {
			throw new Error('Issue request handler not found');
		}

		const result = await provider.handleIssueUrlRequest();
		if (!result) {
			throw new Error('Issue request handler returned no result');
		}
		return result;
	}

	registerIssueUriRequestHandler(extension: IExtensionDescription, provider: IssueUriRequestHandler): Disposable {
		const extensionId = extension.identifier.value;
		this._IssueUriRequestHandlers.set(extensionId, provider);
		this._proxy.$registerIssueUriRequestHandler(extensionId);
		return new Disposable(() => {
			this._proxy.$unregisterIssueUriRequestHandler(extensionId);
			this._IssueUriRequestHandlers.delete(extensionId);
		});
	}
}
