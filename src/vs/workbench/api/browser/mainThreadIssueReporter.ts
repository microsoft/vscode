/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, ExtHostIssueReporterShape, MainContext, MainThreadIssueReporterShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IIssueDataProvider, IIssueUriRequestHandler, IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';

@extHostNamedCustomer(MainContext.MainThreadIssueReporter)
export class MainThreadIssueReporter extends Disposable implements MainThreadIssueReporterShape {
	private readonly _proxy: ExtHostIssueReporterShape;
	private readonly _registrationsUri = this._register(new DisposableMap<string>());
	private readonly _registrationsData = this._register(new DisposableMap<string>());

	constructor(
		context: IExtHostContext,
		@IWorkbenchIssueService private readonly _issueService: IWorkbenchIssueService
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostIssueReporter);
	}

	$registerIssueUriRequestHandler(extensionId: string): void {
		const handler: IIssueUriRequestHandler = {
			provideIssueUrl: async (token: CancellationToken) => {
				const parts = await this._proxy.$getIssueReporterUri(extensionId, token);
				return URI.from(parts);
			}
		};
		this._registrationsUri.set(extensionId, this._issueService.registerIssueUriRequestHandler(extensionId, handler));
	}

	$unregisterIssueUriRequestHandler(extensionId: string): void {
		this._registrationsUri.deleteAndDispose(extensionId);
	}

	$registerIssueDataProvider(extensionId: string): void {
		const provider: IIssueDataProvider = {
			provideIssueExtensionData: async (token: CancellationToken) => {
				const parts = await this._proxy.$getIssueReporterData(extensionId, token);
				return parts;
			},
			provideIssueExtensionTemplate: async (token: CancellationToken) => {
				const parts = await this._proxy.$getIssueReporterTemplate(extensionId, token);
				return parts;
			}
		};
		this._registrationsData.set(extensionId, this._issueService.registerIssueDataProvider(extensionId, provider));
	}

	$unregisterIssueDataProvider(extensionId: string): void {
		this._registrationsData.deleteAndDispose(extensionId);
	}
}
