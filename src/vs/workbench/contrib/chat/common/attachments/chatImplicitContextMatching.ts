/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { IChatRequestVariableEntry, isStringVariableEntry } from './chatVariableEntries.js';

export interface IImplicitContextAttachmentTarget {
	readonly uri?: URI;
	readonly range?: IRange;
	/**
	 * Whether the context value this target was built from is a string context
	 * (i.e. it satisfied `isStringImplicitContextValue`). Set by the caller, which
	 * has the value in scope, so the matcher never infers the kind from `handle`.
	 */
	readonly isStringTarget: boolean;
	readonly handle?: number;
	readonly resourceUri?: URI;
}

/**
 * Whether an implicit context suggestion should be hidden because the same
 * attachment is already in the chat input attachment model.
 */
export function isImplicitContextAlreadyAttached(
	attachments: readonly IChatRequestVariableEntry[],
	target: IImplicitContextAttachmentTarget,
): boolean {
	const { uri: targetUri, range: targetRange, isStringTarget, handle: targetHandle, resourceUri: targetResourceUri } = target;

	return attachments.some(a => {
		if (isStringTarget && targetHandle !== undefined && isStringVariableEntry(a) && a.handle === targetHandle) {
			return true;
		}

		// Match string/PR attachment identity by resource URI, not its editor/webview URI.
		if (isStringVariableEntry(a)) {
			return !!(targetResourceUri && a.resourceUri && isEqual(targetResourceUri, a.resourceUri));
		}

		// String-shaped targets only match string attachments (by handle or resourceUri).
		if (isStringTarget) {
			return false;
		}

		const aUri = URI.isUri(a.value) ? a.value : isLocation(a.value) ? a.value.uri : undefined;
		const aRange = isLocation(a.value) ? a.value.range : undefined;
		if (targetUri && aUri && isEqual(targetUri, aUri)) {
			if (targetRange && aRange) {
				return Range.equalsRange(targetRange, aRange);
			}
			return !targetRange && !aRange;
		}
		return false;
	});
}
