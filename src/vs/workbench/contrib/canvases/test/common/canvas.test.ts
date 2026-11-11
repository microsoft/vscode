/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Verbosity } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { CanvasDefinitionOpener, CanvasInput, canPresentCanvasInGroup, getCanvasDefinitionInstanceId, getCanvasInstanceLabels, ICanvasContextService, ICanvasDefinition } from '../../common/canvas.js';
import { ICanvas, ICanvasOwner } from '../../../../common/canvasReference.js';

suite('CanvasInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorGroupsService = upcastPartial<IEditorGroupsService>({
		mainPart: upcastPartial<IEditorPart>({ windowId: 1 }),
		getGroup: id => upcastPartial<IEditorGroup>({ windowId: id === 1 ? 1 : 2 }),
	});
	const environmentService = (isSessionsWindow = false) => upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow });
	const contextService = (canPresentInGroup?: ICanvasContextService['canPresentInGroup']) => upcastPartial<ICanvasContextService>({ canPresentInGroup });

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
		}, canvas('Preview'), editorGroupsService, environmentService(), contextService()));
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
		}, editorGroupsService, environmentService(), contextService()));

		assert.deepStrictEqual({ main: input.canMove(1, 1), auxiliary: typeof input.canMove(1, 2), newWindow: typeof input.canMoveToNewWindow(1) }, { main: true, auxiliary: 'string', newWindow: 'string' });
	});

	test('moves to a window outside the main window only where its context service presents canvases of its owner, as a canvas editor shows it only there', () => {
		const owner = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') };
		// A window of its own that shows the owning chat, such as a chat window: window 2.
		const presenting = contextService((candidate, group) => candidate.chat.toString() === owner.chat.toString() && group.windowId === 2);
		const input = store.add(new CanvasInput({ ...owner, canvas: URI.parse('canvas:/preview') }, undefined, editorGroupsService, environmentService(), presenting));
		const otherChat = store.add(new CanvasInput({ ...owner, chat: URI.parse('chat:/other'), canvas: URI.parse('canvas:/preview') }, undefined, editorGroupsService, environmentService(), presenting));
		const group = (windowId: number) => upcastPartial<IEditorGroup>({ windowId });

		assert.deepStrictEqual({
			main: input.canMove(1, 1),
			ownersWindow: input.canMove(1, 2),
			otherChat: typeof otherChat.canMove(1, 2),
			editorShowsInOwnersWindow: canPresentCanvasInGroup(input.reference, group(2), editorGroupsService, presenting),
			editorShowsInAnotherWindow: canPresentCanvasInGroup(input.reference, group(3), editorGroupsService, presenting),
			editorShowsOtherChat: canPresentCanvasInGroup(otherChat.reference, group(2), editorGroupsService, presenting),
		}, { main: true, ownersWindow: true, otherChat: 'string', editorShowsInOwnersWindow: true, editorShowsInAnotherWindow: false, editorShowsOtherChat: false });
	});

	test('shows reopen instructions only in the long title', () => {
		const labels = [false, true].map(isSessionsWindow => {
			const input = store.add(new CanvasInput({
				providerId: 'local',
				session: URI.parse('session:/owner'),
				chat: URI.parse('chat:/owner'),
				canvas: URI.parse('canvas:/preview'),
			}, undefined, editorGroupsService, environmentService(isSessionsWindow), contextService()));
			return {
				description: input.getDescription(),
				shortTitle: input.getTitle(Verbosity.SHORT),
				mediumTitle: input.getTitle(Verbosity.MEDIUM),
				longTitle: input.getTitle(Verbosity.LONG),
			};
		});

		assert.deepStrictEqual(labels, [
			{
				description: undefined,
				shortTitle: 'Canvas',
				mediumTitle: 'Canvas',
				longTitle: 'Canvas - Closing this tab hides the canvas. Reopen it from its canvas pill or ask the agent to open it again.',
			},
			{
				description: undefined,
				shortTitle: 'Canvas',
				mediumTitle: 'Canvas',
				longTitle: 'Canvas - Closing this tab hides the canvas. Reopen it from the Canvas submenu in Add Tab, use its canvas pill, or ask the agent to open it again.',
			},
		]);
	});
});

