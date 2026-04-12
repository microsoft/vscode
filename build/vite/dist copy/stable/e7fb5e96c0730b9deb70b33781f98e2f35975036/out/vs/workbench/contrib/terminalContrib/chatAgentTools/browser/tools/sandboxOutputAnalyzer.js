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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
let SandboxOutputAnalyzer = class SandboxOutputAnalyzer extends Disposable {
    constructor(_sandboxService) {
        super();
        this._sandboxService = _sandboxService;
    }
    async analyze(options) {
        if (!options.isSandboxWrapped) {
            return undefined;
        }
        const knownFailure = options.exitCode !== undefined && options.exitCode !== 0;
        const suspectedFailure = !knownFailure && options.exitCode === undefined && this._outputLooksSandboxBlocked(options.exitResult);
        if (!knownFailure && !suspectedFailure) {
            return undefined;
        }
        const os = await this._sandboxService.getOS();
        const fileSystemSetting = os === 3 /* OperatingSystem.Linux */
            ? "chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */
            : "chat.agent.sandbox.fileSystem.mac" /* TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem */;
        const prefix = knownFailure
            ? 'Command failed while running in sandboxed mode. If the command failed due to sandboxing:'
            : 'Command ran in sandboxed mode and may have been blocked by the sandbox. If the command failed due to sandboxing:';
        return `${prefix}
- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${fileSystemSetting}, or to add required domains to ${"chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */}.
- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user — setting this flag automatically shows a confirmation prompt to the user.

Here is the output of the command:\n`;
    }
    /**
     * Checks whether the command output contains strings that typically indicate
     * the sandbox blocked the operation. Used when exit code is unavailable.
     *
     * The output may contain newlines inserted by terminal wrapping, so we
     * strip them before testing.
     */
    _outputLooksSandboxBlocked(output) {
        return outputLooksSandboxBlocked(output);
    }
};
SandboxOutputAnalyzer = __decorate([
    __param(0, ITerminalSandboxService)
], SandboxOutputAnalyzer);
export { SandboxOutputAnalyzer };
/**
 * Checks whether the command output contains strings that typically indicate
 * the sandbox blocked the operation. The output may contain newlines inserted
 * by terminal wrapping, so we strip them before testing.
 */
export function outputLooksSandboxBlocked(output) {
    const normalized = output.replace(/\n/g, ' ');
    return /Operation not permitted|Permission denied|Read-only file system|sandbox-exec|bwrap|sandbox_violation/i.test(normalized);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveE91dHB1dEFuYWx5emVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvc2FuZGJveE91dHB1dEFuYWx5emVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV4RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUkxRSxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVBQVU7SUFDcEQsWUFDMkMsZUFBd0M7UUFFbEYsS0FBSyxFQUFFLENBQUM7UUFGa0Msb0JBQWUsR0FBZixlQUFlLENBQXlCO0lBR25GLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQStCO1FBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUMvQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxTQUFTLElBQUksT0FBTyxDQUFDLFFBQVEsS0FBSyxDQUFDLENBQUM7UUFDOUUsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFlBQVksSUFBSSxPQUFPLENBQUMsUUFBUSxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWhJLElBQUksQ0FBQyxZQUFZLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3hDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDOUMsTUFBTSxpQkFBaUIsR0FBRyxFQUFFLGtDQUEwQjtZQUNyRCxDQUFDO1lBQ0QsQ0FBQyxvR0FBMEQsQ0FBQztRQUU3RCxNQUFNLE1BQU0sR0FBRyxZQUFZO1lBQzFCLENBQUMsQ0FBQywwRkFBMEY7WUFDNUYsQ0FBQyxDQUFDLGtIQUFrSCxDQUFDO1FBQ3RILE9BQU8sR0FBRyxNQUFNO3NJQUNvSCxpQkFBaUIsbUNBQW1DLGtIQUFpRTs7O3FDQUd0TixDQUFDO0lBQ3JDLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSywwQkFBMEIsQ0FBQyxNQUFjO1FBQ2hELE9BQU8seUJBQXlCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDMUMsQ0FBQztDQUNELENBQUE7QUE1Q1kscUJBQXFCO0lBRS9CLFdBQUEsdUJBQXVCLENBQUE7R0FGYixxQkFBcUIsQ0E0Q2pDOztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUseUJBQXlCLENBQUMsTUFBYztJQUN2RCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztJQUM5QyxPQUFPLHVHQUF1RyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNqSSxDQUFDIn0=