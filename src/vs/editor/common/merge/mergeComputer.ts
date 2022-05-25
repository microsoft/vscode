/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILineChange, IDiffComputationResult } from 'vs/editor/common/diff/diffComputer';
import { ConflictState } from 'vs/editor/common/editorCommon';

export interface IMergeComputationResult {
	currentDiff: IDiffComputationResult;
	incomingDiff: IDiffComputationResult;
	initialRegions: MergeRegion[];

	outputDiff: IDiffComputationResult;
	merges: MergeRegion[];
}

/**
 * A merge (from 2 sources) that corresponds to a change region within the three
 * way merge editor. It can have multiple current/output/incoming changes within
 * a region if they overlap.
 */
export interface IMerge {
	currentStartLineNumber: number;
	currentEndLineNumber: number;
	incomingStartLineNumber: number;
	incomingEndLineNumber: number;
	outputStartLineNumber: number;
	outputEndLineNumber: number;
	hasConflict: boolean;
	currentChanges: ILineChange[];
	outputChanges: ILineChange[];
	incomingChanges: ILineChange[];
}

/** State of a merge region. */
export interface MergeRegionState {
	conflict: ConflictState;
	action?: ResolvingAction;
}

/** Ongoing action applying to a merge region. */
export enum ResolvingAction {
	AcceptingLeft,
	AcceptingRight,
}

/** A region of merge with the merge state. */
export interface MergeRegion extends IMerge {
	state: MergeRegionState;
}
