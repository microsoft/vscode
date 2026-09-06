/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { TextEditor } from 'vscode';
import { DisposableStore } from '../../../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { withInMemoryTelemetry } from '../../../../lib/src/test/telemetry';
import { createExtensionTestingContext } from '../../test/context';
import { CodeRefEngagementTracker } from '../codeReferenceEngagementTracker';
import { citationsChannelName } from '../outputChannel';

suite('CodeReferenceEngagementTracker', function () {
	let engagementTracker: CodeRefEngagementTracker;
	let accessor: ServicesAccessor;
	const disposables = new DisposableStore();

	setup(function () {
		accessor = createExtensionTestingContext().createTestingAccessor();
		engagementTracker = disposables.add(accessor.get(IInstantiationService).createInstance(CodeRefEngagementTracker));
	});

	teardown(function () {
		disposables.clear();
	});

	test('sends a telemetry event when the output channel is focused', async function () {
		const telemetry = await withInMemoryTelemetry(accessor, () => {
			engagementTracker.onActiveEditorChange({
				document: { uri: { scheme: 'output', path: citationsChannelName } },
			} as TextEditor);
		});

		assert.ok(telemetry.reporter.events.length === 1);
		assert.strictEqual(telemetry.reporter.events[0].name, 'code_referencing.github_copilot_log.focus.count');
	});

	test('sends a telemetry event when the output channel is focused2', async function () {
		const telemetry = await withInMemoryTelemetry(accessor, () => {
			engagementTracker.onActiveEditorChange({
				document: { uri: { scheme: 'output', path: citationsChannelName } },
			} as TextEditor);
		});

		assert.ok(telemetry.reporter.events.length === 1);
		assert.strictEqual(telemetry.reporter.events[0].name, 'code_referencing.github_copilot_log.focus.count');
	});


	test('sends a telemetry event when the output channel is opened', async function () {
		const telemetry = await withInMemoryTelemetry(accessor, () => {
			engagementTracker.onVisibleEditorsChange([
				{
					document: { uri: { scheme: 'output', path: citationsChannelName } },
				},
			] as TextEditor[]);
		});

		assert.ok(telemetry.reporter.events.length === 1);
		assert.strictEqual(telemetry.reporter.events[0].name, 'code_referencing.github_copilot_log.open.count');
	});

	test('does not send a telemetry event when the output channel is already opened', async function () {
		const telemetry = await withInMemoryTelemetry(accessor, () => {
			engagementTracker.onVisibleEditorsChange([
				{
					document: { uri: { scheme: 'output', path: citationsChannelName } },
				},
			] as TextEditor[]);
			engagementTracker.onVisibleEditorsChange([
				{
					document: { uri: { scheme: 'output', path: citationsChannelName } },
				},
				{
					document: { uri: { scheme: 'file', path: 'some-other-file.js' } },
				},
			] as TextEditor[]);
		});

		assert.ok(telemetry.reporter.events.length === 1);
	});

	test('tracks when the log closes internally', async function () {
		const telemetry = await withInMemoryTelemetry(accessor, () => {
			engagementTracker.onVisibleEditorsChange([
				{
					document: { uri: { scheme: 'output', path: citationsChannelName } },
				},
			] as TextEditor[]);
			engagementTracker.onVisibleEditorsChange([
				{
					document: { uri: { scheme: 'file', path: 'some-other-file.js' } },
				},
			] as TextEditor[]);
		});

		assert.ok(telemetry.reporter.events.length === 1);
		assert.ok(engagementTracker.logVisible === false);
	});
});
