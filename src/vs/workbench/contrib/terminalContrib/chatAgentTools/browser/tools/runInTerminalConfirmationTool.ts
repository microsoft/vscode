/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { IAgentSessionsService } from '../../../../chat/browser/agentSessions/agentSessionsService.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { TerminalToolId } from './toolIds.js';

export const ConfirmTerminalCommandToolData: IToolData = {
	id: TerminalToolId.ConfirmTerminalCommand,
	displayName: localize('confirmTerminalCommandTool.displayName', 'Confirm Terminal Command'),
	modelDescription: [
		'This tool allows you to get explicit user confirmation for a terminal command without executing it.',
		'',
		'When to use:',
		'- When you need to verify user approval before executing a command',
		'- When you want to show command details, auto-approval status, and simplified versions to the user',
		'- When you need the user to review a potentially risky command',
		'',
		'The tool will:',
		'- Show the command with syntax highlighting',
		'- Display auto-approval status if enabled',
		'- Show simplified version of the command if applicable',
		'- Provide custom actions for creating auto-approval rules',
		'- Return approval/rejection status',
		'',
		'After confirmation, use a tool to actually execute the command.'
	].join('\n'),
	userDescription: localize('confirmTerminalCommandTool.userDescription', 'Tool for confirming terminal commands'),
	source: ToolDataSource.Internal,
	icon: Codicon.shield,
	inputSchema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description: 'The command to confirm with the user.'
			},
			explanation: {
				type: 'string',
				description: 'A one-sentence description of what the command does. This will be shown to the user in the confirmation dialog.'
			},
			isBackground: {
				type: 'boolean',
				description: 'Whether the command would start a background process. This provides context for the confirmation.'
			},
		},
		required: [
			'command',
			'explanation',
			'isBackground',
		]
	}
};

export class ConfirmTerminalCommandTool extends RunInTerminalTool {
	constructor(
		@IChatService _chatService: IChatService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IFileService _fileService: IFileService,
		@IHistoryService _historyService: IHistoryService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@ILabelService _labelService: ILabelService,
		@ILanguageModelToolsService _languageModelToolsService: ILanguageModelToolsService,
		@IRemoteAgentService _remoteAgentService: IRemoteAgentService,
		@IStorageService _storageService: IStorageService,
		@ITerminalChatService _terminalChatService: ITerminalChatService,
		@ITerminalLogService _logService: ITerminalLogService,
		@ITerminalService _terminalService: ITerminalService,
		@IWorkspaceContextService _workspaceContextService: IWorkspaceContextService,
		@IChatWidgetService _chatWidgetService: IChatWidgetService,
		@IAgentSessionsService _agentSessionsService: IAgentSessionsService,
	) {
		super(
			false, // enableSandboxing
			_chatService,
			_configurationService,
			_fileService,
			_historyService,
			_instantiationService,
			_labelService,
			_languageModelToolsService,
			_remoteAgentService,
			_storageService,
			_terminalChatService,
			_logService,
			_terminalService,
			_workspaceContextService,
			_chatWidgetService,
			_agentSessionsService,
		);
	}

	override async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const preparedInvocation = await super.prepareToolInvocation(context, token);
		if (preparedInvocation) {
			preparedInvocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
		}
		return preparedInvocation;
	}
	override async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		// This is a confirmation-only tool - just return success
		return {
			content: [{
				kind: 'text',
				value: 'yes'
			}]
		};
	}
}
