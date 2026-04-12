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
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ProcessExplorerControl } from '../browser/processExplorerControl.js';
let NativeProcessExplorerControl = class NativeProcessExplorerControl extends ProcessExplorerControl {
    constructor(container, instantiationService, productService, contextMenuService, nativeHostService, commandService, processService, clipboardService) {
        super(instantiationService, productService, contextMenuService, commandService, clipboardService);
        this.nativeHostService = nativeHostService;
        this.processService = processService;
        this.create(container);
    }
    killProcess(pid, signal) {
        return this.nativeHostService.killProcess(pid, signal);
    }
    resolveProcesses() {
        return this.processService.resolveProcesses();
    }
};
NativeProcessExplorerControl = __decorate([
    __param(1, IInstantiationService),
    __param(2, IProductService),
    __param(3, IContextMenuService),
    __param(4, INativeHostService),
    __param(5, ICommandService),
    __param(6, IProcessService),
    __param(7, IClipboardService)
], NativeProcessExplorerControl);
export { NativeProcessExplorerControl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0V4cGxvcmVyQ29udHJvbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Byb2Nlc3NFeHBsb3Jlci9lbGVjdHJvbi1icm93c2VyL3Byb2Nlc3NFeHBsb3JlckNvbnRyb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXZFLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsc0JBQXNCO0lBRXZFLFlBQ0MsU0FBc0IsRUFDQyxvQkFBMkMsRUFDakQsY0FBK0IsRUFDM0Isa0JBQXVDLEVBQ3ZCLGlCQUFxQyxFQUN6RCxjQUErQixFQUNkLGNBQStCLEVBQzlDLGdCQUFtQztRQUV0RCxLQUFLLENBQUMsb0JBQW9CLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBTDdELHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFFeEMsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBS2pFLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUVrQixXQUFXLENBQUMsR0FBVyxFQUFFLE1BQWM7UUFDekQsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRWtCLGdCQUFnQjtRQUNsQyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUMvQyxDQUFDO0NBQ0QsQ0FBQTtBQXhCWSw0QkFBNEI7SUFJdEMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxpQkFBaUIsQ0FBQTtHQVZQLDRCQUE0QixDQXdCeEMifQ==