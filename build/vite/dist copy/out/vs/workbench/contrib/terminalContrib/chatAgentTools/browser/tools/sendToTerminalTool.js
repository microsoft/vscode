/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
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
import { ToolDataSource } from '../../../../chat/common/tools/languageModelToolsService.js';
import { buildCommandDisplayText, isPowerShell, normalizeCommandForExecution } from '../runInTerminalHelpers.js';
import { RunInTerminalToolTelemetry } from '../runInTerminalToolTelemetry.js';
import { TreeSitterCommandParser } from '../treeSitterCommandParser.js';
import { CommandLineAutoApproveAnalyzer } from './commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { RunInTerminalTool, TerminalProfileFetcher } from './runInTerminalTool.js';
import { isSessionAutoApproveLevel, isTerminalAutoApproveAllowed } from './terminalToolAutoApprove.js';
export const SendToTerminalToolData = {
    id: "send_to_terminal" /* TerminalToolId.SendToTerminal */,
    toolReferenceName: 'sendToTerminal',
    displayName: localize('sendToTerminalTool.displayName', 'Send to Terminal'),
    modelDescription: `Send a command to an existing persistent terminal session started with ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode (legacy: isBackground=true). Use this for long-running terminal workflows. The ID must be the exact opaque value returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */}. After sending, use ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check updated output.`,
    icon: Codicon.terminal,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: `The ID of the persistent terminal session to send a command to (returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode).`,
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
const SEND_TO_TERMINAL_REFERENCE_NAME = 'sendToTerminal';
let SendToTerminalTool = class SendToTerminalTool extends Disposable {
    constructor(_configurationService, instantiationService, _storageService, _logService, _chatService, _chatWidgetService) {
        super();
        this._configurationService = _configurationService;
        this._storageService = _storageService;
        this._logService = _logService;
        this._chatService = _chatService;
        this._chatWidgetService = _chatWidgetService;
        const treeSitterCommandParser = this._register(instantiationService.createInstance(TreeSitterCommandParser));
        const telemetry = instantiationService.createInstance(RunInTerminalToolTelemetry);
        this._autoApproveAnalyzer = this._register(instantiationService.createInstance(CommandLineAutoApproveAnalyzer, treeSitterCommandParser, telemetry, (message, ...args) => this._logService.info(`SendToTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, ...args)));
        this._profileFetcher = instantiationService.createInstance(TerminalProfileFetcher);
    }
    async prepareToolInvocation(context, _token) {
        const args = context.parameters;
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
                const analyzerOptions = {
                    commandLine: args.command,
                    cwd,
                    os,
                    shell,
                    treeSitterLanguage: isPowerShell(shell, os) ? "powershell" /* TreeSitterCommandParserLanguage.PowerShell */ : "bash" /* TreeSitterCommandParserLanguage.Bash */,
                    terminalToolSessionId: generateUuid(),
                    chatSessionResource,
                    requiresUnsandboxConfirmation: false,
                };
                const analyzerResult = await this._autoApproveAnalyzer.analyze(analyzerOptions);
                const wouldBeAutoApproved = (analyzerResult.isAutoApproved === true &&
                    analyzerResult.isAutoApproveAllowed);
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
    async invoke(invocation, _countTokens, _progress, _token) {
        const args = invocation.parameters;
        const execution = RunInTerminalTool.getExecution(args.id);
        if (!execution) {
            return {
                content: [{
                        kind: 'text',
                        value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid. The ID must be the exact value returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */}.`
                    }]
            };
        }
        await execution.instance.sendText(normalizeCommandForExecution(args.command), true);
        return {
            content: [{
                    kind: 'text',
                    value: `Successfully sent command to terminal ${args.id}. Use ${"get_terminal_output" /* TerminalToolId.GetTerminalOutput */} to check for updated output.`
                }]
        };
    }
};
SendToTerminalTool = __decorate([
    __param(0, IConfigurationService),
    __param(1, IInstantiationService),
    __param(2, IStorageService),
    __param(3, ITerminalLogService),
    __param(4, IChatService),
    __param(5, IChatWidgetService)
], SendToTerminalTool);
export { SendToTerminalTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VuZFRvVGVybWluYWxUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvc2VuZFRvVGVybWluYWxUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsY0FBYyxFQUE2TCxNQUFNLDREQUE0RCxDQUFDO0FBQ3ZSLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxZQUFZLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNqSCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsdUJBQXVCLEVBQW1DLE1BQU0sK0JBQStCLENBQUM7QUFFekcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHNCQUFzQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDbkYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLDRCQUE0QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHdkcsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQWM7SUFDaEQsRUFBRSx3REFBK0I7SUFDakMsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBQ25DLFdBQVcsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsa0JBQWtCLENBQUM7SUFDM0UsZ0JBQWdCLEVBQUUsMEVBQTBFLG9EQUE0QiwrSUFBK0ksb0RBQTRCLHdCQUF3Qiw0REFBZ0MsMkJBQTJCO0lBQ3RYLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUTtJQUN0QixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxFQUFFLEVBQUU7Z0JBQ0gsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLCtFQUErRSxvREFBNEIsa0JBQWtCO2dCQUMxSSxPQUFPLEVBQUUsNEZBQTRGO2FBQ3JHO1lBQ0QsT0FBTyxFQUFFO2dCQUNSLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSw2RkFBNkY7YUFDMUc7U0FDRDtRQUNELFFBQVEsRUFBRTtZQUNULElBQUk7WUFDSixTQUFTO1NBQ1Q7S0FDRDtDQUNELENBQUM7QUFPRixNQUFNLCtCQUErQixHQUFHLGdCQUFnQixDQUFDO0FBRWxELElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQW1CLFNBQVEsVUFBVTtJQUtqRCxZQUN5QyxxQkFBNEMsRUFDN0Qsb0JBQTJDLEVBQ2hDLGVBQWdDLEVBQzVCLFdBQWdDLEVBQ3ZDLFlBQTBCLEVBQ3BCLGtCQUFzQztRQUUzRSxLQUFLLEVBQUUsQ0FBQztRQVBnQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBRWxELG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUM1QixnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7UUFDdkMsaUJBQVksR0FBWixZQUFZLENBQWM7UUFDcEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUkzRSxNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUM3RyxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQzdFLDhCQUE4QixFQUM5Qix1QkFBdUIsRUFDdkIsU0FBUyxFQUNULENBQUMsT0FBZSxFQUFFLEdBQUcsSUFBZSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxzREFBc0QsT0FBTyxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FDeEksQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRUQsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQTBDLEVBQUUsTUFBeUI7UUFDaEcsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLFVBQXdDLENBQUM7UUFDOUQsTUFBTSxjQUFjLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTdELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUMvQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHlCQUF5QixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFFdEcsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQzlDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLHNCQUFzQixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFFM0YsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ2pELG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsb0NBQW9DLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWhJLHNEQUFzRDtRQUN0RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQztRQUN4RCxNQUFNLHFCQUFxQixHQUFHLG1CQUFtQixJQUFJLHlCQUF5QixDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRTVLLElBQUksbUJBQW1CLEdBQUcsS0FBSyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzVCLE1BQU0sb0JBQW9CLEdBQUcsNEJBQTRCLENBQUMsK0JBQStCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUU3SSw0RUFBNEU7WUFDNUUsbUZBQW1GO1lBQ25GLElBQUksb0JBQW9CLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7b0JBQ3JDLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUztvQkFDOUIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxlQUFlLEVBQUU7aUJBQ3RDLENBQUMsQ0FBQztnQkFFSCxNQUFNLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sU0FBUyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUU5RSxNQUFNLGVBQWUsR0FBZ0M7b0JBQ3BELFdBQVcsRUFBRSxJQUFJLENBQUMsT0FBTztvQkFDekIsR0FBRztvQkFDSCxFQUFFO29CQUNGLEtBQUs7b0JBQ0wsa0JBQWtCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLCtEQUE0QyxDQUFDLGtEQUFxQztvQkFDL0gscUJBQXFCLEVBQUUsWUFBWSxFQUFFO29CQUNyQyxtQkFBbUI7b0JBQ25CLDZCQUE2QixFQUFFLEtBQUs7aUJBQ3BDLENBQUM7Z0JBRUYsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUNoRixNQUFNLG1CQUFtQixHQUFHLENBQzNCLGNBQWMsQ0FBQyxjQUFjLEtBQUssSUFBSTtvQkFDdEMsY0FBYyxDQUFDLG9CQUFvQixDQUNuQyxDQUFDO2dCQUNGLG1CQUFtQixHQUFHLGNBQWMsQ0FBQyxvQkFBb0IsSUFBSSxDQUFDLG1CQUFtQixJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUMxSCxDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxDQUFDLG1CQUFtQixJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxPQUFPLENBQUMsdUJBQXVCLEtBQUssU0FBUyxDQUFDO1FBQ2pJLE1BQU0sb0JBQW9CLEdBQUcsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1lBQ3JELEtBQUssRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUM7WUFDekQsT0FBTyxFQUFFLG1CQUFtQjtZQUM1QixnQkFBZ0IsRUFBRSxTQUFTO1NBQzNCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUVkLE9BQU87WUFDTixpQkFBaUI7WUFDakIsZ0JBQWdCO1lBQ2hCLG9CQUFvQjtTQUNwQixDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBMkIsRUFBRSxZQUFpQyxFQUFFLFNBQXVCLEVBQUUsTUFBeUI7UUFDOUgsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFVBQXdDLENBQUM7UUFFakUsTUFBTSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTixPQUFPLEVBQUUsQ0FBQzt3QkFDVCxJQUFJLEVBQUUsTUFBTTt3QkFDWixLQUFLLEVBQUUscURBQXFELElBQUksQ0FBQyxFQUFFLGdIQUFnSCxvREFBNEIsR0FBRztxQkFDbE4sQ0FBQzthQUNGLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFcEYsT0FBTztZQUNOLE9BQU8sRUFBRSxDQUFDO29CQUNULElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSx5Q0FBeUMsSUFBSSxDQUFDLEVBQUUsU0FBUyw0REFBZ0MsK0JBQStCO2lCQUMvSCxDQUFDO1NBQ0YsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBbEhZLGtCQUFrQjtJQU01QixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxrQkFBa0IsQ0FBQTtHQVhSLGtCQUFrQixDQWtIOUIifQ==