/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InternalTestItem } from 'vs/workbench/contrib/testing/common/testTypes';
import { capabilityContextKeys } from 'vs/workbench/contrib/testing/common/testProfileService';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';

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
