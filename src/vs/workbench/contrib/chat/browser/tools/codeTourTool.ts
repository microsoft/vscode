/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatCodeTourStop } from '../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { WorkingDirectory } from '../../common/workingDirectory.js';
import { ICodeTourService } from '../codeTour/codeTourService.js';

export const CodeTourToolId = 'vscode_codeTour';
export const CodeTourToolReferenceName = 'codeTour';

export const CodeTourToolData: IToolData = {
	id: CodeTourToolId,
	toolReferenceName: CodeTourToolReferenceName,
	displayName: localize('codeTourTool.displayName', 'Code Tour'),
	userDescription: localize('codeTourTool.userDescription', 'Walk the user through code by opening and highlighting one stop at a time'),
	modelDescription: `Present ONE stop of a guided code tour: open a file in the editor, reveal and highlight the relevant range, and optionally open a page in the integrated browser. Use this to explain an existing implementation or a design you are proposing, so the user sees exactly the code you are talking about.

Call this tool once per stop, in the order you want the user to follow. The chat renders a tour widget that accumulates the stops, so the user can jump back to any of them.

Guidelines:
- Pass "tourTitle" on the first call only. It names the whole tour.
- Keep "narration" to a few sentences that explain what this specific stop shows and why it matters. Do not repeat the narration in your assistant message.
- Prefer precise ranges. Use "startLine"/"endLine" when you know them; use "symbol" when you only know the name of a function, class, or method.
- Aim for 3 to 8 stops. Order them so each one builds on the last.
- Set "isLast" on the final stop, then write a short wrap-up message.
- If the result says the user stopped the tour, stop calling this tool and respond to the user instead.`,
	icon: Codicon.mapVertical,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			tourTitle: {
				type: 'string',
				description: 'Title of the whole tour. Required on the first stop, ignored afterwards.'
			},
			stopTitle: {
				type: 'string',
				description: 'Short label for this stop, shown in the tour widget (e.g. "Where the request is parsed").'
			},
			narration: {
				type: 'string',
				description: 'Markdown explanation of this stop. A few sentences describing what this code does and why it matters to the explanation.'
			},
			file: {
				type: 'string',
				description: 'File to open for this stop, as a workspace-relative path or an absolute path. Omit for a narration-only stop.'
			},
			startLine: {
				type: 'number',
				description: 'First line of the range to reveal and highlight (1-based).'
			},
			endLine: {
				type: 'number',
				description: 'Last line of the range to reveal and highlight (1-based, inclusive). Defaults to "startLine".'
			},
			symbol: {
				type: 'string',
				description: 'Name of the function, class, or method to reveal when you do not know the line numbers. Ignored when "startLine" is provided.'
			},
			url: {
				type: 'string',
				description: 'Absolute http(s) URL to open in the integrated browser alongside this stop, for example rendered docs or a running app.'
			},
			isLast: {
				type: 'boolean',
				description: 'Set to true on the final stop of the tour.'
			}
		},
		required: ['stopTitle', 'narration'],
	},
};

interface ICodeTourToolParams {
	tourTitle?: string;
	stopTitle: string;
	narration: string;
	file?: string;
	startLine?: number;
	endLine?: number;
	symbol?: string;
	url?: string;
	isLast?: boolean;
}

/** Normalizes a model-supplied URL, or returns `undefined` when it is not a usable absolute URL. */
function normalizeUrl(url: string | undefined): string | undefined {
	return url ? URL.parse(url)?.href : undefined;
}

export class CodeTourTool implements IToolImpl {

