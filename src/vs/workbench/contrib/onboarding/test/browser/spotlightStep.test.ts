/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { createOnboardingClickStep, createOnboardingContextStep } from '../../browser/spotlight/spotlightStep.js';
import { SPOTLIGHT_PRESENTATION_KIND } from '../../browser/spotlight/spotlightTypes.js';

suite('Spotlight prerequisite steps', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates an interactive click-completed step with bounded target wait', () => {
		assert.deepStrictEqual(createOnboardingClickStep({
			id: 'choose',
			targetId: 'example.choose',
			title: 'Choose an item',
			description: 'Select the item to continue.',
		}), {
			id: 'choose',
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				id: 'choose',
				targetId: 'example.choose',
				title: 'Choose an item',
				description: 'Select the item to continue.',
				allowTargetInteraction: true,
				advanceOnTargetClick: true,
				missingTarget: { kind: 'wait', timeoutMs: 10_000 },
			},
		});
	});

	test('creates an interactive context-completed step that opens its target', () => {
		const completeWhen = ContextKeyExpr.has('exampleSelected');
		assert.deepStrictEqual(createOnboardingContextStep({
			id: 'select',
			targetId: 'example.selector',
			title: 'Select a value',
			description: 'Choose a value to continue.',
			completeWhen,
		}), {
			id: 'select',
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				id: 'select',
				targetId: 'example.selector',
				title: 'Select a value',
				description: 'Choose a value to continue.',
				openTarget: true,
				allowTargetInteraction: true,
				advanceWhen: completeWhen,
				missingTarget: { kind: 'wait', timeoutMs: 10_000 },
			},
		});
	});

	test('preserves explicit interaction and target behavior', () => {
		assert.deepStrictEqual(createOnboardingContextStep({
			id: 'acknowledge',
			targetId: 'example.status',
			title: 'Review status',
			description: 'Review the status, then continue.',
			completeWhen: ContextKeyExpr.true(),
			openTarget: false,
			allowTargetInteraction: false,
			missingTarget: { kind: 'abort' },
		}).payload, {
			id: 'acknowledge',
			targetId: 'example.status',
			title: 'Review status',
			description: 'Review the status, then continue.',
			openTarget: false,
			allowTargetInteraction: false,
			advanceWhen: ContextKeyExpr.true(),
			missingTarget: { kind: 'abort' },
		});
	});
});
