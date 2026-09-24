/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IBrowserViewLoadError } from '../../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { MANAGE_TRUST_COMMAND_ID } from '../../../workspace/common/workspace.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserFileTrustWidget } from '../../electron-browser/browserFileTrustWidget.js';

suite('BrowserFileTrustWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const file = URI.file('/canvas-file-trust/outside/index.html');

	function createModel() {
		let url = file.toString();
		let error: IBrowserViewLoadError | undefined = { url, errorCode: -2, errorDescription: 'ERR_FAILED', fileAccessDenied: true };
		let loading = false;
		const loads: string[] = [];
		const model = upcastPartial<IBrowserViewModel>({
			get url() { return url; },
			get error() { return error; },
			get loading() { return loading; },
			presentation: { type: 'external', resource: URI.parse('test-canvas:/owner/chat/instance') },
			loadURL: async value => { loads.push(value); },
		});
		return {
			model, loads,
			setState: (next: { url?: string; error?: IBrowserViewLoadError; loading?: boolean }) => {
				url = next.url ?? url;
				error = next.error;
				loading = next.loading ?? false;
			},
		};
	}

	function createFixture() {
		const approval = new DeferredPromise<boolean | undefined>();
		const requests: ResourceTrustRequestOptions[] = [];
		const commands: string[] = [];
		const notifications: string[] = [];
		const errors: Error[] = [];
		const widget = store.add(new BrowserFileTrustWidget(
			upcastPartial<IWorkspaceTrustRequestService>({
				requestResourcesTrust: async options => { requests.push(options); return approval.p; },
			}),
			upcastPartial<ICommandService>({
				executeCommand: async id => { commands.push(id); return undefined; },
			}),
			upcastPartial<INotificationService>({
				error: message => { notifications.push(String(message)); },
			}),
			store.add(new class extends NullLogService {
				override error(_message: string, error: Error): void { errors.push(error); }
			}()),
		));
		const click = (label: string) => {
			const button = [...widget.element.querySelectorAll<HTMLElement>('[role="button"]')].find(button => button.textContent === label);
			assert.ok(button, label);
			button.click();
		};
		return { widget, click, approval, requests, commands, notifications, errors };
	}

	test('does not request file authority merely by presenting an approved external source', () => {
		const fixture = createFixture();
		const { model } = createModel();
		fixture.widget.update(model);
		assert.deepStrictEqual({
			visible: fixture.widget.element.style.display !== 'none',
			explainsSeparation: fixture.widget.element.textContent?.includes('Approving an extension to run does not grant local file access.'),
			requests: fixture.requests,
			commands: fixture.commands,
		}, { visible: true, explainsSeparation: true, requests: [], commands: [] });
	});

	test('explicit folder approval uses the existing resource-trust dialog and reloads only that native page', async () => {
		const fixture = createFixture();
		const { model, loads } = createModel();
		fixture.widget.update(model);
		fixture.click('Trust Folder...');
		await fixture.approval.complete(true);
		await timeout(0);
		assert.deepStrictEqual({
			folders: fixture.requests.map(request => request.uri.toString()),
			loads,
			commands: fixture.commands,
		}, { folders: [URI.file('/canvas-file-trust/outside').toString()], loads: [file.toString()], commands: [] });
	});

	test('declining folder trust leaves the source blocked', async () => {
		const fixture = createFixture();
		const { model, loads } = createModel();
		fixture.widget.update(model);
		fixture.click('Trust Folder...');
		await fixture.approval.complete(false);
		await timeout(0);
		assert.deepStrictEqual({ loads, visible: fixture.widget.element.style.display !== 'none', notifications: fixture.notifications }, {
			loads: [], visible: true, notifications: [],
		});
	});

	test('manage trust and manual reload do not request or silently grant folder authority', async () => {
		const fixture = createFixture();
		const { model, loads } = createModel();
		fixture.widget.update(model);
		fixture.click('Manage Workspace Trust');
		await timeout(0);
		fixture.click('Reload');
		await timeout(0);
		assert.deepStrictEqual({ commands: fixture.commands, loads, requests: fixture.requests }, {
			commands: [MANAGE_TRUST_COMMAND_ID], loads: [file.toString()], requests: [],
		});
	});

	test('a late folder approval cannot reload a replacement owner, even at the same URL', async () => {
		const fixture = createFixture();
		const first = createModel();
		const next = createModel();
		fixture.widget.update(first.model);
		fixture.click('Trust Folder...');
		fixture.widget.update(next.model);
		await fixture.approval.complete(true);
		await timeout(0);
		assert.deepStrictEqual({ first: first.loads, next: next.loads }, { first: [], next: [] });
	});

	test('detachment or navigation during approval prevents a late reload', async () => {
		for (const detach of [true, false]) {
			const fixture = createFixture();
			const model = createModel();
			fixture.widget.update(model.model);
			fixture.click('Trust Folder...');
			if (detach) {
				fixture.widget.update(undefined);
			} else {
				model.setState({ url: 'https://example.com/other' });
				fixture.widget.update(model.model);
			}
			await fixture.approval.complete(true);
			await timeout(0);
			assert.deepStrictEqual(model.loads, []);
		}
	});

	test('trust failures are visible and retry remains available', async () => {
		const fixture = createFixture();
		const { model } = createModel();
		fixture.widget.update(model);
		fixture.click('Trust Folder...');
		const failure = new Error('Controlled trust persistence failure');
		await fixture.approval.error(failure);
		await timeout(0);
		assert.deepStrictEqual({
			errors: fixture.errors, notifications: fixture.notifications.length,
			enabled: fixture.widget.element.querySelector('[aria-disabled="true"]') === null,
		}, { errors: [failure], notifications: 1, enabled: true });
	});

	test('missing files and other native errors are not treated as folder-trust approval requests', () => {
		const fixture = createFixture();
		const model = createModel();
		model.setState({ error: { url: file.toString(), errorCode: -6, errorDescription: 'ERR_FILE_NOT_FOUND' } });
		fixture.widget.update(model.model);
		assert.deepStrictEqual({ hidden: fixture.widget.element.style.display, requests: fixture.requests }, { hidden: 'none', requests: [] });
	});
});
