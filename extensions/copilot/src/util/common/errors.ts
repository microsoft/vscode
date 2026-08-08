/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeStringify } from '../vs/base/common/objects';

export namespace ErrorUtils {

	export function fromUnknown(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}

		if (typeof error === 'string') {
			return new Error(error);
		}

		return new Error(`An unexpected error occurred: ${safeStringify(error)}`);
	}

	export function toString(error: Error) {
		return error.stack ? error.stack : error.message;
	}

}