	constructor(
		@ICodeTourService private readonly _codeTourService: ICodeTourService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentNetworkFilterService private readonly _agentNetworkFilterService: IAgentNetworkFilterService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as ICodeTourToolParams;
		// Only the first stop renders the tour widget. Later stops append to the
		// same live `stops` array, so hiding them avoids a second widget and a
		// row of redundant progress messages.
		const isFirstStop = !context.chatSessionResource || !this._codeTourService.getActiveTour(context.chatSessionResource);
		const prepared: IPreparedToolInvocation = {
			invocationMessage: localize('codeTour.invocation', "Showing {0}", params.stopTitle),
			pastTenseMessage: localize('codeTour.past', "Showed {0}", params.stopTitle),
			presentation: isFirstStop ? undefined : ToolInvocationPresentation.Hidden,
		};

		// A stop that opens a page loads model-supplied content in the user's
		// browser session, so it goes through the same allow-list and
		// confirmation as the integrated browser tools.
		const url = normalizeUrl(params.url);
		if (!url) {
			return prepared;
		}
		if (!this._agentNetworkFilterService.isUriAllowed(URI.parse(url))) {
			throw new Error(this._agentNetworkFilterService.formatError(URI.parse(url)));
		}
		return {
			...prepared,
			// Hidden invocations cannot show a confirmation, so a stop with a URL
			// always renders.
			presentation: undefined,
			confirmationMessages: {
				title: localize('codeTour.confirmTitle', "Open Browser Page?"),
				message: localize('codeTour.confirmMessage', "The code tour wants to open {0} in the integrated browser.", url),
				allowAutoConfirm: true,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as ICodeTourToolParams;
		const sessionResource = invocation.context?.sessionResource;
		if (!sessionResource) {
			return createToolSimpleTextResult('The code tour tool can only be used inside a chat session.');
		}

		if (this._codeTourService.isStopped(sessionResource)) {
			return createToolSimpleTextResult('The user stopped the tour. Do not present more stops; respond to the user directly instead.');
		}

		const isFirstStop = !this._codeTourService.getActiveTour(sessionResource);
		if (isFirstStop) {
			this._codeTourService.startTour(sessionResource, params.tourTitle?.trim() || localize('codeTour.defaultTitle', "Code tour"));
		}

		const { uri, range, note } = await this._resolveLocation(params, invocation);
		const url = normalizeUrl(params.url);
		const stop: IChatCodeTourStop = {
			title: params.stopTitle,
			narration: params.narration,
			uri,
			range,
			url: url && this._agentNetworkFilterService.isUriAllowed(URI.parse(url)) ? url : undefined,
		};

		const added = await this._codeTourService.addStop(sessionResource, stop, !!params.isLast);
		if (!added) {
			return createToolSimpleTextResult('This tour has already ended. Do not present more stops; summarize the explanation for the user instead.');
		}

		// Only the first stop carries the widget. Later stops mutate the same
		// live `stops` array, so the widget grows without rendering a second one.
		const tour = this._codeTourService.getActiveTour(sessionResource);
		const messages = [`Showed stop ${tour?.stops.length ?? 1}: ${params.stopTitle}.`];
		if (note) {
			messages.push(note);
		}
		if (params.isLast) {
			messages.push('This was the final stop. Wrap up the explanation for the user.');
		}

		return {
			content: [{ kind: 'text', value: messages.join(' ') }],
			toolSpecificData: isFirstStop ? tour : undefined,
		};
	}

	/**
	 * Turns the model-supplied file/line/symbol input into a concrete location,
	 * along with a note explaining any part that could not be resolved so the
	 * model can correct itself on the next stop.
	 */
	private async _resolveLocation(params: ICodeTourToolParams, invocation: IToolInvocation): Promise<{ uri?: URI; range?: IChatCodeTourStop['range']; note?: string }> {
		if (!params.file) {
			return {};
		}

		const workingDir = new WorkingDirectory(this._workspaceContextService, invocation.context?.workingDirectory);
		const uri = workingDir.resolveRelativePath(params.file);
		if (!uri) {
			return { note: `Could not resolve "${params.file}" inside the workspace, so no file was opened for this stop.` };
		}

		const range = await this._codeTourService.resolveRange(uri, params.startLine, params.endLine, params.symbol);
		if (!range && (params.symbol || params.startLine !== undefined)) {
			return { uri, note: 'Could not resolve the requested range, so the file was opened without a highlight. Provide startLine/endLine for the next stop.' };
		}

		return { uri, range };
	}
}

export class CodeTourToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.codeTourTool';

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._update();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.CodeTourEnabled)) {
				this._update();
			}
		}));
	}

	private _update(): void {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.CodeTourEnabled)) {
			this._registration.clear();
			return;
		}
		if (!this._registration.value) {
			this._registration.value = this._toolsService.registerTool(CodeTourToolData, this._instantiationService.createInstance(CodeTourTool));
		}
	}
}
