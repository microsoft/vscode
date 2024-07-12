/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITreeSitterParserService = createDecorator<ITreeSitterParserService>('treeSitterParserService');

/**
 * Currently this service just logs telemetry about how long it takes to parse files.
 * Actual API will come later as we add features like syntax highlighting.
 */
export interface ITreeSitterParserService {
	readonly _serviceBrand: undefined;
}
