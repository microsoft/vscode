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
import { ITerminalSandboxService } from '../../../common/terminalSandboxService.js';
/**
 * Command line presenter for sandboxed commands.
 * Returns the display form of the command (provided via {@link ICommandLineRewriterResult.forDisplay}
 * from the rewriter pipeline) for cleaner presentation, while the actual sandboxed command runs
 * unchanged.
 */
let SandboxedCommandLinePresenter = class SandboxedCommandLinePresenter {
    constructor(_sandboxService) {
        this._sandboxService = _sandboxService;
    }
    async present(options) {
        if (!(await this._sandboxService.isEnabled())) {
            return undefined;
        }
        return {
            commandLine: options.commandLine.forDisplay,
            processOtherPresenters: true
        };
    }
};
SandboxedCommandLinePresenter = __decorate([
    __param(0, ITerminalSandboxService)
], SandboxedCommandLinePresenter);
export { SandboxedCommandLinePresenter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveGVkQ29tbWFuZExpbmVQcmVzZW50ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9zYW5kYm94ZWRDb21tYW5kTGluZVByZXNlbnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUdwRjs7Ozs7R0FLRztBQUNJLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQTZCO0lBQ3pDLFlBQzJDLGVBQXdDO1FBQXhDLG9CQUFlLEdBQWYsZUFBZSxDQUF5QjtJQUVuRixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFxQztRQUNsRCxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQy9DLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPO1lBQ04sV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUMsVUFBVTtZQUMzQyxzQkFBc0IsRUFBRSxJQUFJO1NBQzVCLENBQUM7SUFDSCxDQUFDO0NBQ0QsQ0FBQTtBQWZZLDZCQUE2QjtJQUV2QyxXQUFBLHVCQUF1QixDQUFBO0dBRmIsNkJBQTZCLENBZXpDIn0=