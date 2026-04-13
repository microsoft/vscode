/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { withInMemoryTelemetry } from '../../test/telemetry';
import { createTextDocument } from '../../test/textDocument';
import { CopilotCompletion } from '../copilotCompletion';
import {
	ICompletionsLastGhostText, handleGhostTextPostInsert,
	handleGhostTextShown,
	handlePartialGhostTextPostInsert,
	rejectLastShown,
	setLastShown
} from '../last';
import { ResultType } from '../resultType';

suite('Isolated LastGhostText tests', function () {
	let accessor: ServicesAccessor;
	let last: ICompletionsLastGhostText;
	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
		last = accessor.get(ICompletionsLastGhostText);
	});

	function makeCompletion(index = 0, text = 'foo', offset = 0): CopilotCompletion {
		return {
			uuid: 'uuid-' + index,
			insertText: text,
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: text.length } },
			index,
			displayText: text,
			offset,
			uri: 'file:///test',
			position: { line: 0, character: 0 },
			telemetry: TelemetryWithExp.createEmptyConfigForTesting(),
			resultType: ResultType.Network,
		} as CopilotCompletion;
	}

	test('full completion flow: show, accept, reset', function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		const cmp = makeCompletion(1, 'full completion', 0);
		handleGhostTextShown(accessor, cmp);
		assert.strictEqual(last.shownCompletions.length, 1);
		handleGhostTextPostInsert(accessor, cmp);
		assert.strictEqual(last.shownCompletions.length, 0);
		assert.strictEqual(last.position, undefined);
		assert.strictEqual(last.uri, undefined);
	});

	test('partial completion flow: show, partial accept, state', function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		const cmp = makeCompletion(2, 'partial completion', 0);
		handleGhostTextShown(accessor, cmp);
		assert.strictEqual(last.shownCompletions.length, 1);
		handlePartialGhostTextPostInsert(accessor, cmp, 7); // accept first 7 chars
		assert.strictEqual(last.partiallyAcceptedLength, 7);
		// State is not reset by partial accept
		assert.strictEqual(last.shownCompletions.length, 1);
	});

	test('reject after show clears completions', function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		const cmp = makeCompletion(3, 'reject me', 0);
		handleGhostTextShown(accessor, cmp);
		assert.strictEqual(last.shownCompletions.length, 1);
		rejectLastShown(accessor, 0);
		assert.strictEqual(last.shownCompletions.length, 0);
	});

	test('setLastShown resets completions if position/uri changes', function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		last.shownCompletions.push(makeCompletion(4, 'baz', 0));
		const doc = createTextDocument('file:///other', 'plaintext', 1, '');
		setLastShown(accessor, doc, { line: 1, character: 1 }, ResultType.Network);
		assert.strictEqual(last.shownCompletions.length, 0);
	});

	test('full acceptance sends total number of lines with telemetry', async function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		const cmp = makeCompletion(0, 'line1\nline2\nline3', 0);
		handleGhostTextShown(accessor, cmp);

		const { reporter } = await withInMemoryTelemetry(accessor, () => {
			handleGhostTextPostInsert(accessor, cmp);
		});

		const event = reporter.events.find(e => e.name === 'ghostText.accepted');
		assert.ok(event);
		assert.strictEqual(event.measurements.numLines, 3);
	});

	test('partial acceptance for VS Code sends total number of lines accepted with telemetry', async function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		const cmp = makeCompletion(0, 'line1\nline2\nline3', 0);
		handleGhostTextShown(accessor, cmp);

		const { reporter } = await withInMemoryTelemetry(accessor, () => {
			handlePartialGhostTextPostInsert(accessor, cmp, 'line1'.length);
		});

		const event = reporter.events.find(e => e.name === 'ghostText.accepted');
		assert.ok(event);
		assert.strictEqual(event.measurements.numLines, 1);
	});

	test('additional partial acceptance for VS Code sends total number of lines accepted with telemetry', async function () {
		last.setState({ uri: 'file:///test' }, { line: 0, character: 0 });
		const cmp = makeCompletion(0, 'line1\nline2\nline3', 0);
		handleGhostTextShown(accessor, cmp);
		handlePartialGhostTextPostInsert(accessor, cmp, 'line1'.length);
		cmp.displayText = 'line2\nline3'; // Simulate the display text being updated after accepting the first line

		const { reporter } = await withInMemoryTelemetry(accessor, () => {
			handlePartialGhostTextPostInsert(accessor, cmp, 'line2'.length);
		});

		const event = reporter.events.reverse().find(e => e.name === 'ghostText.accepted');
		assert.ok(event);
		assert.strictEqual(event.measurements.numLines, 2);
	});
});
