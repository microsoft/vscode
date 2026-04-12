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
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService } from '../../../common/terminalSandboxService.js';
let CommandLineSandboxRewriter = class CommandLineSandboxRewriter extends Disposable {
    constructor(_sandboxService) {
        super();
        this._sandboxService = _sandboxService;
    }
    async rewrite(options) {
        const sandboxPrereqs = await this._sandboxService.checkForSandboxingPrereqs();
        if (!sandboxPrereqs.enabled || sandboxPrereqs.failedCheck === "config" /* TerminalSandboxPrerequisiteCheck.Config */) {
            return undefined;
        }
        const wrappedCommand = this._sandboxService.wrapCommand(options.commandLine, options.requestUnsandboxedExecution, options.shell);
        return {
            rewritten: wrappedCommand.command,
            reasoning: wrappedCommand.requiresUnsandboxConfirmation ? 'Switched command to unsandboxed execution because the command includes a domain that is not in the sandbox allowlist' : 'Wrapped command for sandbox execution',
            forDisplay: options.commandLine, // show the command that is passed as input (after prior rewrites like cd prefix stripping)
            isSandboxWrapped: wrappedCommand.isSandboxWrapped,
            requiresUnsandboxConfirmation: wrappedCommand.requiresUnsandboxConfirmation,
            blockedDomains: wrappedCommand.blockedDomains,
            deniedDomains: wrappedCommand.deniedDomains,
        };
    }
};
CommandLineSandboxRewriter = __decorate([
    __param(0, ITerminalSandboxService)
], CommandLineSandboxRewriter);
export { CommandLineSandboxRewriter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVTYW5kYm94UmV3cml0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lU2FuZGJveFJld3JpdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUJBQXVCLEVBQW9DLE1BQU0sMkNBQTJDLENBQUM7QUFHL0csSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSxVQUFVO0lBQ3pELFlBQzJDLGVBQXdDO1FBRWxGLEtBQUssRUFBRSxDQUFDO1FBRmtDLG9CQUFlLEdBQWYsZUFBZSxDQUF5QjtJQUduRixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFvQztRQUNqRCxNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMseUJBQXlCLEVBQUUsQ0FBQztRQUM5RSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sSUFBSSxjQUFjLENBQUMsV0FBVywyREFBNEMsRUFBRSxDQUFDO1lBQ3ZHLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakksT0FBTztZQUNOLFNBQVMsRUFBRSxjQUFjLENBQUMsT0FBTztZQUNqQyxTQUFTLEVBQUUsY0FBYyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQyxzSEFBc0gsQ0FBQyxDQUFDLENBQUMsdUNBQXVDO1lBQzFOLFVBQVUsRUFBRSxPQUFPLENBQUMsV0FBVyxFQUFFLDJGQUEyRjtZQUM1SCxnQkFBZ0IsRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ2pELDZCQUE2QixFQUFFLGNBQWMsQ0FBQyw2QkFBNkI7WUFDM0UsY0FBYyxFQUFFLGNBQWMsQ0FBQyxjQUFjO1lBQzdDLGFBQWEsRUFBRSxjQUFjLENBQUMsYUFBYTtTQUMzQyxDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUE7QUF4QlksMEJBQTBCO0lBRXBDLFdBQUEsdUJBQXVCLENBQUE7R0FGYiwwQkFBMEIsQ0F3QnRDIn0=