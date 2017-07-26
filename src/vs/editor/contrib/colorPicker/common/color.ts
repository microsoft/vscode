/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorFormat } from 'vs/editor/common/modes';
import { Color } from 'vs/base/common/color';

export interface IColorDecorationExtraOptions {
	readonly color: Color;
	readonly format: IColorFormat;
	readonly availableFormats: IColorFormat[];
}

export function isColorDecorationOptions(options: any): options is IColorDecorationExtraOptions {
	return !!(options && (options as any).color);
}