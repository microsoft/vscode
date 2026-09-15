/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../chat/common/tools/languageModelToolsService.js';
import { IIssueDiagnosticsService } from './issueDiagnosticsService.js';

export const GET_VSCODE_INFO_TOOL_ID = 'vscode_getVSCodeInfo';
export const SEARCH_VSCODE_LOGS_TOOL_ID = 'vscode_searchVSCodeLogs';

export const GetVSCodeInfoToolData: IToolData = {
	id: GET_VSCODE_INFO_TOOL_ID,
	toolReferenceName: 'getVSCodeInfo',
	displayName: localize('issueWizard.getVSCodeInfo.displayName', "Get VS Code Info"),
	userDescription: localize('issueWizard.getVSCodeInfo.userDescription', "Get this running VS Code build's version, quality, and commit."),
	modelDescription: 'Returns the running VS Code product version, quality, and commit directly from VS Code. Use this instead of asking the user to open About or run a shell command.',
	source: ToolDataSource.Internal,
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
	canRequestPreApproval: true,
	alwaysDisplayInputOutput: true,
	inputSchema: {
		type: 'object',
		properties: {},
		additionalProperties: false,
	},
};

export const SearchVSCodeLogsToolData: IToolData = {
	id: SEARCH_VSCODE_LOGS_TOOL_ID,
	toolReferenceName: 'searchVSCodeLogs',
	displayName: localize('issueWizard.searchVSCodeLogs.displayName', "Search VS Code Logs"),
	userDescription: localize('issueWizard.searchVSCodeLogs.userDescription', "Discover or search this run's VS Code logs and Output channels."),
	modelDescription: 'Discover and perform a bounded, case-insensitive literal search of the current VS Code run logs and registered Output channels. Omit query to list valid source IDs, then search only the most relevant sources. Start with at most 10 results. Never ask the user to locate or paste logs when this tool can retrieve the evidence. Invoke this tool only one at a time and wait for each result before starting another search so a session approval covers subsequent searches.',
	source: ToolDataSource.Internal,
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
	canRequestPreApproval: true,
	alwaysDisplayInputOutput: true,
	inputSchema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: localize('issueWizard.searchVSCodeLogs.query', "Case-insensitive literal text to find. Omit to list the available current-run sources."),
			},
			sources: {
				type: 'array',
				items: { type: 'string' },
				maxItems: 50,
				description: localize('issueWizard.searchVSCodeLogs.sources', "Optional source IDs returned by an earlier discovery call."),
			},
			maxResults: {
				type: 'integer',
				minimum: 1,
				maximum: 50,
				default: 10,
				description: localize('issueWizard.searchVSCodeLogs.maxResults', "Maximum number of matching log lines to return. Start with 10 or fewer and increase only when a scoped search reaches the limit."),
			},
		},
		additionalProperties: false,
	},
};

/** Language-model tool that exposes only trusted VS Code build metadata. */
export class GetVSCodeInfoTool implements IToolImpl {
	constructor(private readonly diagnosticsService: IIssueDiagnosticsService) { }

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		return {
			content: [{ kind: 'text', value: JSON.stringify(this.diagnosticsService.getProductInfo(), undefined, 2) }],
			toolResultMessage: localize('issueWizard.getVSCodeInfo.complete', "Read VS Code build information"),
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('issueWizard.getVSCodeInfo.invoking', "Reading VS Code build information"),
			pastTenseMessage: localize('issueWizard.getVSCodeInfo.past', "Read VS Code build information"),
			confirmationMessages: {
				title: localize('issueWizard.getVSCodeInfo.confirmTitle', "Allow VS Code build information to be read?"),
				message: localize('issueWizard.getVSCodeInfo.confirmMessage', "This shares this running build's version, quality, and commit with the agent."),
				allowAutoConfirm: false,
			},
		};
	}
}

/** Parameters accepted by the bounded current-run log search tool. */
interface ISearchVSCodeLogsParameters {
	readonly query?: string;
	readonly sources?: readonly string[];
	readonly maxResults?: number;
}

/** Language-model tool for discovering and searching current-run VS Code diagnostics. */
export class SearchVSCodeLogsTool implements IToolImpl {
	constructor(private readonly diagnosticsService: IIssueDiagnosticsService) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const parameters = invocation.parameters as ISearchVSCodeLogsParameters;
		const result = parameters.query?.trim()
			? await this.diagnosticsService.searchLogs({ query: parameters.query, sources: parameters.sources, maxResults: parameters.maxResults }, token)
			: { sources: await this.diagnosticsService.getLogSources(token) };
		return {
			content: [{ kind: 'text', value: JSON.stringify(result, undefined, 2) }],
			toolResultMessage: parameters.query?.trim()
				? localize('issueWizard.searchVSCodeLogs.complete', "Searched VS Code logs")
				: localize('issueWizard.searchVSCodeLogs.discovered', "Listed VS Code log sources"),
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const parameters = context.parameters as ISearchVSCodeLogsParameters;
		const searching = !!parameters.query?.trim();
		return {
			invocationMessage: searching
				? localize('issueWizard.searchVSCodeLogs.invoking', "Searching VS Code logs")
				: localize('issueWizard.searchVSCodeLogs.listing', "Listing VS Code log sources"),
			pastTenseMessage: searching
				? localize('issueWizard.searchVSCodeLogs.past', "Searched VS Code logs")
				: localize('issueWizard.searchVSCodeLogs.listed', "Listed VS Code log sources"),
			confirmationMessages: {
				title: searching
					? localize('issueWizard.searchVSCodeLogs.confirmSearchTitle', "Allow VS Code logs to be searched?")
					: localize('issueWizard.searchVSCodeLogs.confirmListTitle', "Allow VS Code log sources to be listed?"),
				message: localize('issueWizard.searchVSCodeLogs.confirmMessage', "Logs can contain file paths, repository names, extension output, and other sensitive information. Only bounded source names or matching lines are returned. Choose the session approval option to let subsequent searches run without another prompt."),
				allowAutoConfirm: true,
			},
		};
	}
}

/** Registers the Issue Wizard's read-only diagnostic tools for editor Agent Host sessions. */
export class IssueWizardDiagnosticToolsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.issueWizardDiagnosticTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IIssueDiagnosticsService diagnosticsService: IIssueDiagnosticsService,
	) {
		super();
		this._register(toolsService.registerTool(GetVSCodeInfoToolData, new GetVSCodeInfoTool(diagnosticsService)));
		this._register(toolsService.registerTool(SearchVSCodeLogsToolData, new SearchVSCodeLogsTool(diagnosticsService)));
	}
}
