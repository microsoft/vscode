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
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { isWindows, isLinux } from '../../../../base/common/platform.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { AccessibilityService } from '../../../../platform/accessibility/browser/accessibilityService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
let NativeAccessibilityService = class NativeAccessibilityService extends AccessibilityService {
    constructor(environmentService, contextKeyService, configurationService, _layoutService, _telemetryService, nativeHostService) {
        super(contextKeyService, _layoutService, configurationService);
        this._telemetryService = _telemetryService;
        this.nativeHostService = nativeHostService;
        this.didSendTelemetry = false;
        this.shouldAlwaysUnderlineAccessKeys = undefined;
        this.setAccessibilitySupport(environmentService.window.accessibilitySupport ? 2 /* AccessibilitySupport.Enabled */ : 1 /* AccessibilitySupport.Disabled */);
    }
    async alwaysUnderlineAccessKeys() {
        if (!isWindows) {
            return false;
        }
        if (typeof this.shouldAlwaysUnderlineAccessKeys !== 'boolean') {
            const windowsKeyboardAccessibility = await this.nativeHostService.windowsGetStringRegKey('HKEY_CURRENT_USER', 'Control Panel\\Accessibility\\Keyboard Preference', 'On');
            this.shouldAlwaysUnderlineAccessKeys = (windowsKeyboardAccessibility === '1');
        }
        return this.shouldAlwaysUnderlineAccessKeys;
    }
    setAccessibilitySupport(accessibilitySupport) {
        super.setAccessibilitySupport(accessibilitySupport);
        if (!this.didSendTelemetry && accessibilitySupport === 2 /* AccessibilitySupport.Enabled */) {
            this._telemetryService.publicLog2('accessibility', { enabled: true });
            this.didSendTelemetry = true;
        }
    }
};
NativeAccessibilityService = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, IContextKeyService),
    __param(2, IConfigurationService),
    __param(3, ILayoutService),
    __param(4, ITelemetryService),
    __param(5, INativeHostService)
], NativeAccessibilityService);
export { NativeAccessibilityService };
registerSingleton(IAccessibilityService, NativeAccessibilityService, 1 /* InstantiationType.Delayed */);
// On linux we do not automatically detect that a screen reader is detected, thus we have to implicitly notify the renderer to enable accessibility when user configures it in settings
let LinuxAccessibilityContribution = class LinuxAccessibilityContribution {
    static { this.ID = 'workbench.contrib.linuxAccessibility'; }
    constructor(jsonEditingService, accessibilityService, environmentService) {
        const forceRendererAccessibility = () => {
            if (accessibilityService.isScreenReaderOptimized()) {
                jsonEditingService.write(environmentService.argvResource, [{ path: ['force-renderer-accessibility'], value: true }], true);
            }
        };
        forceRendererAccessibility();
        accessibilityService.onDidChangeScreenReaderOptimized(forceRendererAccessibility);
    }
};
LinuxAccessibilityContribution = __decorate([
    __param(0, IJSONEditingService),
    __param(1, IAccessibilityService),
    __param(2, INativeWorkbenchEnvironmentService)
], LinuxAccessibilityContribution);
if (isLinux) {
    registerWorkbenchContribution2(LinuxAccessibilityContribution.ID, LinuxAccessibilityContribution, 2 /* WorkbenchPhase.BlockRestore */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYWNjZXNzaWJpbGl0eS9lbGVjdHJvbi1icm93c2VyL2FjY2Vzc2liaWxpdHlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBd0IsTUFBTSw0REFBNEQsQ0FBQztBQUN6SCxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQzFHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNoRixPQUFPLEVBQTBDLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBVy9FLElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsb0JBQW9CO0lBS25FLFlBQ3FDLGtCQUFzRCxFQUN0RSxpQkFBcUMsRUFDbEMsb0JBQTJDLEVBQ2xELGNBQThCLEVBQzNCLGlC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