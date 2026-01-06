/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { assertNever } from '../../../../../../../base/common/assert.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning, TDiagnostic } from '../../../../common/promptSyntax/parsers/promptHeader/diagnostics.js';

/**
 * Base class for all expected diagnostics used in the unit tests.
 */
abstract class ExpectedDiagnostic extends PromptMetadataDiagnostic {
	/**
	 * Validate that the provided diagnostic is equal to this object.
	 */
	public validateEqual(other: TDiagnostic) {
		this.validateTypesEqual(other);

		assert.strictEqual(
			this.message,
			other.message,
			`Expected message '${this.message}', got '${other.message}'.`,
		);

		assert(
			this.range
				.equalsRange(other.range),
			`Expected range '${this.range}', got '${other.range}'.`,
		);
	}

	/**
	 * Validate that the provided diagnostic is of the same
	 * diagnostic type as this object.
	 */
	private validateTypesEqual(other: TDiagnostic) {
		if (other instanceof PromptMetadataWarning) {
			assert(
				this instanceof ExpectedDiagnosticWarning,
				`Expected a warning diagnostic object, got '${other}'.`,
			);

			return;
		}

		if (other instanceof PromptMetadataError) {
			assert(
				this instanceof ExpectedDiagnosticError,
				`Expected a error diagnostic object, got '${other}'.`,
			);

			return;
		}

		assertNever(
			other,
			`Unknown diagnostic type '${other}'.`,
		);
	}
}

/**
 * Expected warning diagnostic object for testing purposes.
 */
export class ExpectedDiagnosticWarning extends ExpectedDiagnostic {
	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `expected-diagnostic/warning(${this.message})${this.range}`;
	}
}

/**
 * Expected error diagnostic object for testing purposes.
 */
export class ExpectedDiagnosticError extends ExpectedDiagnostic {
	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `expected-diagnostic/error(${this.message})${this.range}`;
	}
}

/**
 * Type for any expected diagnostic object.
 */
export type TExpectedDiagnostic = ExpectedDiagnosticWarning | ExpectedDiagnosticError;
