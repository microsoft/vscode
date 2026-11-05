/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionCanvasDefinition } from '../../../../services/sessions/common/session.js';
import { getSessionCanvasDefinitionInstanceId, getSessionCanvasDefinitionLabels } from '../../common/sessionCanvas.js';

suite('SessionCanvas', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds stable registered canvas labels and runtime instance ids', () => {
		const canvases: ISessionCanvasDefinition[] = [
			{
				canvasId: 'daily.stats',
				extensionId: 'project:fomobeta/daily-stats',
				extensionSource: 'project',
				extensionName: 'Project Stats',
				displayName: 'Daily Stats',
				description: 'Project statistics.',
				requiresInput: false,
			},
			{
				canvasId: 'daily-stats',
				extensionId: 'user:fomobeta/daily-stats',
				extensionSource: 'user',
				extensionName: 'User Stats',
				displayName: 'Daily Stats',
				description: 'User statistics.',
				requiresInput: false,
			},
			{
				canvasId: '!!!',
				extensionId: '???',
				extensionSource: 'unknown',
				displayName: 'Fallback',
				description: 'Exercises the fallback identifier.',
				requiresInput: false,
			},
		];

		assert.deepStrictEqual({
			labels: getSessionCanvasDefinitionLabels(canvases),
			instanceIds: canvases.map(getSessionCanvasDefinitionInstanceId),
			valid: canvases.map(getSessionCanvasDefinitionInstanceId).every(id => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)),
		}, {
			labels: ['Daily Stats (Project Stats)', 'Daily Stats (User Stats)', 'Fallback'],
			instanceIds: [
				'project-fomobeta-daily-stats-daily.stats-8d5ecf1e',
				'user-fomobeta-daily-stats-daily-stats-0af9875b',
				'canvas-d48d19ca',
			],
			valid: true,
		});
	});

	test('keeps normalized and truncated registered canvas instance ids unique', () => {
		const canvas = (extensionId: string): ISessionCanvasDefinition => ({
			canvasId: 'main',
			extensionId,
			extensionSource: 'project',
			displayName: 'Canvas',
			description: 'Canvas.',
			requiresInput: false,
		});
		const canvases = [
			canvas('project:fomobeta/daily-stats'),
			canvas('project:fomobeta-daily-stats'),
			canvas(`project:${'a'.repeat(140)}-first`),
			canvas(`project:${'a'.repeat(140)}-second`),
		];
		const instanceIds = canvases.map(getSessionCanvasDefinitionInstanceId);

		assert.deepStrictEqual({
			instanceIds,
			unique: new Set(instanceIds).size,
			valid: instanceIds.every(id => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)),
			lengths: instanceIds.map(id => id.length),
		}, {
			instanceIds: [
				'project-fomobeta-daily-stats-main-5e698da5',
				'project-fomobeta-daily-stats-main-bd15d1a3',
				`project-${'a'.repeat(111)}-6aa16fb9`,
				`project-${'a'.repeat(111)}-75713ecf`,
			],
			unique: 4,
			valid: true,
			lengths: [42, 42, 128, 128],
		});
	});
});
