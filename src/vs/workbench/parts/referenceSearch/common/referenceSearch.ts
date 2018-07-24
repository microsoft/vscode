/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import uri from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';

export const VIEW_ID = 'workbench.view.referenceSearch';

export interface IReferenceSearchQueryInfo {
	uri: uri;
	position: Position;
}

export interface IFileMatch {
	resource?: uri;
	lineMatches?: ILineMatch[];
}

export interface ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];
}

export interface IProgress {
	total?: number;
	worked?: number;
	message?: string;
}

export interface IReferenceSearchProgressItem extends IFileMatch, IProgress {
	// Marker interface to indicate the possible values for progress calls from the engine
}

export interface IReferenceSearchCompleteStats {
	limitHit?: boolean;
	stats?: IReferenceSearchStats;
}

export interface IReferenceSearchComplete extends IReferenceSearchCompleteStats {
	results: IFileMatch[];
}

export interface IReferenceSearchStats {
	fromCache: boolean;
	resultCount: number;
	unsortedResultTime?: number;
	sortedResultTime?: number;
}

export interface IReferenceSearchConfigurationProperties {
	location: 'sidebar' | 'panel';
}

export interface IReferenceSearchConfiguration {
	referenceSearch: IReferenceSearchConfigurationProperties;
}
