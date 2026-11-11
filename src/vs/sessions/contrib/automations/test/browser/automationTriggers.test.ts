/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { automationTriggerChoices, automationTriggerFamily, automationTriggerFieldGroups, automationTriggerFields, automationTriggerSummary, canEditAutomationTriggers, hasAutomationEventTrigger, normalizeAutomationTriggerField, selectAutomationTriggerEvents, validateAutomationTriggerFields } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';

suite('Automation triggers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes internal and public catalog fields without supplying defaults', () => {
		const fields = automationTriggerFields({
			name: 'issue_labeled', title: 'Labeled', description: '', field_labels: { labels: 'Labels added' },
			fields: [
				{ name: 'types', required: true, options: ['labeled'] },
				{ name: 'labels', required: true },
				{ id: 'query', label: 'Filter', type: 'string', required: false },
				{ name: 'write_scope', required: false },
			],
		})!;
		assert.deepStrictEqual({
			fields,
			labels: normalizeAutomationTriggerField(fields[0], ' bug, help wanted, , bug '),
			query: normalizeAutomationTriggerField(fields[1], ' label:bug is:open '),
			empty: normalizeAutomationTriggerField(fields[1], '   '),
			error: validateAutomationTriggerFields(fields, {}),
		}, {
			fields: [
				{ name: 'labels', label: 'Labels added', required: true, scalar: false, options: undefined },
				{ name: 'query', label: 'Filter', required: false, scalar: true, options: undefined },
			],
			labels: ['bug', 'help wanted'], query: 'label:bug is:open', empty: undefined, error: 'Labels added is required.',
		});
	});

	test('requires supported controls and validates advertised options and shapes', () => {
		const definition = { title: 'Review', description: '', fields: [{ name: 'states', required: true, options: ['approved'] }] };
		const fields = automationTriggerFields(definition)!;
		assert.deepStrictEqual({
			unknown: automationTriggerFields({ ...definition, fields: [{ name: 'destination', required: true }] }),
			wrongType: automationTriggerFields({ ...definition, fields: [{ name: 'states', type: 'integer', required: true }] }),
			empty: validateAutomationTriggerFields(fields, { states: [] }),
			unknownOption: validateAutomationTriggerFields(fields, { states: ['future'] }),
			valid: validateAutomationTriggerFields(fields, { states: ['approved'], opaque: true }),
		}, {
			unknown: undefined, wrongType: undefined, empty: 'Review states is required.',
			unknownOption: 'Choose a supported value for Review states.', valid: undefined,
		});
	});

	test('frozen menu excludes unsupported events, types and fields, including status and legacy PR triggers', () => {
		const definitions = [
			{ name: 'pull_request_opened', title: '', description: '', fields: [{ name: 'types', required: true, options: ['opened', 'future'] }] },
			{ name: 'issue_status_changed', title: '', description: '', fields: [{ name: 'types', required: true, options: ['changed'] }] },
			{ name: 'pull_request', title: '', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }] },
			{ name: 'pull_request_review_submitted', title: '', description: '', fields: [{ name: 'types', required: true, options: ['submitted'] }, { name: 'future', required: true }] },
		];
		const choices = automationTriggerChoices(definitions);
		assert.deepStrictEqual({
			choices: choices.map(choice => [choice.name, choice.type]),
			legacy: automationTriggerFamily({ pull_request: { types: ['opened'] } }),
			mixed: automationTriggerFamily({ issues: { types: ['opened'] }, pull_request_opened: { types: ['opened'] } }),
			empty: automationTriggerFamily({ issues: { types: ['opened'] }, pull_request_opened: { types: [] } }),
			status: canEditAutomationTriggers({ issue_status_changed: { types: ['changed'] } }, choices),
		}, { choices: [['pull_request_opened', 'opened']], legacy: undefined, mixed: undefined, empty: undefined, status: false });
	});

	test('frozen menu order selects stable defaults independent of catalog order', () => {
		const choices = automationTriggerChoices([
			{ name: 'pull_request_synchronize', title: '', description: '', fields: [{ name: 'types', required: true, options: ['synchronize'] }] },
			{ name: 'issue_labeled', title: '', description: '', fields: [{ name: 'types', required: true, options: ['labeled'] }, { name: 'labels', required: true }] },
			{ name: 'pull_request_opened', title: '', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }] },
			{ name: 'issues', title: '', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }] },
		]);
		assert.deepStrictEqual(choices.map(choice => [choice.name, choice.type]), [
			['issues', 'opened'],
			['issue_labeled', 'labeled'],
			['pull_request_opened', 'opened'],
			['pull_request_synchronize', 'synchronize'],
		]);
	});

	test('event detection includes unsupported and mixed non-interval triggers', () => {
		assert.deepStrictEqual({
			empty: hasAutomationEventTrigger({}),
			schedule: hasAutomationEventTrigger({ interval: { types: ['future'] } }),
			opaque: hasAutomationEventTrigger({ webhook: { types: ['issue'] } }),
			supported: hasAutomationEventTrigger({ issues: { types: ['opened'] } }),
			unsupported: hasAutomationEventTrigger({ issue_future: { types: ['future'] } }),
			mixed: hasAutomationEventTrigger({ interval: { types: ['daily'] }, pull_request_future: { types: ['future'] } }),
		}, { empty: false, schedule: false, opaque: false, supported: true, unsupported: true, mixed: true });
	});

	test('PR comment kinds share an entry and changing events preserves untouched entries and opaque fields', () => {
		const choices = automationTriggerChoices([
			{ name: 'pull_request_comment', title: '', description: '', fields: [{ name: 'types', required: true, options: ['timeline_comment', 'review_comment'] }, { name: 'body_substring', required: false }] },
			{ name: 'pull_request_opened', title: '', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }, { name: 'paths', required: false }] },
		]);
		const current = { pull_request_comment: { types: ['review_comment', 'timeline_comment'], body_substring: '/review', write_scope: 'trigger' as const, allow_copilot_triggers: true, opaque: [1, false] } };
		const selected = selectAutomationTriggerEvents(current, choices);
		const onlyReview = selectAutomationTriggerEvents(selected, choices.filter(choice => choice.type !== 'timeline_comment'));
		assert.deepStrictEqual({
			unchanged: selected.pull_request_comment === current.pull_request_comment,
			family: automationTriggerFamily(selected),
			summary: automationTriggerSummary(selected),
			badge: automationTriggerSummary(selected, true),
			onlyReview,
		}, {
			unchanged: true, family: 'pullRequest', summary: 'Pull request opened, Timeline comment, Review comment', badge: 'Multiple',
			onlyReview: { pull_request_comment: { ...current.pull_request_comment, types: ['review_comment'] }, pull_request_opened: { types: ['opened'] } },
		});
	});

	test('summaries follow frozen event order and keep unknown values visible', () => {
		assert.strictEqual(automationTriggerSummary({
			pull_request_comment: { types: ['review_comment', 'timeline_comment', 'future'] },
			pull_request_opened: { types: ['opened'] },
			future_event: { types: ['second', 'first'] },
		}), 'Pull request opened, Timeline comment, Review comment, pull_request_comment: future, future_event: second, future_event: first');
	});

	test('shared fields propagate across selected PR events and divergent stored values are read-only', () => {
		const choices = automationTriggerChoices([
			{ name: 'pull_request_opened', title: '', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }, { name: 'query', label: 'Pull request query', required: false }, { name: 'paths', label: 'Path filter', required: false }] },
			{ name: 'pull_request_synchronize', title: '', description: '', fields: [{ name: 'types', required: true, options: ['synchronize'] }, { name: 'query', label: 'Pull request query', required: false }, { name: 'paths', label: 'Path filter', required: false }] },
		]);
		const current = { pull_request_opened: { types: ['opened'], query: 'is:open', paths: ['src/**'], opaque: true } };
		const selected = selectAutomationTriggerEvents(current, choices);
		const inherited = {
			pull_request_opened: current.pull_request_opened,
			pull_request_synchronize: { types: ['synchronize'] },
		};
		assert.deepStrictEqual({
			groups: automationTriggerFieldGroups(choices).map(group => ({ name: group.name, choices: group.choices.map(choice => choice.name) })),
			selected,
			editable: canEditAutomationTriggers(selected, choices),
			inheritedEditable: canEditAutomationTriggers(inherited, choices),
			divergent: canEditAutomationTriggers({
				...selected,
				pull_request_synchronize: { ...selected.pull_request_synchronize, query: 'is:closed' },
			}, choices),
		}, {
			groups: [
				{ name: 'query', choices: ['pull_request_opened', 'pull_request_synchronize'] },
				{ name: 'paths', choices: ['pull_request_opened', 'pull_request_synchronize'] },
			],
			selected: {
				pull_request_opened: current.pull_request_opened,
				pull_request_synchronize: { types: ['synchronize'], query: 'is:open', paths: ['src/**'] },
			},
			editable: true,
			inheritedEditable: true,
			divergent: false,
		});
	});
});
