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
let CommandLineSandboxAnalyzer = class CommandLineSandboxAnalyzer extends Disposable {
    constructor(_sandboxService) {
        super();
        this._sandboxService = _sandboxService;
    }
    async analyze(_options) {
        if (!(await this._sandboxService.isEnabled())) {
            return {
                isAutoApproveAllowed: true,
            };
        }
        return {
            isAutoApproveAllowed: true,
            forceAutoApproval: _options.requiresUnsandboxConfirmation ? false : true,
        };
    }
};
CommandLineSandboxAnalyzer = __decorate([
    __param(0, ITerminalSandboxService)
], CommandLineSandboxAnalyzer);
export { CommandLineSandboxAnalyzer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVTYW5kYm94QW5hbHl6ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZUFuYWx5emVyL2NvbW1hbmRMaW5lU2FuZGJveEFuYWx5emVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUc3RSxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLFVBQVU7SUFDekQsWUFDMkMsZUFBd0M7UUFFbEYsS0FBSyxFQUFFLENBQUM7UUFGa0Msb0JBQWUsR0FBZixlQUFlLENBQXlCO0lBR25GLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQXFDO1FBQ2xELElBQUksQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDL0MsT0FBTztnQkFDTixvQkFBb0IsRUFBRSxJQUFJO2FBQzFCLENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTztZQUNOLG9CQUFvQixFQUFFLElBQUk7WUFDMUIsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUk7U0FDeEUsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBbEJZLDBCQUEwQjtJQUVwQyxXQUFBLHVCQUF1QixDQUFBO0dBRmIsMEJBQTBCLENBa0J0QyJ9