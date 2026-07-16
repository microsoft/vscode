/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { PromptElement, PromptReference, TokenLimit } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { raceTimeoutAndCancellationError } from '../../../util/common/racePromise';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { isLocation, isUri } from '../../../util/common/types';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { basename } from '../../../util/vs/base/common/path';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString } from '../../../vscodeTypes';
import { getUniqueReferences } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { CodebaseToolCallingLoop } from '../../prompt/node/codebaseToolCalling';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ToolCallResultWrapper } from '../../prompts/node/panel/toolCalling';
import { WorkspaceContext, WorkspaceContextProps } from '../../prompts/node/panel/workspace/workspaceContext';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';

export interface ICodebaseToolParams {
	query: string;

	// Internal parameter only.
	scopedDirectories?: string[]; // Allows to scope the search to a specific set of directories.
}

export class CodebaseTool implements vscode.LanguageModelTool<ICodebaseToolParams> {
	public static readonly toolName = ToolName.Codebase;
	public static readonly nonDeferred = true;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IWorkspaceChunkSearchService private readonly workspaceChunkSearchService: IWorkspaceChunkSearchService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ICodebaseToolParams>, token: CancellationToken) {
		if (this._input && this._isCodebaseAgentCall(options)) {
			const input = this._input;
			this._input = undefined; // consumed
			return this.invokeCodebaseAgent(input, token);
		}

		if (!options.input.query) {
			throw new Error('Invalid input');
		}

		const query = options.input.query.replace(/^\s*#codebase\s+/, '').trim();

		let references: PromptReference[] = [];
		const id = generateUuid();
		const sw = StopWatch.create();
		const promptTsxResult = await raceTimeoutAndCancellationError(
			async searchToken => {
				const hasSemanticSearch = await this.workspaceChunkSearchService.isAvailable();
				if (!hasSemanticSearch) {
					return null; // Use null as undefined is treated as a timeout by raceTimeoutAndCancellationError
				}

				return renderPromptElementJSON(this.instantiationService, WorkspaceContextWrapper, {
					telemetryInfo: new TelemetryCorrelationId('codebaseTool', id),
					query,
					maxResults: 32,
					scopedDirectories: options.input.scopedDirectories?.map(dir => URI.file(dir)),
					referencesOut: references,
					isToolCall: true,
					lines1Indexed: true,
					absolutePaths: true,
					priority: 100,
				}, undefined, searchToken);
			},
			token,
			20_000,
			'Codebase search timed out, try a different search tool',
		);
		const durationMs = sw.elapsed();

		// If workspace chunk search is not available, return an empty result with this info
		if (!promptTsxResult) {
			const result = new ExtendedLanguageModelToolResult([]);
			result.toolResultMessage = new MarkdownString(l10n.t`Semantic workspace search is not currently available`);
			return result;
		}

		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelPromptTsxPart(promptTsxResult)
		]);
		references = getUniqueReferences(references);

		/* __GDPR__
			"codebaseToolInvoked" : {
				"owner": "roblourens",
				"comment": "Tracks the timing and result count of codebase tool invocations",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"resultCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of results returned", "isMeasurement": true },
				"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Duration of the codebase search in milliseconds", "isMeasurement": true }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('codebaseToolInvoked', {
			requestId: options.chatRequestId,
		}, {
			resultCount: references.length,
			durationMs,
		});
		result.toolResultMessage = references.length === 0 ?
			new MarkdownString(l10n.t`Searched ${this.getDisplaySearchTarget(options.input)} for "${query}", no results`) :
			references.length === 1 ?
				new MarkdownString(l10n.t`Searched ${this.getDisplaySearchTarget(options.input)} for "${query}", 1 result`) :
				new MarkdownString(l10n.t`Searched ${this.getDisplaySearchTarget(options.input)} for "${query}", ${references.length} results`);
		result.toolResultDetails = references
			.map(r => r.anchor)
			.filter(r => isUri(r) || isLocation(r));
		return result;
	}

	private async invokeCodebaseAgent(input: IBuildPromptContext, token: CancellationToken) {
		if (!input.request || !input.conversation) {
			throw new Error('Invalid input');
		}

		const codebaseTool = this.instantiationService.createInstance(CodebaseToolCallingLoop, {
			toolCallLimit: 5,
			conversation: input.conversation,
			request: input.request,
			location: input.request.location,
		});

		const toolCallLoopResult = await codebaseTool.run(undefined, token);
		const promptElement = await renderPromptElementJSON(this.instantiationService, ToolCallResultWrapper, { toolCallResults: toolCallLoopResult.toolCallResults });

		return { content: [new LanguageModelPromptTsxPart(promptElement)] };
	}

	private _input: IBuildPromptContext | undefined;
	async provideInput(promptContext: IBuildPromptContext): Promise<IBuildPromptContext> {
		this._input = promptContext; // TODO@joyceerhl @roblourens HACK: Avoid types in the input being serialized and not deserialized when they go through invokeTool
		return promptContext;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ICodebaseToolParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		if (this._input && this._isCodebaseAgentCall(options)) {
			return {
				presentation: 'hidden'
			};
		}

		return {
			invocationMessage: new MarkdownString(l10n.t`Searching ${this.getDisplaySearchTarget(options.input)} for "${options.input.query}"`),
		};
	}

	private getDisplaySearchTarget(input: ICodebaseToolParams): string {
		let targetSearch;
		if (input.scopedDirectories && input.scopedDirectories.length === 1) {
			targetSearch = `${basename(input.scopedDirectories[0])}`;
		} else if (input.scopedDirectories && input.scopedDirectories.length > 1) {
			targetSearch = l10n.t("{0} directories", input.scopedDirectories.length);
		} else {
			targetSearch = l10n.t("codebase");
		}

		return targetSearch;
	}

	private _isCodebaseAgentCall(options: vscode.LanguageModelToolInvocationPrepareOptions<ICodebaseToolParams> | vscode.LanguageModelToolInvocationOptions<ICodebaseToolParams>): boolean {
		const input = options.input;
		const agentEnabled = this.configurationService.getConfig(ConfigKey.CodeSearchAgentEnabled);
		const noScopedDirectories = input.scopedDirectories === undefined || input.scopedDirectories.length === 0;

		// When anonymous (no GitHub session), always force agent path so we avoid relying on semantic index features.
		const isAnonymous = !this.authenticationService.anyGitHubSession;

		// Don't trigger nested tool calling loop if we're already in a subagent
		if (this._input?.tools?.subAgentInvocationId) {
			return false;
		}

		return (isAnonymous || agentEnabled) && noScopedDirectories;
	}
}

ToolRegistry.registerTool(CodebaseTool);

class WorkspaceContextWrapper extends PromptElement<WorkspaceContextProps> {
	constructor(
		props: WorkspaceContextProps,
	) {
		super(props);
	}

	render() {
		// Main limit is set via maxChunks. Set a TokenLimit just to be sure.
		return <TokenLimit max={28_000}>
			<WorkspaceContext {...this.props} />
		</TokenLimit>;
	}
}
