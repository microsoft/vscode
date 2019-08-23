/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IssueReporterData } from 'vs/platform/issue/node/issue';

export const IWorkbenchIssueService = createDecorator<IWorkbenchIssueService>('workbenchIssueService');

export interface IWorkbenchIssueService {
	_serviceBrand: any;
	openReporter(dataOverrides?: Partial<IssueReporterData>): Promise<void>;
	openProcessExplorer(): Promise<void>;
}
