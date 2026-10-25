/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { CanvasInput, canPresentCanvasInGroup, ICanvas, ICanvasContextService } from '../../common/canvas.js';

suite('CanvasInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const contextService = upcastPartial<ICanvasContextService>({});
	const editorGroupsService = upcastPartial<IEditorGroupsService>({
		mainPart: upcastPartial<IEditorPart>({ windowId: 1 }),
		getGroup: id => upcastPartial<IEditorGroup>({ id, windowId: id === 1 ? 1 : 2 }),
	});
	const environmentService = (isSessionsWindow = false) => upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow });

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
		}, canvas('Preview'), editorGroupsService, environmentService(), contextService));
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

	test('allows movement into the auxiliary window groups its context service allows', () => {
		const owner = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') };
		const input = store.add(new CanvasInput({ ...owner, canvas: URI.parse('canvas:/preview') }, undefined, editorGroupsService, environmentService(), upcastPartial<ICanvasContextService>({
			canPresentInGroup: (candidate, group) => candidate.chat.toString() === owner.chat.toString() && group.id === 2,
		})));

		assert.deepStrictEqual({ main: input.canMove(1, 1), allowed: input.canMove(1, 2), other: typeof input.canMove(1, 3) }, { main: true, allowed: true, other: 'string' });
	});

	test('presents canvases in auxiliary window groups only when the context service allows their owner', () => {
		const owner = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') };
		const other = { ...owner, chat: URI.parse('chat:/other') };
		const main = editorGroupsService.getGroup(1)!;
		const auxiliary = editorGroupsService.getGroup(2)!;
		const allowing = upcastPartial<ICanvasContextService>({
			canPresentInGroup: (candidate, group) => candidate.chat.toString() === owner.chat.toString() && group === auxiliary,
		});

		assert.deepStrictEqual({
			mainWithoutService: canPresentCanvasInGroup(owner, main, editorGroupsService, undefined),
			auxiliaryWithoutService: canPresentCanvasInGroup(owner, auxiliary, editorGroupsService, undefined),
			auxiliaryWithoutHook: canPresentCanvasInGroup(owner, auxiliary, editorGroupsService, contextService),
			auxiliaryAllowed: canPresentCanvasInGroup(owner, auxiliary, editorGroupsService, allowing),
			auxiliaryOtherOwner: canPresentCanvasInGroup(other, auxiliary, editorGroupsService, allowing),
		}, {
			mainWithoutService: true,
			auxiliaryWithoutService: false,
			auxiliaryWithoutHook: false,
			auxiliaryAllowed: true,
			auxiliaryOtherOwner: false,
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
		}, editorGroupsService, environmentService(), contextService));

		assert.deepStrictEqual({ main: input.canMove(1, 1), auxiliary: typeof input.canMove(1, 2) }, { main: true, auxiliary: 'string' });
	});

	test('describes only the reopen affordances of its window', () => {
		const descriptions = [false, true].map(isSessionsWindow => store.add(new CanvasInput({
			providerId: 'local',
			session: URI.parse('session:/owner'),
			chat: URI.parse('chat:/owner'),
			canvas: URI.parse('canvas:/preview'),
		}, undefined, editorGroupsService, environmentService(isSessionsWindow), contextService)).getDescription());

		assert.deepStrictEqual(descriptions, [
			'Closing this tab hides the canvas. Reopen it from its canvas pill or ask the agent to open it again.',
			'Closing this tab hides the canvas. Reopen it from the Canvas submenu in Add Tab, use its canvas pill, or ask the agent to open it again.',
		]);
	});
});
