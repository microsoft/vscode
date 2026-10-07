/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel, IModelDecoration } from '../model.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IMarker } from '../../../platform/markers/common/markers.js';
import { Event } from '../../../base/common/event.js';
import { Range } from '../core/range.js';
import { URI } from '../../../base/common/uri.js';
import { IDisposable } from '../../../base/common/lifecycle.js';

export const IMarkerDecorationsService = createDecorator<IMarkerDecorationsService>('markerDecorationsService');

export interface IMarkerDecorationsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeMarker: Event<ITextModel>;

	/**
	 * Fires when a model starts or stops exceeding the marker decoration limit.
	 */
	readonly onDidChangeDecorationLimitExceeded: Event<ITextModel>;

	getMarker(uri: URI, decoration: IModelDecoration): IMarker | null;

	getLiveMarkers(uri: URI): [Range, IMarker][];

	/**
	 * Returns the applied marker decoration limit when it is exceeded, or undefined otherwise.
	 */
	getExceededDecorationLimit(uri: URI): number | undefined;

	addMarkerSuppression(uri: URI, range: Range): IDisposable;
}
