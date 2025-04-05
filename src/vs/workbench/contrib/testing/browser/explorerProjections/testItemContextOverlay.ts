/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InternalTestItem } from '../../common/testTypes.js';
import { capabilityContextKeys } from '../../common/testProfileService.js';
import { TestId } from '../../common/testId.js';
import { TestingContextKeys } from '../../common/testingContextKeys.js';

export const getTestItemContextOverlay = (test: InternalTestItem | undefined, capabilities: number): [string, unknown][] => {
	if (!test) {
		return [];
	}

	const testId = TestId.fromString(test.item.extId);

	return [
		[TestingContextKeys.testItemExtId.key, testId.localId],
		[TestingContextKeys.controllerId.key, test.controllerId],
		[TestingContextKeys.testItemHasUri.key, !!test.item.uri],
		...capabilityContextKeys(capabilities),
	];
};
