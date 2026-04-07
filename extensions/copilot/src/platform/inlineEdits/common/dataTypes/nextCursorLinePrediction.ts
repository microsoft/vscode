/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum } from '../../../configuration/common/validator';

export enum NextCursorLinePrediction {
	Jump = 'jump',
	OnlyWithEdit = 'onlyWithEdit',
}

export enum NextCursorLinePredictionCursorPlacement {
	BeforeLine = 'beforeLine',
	AfterLine = 'afterLine',
}

export namespace NextCursorLinePredictionCursorPlacement {
	export const VALIDATOR = vEnum(NextCursorLinePredictionCursorPlacement.BeforeLine, NextCursorLinePredictionCursorPlacement.AfterLine);
}
