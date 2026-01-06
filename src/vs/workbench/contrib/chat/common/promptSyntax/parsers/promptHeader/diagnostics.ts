/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../../../../editor/common/core/range.js';

/**
 * List of all currently supported diagnostic types.
 */
export type TDiagnostic = PromptMetadataWarning | PromptMetadataError;

/**
 * Diagnostics object that hold information about some issue
 * related to the prompt header metadata.
 */
export abstract class PromptMetadataDiagnostic {
	constructor(
		public readonly range: Range,
		public readonly message: string,
	) { }

	/**
	 * String representation of the diagnostic object.
	 */
	public abstract toString(): string;
}

/**
 * Diagnostics object that hold information about some
 * non-fatal issue related to the prompt header metadata.
 */
export class PromptMetadataWarning extends PromptMetadataDiagnostic {
	public override toString(): string {
		return `warning(${this.message})${this.range}`;
	}
}

/**
 * Diagnostics object that hold information about some
 * fatal issue related to the prompt header metadata.
 */
export class PromptMetadataError extends PromptMetadataDiagnostic {
	public override toString(): string {
		return `error(${this.message})${this.range}`;
	}
}
