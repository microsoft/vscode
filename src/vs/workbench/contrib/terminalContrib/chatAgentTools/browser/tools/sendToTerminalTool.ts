/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { buildCommandDisplayText, isPowerShell, normalizeCommandForExecution } from '../runInTerminalHelpers.js';
import { RunInTerminalToolTelemetry } from '../runInTerminalToolTelemetry.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../treeSitterCommandParser.js';
import type { ICommandLineAnalyzerOptions } from './commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineAutoApproveAnalyzer } from './commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { RunInTerminalTool, TerminalProfileFetcher } from './runInTerminalTool.js';
import { isSessionAutoApproveLevel, isTerminalAutoApproveAllowed } from './terminalToolAutoApprove.js';
import { TerminalToolId } from './toolIds.js';

export const SendToTerminalToolData: IToolData = {
	id: TerminalToolId.SendToTerminal,
	toolReferenceName: 'sendToTerminal',
	displayName: localize('sendToTerminalTool.displayName', 'Send to Terminal'),
	modelDescription: `Send a command to an existing persistent terminal session started with ${TerminalToolId.RunInTerminal} in async mode (legacy: isBackground=true). Use this for long-running terminal workflows. The ID must be the exact opaque value returned by ${TerminalToolId.RunInTerminal}. After sending, use ${TerminalToolId.GetTerminalOutput} to check updated output.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of the persistent terminal session to send a command to (returned by ${TerminalToolId.RunInTerminal} in async mode).`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
			command: {
				type: 'string',
				description: 'The command to send to the terminal. The text will be sent followed by Enter to execute it.'
			},
		},
		required: [
			'id',
			'command',
		]
	}
};

export interface ISendToTerminalInputParams {
	id: string;
	command: string;
}

const SEND_TO_TERMINAL_REFERENCE_NAME = 'sendToTerminal';

export class SendToTerminalTool extends Disposable implements IToolImpl {

	private readonly _autoApproveAnalyzer: CommandLineAutoApproveAnalyzer;
	private readonly _profileFetcher: TerminalProfileFetcher;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();

		const treeSitterCommandParser = this._register(instantiationService.createInstance(TreeSitterCommandParser));
		const telemetry = instantiationService.createInstance(RunInTerminalToolTelemetry);
		this._autoApproveAnalyzer = this._register(instantiationService.createInstance(
			CommandLineAutoApproveAnalyzer,
			treeSitterCommandParser,
			telemetry,
			(message: string, ...args: unknown[]) => this._logService.info(`SendToTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, ...args),
		));
		this._profileFetcher = instantiationService.createInstance(TerminalProfileFetcher);
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as ISendToTerminalInputParams;
		const displayCommand = buildCommandDisplayText(args.command);

		const invocationMessage = new MarkdownString();
		invocationMessage.appendText(localize('send.progressive', "Sending {0} to terminal", displayCommand));

		const pastTenseMessage = new MarkdownString();
		pastTenseMessage.appendText(localize('send.past', "Sent {0} to terminal", displayCommand));

		const confirmationMessage = new MarkdownString();
		confirmationMessage.appendText(localize('send.confirm.message', "Run {0} in background terminal {1}", displayCommand, args.id));

		// Determine auto-approval, aligned with runInTerminal
		const chatSessionResource = context.chatSessionResource;
		const isSessionAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);

		let isFinalAutoApproved = false;
		if (!isSessionAutoApproved) {
			const isAutoApproveAllowed = isTerminalAutoApproveAllowed(SEND_TO_TERMINAL_REFERENCE_NAME, this._configurationService, this._storageService);

			// Only run the analyzer when auto-approve is allowed; otherwise the command
			// will always require manual confirmation and running the analyzer is unnecessary.
			if (isAutoApproveAllowed) {
				const [os, shell] = await Promise.all([
					this._profileFetcher.osBackend,
					this._profileFetcher.getCopilotShell(),
				]);

				const execution = RunInTerminalTool.getExecution(args.id);
				const cwd = execution ? await execution.instance.getCwdResource() : undefined;

				const analyzerOptions: ICommandLineAnalyzerOptions = {
					commandLine: args.command,
					cwd,
					os,
					shell,
					treeSitterLanguage: isPowerShell(shell, os) ? TreeSitterCommandParserLanguage.PowerShell : TreeSitterCommandParserLanguage.Bash,
					terminalToolSessionId: generateUuid(),
					chatSessionResource,
					requiresUnsandboxConfirmation: false,
				};

				const analyzerResult = await this._autoApproveAnalyzer.analyze(analyzerOptions);
				const wouldBeAutoApproved = (
					analyzerResult.isAutoApproved === true &&
					analyzerResult.isAutoApproveAllowed
				);
				isFinalAutoApproved = analyzerResult.isAutoApproveAllowed && (wouldBeAutoApproved || !!analyzerResult.forceAutoApproval);
			}
		}

		const shouldShowConfirmation = (!isFinalAutoApproved && !isSessionAutoApproved) || context.forceConfirmationReason !== undefined;
		const confirmationMessages = shouldShowConfirmation ? {
			title: localize('send.confirm.title', "Send to Terminal"),
			message: confirmationMessage,
			allowAutoConfirm: undefined,
		} : undefined;

		return {
			invocationMessage,
			pastTenseMessage,
			confirmationMessages,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as ISendToTerminalInputParams;

		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal}.`
				}]
			};
		}

		await execution.instance.sendText(normalizeCommandForExecution(args.command), true);

		return {
			content: [{
				kind: 'text',
				value: `Successfully sent command to terminal ${args.id}. Use ${TerminalToolId.GetTerminalOutput} to check for updated output.`
			}]
		};
	}
}
