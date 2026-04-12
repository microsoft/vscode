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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
export const GetTerminalLastCommandToolData = {
    id: "terminal_last_command" /* TerminalToolId.TerminalLastCommand */,
    toolReferenceName: 'terminalLastCommand',
    legacyToolReferenceFullNames: ['runCommands/terminalLastCommand'],
    displayName: localize('terminalLastCommandTool.displayName', 'Get Terminal Last Command'),
    modelDescription: 'Get the last command run in the active terminal.',
    source: ToolDataSource.Internal,
    icon: Codicon.terminal,
};
let GetTerminalLastCommandTool = class GetTerminalLastCommandTool extends Disposable {
    constructor(_terminalService) {
        super();
        this._terminalService = _terminalService;
    }
    async prepareToolInvocation(context, token) {
        return {
            invocationMessage: localize('getTerminalLastCommand.progressive', "Getting last terminal command"),
            pastTenseMessage: localize('getTerminalLastCommand.past', "Got last terminal command"),
        };
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const activeInstance = this._terminalService.activeInstance;
        if (!activeInstance) {
            return {
                content: [{
                        kind: 'text',
                        value: 'No active terminal instance found.'
                    }]
            };
        }
        const commandDetection = activeInstance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (!commandDetection) {
            return {
                content: [{
                        kind: 'text',
                        value: 'No command detection capability available in the active terminal.'
                    }]
            };
        }
        const executingCommand = commandDetection.executingCommand;
        if (executingCommand) {
            const userPrompt = [];
            userPrompt.push('The following command is currently executing in the terminal:');
            userPrompt.push(executingCommand);
            const cwd = commandDetection.cwd;
            if (cwd) {
                userPrompt.push('It is running in the directory:');
                userPrompt.push(cwd);
            }
            return {
                content: [{
                        kind: 'text',
                        value: userPrompt.join('\n')
                    }]
            };
        }
        const commands = commandDetection.commands;
        if (!commands || commands.length === 0) {
            return {
                content: [{
                        kind: 'text',
                        value: 'No command has been run in the active terminal.'
                    }]
            };
        }
        const lastCommand = commands[commands.length - 1];
        const userPrompt = [];
        if (lastCommand.command) {
            userPrompt.push('The following is the last command run in the terminal:');
            userPrompt.push(lastCommand.command);
        }
        if (lastCommand.cwd) {
            userPrompt.push('It was run in the directory:');
            userPrompt.push(lastCommand.cwd);
        }
        if (lastCommand.exitCode !== undefined) {
            userPrompt.push(`It exited with code: ${lastCommand.exitCode}`);
        }
        if (lastCommand.hasOutput() && lastCommand.getOutput) {
            const output = lastCommand.getOutput();
            if (output && output.trim().length > 0) {
                userPrompt.push('It has the following output:');
                userPrompt.push(output);
            }
        }
        return {
            content: [{
                    kind: 'text',
                    value: userPrompt.join('\n')
                }]
        };
    }
};
GetTerminalLastCommandTool = __decorate([
    __param(0, ITerminalService)
], GetTerminalLastCommandTool);
export { GetTerminalLastCommandTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0VGVybWluYWxMYXN0Q29tbWFuZFRvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9nZXRUZXJtaW5hbExhc3RDb21tYW5kVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVwRCxPQUFPLEVBQUUsY0FBYyxFQUE2TCxNQUFNLDREQUE0RCxDQUFDO0FBQ3ZSLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRzVFLE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFjO0lBQ3hELEVBQUUsa0VBQW9DO0lBQ3RDLGlCQUFpQixFQUFFLHFCQUFxQjtJQUN4Qyw0QkFBNEIsRUFBRSxDQUFDLGlDQUFpQyxDQUFDO0lBQ2pFLFdBQVcsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsMkJBQTJCLENBQUM7SUFDekYsZ0JBQWdCLEVBQUUsa0RBQWtEO0lBQ3BFLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtJQUMvQixJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVE7Q0FDdEIsQ0FBQztBQUVLLElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsVUFBVTtJQUV6RCxZQUNvQyxnQkFBa0M7UUFFckUsS0FBSyxFQUFFLENBQUM7UUFGMkIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFrQjtJQUd0RSxDQUFDO0lBRUQsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQTBD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