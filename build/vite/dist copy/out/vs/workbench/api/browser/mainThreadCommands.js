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
import { DisposableMap } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { isString } from '../../../base/common/types.js';
let MainThreadCommands = class MainThreadCommands {
    constructor(extHostContext, _commandService, _extensionService) {
        this._commandService = _commandService;
        this._extensionService = _extensionService;
        this._commandRegistrations = new DisposableMap();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCommands);
        this._generateCommandsDocumentationRegistration = CommandsRegistry.registerCommand('_generateCommandsDocumentation', () => this._generateCommandsDocumentation());
    }
    dispose() {
        this._commandRegistrations.dispose();
        this._generateCommandsDocumentationRegistration.dispose();
    }
    async _generateCommandsDocumentation() {
        const result = await this._proxy.$getContributedCommandMetadata();
        // add local commands
        const commands = CommandsRegistry.getCommands();
        for (const [id, command] of commands) {
            if (command.metadata) {
                result[id] = command.metadata;
            }
        }
        // print all as markdown
        const all = [];
        for (const id in result) {
            all.push('`' + id + '` - ' + _generateMarkdown(result[id]));
        }
        console.log(all.join('\n'));
    }
    $registerCommand(id) {
        this._commandRegistrations.set(id, CommandsRegistry.registerCommand(id, (accessor, ...args) => {
            return this._proxy.$executeContributedCommand(id, ...args).then(result => {
                return revive(result);
            });
        }));
    }
    $unregisterCommand(id) {
        this._commandRegistrations.deleteAndDispose(id);
    }
    $fireCommandActivationEvent(id) {
        const activationEvent = `onCommand:${id}`;
        if (!this._extensionService.activationEventIsDone(activationEvent)) {
            // this is NOT awaited because we only use it as drive-by-activation
            // for commands that are already known inside the extension host
            this._extensionService.activateByEvent(activationEvent);
        }
    }
    async $executeCommand(id, args, retry) {
        if (args instanceof SerializableObjectWithBuffers) {
            args = args.value;
        }
        for (let i = 0; i < args.length; i++) {
            args[i] = revive(args[i]);
        }
        if (retry && args.length > 0 && !CommandsRegistry.getCommand(id)) {
            await this._extensionService.activateByEvent(`onCommand:${id}`);
            throw new Error('$executeCommand:retry');
        }
        return this._commandService.executeCommand(id, ...args);
    }
    $getCommands() {
        return Promise.resolve([...CommandsRegistry.getCommands().keys()]);
    }
};
MainThreadCommands = __decorate([
    extHostNamedCustomer(MainContext.MainThreadCommands),
    __param(1, ICommandService),
    __param(2, IExtensionService)
], MainThreadCommands);
export { MainThreadCommands };
// --- command doc
function _generateMarkdown(description) {
    if (typeof description === 'string') {
        return description;
    }
    else {
        const descriptionString = isString(description.description)
            ? description.description
            // Our docs website is in English, so keep the original here.
            : description.description.original;
        const parts = [descriptionString];
        parts.push('\n\n');
        if (description.args) {
            for (const arg of description.args) {
                parts.push(`* _${arg.name}_ - ${arg.description || ''}\n`);
            }
        }
        if (description.returns) {
            parts.push(`* _(returns)_ - ${description.returns}`);
        }
        parts.push('\n\n');
        return parts.join('');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRDb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDL0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxnQkFBZ0IsRUFBb0IsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDcEgsT0FBTyxFQUFtQixvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBTyw2QkFBNkIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pHLE9BQU8sRUFBd0IsY0FBYyxFQUFFLFdBQVcsRUFBMkIsTUFBTSwrQkFBK0IsQ0FBQztBQUMzSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFJbEQsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBa0I7SUFNOUIsWUFDQyxjQUErQixFQUNkLGVBQWlELEVBQy9DLGlCQUFxRDtRQUR0QyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDOUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQVB4RCwwQkFBcUIsR0FBRyxJQUFJLGFBQWEsRUFBVSxDQUFDO1FBU3BFLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFdEUsSUFBSSxDQUFDLDBDQUEwQyxHQUFHLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUUs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