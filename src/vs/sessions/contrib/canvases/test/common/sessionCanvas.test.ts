/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionCanvas, ISessionCanvasDefinition } from '../../../../services/sessions/common/session.js';
import { getSessionCanvasDefinitionInstanceId, getSessionCanvasDefinitionLabels, SessionCanvasInput } from '../../common/sessionCanvas.js';

suite('SessionCanvasInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps transient sources out of editor identity and does not restore', () => {
		const source = 'https://secret.example/canvas?token=sensitive';
		const canvas = (title: string): ISessionCanvas => ({
			resource: URI.parse('agent-host-canvas:/preview'),
			instanceId: 'preview',
			title,
			source: URI.parse(source),
		});
		const input = store.add(new SessionCanvasInput({
			providerId: 'local-agent-host',
			session: URI.parse('agent-host-session:/session'),
			chat: URI.parse('agent-host-chat:/session/main'),
			canvas: URI.parse('agent-host-canvas:/preview'),
		}, canvas('Preview')));
		const labels: string[] = [];
		store.add(input.onDidChangeLabel(() => labels.push(input.getName())));

		input.setCanvas(canvas('Updated Preview'));

		assert.deepStrictEqual({
			name: input.getName(),
			labels,
			canReopen: input.canReopen(),
			containsSource: input.resource.toString().includes('secret.example'),
		}, {
			name: 'Updated Preview',
			labels: ['Updated Preview'],
			canReopen: false,
			containsSource: false,
		});
	});

	test('builds stable registered canvas labels and runtime instance ids', () => {
		const canvases: ISessionCanvasDefinition[] = [
			{
				canvasId: 'daily.stats',
				extensionId: 'project:fomobeta/daily-stats',
				extensionSource: 'project',
				extensionName: 'Project Stats',
				displayName: 'Daily Stats',
				description: 'Project statistics.',
			},
			{
				canvasId: 'daily-stats',
				extensionId: 'user:fomobeta/daily-stats',
				extensionSource: 'user',
				extensionName: 'User Stats',
				displayName: 'Daily Stats',
				description: 'User statistics.',
			},
			{
				canvasId: '!!!',
				extensionId: '???',
				extensionSource: 'unknown',
				displayName: 'Fallback',
				description: 'Exercises the fallback identifier.',
			},
		];

		assert.deepStrictEqual({
			labels: getSessionCanvasDefinitionLabels(canvases),
			instanceIds: canvases.map(getSessionCanvasDefinitionInstanceId),
			valid: canvases.map(getSessionCanvasDefinitionInstanceId).every(id => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)),
		}, {
			labels: ['Daily Stats (Project Stats)', 'Daily Stats (User Stats)', 'Fallback'],
			instanceIds: ['project-fomobeta-daily-stats-daily.stats', 'user-fomobeta-daily-stats-daily-stats', 'canvas-1mz44ay'],
			valid: true,
		});
	});
});
