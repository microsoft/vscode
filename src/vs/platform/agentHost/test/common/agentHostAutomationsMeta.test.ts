/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostAutomationScheduleKind, withAgentHostAutomationScheduleKind } from '../../common/meta/agentHostAutomationsMeta.js';
import type { AutomationDefinition } from '../../common/state/protocol/state.js';

suite('Agent Host Automation schedule metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips the editing form and clears only its own metadata', () => {
		const original = { vendor: { keep: true } };
		const marked = withAgentHostAutomationScheduleKind(original, 'cron');
		const definition = upcastPartial<AutomationDefinition>({ _meta: marked });
		assert.deepStrictEqual({
			original, marked,
			kind: getAgentHostAutomationScheduleKind(JSON.parse(JSON.stringify(definition))),
			cleared: withAgentHostAutomationScheduleKind(marked, undefined),
			clearedLastKey: withAgentHostAutomationScheduleKind(withAgentHostAutomationScheduleKind(undefined, 'cron'), undefined),
		}, {
			original: { vendor: { keep: true } },
			marked: { vendor: { keep: true }, 'vscode.automationScheduleKind': 'cron' },
			kind: 'cron',
			cleared: original,
			clearedLastKey: {},
		});
	});

	test('ignores absent and unrecognized editing preferences', () => {
		const values = [undefined, null, true, 'hourly', { kind: 'cron' }];
		assert.deepStrictEqual(values.map(value => getAgentHostAutomationScheduleKind(upcastPartial<AutomationDefinition>({
			_meta: { 'vscode.automationScheduleKind': value },
		}))), values.map(() => undefined));
	});
});
