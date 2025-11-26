/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AnnotatedStringEdit, AnnotatedStringReplacement, StringEdit, StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { AgentAttribution, CombinedAttribution, UserEditAttribution, attributedRangesDTOToEdit, filterRangesBySession, generateConflictMarkers, getAttributedRanges, rebaseAttributedEdit, rebaseAttributedRanges } from '../../browser/chatEditing/chatEditingAttribution.js';
import { IModifiedEntryTelemetryInfo } from '../../common/chatEditingService.js';
import { URI } from '../../../../../base/common/uri.js';

suite('ChatEditingAttribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const telemetryInfo: IModifiedEntryTelemetryInfo = {
		agentId: 'agent1',
		command: 'command1',
		sessionResource: URI.parse('test://session'),
		requestId: 'req1',
		result: undefined,
		modelId: 'model1',
		modeId: undefined,
		applyCodeBlockSuggestionId: undefined,
		feature: undefined
	};

	const agentAttribution = new CombinedAttribution(new AgentAttribution(telemetryInfo, 'req1', undefined));
	const userAttribution = new CombinedAttribution(UserEditAttribution.instance);
	const fallbackAttribution = new CombinedAttribution(new AgentAttribution({ ...telemetryInfo, agentId: 'fallback' }, 'fallback', undefined));

	test('rebaseAttributedEdit - simple rebase preserves attribution', () => {
		// Original: Insert "Hello" at 0
		const original = AnnotatedStringEdit.create([
			AnnotatedStringReplacement.insert(0, 'Hello', agentAttribution)
		]);

		// Rebased: Insert "Hello" at 5 (shifted by 5)
		const rebased = new StringEdit([
			StringReplacement.insert(5, 'Hello')
		]);

		const result = rebaseAttributedEdit(original, rebased, () => fallbackAttribution);

		assert.strictEqual(result.replacements.length, 1);
		assert.strictEqual(result.replacements[0].newText, 'Hello');
		assert.strictEqual(result.replacements[0].replaceRange.start, 5);
		assert.strictEqual(result.replacements[0].data, agentAttribution);
	});

	test('rebaseAttributedEdit - multiple edits preserve attribution', () => {
		const original = AnnotatedStringEdit.create([
			AnnotatedStringReplacement.insert(0, 'Hello', agentAttribution),
			AnnotatedStringReplacement.insert(10, 'World', userAttribution)
		]);

		const rebased = new StringEdit([
			StringReplacement.insert(5, 'Hello'),
			StringReplacement.insert(15, 'World')
		]);

		const result = rebaseAttributedEdit(original, rebased, () => fallbackAttribution);

		assert.strictEqual(result.replacements.length, 2);
		assert.strictEqual(result.replacements[0].data, agentAttribution);
		assert.strictEqual(result.replacements[1].data, userAttribution);
	});

	test('rebaseAttributedEdit - fallback used when text does not match', () => {
		const original = AnnotatedStringEdit.create([
			AnnotatedStringReplacement.insert(0, 'Hello', agentAttribution)
		]);

		// Rebased has different text (simulating a split or modification during rebase)
		const rebased = new StringEdit([
			StringReplacement.insert(5, 'HelloModified')
		]);

		const result = rebaseAttributedEdit(original, rebased, () => fallbackAttribution);

		assert.strictEqual(result.replacements.length, 1);
		assert.strictEqual(result.replacements[0].data, fallbackAttribution);
	});

	test('rebaseAttributedEdit - handles duplicate text correctly', () => {
		const original = AnnotatedStringEdit.create([
			AnnotatedStringReplacement.insert(0, 'Hello', agentAttribution),
			AnnotatedStringReplacement.insert(10, 'Hello', userAttribution)
		]);

		const rebased = new StringEdit([
			StringReplacement.insert(5, 'Hello'),
			StringReplacement.insert(15, 'Hello')
		]);

		const result = rebaseAttributedEdit(original, rebased, () => fallbackAttribution);

		assert.strictEqual(result.replacements.length, 2);
		assert.strictEqual(result.replacements[0].data, agentAttribution);
		assert.strictEqual(result.replacements[1].data, userAttribution);
	});

	test('filterRangesBySession filters by sessionResource', () => {
		const otherSession = URI.parse('test://other');
		const ranges = [
			{
				start: 0,
				end: 5,
				telemetryInfo,
				requestId: 'req1',
				undoStopId: undefined,
				isUserEdit: false
			},
			{
				start: 5,
				end: 10,
				telemetryInfo: { ...telemetryInfo, sessionResource: otherSession },
				requestId: 'req2',
				undoStopId: undefined,
				isUserEdit: false
			}
		];

		const filtered = filterRangesBySession(ranges, telemetryInfo.sessionResource);
		assert.strictEqual(filtered.length, 1);
		assert.strictEqual(filtered[0].requestId, 'req1');
	});

	test('rebaseAttributedRanges returns conflicts when rebase fails', () => {
		const storedContent = 'hello world';
		const currentContent = 'hello brave new world';
		const ranges = [
			{
				start: 6,
				end: 11,
				telemetryInfo,
				requestId: 'req1',
				undoStopId: undefined,
				isUserEdit: false
			}
		];

		// Simulate an external edit that expands the middle of the string
		const externalEdit = new StringEdit([
			StringReplacement.replace(new OffsetRange(6, 11), 'brave new world')
		]);

		const result = rebaseAttributedRanges(ranges, storedContent, currentContent, externalEdit);
		assert.strictEqual(result.ranges.length, 0);
		assert.strictEqual(result.conflicts.length, 1);

		const marker = generateConflictMarkers(result.conflicts[0]);
		assert.ok(marker.includes('<<<<<<<'));
		assert.ok(marker.includes('======='));
		assert.ok(marker.includes('>>>>>>>'));
	});

	test('attributedRangesDTOToEdit round-trips basic ranges', () => {
		const currentContent = 'hello world';
		const ranges = [
			{
				start: 0,
				end: 5,
				telemetryInfo,
				requestId: 'req1',
				undoStopId: undefined,
				isUserEdit: false
			}
		];

		const edit = attributedRangesDTOToEdit(ranges, currentContent, currentContent);
		const attributed = getAttributedRanges(edit);
		assert.strictEqual(attributed.length, 1);
		assert.strictEqual(attributed[0].range.start, 0);
		assert.strictEqual(attributed[0].range.endExclusive, 5);
	});
});
