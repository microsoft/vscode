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
import { Emitter } from '../../../base/common/event.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ITimelineService } from '../../contrib/timeline/common/timeline.js';
import { revive } from '../../../base/common/marshalling.js';
let MainThreadTimeline = class MainThreadTimeline {
    constructor(context, logService, _timelineService) {
        this.logService = logService;
        this._timelineService = _timelineService;
        this._providerEmitters = new Map();
        this._proxy = context.getProxy(ExtHostContext.ExtHostTimeline);
    }
    $registerTimelineProvider(provider) {
        this.logService.trace(`MainThreadTimeline#registerTimelineProvider: id=${provider.id}`);
        const proxy = this._proxy;
        const emitters = this._providerEmitters;
        let onDidChange = emitters.get(provider.id);
        if (onDidChange === undefined) {
            onDidChange = new Emitter();
            emitters.set(provider.id, onDidChange);
        }
        this._timelineService.registerTimelineProvider({
            ...provider,
            onDidChange: onDidChange.event,
            async provideTimeline(uri, options, token) {
                return revive(await proxy.$getTimeline(provider.id, uri, options, token));
            },
            dispose() {
                emitters.delete(provider.id);
                onDidChange?.dispose();
            }
        });
    }
    $unregisterTimelineProvider(id) {
        this.logService.trace(`MainThreadTimeline#unregisterTimelineProvider: id=${id}`);
        this._timelineService.unregisterTimelineProvider(id);
    }
    $emitTimelineChangeEvent(e) {
        this.logService.trace(`MainThreadTimeline#emitChangeEvent: id=${e.id}, uri=${e.uri?.toString(true)}`);
        const emitter = this._providerEmitters.get(e.id);
        emitter?.fire(e);
    }
    dispose() {
        // noop
    }
};
MainThreadTimeline = __decorate([
    extHostNamedCustomer(MainContext.MainThreadTimeline),
    __param(1, ILogService),
    __param(2, ITimelineService)
], MainThreadTimeline);
export { MainThreadTimeline };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFRpbWVsaW5lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRUaW1lbGluZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQWlELGNBQWMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzNILE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQW9FLGdCQUFnQixFQUFZLE1BQU0sMkNBQTJDLENBQUM7QUFDekosT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBR3RELElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQWtCO0lBSTlCLFlBQ0MsT0FBd0IsRUFDWCxVQUF3QyxFQUNuQyxnQkFBbUQ7UUFEdkMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNsQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO1FBTHJELHNCQUFpQixHQUFHLElBQUksR0FBRyxFQUF3QyxDQUFDO1FBT3BGLElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELHlCQUF5QixDQUFDLFFBQW9DO1FBQzdELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLG1EQUFtRCxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV4RixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBRTFCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUN4QyxJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1QyxJQUFJLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMvQixXQUFXLEdBQUcsSUFBSSxPQUFPLEVBQXVCLENBQUM7WUFDakQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFFRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsd0JBQXdCLENBQUM7WUFDOUMsR0FBRyxRQUFRO1lBQ1gsV0FBVyxFQUFFLFdBQVcsQ0FBQyxLQUFLO1lBQzlCLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBUSxFQUFFLE9BQXdCLEVBQUUsS0FBd0I7Z0JBQ2pGLE9BQU8sTUFBTSxDQUFXLE1BQU0sS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNyRixDQUFDO1lBQ0QsT0FBTztnQkFDTixRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0IsV0FBVyxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBQ3hCLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsMkJBQTJCLENBQUMsRUFBVTtRQUNyQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxxREFBcUQsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVELHdCQUF3QixDQUFDLENBQXNCO1FBQzlDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUV0RyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRCxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxPQUFPO1FBQ04sT0FBTztJQUNSLENBQUM7Q0FDRCxDQUFBO0FBckRZLGtCQUFrQjtJQUQ5QixvQkFBb0IsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUM7SUFPbEQsV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLGdCQUFnQixDQUFBO0dBUE4sa0JBQWtCLENBcUQ5QiJ9