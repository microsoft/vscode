/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatContextUsageDetails, IChatContextUsageData } from '../../../../browser/widgetHosts/viewPane/chatContextUsageDetails.js';

suite('ChatContextUsageDetails', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function data(overrides: Partial<IChatContextUsageData> = {}): IChatContextUsageData {
		return {
			usedTokens: 50_000,
			completionTokens: 4_000,
			totalContextWindow: 100_000,
			percentage: 50,
			...overrides,
		};
	}

	function tokenText(details: ChatContextUsageDetails): string | null | undefined {
		return details.domNode.querySelector('.quota-value')?.textContent;
	}

	function createDetails(initial: IChatContextUsageData | undefined) {
		const instaService = workbenchInstantiationService(undefined, disposables);
		const observable = observableValue<IChatContextUsageData | undefined>('test', initial);
		const details = disposables.add(instaService.createInstance(ChatContextUsageDetails, undefined, observable));
		return { details, observable };
	}

	test('renders the initial data on construction', () => {
		const { details } = createDetails(data({ percentage: 42 }));
		assert.strictEqual(tokenText(details), '42%');
	});

	test('re-renders in place when the observable changes (open-popover refresh)', () => {
		const { details, observable } = createDetails(data({ percentage: 80 }));
		assert.strictEqual(tokenText(details), '80%');

		// Simulate a mid-session change (e.g. after /compact) while the popover instance stays alive.
		observable.set(data({ percentage: 15 }), undefined);
		assert.strictEqual(tokenText(details), '15%');
	});
});
