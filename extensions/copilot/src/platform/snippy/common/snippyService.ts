/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { URI } from '../../../util/vs/base/common/uri';
import { StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';

export interface ISnippyService {
	_serviceBrand: undefined;

	handlePostInsertion(documentUri: URI, documentBeforeEdits: StringText, singleEdit: StringReplacement): Promise<void>;
}

export const ISnippyService = createServiceIdentifier<ISnippyService>('ISnippyService');

export class NullSnippyService implements ISnippyService {
	_serviceBrand: undefined;

	public async handlePostInsertion(): Promise<void> {
		return;
	}
}
