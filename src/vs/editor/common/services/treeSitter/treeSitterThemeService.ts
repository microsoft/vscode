/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';

export const ITreeSitterThemeService = createDecorator<ITreeSitterThemeService>('treeSitterThemeService');

export interface ITreeSitterThemeService {
	readonly _serviceBrand: undefined;
	readonly onChange: IObservable<void>;

	findMetadata(captureNames: string[], languageId: number, bracket: boolean, reader: IReader | undefined): number;
}
