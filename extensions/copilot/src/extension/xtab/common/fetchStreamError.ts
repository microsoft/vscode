/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NoNextEditReason } from '../../../platform/inlineEdits/common/statelessNextEditProvider';

/**
 * Typed error thrown when an async line stream is rejected due to a fetch failure.
 * Consumers can catch this to extract the mapped {@link NoNextEditReason}.
 */
export class FetchStreamError extends Error {
	constructor(readonly reason: NoNextEditReason) {
		super('Fetch stream failed');
	}
}
