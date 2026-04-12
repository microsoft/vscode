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
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
let AccessibilityStatus = class AccessibilityStatus extends Disposable {
    static { this.ID = 'workbench.contrib.accessibilityStatus'; }
    constructor(configurationService, notificationService, accessibilityService, statusbarService, openerService) {
        super();
        this.configurationService = configurationService;
        this.notificationService = notificationService;
        this.accessibilityService = accessibilityService;
        this.statusbarService = statusbarService;
        this.openerService = openerService;
        this.screenReaderNotification = null;
        this.promptedScreenReader = false;
        this.screenReaderModeElement = this._register(new MutableDisposable());
        this._register(CommandsRegistry.registerCommand({ id: 'showEditorScreenReaderNotification', handler: () => this.showScreenReaderNotification() }));
        this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.onScreenReaderModeChange()));
        this._register(this.configurationService.onDidChangeConfiguration(c => {
            if (c.affectsConfiguration('editor.accessibilitySupport')) {
                this.onScreenReaderModeChange();
            }
        }));
    }
    showScreenReaderNotification() {
        this.screenReaderNotification = this.notificationService.prompt(Severity.Info, localize('screenReaderDetectedExplanation.question', "Screen reader usage detected. Do you want to enable {0} to optimize the editor for screen reader usage?", 'editor.accessibilitySupport'), [{
                label: localize('screenReaderDetectedExplanation.answerYes', "Yes"),
                run: () => {
                    this.configurationService.updateValue('editor.accessibilitySupport', 'on', 2 /* ConfigurationTarget.USER */);
                }
            }, {
                label: localize('screenReaderDetectedExplanation.answerNo', "No"),
                run: () => {
                    this.configurationService.updateValue('editor.accessibilitySupport', 'off', 2 /* ConfigurationTarget.USER */);
                }
            },
            {
                label: localize('screenReaderDetectedExplanation.answerLearnMore', "Learn More"),
                run: () => {
                    this.openerService.open('https://code.visualstudio.com/docs/editor/accessibility#_screen-readers');
                }
            }], {
            sticky: true,
            priority: NotificationPriority.URGENT
        });
        Event.once(this.screenReaderNotification.onDidClose)(() => this.screenReaderNotification = null);
    }
    updateScreenReaderModeElement(visible) {
        if (visible) {
            if (!this.screenReaderModeElement.value) {
                const text = localize('screenReaderDetected', "Screen Reader Optimized");
                this.screenReaderModeElement.value = this.statusbarService.addEntry({
                    name: localize('status.editor.screenReaderMode', "Screen Reader Mode"),
                    text,
                    ariaLabel: text,
                    command: 'showEditorScreenReaderNotification',
                    kind: 'prominent',
                    showInAllWindows: true
                }, 'status.editor.screenReaderMode', 1 /* StatusbarAlignment.RIGHT */, 100.6);
            }
        }
        else {
            this.screenReaderModeElement.clear();
        }
    }
    onScreenReaderModeChange() {
        // We only support text based editors
        const screenReaderDetected = this.accessibilityService.isScreenReaderOptimized();
        if (screenReaderDetected) {
            const screenReaderConfiguration = this.configurationService.getValue('editor.accessibilitySupport');
            if (screenReaderConfiguration === 'auto') {
                if (!this.promptedScreenReader) {
                    this.promptedScreenReader = true;
                    setTimeout(() => this.showScreenReaderNotification(), 100);
                }
            }
        }
        if (this.screenReaderNotification) {
            this.screenReaderNotification.close();
        }
        this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
    }
};
AccessibilityStatus = __decorate([
    __param(0, IConfigurationService),
    __param(1, INotificationService),
    __param(2, IAccessibilityService),
    __param(3, IStatusbarService),
    __param(4, IOpenerService)
], AccessibilityStatus);
export { AccessibilityStatus };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eVN0YXR1cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U3RhdHVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQXVCLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFM0ksT0FBTyxFQUEyQixpQkFBaUIsRUFBc0IsTUFBTSxrREFBa0QsQ0FBQztBQUNsSSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFdkUsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO2FBRWxDLE9BQUUsR0FBRyx1Q0FBdUMsQUFBMUMsQ0FBMkM7SUFNN0QsWUFDd0Isb0JBQTRELEVBQzdELG1CQUEwRCxFQUN6RCxvQkFBNEQsRUFDaEUsZ0JBQW9ELEVBQ3ZELGFBQThDO1FBRTlELEtBQUssRUFBRSxDQUFDO1FBTmdDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDNUMsd0JBQW1C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