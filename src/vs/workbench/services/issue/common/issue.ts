/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IssueReporterData } from 'vs/platform/issue/common/issue';

export interface IIssueUriRequestHandler {
	provideIssueUrl(token: CancellationToken): Promise<URI>;
}

export const IWorkbenchIssueService = createDecorator<IWorkbenchIssueService>('workbenchIssueService');

export interface IWorkbenchIssueService {
	readonly _serviceBrand: undefined;
	openReporter(dataOverrides?: Partial<IssueReporterData>): Promise<void>;
	openProcessExplorer(): Promise<void>;
	registerIssueUriRequestHandler(extensionId: string, handler: IIssueUriRequestHandler): IDisposable;
}
