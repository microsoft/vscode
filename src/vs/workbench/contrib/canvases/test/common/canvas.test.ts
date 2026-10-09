/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { CanvasInput, ICanvas } from '../../common/canvas.js';

suite('CanvasInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorGroupsService = upcastPartial<IEditorGroupsService>({
		mainPart: upcastPartial<IEditorPart>({ windowId: 1 }),
		getGroup: id => upcastPartial<IEditorGroup>({ windowId: id === 1 ? 1 : 2 }),
	});

	test('keeps transient sources out of editor identity and does not restore', () => {
		const source = 'https://secret.example/canvas?token=sensitive';
		const canvas = (title: string): ICanvas => ({
			resource: URI.parse('agent-host-canvas:/preview'),
			instanceId: 'preview',
			title,
			source: URI.parse(source),
		});
		const input = store.add(new CanvasInput({
			providerId: 'local-agent-host',
			session: URI.parse('agent-host-session:/session'),
			chat: URI.parse('agent-host-chat:/session/main'),
			canvas: URI.parse('agent-host-canvas:/preview'),
		}, canvas('Preview'), editorGroupsService));
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

	test('allows main-window movement but rejects auxiliary windows', () => {
		const input = store.add(new CanvasInput({
			providerId: 'local',
			session: URI.parse('session:/owner'),
			chat: URI.parse('chat:/owner'),
			canvas: URI.parse('canvas:/preview'),
		}, {
			resource: URI.parse('canvas:/preview'),
			instanceId: 'preview',
			title: 'Preview',
			source: URI.parse('https://example.test'),
		}, editorGroupsService));

		assert.deepStrictEqual({ main: input.canMove(1, 1), auxiliary: typeof input.canMove(1, 2) }, { main: true, auxiliary: 'string' });
	});
});
