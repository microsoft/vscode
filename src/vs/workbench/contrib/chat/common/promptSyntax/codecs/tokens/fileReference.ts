/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { PromptVariableWithData } from './promptVariable.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { IRange, Range } from '../../../../../../../editor/common/core/range.js';

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
	 * Create a {@link FileReference} from a {@link PromptVariableWithData} instance.
	 * @throws if variable name is not equal to {@link VARIABLE_NAME}.
	 */
	public static from(variable: PromptVariableWithData) {
		assert(
			variable.name === VARIABLE_NAME,
			`Variable name must be '${VARIABLE_NAME}', got '${variable.name}'.`,
		);

		return new FileReference(
			variable.range,
			variable.data,
		);
	}

	/**
	 * Get the range of the `link` part of the token (e.g.,
	 * the `/path/to/file.md` part of `#file:/path/to/file.md`).
	 */
	public get linkRange(): IRange | undefined {
		return super.dataRange;
	}
}
