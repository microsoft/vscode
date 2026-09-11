/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentCanvas } from '../../../../../../platform/agentHost/common/meta/agentCanvasMeta.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchCreateOptions, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { AgentHostCanvas } from '../../../browser/agentSessions/agentHost/agentHostCanvas.js';

suite('AgentHostCanvas', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('agent-host-copilot:/session');
	const canvas: IAgentCanvas = { chat: 'copilot:/session/chat/default', instanceId: 'one', canvasTypeId: 'example:counter', title: 'Counter', url: 'http://127.0.0.1:3000/?token=example' };

	function setup(local = true, creation?: Promise<void>) {
		const known = new Map<string, BrowserEditorInput>();
		const calls: string[] = [];
		const options: IBrowserViewWorkbenchCreateOptions[] = [];
		const errors: string[] = [];
		const browserService = upcastPartial<IBrowserViewWorkbenchService>({
			getKnownBrowserViews: () => known,
			getPreferredGroup: async () => undefined,
			createBrowserView: async opts => {
				options.push(opts);
				calls.push('create');
				await creation;
				let disposed = false;
				const input = upcastPartial<BrowserEditorInput>({
					id: opts.id!,
					isDisposed: () => disposed,
					resolve: async () => upcastPartial<IBrowserViewModel>({
						loadURL: async url => { calls.push(`navigate:${url}`); },
					}),
					dispose: () => {
						disposed = true;
						known.delete(opts.id!);
						calls.push('dispose');
					},
				});
				known.set(input.id, input);
				return input;
			},
		});
		const editorService = upcastPartial<IEditorService>({
			openEditor: async () => { calls.push('reveal'); return undefined; },
		});
		const notifications = upcastPartial<INotificationService>({ error: message => { errors.push(String(message)); } });
		const createController = () => store.add(new AgentHostCanvas(resource, 'local', local, browserService, editorService, notifications, new NullLogService()));
		return { controller: createController(), createController, known, calls, options, errors };
	}

	test('opens, updates and closes the runtime instance without sharing the page or user storage', async () => {
		const { controller, calls, options } = setup();
		await controller.update([canvas]);
		await controller.update([canvas]);
		await controller.update([{ ...canvas, url: 'https://example.com/canvas' }]);
		await controller.update([]);
		assert.deepStrictEqual({
			calls,
			owner: options[0].owner,
			storage: options[0].session,
			audiences: options[0].initialAudiences,
			transient: options[0].transient,
		}, {
			calls: ['create', `navigate:${canvas.url}`, 'navigate:https://example.com/canvas', 'dispose'],
			owner: { type: 'agent', sessionId: resource.toString() },
			storage: { scope: 'ephemeral' },
			audiences: undefined,
			transient: true,
		});
	});

	test('a dismissed browser stays dismissed until explicitly reopened', async () => {
		const { controller, known, calls } = setup();
		await controller.update([canvas]);
		[...known.values()][0].dispose();
		await controller.update([canvas]);
		await controller.open(canvas.instanceId);
		assert.deepStrictEqual(calls, ['create', `navigate:${canvas.url}`, 'dispose', 'create', `navigate:${canvas.url}`, 'reveal']);
	});

	test('reattaching to a chat reuses its browser instead of opening another page', async () => {
		const { controller, createController, options } = setup();
		await controller.update([canvas]);
		controller.dispose();
		await createController().update([canvas]);
		assert.strictEqual(options.length, 1);
	});

	test('rejects non-web URLs and remote-host rendering explicitly', async () => {
		const local = setup();
		const remote = setup(false);
		await local.controller.update([{ ...canvas, url: 'file:///private/file.html' }]);
		await remote.controller.update([canvas]);
		assert.deepStrictEqual({
			created: local.options.length + remote.options.length,
			errors: [...local.errors, ...remote.errors],
		}, {
			created: 0,
			errors: [
				'Unable to open the canvas in the Integrated Browser: The canvas did not provide an HTTP or HTTPS URL.',
				'Unable to open the canvas in the Integrated Browser: Canvas rendering currently requires a local agent host. Remote Canvas URL forwarding is not yet supported.',
			],
		});
	});

	test('a close while browser creation is pending does not leave an orphan page', async () => {
		const creation = new DeferredPromise<void>();
		const { controller, calls, known } = setup(true, creation.p);
		const opening = controller.update([canvas]);
		await Promise.resolve();
		const closing = controller.update([]);
		await creation.complete();
		await Promise.all([opening, closing]);
		assert.deepStrictEqual({ calls, pages: known.size }, { calls: ['create', 'dispose'], pages: 0 });
	});

	test('an instance can open again after a failed presentation was removed', async () => {
		const { controller, calls, errors } = setup();
		await controller.update([{ ...canvas, url: 'file:///canvas.html' }]);
		await controller.update([]);
		await controller.update([canvas]);
		assert.deepStrictEqual({ calls, errors: errors.length }, {
			calls: ['create', `navigate:${canvas.url}`],
			errors: 1,
		});
	});

	test('an instance without a URL opens when the runtime supplies one', async () => {
		const { controller, calls } = setup();
		await controller.update([{ ...canvas, url: undefined }]);
		await controller.update([canvas]);
		assert.deepStrictEqual(calls, ['create', `navigate:${canvas.url}`]);
	});

	test('a new runtime open re-presents a dismissed instance with the same URL', async () => {
		const { controller, known, calls } = setup();
		await controller.update([{ ...canvas, revision: 'first' }]);
		[...known.values()][0].dispose();
		await controller.update([{ ...canvas, revision: 'first' }]);
		await controller.update([{ ...canvas, revision: 'second' }]);
		assert.deepStrictEqual(calls, ['create', `navigate:${canvas.url}`, 'dispose', 'create', `navigate:${canvas.url}`]);
	});

	test('provider disconnect retains the page and rejects stale URL reopening', async () => {
		const { controller, calls, errors } = setup();
		await controller.update([canvas]);
		await controller.update([{ ...canvas, unavailable: true }]);
		await controller.open(canvas.instanceId);
		assert.deepStrictEqual({ calls, errors: errors.length }, {
			calls: ['create', `navigate:${canvas.url}`],
			errors: 1,
		});
	});
});
