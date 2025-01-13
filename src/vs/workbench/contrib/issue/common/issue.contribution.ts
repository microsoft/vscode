/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { ICommandAction } from '../../../../platform/action/common/action.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandMetadata } from '../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchIssueService, IssueReporterData } from './issue.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

const OpenIssueReporterActionId = 'workbench.action.openIssueReporter';
const OpenIssueReporterApiId = 'vscode.openIssueReporter';

const OpenIssueReporterCommandMetadata: ICommandMetadata = {
	description: 'Open the issue reporter and optionally prefill part of the form.',
	args: [
		{
			name: 'options',
			description: 'Data to use to prefill the issue reporter with.',
			isOptional: true,
			schema: {
				oneOf: [
					{
						type: 'string',
						description: 'The extension id to preselect.'
					},
					{
						type: 'object',
						properties: {
							extensionId: {
								type: 'string'
							},
							issueTitle: {
								type: 'string'
							},
							issueBody: {
								type: 'string'
							}
						}

					}
				]
			}
		},
	]
};

interface OpenIssueReporterArgs {
	readonly extensionId?: string;
	readonly issueTitle?: string;
	readonly issueBody?: string;
	readonly extensionData?: string;
}

export class BaseIssueContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!productService.reportIssueUrl) {
			return;
		}

		this._register(CommandsRegistry.registerCommand({
			id: OpenIssueReporterActionId,
			handler: function (accessor, args?: string | [string] | OpenIssueReporterArgs) {
				const data: Partial<IssueReporterData> =
					typeof args === 'string'
						? { extensionId: args }
						: Array.isArray(args)
							? { extensionId: args[0] }
							: args ?? {};

				return accessor.get(IWorkbenchIssueService).openReporter(data);
			},
			metadata: OpenIssueReporterCommandMetadata
		}));

		this._register(CommandsRegistry.registerCommand({
			id: OpenIssueReporterApiId,
			handler: function (accessor, args?: string | [string] | OpenIssueReporterArgs) {
				const data: Partial<IssueReporterData> =
					typeof args === 'string'
						? { extensionId: args }
						: Array.isArray(args)
							? { extensionId: args[0] }
							: args ?? {};

				return accessor.get(IWorkbenchIssueService).openReporter(data);
			},
			metadata: OpenIssueReporterCommandMetadata
		}));

		const reportIssue: ICommandAction = {
			id: OpenIssueReporterActionId,
			title: localize2({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue..."),
			category: Categories.Help
		};

		this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: reportIssue }));

		this._register(MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
			group: '3_feedback',
			command: {
				id: OpenIssueReporterActionId,
				title: localize({ key: 'miReportIssue', comment: ['&& denotes a mnemonic', 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue")
			},
			order: 3
		}));
	}
}
