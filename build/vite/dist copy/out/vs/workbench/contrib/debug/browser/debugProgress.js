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
import { Event } from '../../../../base/common/event.js';
import { dispose } from '../../../../base/common/lifecycle.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IDebugService, VIEWLET_ID } from '../common/debug.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
let DebugProgressContribution = class DebugProgressContribution {
    constructor(debugService, progressService, viewsService) {
        this.toDispose = [];
        let progressListener;
        const listenOnProgress = (session) => {
            if (progressListener) {
                progressListener.dispose();
                progressListener = undefined;
            }
            if (session) {
                progressListener = session.onDidProgressStart(async (progressStartEvent) => {
                    const promise = new Promise(r => {
                        // Show progress until a progress end event comes or the session ends
                        const listener = Event.any(Event.filter(session.onDidProgressEnd, e => e.body.progressId === progressStartEvent.body.progressId), session.onDidEndAdapter)(() => {
                            listener.dispose();
                            r();
                        });
                    });
                    if (viewsService.isViewContainerVisible(VIEWLET_ID)) {
                        progressService.withProgress({ location: VIEWLET_ID }, () => promise);
                    }
                    const source = debugService.getAdapterManager().getDebuggerLabel(session.configuration.type);
                    progressService.withProgress({
                        location: 15 /* ProgressLocation.Notification */,
                        title: progressStartEvent.body.title,
                        cancellable: progressStartEvent.body.cancellable,
                        source,
                        delay: 500
                    }, progressStep => {
                        let total = 0;
                        const reportProgress = (progress) => {
                            let increment = undefined;
                            if (typeof progress.percentage === 'number') {
                                increment = progress.percentage - total;
                                total += increment;
                            }
                            progressStep.report({
                                message: progress.message,
                                increment,
                                total: typeof increment === 'number' ? 100 : undefined,
                            });
                        };
                        if (progressStartEvent.body.message) {
                            reportProgress(progressStartEvent.body);
                        }
                        const progressUpdateListener = session.onDidProgressUpdate(e => {
                            if (e.body.progressId === progressStartEvent.body.progressId) {
                                reportProgress(e.body);
                            }
                        });
                        return promise.then(() => progressUpdateListener.dispose());
                    }, () => session.cancel(progressStartEvent.body.progressId));
                });
            }
        };
        this.toDispose.push(debugService.getViewModel().onDidFocusSession(listenOnProgress));
        listenOnProgress(debugService.getViewModel().focusedSession);
        this.toDispose.push(debugService.onWillNewSession(session => {
            if (!progressListener) {
                listenOnProgress(session);
            }
        }));
    }
    dispose() {
        dispose(this.toDispose);
    }
};
DebugProgressContribution = __decorate([
    __param(0, IDebugService),
    __param(1, IProgressService),
    __param(2, IViewsService)
], DebugProgressContribution);
export { DebugProgressContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdQcm9ncmVzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFlLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBb0IsTUFBTSxrREFBa0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsYUFBYSxFQUFpQixVQUFVLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFeEUsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBeUI7SUFJckMsWUFDZ0IsWUFBMkIsRUFDeEIsZUFBaUMsRUFDcEMsWUFBMkI7UUFMbkMsY0FBUyxHQUFrQixFQUFFLENBQUM7UUFPckMsSUFBSSxnQkFBeUMsQ0FBQztRQUM5QyxNQUFNLGdCQUFnQixHQUFHLENBQUMsT0FBa0MsRUFBRSxFQUFFO1lBQy9ELElBQUksZ0JBQWdCLEVBQUUsQ0FBQztnQkFDdEIsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQzNCLGdCQUFnQixHQUFHLFNBQVMsQ0FBQztZQUM5QixDQUFDO1lBQ0QsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixnQkFBZ0IsR0FBRyxPQUFPLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFDLGtCQUFrQixFQUFDLEVBQUU7b0JBQ3hFLE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxDQUFPLENBQUMsQ0FBQyxFQUFFO3dCQUNyQyxxRUFBcUU7d0JBQ3JFLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxH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