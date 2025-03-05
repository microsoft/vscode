/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from '../../../../../../editor/common/core/range.js';
import { ModelDecorationOptions } from '../../../../../../editor/common/model/textModel.js';

/**
 * Decoration object.
 */
export interface ITextModelDecoration {
	/**
	 * Range of the decoration.
	 */
	range: IRange;

	/**
	 * Associated decoration options.
	 */
	options: ModelDecorationOptions;
}

/**
 * Decoration CSS class names.
 */
export enum DecorationClassNames {
	/**
	 * CSS class name for `default` prompt syntax decoration.
	 */
	default = 'prompt-decoration',

	/**
	 * CSS class name for `file reference` prompt syntax decoration.
	 */
	fileReference = DecorationClassNames.default,
}
