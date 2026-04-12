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
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunWithStore, observableFromEvent } from '../../../../base/common/observable.js';
import { IAccessibilitySignalService, AccessibilitySignal } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IDebugService } from '../../debug/common/debug.js';
let AccessibilitySignalLineDebuggerContribution = class AccessibilitySignalLineDebuggerContribution extends Disposable {
    constructor(debugService, accessibilitySignalService) {
        super();
        this.accessibilitySignalService = accessibilitySignalService;
        const isEnabled = observableFromEvent(this, accessibilitySignalService.onSoundEnabledChanged(AccessibilitySignal.onDebugBreak), () => accessibilitySignalService.isSoundEnabled(AccessibilitySignal.onDebugBreak));
        this._register(autorunWithStore((reader, store) => {
            /** @description subscribe to debug sessions */
            if (!isEnabled.read(reader)) {
                return;
            }
            const sessionDisposables = new Map();
            store.add(toDisposable(() => {
                sessionDisposables.forEach(d => d.dispose());
                sessionDisposables.clear();
            }));
            store.add(debugService.onDidNewSession((session) => sessionDisposables.set(session, this.handleSession(session))));
            store.add(debugService.onDidEndSession(({ session }) => {
                sessionDisposables.get(session)?.dispose();
                sessionDisposables.delete(session);
            }));
            debugService
                .getModel()
                .getSessions()
                .forEach((session) => sessionDisposables.set(session, this.handleSession(session)));
        }));
    }
    handleSession(session) {
        return session.onDidChangeState(e => {
            const stoppedDetails = session.getStoppedDetails();
            const BREAKPOINT_STOP_REASON = 'breakpoint';
            if (stoppedDetails && stoppedDetails.reason === BREAKPOINT_STOP_REASON) {
                this.accessibilitySignalService.playSignal(AccessibilitySignal.onDebugBreak);
            }
        });
    }
};
AccessibilitySignalLineDebuggerContribution = __decorate([
    __param(0, IDebugService),
    __param(1, IAccessibilitySignalService)
], AccessibilitySignalLineDebuggerContribution);
export { AccessibilitySignalLineDebuggerContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eVNpZ25hbERlYnVnZ2VyQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYWNjZXNzaWJpbGl0eVNpZ25hbHMvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsRGVidWdnZXJDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQThCLE1BQU0sZ0ZBQWdGLENBQUM7QUFFOUssT0FBTyxFQUFFLGFBQWEsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUVwRSxJQUFNLDJDQUEyQyxHQUFqRCxNQUFNLDJDQUNaLFNBQVEsVUFBVTtJQUdsQixZQUNnQixZQUEyQixFQUNJLDBCQUFzRDtRQUVwRyxLQUFLLEVBQUUsQ0FBQztRQUZzQywrQkFBMEIsR0FBMUIsMEJBQTBCLENBQTRCO1FBSXBHLE1BQU0sU0FBUyxHQUFHLG1CQUFtQixDQUFDLElBQUksRUFDekMsMEJBQTBCLENBQUMscUJBQXFCLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLEVBQ2xGLEdBQUcsRUFBRSxDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsQ0FDakYsQ0FBQztRQUNGLElBQUksQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDakQsK0NBQStDO1lBQy9DLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQzdCLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsRUFBOEIsQ0FBQztZQUNqRSxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7Z0JBQzNCLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM1QixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosS0FBSyxDQUFDLEdBQUcsQ0FDUixZQUFZLENBQUMsZUFBZSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FDeEMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQzVELENBQ0QsQ0FBQztZQUVGLEtBQUssQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtnQkFDdEQsa0JBQWtCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDO2dCQUMzQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLFlBQVk7aUJBQ1YsUUFBUSxFQUFFO2lCQUNWLFdBQVcsRUFBRTtpQkFDYixPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUNwQixrQkFBa0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FDNUQsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sYUFBYSxDQUFDLE9BQXNCO1FBQzNDLE9BQU8sT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ25DLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ25ELE1BQU0sc0JBQXNCLEdBQUcsWUFBWSxDQUFDO1lBQzVDLElBQUksY0FBYyxJQUFJLGNBQWMsQ0FBQyxNQUFNLEtBQUssc0JBQXNCLEVBQUUsQ0FBQztnQkFDeEUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5RSxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQTtBQXZEWSwyQ0FBMkM7SUFLckQsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLDJCQUEyQixDQUFBO0dBTmpCLDJDQUEyQyxDQXVEdkQifQ==