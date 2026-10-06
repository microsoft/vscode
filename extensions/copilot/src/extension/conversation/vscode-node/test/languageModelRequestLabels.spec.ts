/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getLanguageModelRequestLabels } from '../../common/languageModelAccess';

describe('getLanguageModelRequestLabels', () => {
	it('attributes core requests to their purpose and ignores purposes from extensions or with unexpected values', () => {
		expect({
			corePurpose: getLanguageModelRequestLabels(undefined, 'thinkingTitle'),
			coreWithoutPurpose: getLanguageModelRequestLabels(undefined, undefined),
			coreInvalidPurpose: getLanguageModelRequestLabels(undefined, 'title/../user@example.com'),
			coreNonStringPurpose: getLanguageModelRequestLabels(undefined, 42),
			extensionSpoofingPurpose: getLanguageModelRequestLabels('publisher.extension', 'thinkingTitle'),
		}).toEqual({
			corePurpose: { messageSource: 'api.core/thinkingTitle', debugName: 'copilotLanguageModelWrapper/thinkingTitle' },
			coreWithoutPurpose: { messageSource: 'api.undefined', debugName: 'copilotLanguageModelWrapper' },
			coreInvalidPurpose: { messageSource: 'api.undefined', debugName: 'copilotLanguageModelWrapper' },
			coreNonStringPurpose: { messageSource: 'api.undefined', debugName: 'copilotLanguageModelWrapper' },
			extensionSpoofingPurpose: { messageSource: 'api.publisher.extension', debugName: 'copilotLanguageModelWrapper' },
		});
	});
});
