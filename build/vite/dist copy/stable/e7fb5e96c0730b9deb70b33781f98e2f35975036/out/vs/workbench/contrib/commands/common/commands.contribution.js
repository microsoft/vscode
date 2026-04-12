/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { safeStringify } from '../../../../base/common/objects.js';
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
/** Runs several commands passed to it as an argument */
class RunCommands extends Action2 {
    constructor() {
        super({
            id: 'runCommands',
            title: nls.localize2('runCommands', "Run Commands"),
            f1: false,
            metadata: {
                description: nls.localize('runCommands.description', "Run several commands"),
                args: [
                    {
                        name: 'args',
                        schema: {
                            type: 'object',
                            required: ['commands'],
                            properties: {
                                commands: {
                                    type: 'array',
                                    description: nls.localize('runCommands.commands', "Commands to run"),
                                    items: {
                                        anyOf: [
                                            {
                                                $ref: 'vscode://schemas/keybindings#/definitions/commandNames'
                                            },
                                            {
                                                type: 'string',
                                            },
                                            {
                                                type: 'object',
                                                required: ['command'],
                                                properties: {
                                                    command: {
                                                        'anyOf': [
                                                            {
                                                                $ref: 'vscode://schemas/keybindings#/definitions/commandNames'
                                                            },
                                                            {
                                                                type: 'string'
                                                            },
                                                        ]
                                                    }
                                                },
                                                $ref: 'vscode://schemas/keybindings#/definitions/commandsSchemas'
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                ]
            }
        });
    }
    // dev decisions:
    // - this command takes a single argument-object because
    //	- keybinding definitions don't allow running commands with several arguments
    //  - and we want to be able to take on different other arguments in future, e.g., `runMode : 'serial' | 'concurrent'`
    async run(accessor, args) {
        const notificationService = accessor.get(INotificationService);
        if (!this._isCommandArgs(args)) {
            notificationService.error(nls.localize('runCommands.invalidArgs', "'runCommands' has received an argument with incorrect type. Please, review the argument passed to the command."));
            return;
        }
        if (args.commands.length === 0) {
            notificationService.warn(nls.localize('runCommands.noCommandsToRun', "'runCommands' has not received commands to run. Did you forget to pass commands in the 'runCommands' argument?"));
            return;
        }
        const commandService = accessor.get(ICommandService);
        const logService = accessor.get(ILogService);
        let i = 0;
        try {
            for (; i < args.commands.length; ++i) {
                const cmd = args.commands[i];
                logService.debug(`runCommands: executing ${i}-th command: ${safeStringify(cmd)}`);
                await this._runCommand(commandService, cmd);
                logService.debug(`runCommands: executed ${i}-th command`);
            }
        }
        catch (err) {
            logService.debug(`runCommands: executing ${i}-th command resulted in an error: ${err instanceof Error ? err.message : safeStringify(err)}`);
            notificationService.error(err);
        }
    }
    _isCommandArgs(args) {
        if (!args || typeof args !== 'object') {
            return false;
        }
        if (!('commands' in args) || !Array.isArray(args.commands)) {
            return false;
        }
        for (const cmd of args.commands) {
            if (typeof cmd === 'string') {
                continue;
            }
            if (typeof cmd === 'object' && typeof cmd.command === 'string') {
                continue;
            }
            return false;
        }
        return true;
    }
    _runCommand(commandService, cmd) {
        let commandID, commandArgs;
        if (typeof cmd === 'string') {
            commandID = cmd;
        }
        else {
            commandID = cmd.command;
            commandArgs = cmd.args;
        }
        if (commandArgs === undefined) {
            return commandService.executeCommand(commandID);
        }
        else {
            if (Array.isArray(commandArgs)) {
                return commandService.executeCommand(commandID, ...commandArgs);
            }
            else {
                return commandService.executeCommand(commandID, commandArgs);
            }
        }
    }
}
registerAction2(RunCommands);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVuRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFRaEcsd0RBQXdEO0FBQ3hELE1BQU0sV0FBWSxTQUFRLE9BQU87SUFFaEM7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsYUFBYTtZQUNqQixLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsY0FBYyxDQUFDO1lBQ25ELEVBQUUsRUFBRSxLQUFLO1lBQ1QsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLHNCQUFzQixDQUFDO2dCQUM1RSxJQUFJLEVBQUU7b0JBQ0w7d0JBQ0MsSUFBSSxFQUFFLE1BQU07d0JBQ1osTUFBTSxFQUFFOzRCQUNQLElBQUksRUFBRSxRQUFROzRCQUNkLFFBQVEsRUFBRSxDQUFDLFVBQVUsQ0FBQzs0QkFDdEIsVUFBVSxFQUFFO2dDQUNYLFFBQVEsRUFBRTtvQ0FDVCxJQUFJLEVBQUUsT0FBTztvQ0FDYixXQUFXLEVBQUUsR0FBRyxD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