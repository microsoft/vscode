/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostAutomationScheduleKind, withAgentHostAutomationScheduleKind } from '../../common/meta/agentHostAutomationsMeta.js';
import { getAgentHostAutomationReminderContext, withAgentHostAutomationReminderContext } from '../../common/meta/agentHostAutomationRemindersMeta.js';
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

suite('Agent Host Automation reminder metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves opaque context and unrelated metadata without inventing absent metadata', () => {
		const original = { vendor: { keep: true } };
		const context = { attachments: 'serialized draft', handoffId: 'handoff' };
		const marked = withAgentHostAutomationReminderContext(original, context);
		assert.deepStrictEqual({
			original,
			context: getAgentHostAutomationReminderContext(upcastPartial<AutomationDefinition>({ _meta: marked })),
			cleared: withAgentHostAutomationReminderContext(marked, undefined),
			absent: withAgentHostAutomationReminderContext(undefined, undefined),
		}, { original: { vendor: { keep: true } }, context, cleared: original, absent: undefined });
	});

	test('round trips the opaque originating session URI alongside handoff context', () => {
		const context = {
			attachments: 'serialized draft',
			handoffId: 'handoff',
			sourceSessionResource: 'vendor-session://connection/opaque%2Fsession?origin=client#chat',
		};
		const definition = upcastPartial<AutomationDefinition>({ _meta: withAgentHostAutomationReminderContext(undefined, context) });
		assert.deepStrictEqual(getAgentHostAutomationReminderContext(JSON.parse(JSON.stringify(definition))), context);
	});

	test('ignores malformed context instead of exposing unvalidated values', () => {
		const values = [undefined, null, [], 'draft', { attachments: [] }, { handoffId: 1 }, { attachments: 'valid', handoffId: false }, { sourceSessionResource: null }, { sourceSessionResource: 1 }, { sourceSessionResource: { scheme: 'vendor-session' } }, { attachments: 'valid', sourceSessionResource: false }];
		assert.deepStrictEqual(values.map(value => getAgentHostAutomationReminderContext(upcastPartial<AutomationDefinition>({
			_meta: { 'vscode.reminderContext': value },
		}))), values.map(() => undefined));
	});
});
