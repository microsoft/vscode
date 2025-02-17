/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { InputNumber } from './model/modifiedBaseRange.js';
export class MergeEditorTelemetry {
	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) { }

	reportMergeEditorOpened(args: {
		conflictCount: number;
		combinableConflictCount: number;

		baseVisible: boolean;
		isColumnView: boolean;
		baseTop: boolean;
	}): void {
		this.telemetryService.publicLog2<{
			conflictCount: number;
			combinableConflictCount: number;

			baseVisible: boolean;
			isColumnView: boolean;
			baseTop: boolean;
		}, {
			owner: 'hediet';

			conflictCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many conflicts typically occur' };
			combinableConflictCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To evaluate how useful the smart-merge feature is' };

			baseVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many users use the base view to solve a conflict' };
			isColumnView: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To gain insight which layout should be default' };
			baseTop: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To gain insight which layout should be default for the base view' };

			comment: 'This event tracks when a user opens a 3 way merge editor. The associated data helps to fine-tune the merge editor.';
		}>('mergeEditor.opened', {
			conflictCount: args.conflictCount,
			combinableConflictCount: args.combinableConflictCount,

			baseVisible: args.baseVisible,
			isColumnView: args.isColumnView,
			baseTop: args.baseTop,
		});
	}

	reportLayoutChange(args: {
		baseVisible: boolean;
		isColumnView: boolean;
		baseTop: boolean;
	}): void {
		this.telemetryService.publicLog2<{
			baseVisible: boolean;
			isColumnView: boolean;
			baseTop: boolean;
		}, {
			owner: 'hediet';

			baseVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many users use the base view to solve a conflict' };
			isColumnView: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To gain insight which layout should be default' };
			baseTop: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To gain insight which layout should be default for the base view' };

			comment: 'This event tracks when a user changes the layout of the 3 way merge editor. This is useful to understand what layout should be default.';
		}>('mergeEditor.layoutChanged', {
			baseVisible: args.baseVisible,
			isColumnView: args.isColumnView,
			baseTop: args.baseTop,
		});
	}

	reportMergeEditorClosed(args: {
		conflictCount: number;
		combinableConflictCount: number;

		durationOpenedSecs: number;
		remainingConflictCount: number;
		accepted: boolean;

		conflictsResolvedWithBase: number;
		conflictsResolvedWithInput1: number;
		conflictsResolvedWithInput2: number;
		conflictsResolvedWithSmartCombination: number;

		manuallySolvedConflictCountThatEqualNone: number;
		manuallySolvedConflictCountThatEqualSmartCombine: number;
		manuallySolvedConflictCountThatEqualInput1: number;
		manuallySolvedConflictCountThatEqualInput2: number;

		manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: number;
		manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: number;
		manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: number;
		manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: number;
		manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: number;
	}): void {
		this.telemetryService.publicLog2<{
			conflictCount: number;
			combinableConflictCount: number;

			durationOpenedSecs: number;
			remainingConflictCount: number;
			accepted: boolean;

			conflictsResolvedWithBase: number;
			conflictsResolvedWithInput1: number;
			conflictsResolvedWithInput2: number;
			conflictsResolvedWithSmartCombination: number;

			manuallySolvedConflictCountThatEqualNone: number;
			manuallySolvedConflictCountThatEqualSmartCombine: number;
			manuallySolvedConflictCountThatEqualInput1: number;
			manuallySolvedConflictCountThatEqualInput2: number;

			manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: number;
			manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: number;
			manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: number;
			manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: number;
			manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: number;
		}, {
			owner: 'hediet';

			conflictCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many conflicts typically occur' };
			combinableConflictCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To evaluate how useful the smart-merge feature is' };

			durationOpenedSecs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how long the merge editor was open before it was closed. This can be compared with the inline experience to investigate time savings.' };
			remainingConflictCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many conflicts were skipped. Should be zero for a successful merge.' };
			accepted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the user completed the merge successfully or just closed the editor' };

			conflictsResolvedWithBase: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many conflicts are resolved with base' };
			conflictsResolvedWithInput1: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many conflicts are resolved with input1' };
			conflictsResolvedWithInput2: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many conflicts are resolved with input2' };
			conflictsResolvedWithSmartCombination: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how many conflicts are resolved with smart combination' };

			manuallySolvedConflictCountThatEqualNone: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many conflicts were solved manually that are not recognized by the merge editor.' };
			manuallySolvedConflictCountThatEqualSmartCombine: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many conflicts were solved manually that equal the smart combination of the inputs.' };
			manuallySolvedConflictCountThatEqualInput1: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many conflicts were solved manually that equal just input 1' };
			manuallySolvedConflictCountThatEqualInput2: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many conflicts were solved manually that equal just input 2' };

			manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many manually solved conflicts that are not recognized started with base' };
			manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many manually solved conflicts that are not recognized started with input1' };
			manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many manually solved conflicts that are not recognized started with input2' };
			manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many manually solved conflicts that are not recognized started with both (non-smart combination)' };
			manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates how many manually solved conflicts that are not recognized started with both (smart-combination)' };

			comment: 'This event tracks when a user closes a merge editor. It also tracks how the user solved the merge conflicts. This data can be used to improve the UX of the merge editor. This event will be fired rarely (less than 200k per week)';
		}>('mergeEditor.closed', {
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

	reportAcceptInvoked(inputNumber: InputNumber, otherAccepted: boolean): void {
		this.telemetryService.publicLog2<{
			otherAccepted: boolean;
			isInput1: boolean;
		}, {
			owner: 'hediet';
			otherAccepted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the user already accepted the other side' };
			isInput1: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the user accepted input 1 or input 2' };
			comment: 'This event tracks when a user accepts one side of a conflict.';
		}>('mergeEditor.action.accept', {
			otherAccepted: otherAccepted,
			isInput1: inputNumber === 1,
		});
	}

	reportSmartCombinationInvoked(otherAccepted: boolean): void {
		this.telemetryService.publicLog2<{
			otherAccepted: boolean;
		}, {
			owner: 'hediet';
			otherAccepted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the user immediately clicks on accept both or only after the other side has been accepted' };
			comment: 'This event tracks when the user clicks on "Accept Both".';
		}>('mergeEditor.action.smartCombination', {
			otherAccepted: otherAccepted,
		});
	}

	reportRemoveInvoked(inputNumber: InputNumber, otherAccepted: boolean): void {
		this.telemetryService.publicLog2<{
			otherAccepted: boolean;
			isInput1: boolean;
		}, {
			owner: 'hediet';
			otherAccepted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the user accepted the other side' };
			isInput1: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates if the user accepted input 1 or input 2' };
			comment: 'This event tracks when a user un-accepts one side of a conflict.';
		}>('mergeEditor.action.remove', {
			otherAccepted: otherAccepted,
			isInput1: inputNumber === 1,
		});
	}

	reportResetToBaseInvoked(): void {
		this.telemetryService.publicLog2<{
		}, {
			owner: 'hediet';
			comment: 'This event tracks when the user invokes "Reset To Base".';
		}>('mergeEditor.action.resetToBase', {});
	}

	reportNavigationToNextConflict(): void {
		this.telemetryService.publicLog2<{
		}, {
			owner: 'hediet';
			comment: 'This event tracks when the user navigates to the next conflict".';
		}>('mergeEditor.action.goToNextConflict', {

		});
	}

	reportNavigationToPreviousConflict(): void {
		this.telemetryService.publicLog2<{

		}, {
			owner: 'hediet';
			comment: 'This event tracks when the user navigates to the previous conflict".';
		}>('mergeEditor.action.goToPreviousConflict', {

		});
	}

	reportConflictCounterClicked(): void {
		this.telemetryService.publicLog2<{
		}, {
			owner: 'hediet';
			comment: 'This event tracks when the user clicks on the conflict counter to navigate to the next conflict.';
		}>('mergeEditor.action.conflictCounterClicked', {});
	}
}
