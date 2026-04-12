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
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
let MergeEditorTelemetry = class MergeEditorTelemetry {
    constructor(telemetryService) {
        this.telemetryService = telemetryService;
    }
    reportMergeEditorOpened(args) {
        this.telemetryService.publicLog2('mergeEditor.opened', {
            conflictCount: args.conflictCount,
            combinableConflictCount: args.combinableConflictCount,
            baseVisible: args.baseVisible,
            isColumnView: args.isColumnView,
            baseTop: args.baseTop,
        });
    }
    reportLayoutChange(args) {
        this.telemetryService.publicLog2('mergeEditor.layoutChanged', {
            baseVisible: args.baseVisible,
            isColumnView: args.isColumnView,
            baseTop: args.baseTop,
        });
    }
    reportMergeEditorClosed(args) {
        this.telemetryService.publicLog2('mergeEditor.closed', {
            conflictCount: args.conflictCount,
            combinableConflictCount: args.combinableConflictCount,
            durationOpenedSecs: args.durationOpenedSecs,
            remainingConflictCount: args.remainingConflictCount,
            accepted: args.accepted,
            conflictsResolvedWithBase: args.conflictsResolvedWithBase,
            conflictsResolvedWithInput1: args.conflictsResolvedWithInput1,
            conflictsResolvedWithInput2: args.conflictsResolvedWithInput2,
            conflictsResolvedWithSmartCombination: args.conflictsResolvedWithSmartCombination,
            manuallySolvedConflictCountThatEqualNone: args.manuallySolvedConflictCountThatEqualNone,
            manuallySolvedConflictCountThatEqualSmartCombine: args.manuallySolvedConflictCountThatEqualSmartCombine,
            manuallySolvedConflictCountThatEqualInput1: args.manuallySolvedConflictCountThatEqualInput1,
            manuallySolvedConflictCountThatEqualInput2: args.manuallySolvedConflictCountThatEqualInput2,
            manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: args.manuallySolvedConflictCountThatEqualNoneAndStartedWithBase,
            manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: args.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1,
            manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: args.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2,
            manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: args.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart,
            manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: args.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart,
        });
    }
    reportAcceptInvoked(inputNumber, otherAccepted) {
        this.telemetryService.publicLog2('mergeEditor.action.accept', {
            otherAccepted: otherAccepted,
            isInput1: inputNumber === 1,
        });
    }
    reportSmartCombinationInvoked(otherAccepted) {
        this.telemetryService.publicLog2('mergeEditor.action.smartCombination', {
            otherAccepted: otherAccepted,
        });
    }
    reportRemoveInvoked(inputNumber, otherAccepted) {
        this.telemetryService.publicLog2('mergeEditor.action.remove', {
            otherAccepted: otherAccepted,
            isInput1: inputNumber === 1,
        });
    }
    reportResetToBaseInvoked() {
        this.telemetryService.publicLog2('mergeEditor.action.resetToBase', {});
    }
    reportNavigationToNextConflict() {
        this.telemetryService.publicLog2('mergeEditor.action.goToNextConflict', {});
    }
    reportNavigationToPreviousConflict() {
        this.telemetryService.publicLog2('mergeEditor.action.goToPreviousConflict', {});
    }
    reportConflictCounterClicked() {
        this.telemetryService.publicLog2('mergeEditor.action.conflictCounterClicked', {});
    }
};
MergeEditorTelemetry = __decorate([
    __param(0, ITelemetryService)
], MergeEditorTelemetry);
export { MergeEditorTelemetry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci90ZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFaEYsSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBb0I7SUFDaEMsWUFDcUMsZ0JBQW1DO1FBQW5DLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7SUFDcEUsQ0FBQztJQUVMLHVCQUF1QixDQUFDLElBT3ZCO1FBQ0EsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FrQjdCLG9CQUFvQixFQUFFO1lBQ3hCLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtZQUNqQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsdUJBQXVCO1lBRXJELFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDL0IsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1NBQ3JCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxJQUlsQjtRQUNBLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBWTdCLDJCQUEyQixFQUFFO1lBQy9CLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztZQUM3QixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDL0IsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1NBQ3JCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxJQXVCdkI7UUFDQSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQWtEN0Isb0JBQW9CLEVBQUU7WUFDeEIsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2pDLHVCQUF1QixFQUFFLElBQUksQ0FBQyx1QkFBdUI7WUFFckQsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGtCQUFrQjtZQUMzQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsc0JBQXNCO1lBQ25ELFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUV2Qix5QkFBeUIsRUFBRSxJQUFJLENBQUMseUJBQXlCO1lBQ3pELDJCQUEyQixFQUFFLElBQUksQ0FBQywyQkFBMkI7WUFDN0QsMkJBQTJCLEVBQUUsSUFBSSxDQUFDLDJCQUEyQjtZQUM3RCxxQ0FBcUMsRUFBRSxJQUFJLENBQUMscUNBQXFDO1lBRWpGLHdDQUF3QyxFQUFFLElBQUksQ0FBQyx3Q0FBd0M7WUFDdkYsZ0RBQWdELEVBQUUsSUFBSSxDQUFDLGdEQUFnRDtZQUN2RywwQ0FBMEMsRUFBRSxJQUFJLENBQUMsMENBQTBDO1lBQzNGLDBDQUEwQyxFQUFFLElBQUksQ0FBQywwQ0FBMEM7WUFFM0YsMERBQTBELEVBQUUsSUFBSSxDQUFDLDBEQUEwRDtZQUMzSCw0REFBNEQsRUFBRSxJQUFJLENBQUMsNERBQTREO1lBQy9ILDREQUE0RCxFQUFFLElBQUksQ0FBQyw0REFBNEQ7WUFDL0gsa0VBQWtFLEVBQUUsSUFBSSxDQUFDLGtFQUFrRTtZQUMzSSwrREFBK0QsRUFBRSxJQUFJLENBQUMsK0RBQStEO1NBQ3JJLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxXQUF3QixFQUFFLGFBQXNCO1FBQ25FLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBUTdCLDJCQUEyQixFQUFFO1lBQy9CLGFBQWEsRUFBRSxhQUFhO1lBQzVCLFFBQVEsRUFBRSxXQUFXLEtBQUssQ0FBQztTQUMzQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsNkJBQTZCLENBQUMsYUFBc0I7UUFDbkQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FNN0IscUNBQXFDLEVBQUU7WUFDekMsYUFBYSxFQUFFLGFBQWE7U0FDNUIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELG1CQUFtQixDQUFDLFdBQXdCLEVBQUUsYUFBc0I7UUFDbkUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FRN0IsMkJBQTJCLEVBQUU7WUFDL0IsYUFBYSxFQUFFLGFBQWE7WUFDNUIsUUFBUSxFQUFFLFdBQVcsS0FBSyxDQUFDO1NBQzNCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCx3QkFBd0I7UUFDdkIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FJN0IsZ0NBQWdDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVELDhCQUE4QjtRQUM3QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUk3QixxQ0FBcUMsRUFBRSxFQUV6QyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsa0NBQWtDO1FBQ2pDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBSzdCLHlDQUF5QyxFQUFFLEVBRTdDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCw0QkFBNEI7UUFDM0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FJN0IsMkNBQTJDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDckQsQ0FBQztDQUNELENBQUE7QUFuUFksb0JBQW9CO0lBRTlCLFdBQUEsaUJBQWlCLENBQUE7R0FGUCxvQkFBb0IsQ0FtUGhDIn0=