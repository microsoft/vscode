/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mergeOriginatingTriggers, originatingTriggerTelemetry, parseOriginatingTrigger, type IOriginatingTriggerContext } from '../../common/originatingTrigger.js';

suite('Originating trigger attribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const first: IOriginatingTriggerContext = {
		triggers: [{ id: '00000000-0000-4000-8000-000000000001', kind: 'user' }],
		incomplete: false,
		involvesSteering: false,
	};
	const second: IOriginatingTriggerContext = {
		triggers: [{ id: '00000000-0000-4000-8000-000000000002', kind: 'automation' }],
		incomplete: false,
		involvesSteering: true,
	};

	test('validates opaque references and drops content outside the contract', () => {
		assert.deepStrictEqual({
			parsed: parseOriginatingTrigger({ ...first, prompt: 'not telemetry', triggers: [{ ...first.triggers[0], content: 'not telemetry' }] }),
			invalid: [
				{ ...first, triggers: [{ id: 'caller supplied text', kind: 'user' }] },
				{ ...first, triggers: [{ ...first.triggers[0], kind: 'arbitrary category' }] },
				{ ...first, triggers: [first.triggers[0], first.triggers[0]] },
				{ ...first, involvesSteering: 'true' },
			].map(parseOriginatingTrigger),
		}, {
			parsed: first,
			invalid: [undefined, undefined, undefined, undefined],
		});
	});

	test('preserves shared causes and steering without assigning a scalar owner', () => {
		const merged = mergeOriginatingTriggers(first, second);
		assert.deepStrictEqual({
			shared: originatingTriggerTelemetry(merged),
			partial: originatingTriggerTelemetry(mergeOriginatingTriggers(merged, { triggers: [], incomplete: true, involvesSteering: false })),
			repeated: mergeOriginatingTriggers(merged, first),
		}, {
			shared: {
				originatingTriggerAttribution: 'multiple',
				originatingTriggers: JSON.stringify([...first.triggers, ...second.triggers]),
				involvesSteering: true,
			},
			partial: {
				originatingTriggerAttribution: 'partial',
				originatingTriggers: JSON.stringify([...first.triggers, ...second.triggers]),
				involvesSteering: true,
			},
			repeated: merged,
		});
	});

	test('bounds the union at sixteen references while retaining missingness', () => {
		const context: IOriginatingTriggerContext = {
			...first,
			triggers: Array.from({ length: 16 }, (_, index) => ({ id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`, kind: 'user' })),
		};
		const extra: IOriginatingTriggerContext = { ...first, triggers: [{ id: '00000000-0000-4000-8000-000000000010', kind: 'user' }] };
		assert.deepStrictEqual({
			atLimit: parseOriginatingTrigger(context),
			overLimit: parseOriginatingTrigger({ ...context, triggers: [...context.triggers, ...extra.triggers] }),
			merged: mergeOriginatingTriggers(context, extra),
			conflicting: mergeOriginatingTriggers(first, { ...first, triggers: [{ ...first.triggers[0], kind: 'automation' }] }),
		}, {
			atLimit: context,
			overLimit: undefined,
			merged: { ...context, incomplete: true },
			conflicting: { ...first, incomplete: true },
		});
	});
});
