/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const OpenIssueReporterActionId = 'workbench.action.openIssueReporter';

export interface OpenIssueReporterArgs {
	readonly extensionId?: string;
	readonly issueTitle?: string;
	readonly issueBody?: string;
}
