/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptVariableWithData } from './promptVariable.js';
import { IRange, Range } from '../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';

/**
 * Name of the variable.
 */
const VARIABLE_NAME: string = 'file';

/**
 * Object represents a file reference token inside a chatbot prompt.
 */
export class FileReference extends PromptVariableWithData {
	constructor(
		range: Range,
		public readonly path: string,
	) {
		super(range, VARIABLE_NAME, path);
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if ((other instanceof FileReference) === false) {
			return false;
		}

		return super.equals(other);
	}

	/**
	 * Get the range of the `link` part of the token (e.g.,
	 * the `/path/to/file.md` part of `#file:/path/to/file.md`).
	 */
	public get linkRange(): IRange {
		return super.dataRange;
	}
}
