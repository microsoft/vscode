/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIgnoreService } from '../../../../../../platform/ignore/common/ignoreService';
import { URI } from '../../../../../../util/vs/base/common/uri';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { TextDocumentIdentifier } from '../textDocument';

/**
 * Evaluate document uri to see if it's valid for copilot to process
 */
export async function isDocumentValid(
	accessor: ServicesAccessor,
	document: TextDocumentIdentifier,
): Promise<{ status: 'valid' } | { status: 'invalid'; reason: string }> {
	const ignoreService = accessor.get(IIgnoreService);
	if (await ignoreService.isCopilotIgnored(URI.parse(document.uri))) {
		return {
			status: 'invalid',
			reason: 'Document is blocked by repository policy',
		};
	}

	return { status: 'valid' };
}
