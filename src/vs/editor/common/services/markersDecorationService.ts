/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel, IModelDecoration } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IMarker } from 'vs/platform/markers/common/markers';

export const IMarkerDecorationsService = createDecorator<IMarkerDecorationsService>('markerDecorationsService');

export interface IMarkerDecorationsService {
	_serviceBrand: any;

	getMarker(model: ITextModel, decoration: IModelDecoration): IMarker | null;
}