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
var StructuredLogger_1;
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDataChannelService } from '../../../../platform/dataChannel/common/dataChannel.js';
/**
 * The sourceLabel must not contain '@'!
*/
export function formatRecordableLogEntry(entry) {
    // eslint-disable-next-line local/code-no-any-casts
    return entry.sourceId + ' @@ ' + JSON.stringify({ ...entry, modelUri: entry.modelUri?.toString(), sourceId: undefined });
}
let StructuredLogger = StructuredLogger_1 = class StructuredLogger extends Disposable {
    static cast() {
        return this;
    }
    constructor(_key, _contextKeyService, _dataChannelService) {
        super();
        this._key = _key;
        this._contextKeyService = _contextKeyService;
        this._dataChannelService = _dataChannelService;
        this._isEnabledContextKeyValue = observableContextKey('structuredLogger.enabled:' + this._key, this._contextKeyService).recomputeInitiallyAndOnChange(this._store);
        this.isEnabled = this._isEnabledContextKeyValue.map(v => v !== undefined);
    }
    log(data) {
        const enabled = this._isEnabledContextKeyValue.get();
        if (!enabled) {
            return false;
        }
        this._dataChannelService.getDataChannel('structuredLogger:' + this._key).sendData(data);
        return true;
    }
};
StructuredLogger = StructuredLogger_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, IDataChannelService)
], StructuredLogger);
export { StructuredLogger };
function observableContextKey(key, contextKeyService) {
    return observableFromEvent(contextKeyService.onDidChangeContext, () => contextKeyService.getContextKeyValue(key));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RydWN0dXJlZExvZ2dlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvc3RydWN0dXJlZExvZ2dlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXpGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBMEM3Rjs7RUFFRTtBQUNGLE1BQU0sVUFBVSx3QkFBd0IsQ0FBZ0MsS0FBUTtJQUMvRSxtREFBbUQ7SUFDbkQsT0FBTyxLQUFLLENBQUMsUUFBUSxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxLQUFLLEVBQUUsUUFBUSxFQUFHLEtBQWEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7QUFDbkksQ0FBQztBQUVNLElBQU0sZ0JBQWdCLHdCQUF0QixNQUFNLGdCQUFnRCxTQUFRLFVBQVU7SUFDdkUsTUFBTSxDQUFDLElBQUk7UUFDakIsT0FBTyxJQUFrQyxDQUFDO0lBQzNDLENBQUM7SUFLRCxZQUNrQixJQUFZLEVBQ1Esa0JBQXNDLEVBQ3JDLG1CQUF3QztRQUU5RSxLQUFLLEVBQUUsQ0FBQztRQUpTLFNBQUksR0FBSixJQUFJLENBQVE7UUFDUSx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3JDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFHOUUsSUFBSSxDQUFDLHlCQUF5QixHQUFHLG9CQUFvQixDQUFVLDJCQUEyQixHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVLLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRU0sR0FBRyxDQUFDLElBQU87UUFDakIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLENBQUksbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzRixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRCxDQUFBO0FBMUJZLGdCQUFnQjtJQVUxQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsbUJBQW1CLENBQUE7R0FYVCxnQkFBZ0IsQ0EwQjVCOztBQUVELFNBQVMsb0JBQW9CLENBQUksR0FBVyxFQUFFLGlCQUFxQztJQUNsRixPQUFPLG1CQUFtQixDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdEgsQ0FBQyJ9