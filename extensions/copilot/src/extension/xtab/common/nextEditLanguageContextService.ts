/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageContextResponse } from '../../../platform/inlineEdits/common/dataTypes/languageContext';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Position } from '../../../util/vs/editor/common/core/position';

export interface NextEditLanguageContextRequest {
	readonly opportunityId: string;
	readonly completionId: string;
	/**
	 * The document snapshot NES prompts with.
	 */
	readonly document: StatelessNextEditDocument;
	/**
	 * Cursor position in `document.documentAfterEdits`.
	 */
	readonly cursorPosition: Position;
	/**
	 * How long to wait for context, in milliseconds.
	 */
	readonly timeBudgetMs: number;
}

/**
 * Collects language context, such as declarations of the symbols around the cursor, for the NES prompt.
 */
export interface INextEditLanguageContextService {
	readonly _serviceBrand: undefined;

	/**
	 * @returns `undefined` when no context source applies to the document.
	 */
	getLanguageContext(request: NextEditLanguageContextRequest, token: CancellationToken): Promise<LanguageContextResponse | undefined>;
}

export const INextEditLanguageContextService = createServiceIdentifier<INextEditLanguageContextService>('INextEditLanguageContextService');
