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
import { debounce } from '../../../../../base/common/decorators.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
let TextAreaSyncAddon = class TextAreaSyncAddon extends Disposable {
    activate(terminal) {
        this._terminal = terminal;
        this._refreshListeners();
    }
    constructor(_capabilities, _accessibilityService, _configurationService, _logService) {
        super();
        this._capabilities = _capabilities;
        this._accessibilityService = _accessibilityService;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this._listeners = this._register(new MutableDisposable());
        this._register(Event.runAndSubscribe(Event.any(this._capabilities.onDidChangeCapabilities, this._accessibilityService.onDidChangeScreenReaderOptimized), () => {
            this._refreshListeners();
        }));
    }
    _refreshListeners() {
        const commandDetection = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (this._shouldBeActive() && commandDetection) {
            if (!this._listeners.value) {
                const textarea = this._terminal?.textarea;
                if (textarea) {
                    this._listeners.value = Event.runAndSubscribe(commandDetection.promptInputModel.onDidChangeInput, () => this._sync(textarea));
                }
            }
        }
        else {
            this._listeners.clear();
        }
    }
    _shouldBeActive() {
        return this._accessibilityService.isScreenReaderOptimized() || this._configurationService.getValue("terminal.integrated.developer.devMode" /* TerminalSettingId.DevMode */);
    }
    _sync(textArea) {
        const commandCapability = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (!commandCapability) {
            return;
        }
        textArea.value = commandCapability.promptInputModel.value;
        textArea.selectionStart = commandCapability.promptInputModel.cursorIndex;
        textArea.selectionEnd = commandCapability.promptInputModel.cursorIndex;
        this._logService.debug(`TextAreaSyncAddon#sync: text changed to "${textArea.value}"`);
    }
};
__decorate([
    debounce(50)
], TextAreaSyncAddon.prototype, "_sync", null);
TextAreaSyncAddon = __decorate([
    __param(1, IAccessibilityService),
    __param(2, IConfigurationService),
    __param(3, ITerminalLogService)
], TextAreaSyncAddon);
export { TextAreaSyncAddon };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEFyZWFTeW5jQWRkb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvYWNjZXNzaWJpbGl0eS9icm93c2VyL3RleHRBcmVhU3luY0FkZG9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSxtQkFBbUIsRUFBcUIsTUFBTSxxREFBcUQsQ0FBQztBQUV0RyxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFrQixTQUFRLFVBQVU7SUFJaEQsUUFBUSxDQUFDLFFBQWtCO1FBQzFCLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO1FBQzFCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFRCxZQUNrQixhQUF1QyxFQUNqQyxxQkFBNkQsRUFDN0QscUJBQTZELEVBQy9ELFdBQWlEO1FBRXRFLEtBQUssRUFBRSxDQUFDO1FBTFMsa0JBQWEsR0FBYixhQUFhLENBQTBCO1FBQ2hCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDNUMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM5QyxnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7UUFYdEQsZUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFlckUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQzdDLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLEVBQzFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxnQ0FBZ0MsQ0FDM0QsRUFBRSxHQUFHLEVBQUU7WUFDUCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGlCQUFpQjtRQUN4QixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyw2Q0FBcUMsQ0FBQztRQUNyRixJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM1QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQztnQkFDMUMsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDZCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDL0gsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsQ0FBQztJQUNGLENBQUM7SUFFTyxlQUFlO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLHVCQUF1QixFQUFFLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEseUVBQTJCLENBQUM7SUFDL0gsQ0FBQztJQUdPLEtBQUssQ0FBQyxRQUE2QjtRQUMxQyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyw2Q0FBcUMsQ0FBQztRQUN0RixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN4QixPQUFPO1FBQ1IsQ0FBQztRQUVELFFBQVEsQ0FBQyxLQUFLLEdBQUcsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO1FBQzFELFFBQVEsQ0FBQyxjQUFjLEdBQUcsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDO1FBQ3pFLFFBQVEsQ0FBQyxZQUFZLEdBQUcsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDO1FBRXZFLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxRQUFRLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUN2RixDQUFDO0NBQ0QsQ0FBQTtBQVpRO0lBRFAsUUFBUSxDQUFDLEVBQUUsQ0FBQzs4Q0FZWjtBQXZEVyxpQkFBaUI7SUFXM0IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsbUJBQW1CLENBQUE7R0FiVCxpQkFBaUIsQ0F3RDdCIn0=