suite('Canvas instance identifiers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const definition = (extensionId: string): ICanvasDefinition => ({
		canvasId: 'main', extensionId, extensionSource: 'project', displayName: 'Counter', description: 'A counter.', requiresInput: false,
	});
	const instance = (type: ICanvasDefinition, instanceId: string, title = 'Counter'): ICanvas => ({
		resource: URI.parse(`canvas:/${instanceId}`), instanceId, title, source: undefined, extensionId: type.extensionId, canvasId: type.canvasId,
	});
	const owner = (chat: string): ICanvasOwner => ({ providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse(`chat:/${chat}`) });

	test('numbers new instances of a registered canvas type and labels them by their numbers', async () => {
		const counter = definition('project:counter');
		const long = definition(`project:${'a'.repeat(140)}`);
		const allocate = async (type: ICanvasDefinition, canvases: readonly ICanvas[]) => {
			let allocated = '';
			await new CanvasDefinitionOpener().open(owner('main'), type, canvases, async instanceId => { allocated = instanceId; });
			return allocated;
		};
		const first = await allocate(counter, []);
		const second = await allocate(counter, [instance(counter, first), instance(counter, 'sidebar')]);
		const gap = await allocate(counter, [instance(counter, first), instance(counter, `${first}-3`)]);
		const longFirst = await allocate(long, []);
		const longSecond = await allocate(long, [instance(long, longFirst)]);

		const base = getCanvasDefinitionInstanceId(counter);
		assert.deepStrictEqual({
			first,
			second,
			gap,
			longSecond: { length: longSecond.length, suffix: longSecond.slice(-2), sharesPrefix: longFirst.startsWith(longSecond.slice(0, -2)) },
			labels: getCanvasInstanceLabels([
				instance(counter, second),
				instance(counter, 'sidebar'),
				instance(counter, first),
				instance(long, longSecond, 'Long'),
				instance(long, longFirst, 'Long'),
			]),
		}, {
			first: base,
			second: `${base}-2`,
			gap: `${base}-2`,
			longSecond: { length: 128, suffix: '-2', sharesPrefix: true },
			labels: ['Counter (2)', 'Counter (sidebar)', 'Counter (1)', 'Long (2)', 'Long (1)'],
		});
	});

	test('reserves the identifiers of overlapping opens until the chat publishes them, and releases those of failed opens', async () => {
		const counter = definition('project:counter');
		const base = getCanvasDefinitionInstanceId(counter);
		const opener = new CanvasDefinitionOpener();
		const requested: string[] = [];
		const pending: DeferredPromise<void>[] = [];
		const open = (canvases: readonly ICanvas[], chat = 'main') => opener.open(owner(chat), counter, canvases, instanceId => {
			requested.push(`${chat}:${instanceId.replace(base, 'base')}`);
			const request = new DeferredPromise<void>();
			pending.push(request);
			return request.p;
		});

		const first = open([]);
		const second = open([]);
		const otherChat = open([], 'other');
		await pending[1].error(new Error('open failed'));
		await assert.rejects(second, /open failed/);
		await pending[0].complete();
		await pending[2].complete();
		await Promise.all([first, otherChat]);
		// The first canvas is not published yet: its identifier stays reserved, while the failed one is free again.
		const third = open([]);
		await pending[3].complete();
		await third;
		// Once published, canvases closed later free their identifiers.
		const fourth = open([instance(counter, base), instance(counter, `${base}-2`)]);
		await pending[4].complete();
		await fourth;
		const fifth = open([instance(counter, `${base}-2`)]);
		await pending[5].complete();
		await fifth;

		assert.deepStrictEqual(requested, ['main:base', 'main:base-2', 'other:base', 'main:base-2', 'main:base-3', 'main:base']);
	});
});
