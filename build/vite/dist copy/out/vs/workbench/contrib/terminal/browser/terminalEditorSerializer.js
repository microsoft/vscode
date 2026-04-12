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
import { isNumber, isObject } from '../../../../base/common/types.js';
import { ITerminalEditorService } from './terminal.js';
let TerminalInputSerializer = class TerminalInputSerializer {
    constructor(_terminalEditorService) {
        this._terminalEditorService = _terminalEditorService;
    }
    canSerialize(editorInput) {
        return isNumber(editorInput.terminalInstance?.persistentProcessId) && editorInput.terminalInstance.shouldPersist;
    }
    serialize(editorInput) {
        if (!this.canSerialize(editorInput)) {
            return;
        }
        return JSON.stringify(this._toJson(editorInput.terminalInstance));
    }
    deserialize(instantiationService, serializedEditorInput) {
        const editorInput = JSON.parse(serializedEditorInput);
        if (!isDeserializedTerminalEditorInput(editorInput)) {
            throw new Error(`Could not revive terminal editor input, ${editorInput}`);
        }
        return this._terminalEditorService.reviveInput(editorInput);
    }
    _toJson(instance) {
        return {
            id: instance.persistentProcessId,
            pid: instance.processId || 0,
            title: instance.title,
            titleSource: instance.titleSource,
            cwd: '',
            icon: instance.icon,
            color: instance.color,
            hasChildProcesses: instance.hasChildProcesses,
            isFeatureTerminal: instance.shellLaunchConfig.isFeatureTerminal,
            hideFromUser: instance.shellLaunchConfig.hideFromUser,
            reconnectionProperties: instance.shellLaunchConfig.reconnectionProperties,
            shellIntegrationNonce: instance.shellIntegrationNonce
        };
    }
};
TerminalInputSerializer = __decorate([
    __param(0, ITerminalEditorService)
], TerminalInputSerializer);
export { TerminalInputSerializer };
function isDeserializedTerminalEditorInput(obj) {
    return isObject(obj) && 'id' in obj && 'pid' in obj;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFZGl0b3JTZXJpYWxpemVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEVkaXRvclNlcmlhbGl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUl0RSxPQUFPLEVBQWtDLHNCQUFzQixFQUE0RCxNQUFNLGVBQWUsQ0FBQztBQUcxSSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF1QjtJQUNuQyxZQUMwQyxzQkFBOEM7UUFBOUMsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF3QjtJQUNwRixDQUFDO0lBRUUsWUFBWSxDQUFDLFdBQWdDO1FBQ25ELE9BQU8sUUFBUSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUM7SUFDbEgsQ0FBQztJQUVNLFNBQVMsQ0FBQyxXQUFnQztRQUNoRCxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU87UUFDUixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU0sV0FBVyxDQUFDLG9CQUEyQyxFQUFFLHFCQUE2QjtRQUM1RixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFZLENBQUM7UUFDakUsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDckQsTUFBTSxJQUFJLEtBQUssQ0FBQywyQ0FBMkMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTyxPQUFPLENBQUMsUUFBMkI7UUFDMUMsT0FBTztZQUNOLEVBQUUsRUFBRSxRQUFRLENBQUMsbUJBQW9CO1lBQ2pDLEdBQUcsRUFBRSxRQUFRLENBQUMsU0FBUyxJQUFJLENBQUM7WUFDNUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO1lBQ3JCLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVztZQUNqQyxHQUFHLEVBQUUsRUFBRTtZQUNQLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtZQUNuQixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7WUFDckIsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLGlCQUFpQjtZQUM3QyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCO1lBQy9ELFlBQVksRUFBRSxRQUFRLENBQUMsaUJBQWlCLENBQUMsWUFBWTtZQUNyRCxzQkFBc0IsRUFBRSxRQUFRLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCO1lBQ3pFLHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxxQkFBcUI7U0FDckQsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBeENZLHVCQUF1QjtJQUVqQyxXQUFBLHNCQUFzQixDQUFBO0dBRlosdUJBQXVCLENBd0NuQzs7QUFFRCxTQUFTLGlDQUFpQyxDQUFDLEdBQVk7SUFDdEQsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxLQUFLLElBQUksR0FBRyxDQUFDO0FBQ3JELENBQUMifQ==