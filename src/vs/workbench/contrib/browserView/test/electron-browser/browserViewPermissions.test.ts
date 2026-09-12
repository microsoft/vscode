/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PermissionCategory } from '../../../../../platform/browserView/common/browserPermissions.js';
import type { IBrowserViewDeviceRequest, IBrowserViewNavigationEvent, IBrowserViewPermissionRequestEvent } from '../../../../../platform/browserView/common/browserView.js';
import type { IPrompt, IPromptResult, IPromptResultWithCancel, IPromptWithCustomCancel, IPromptWithDefaultCancel } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import type { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { type IQuickInputHideEvent, type IQuickInputService, type IQuickPick, type IQuickPickDidAcceptEvent, type IQuickPickItem, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import type { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserViewPermissionHandler } from '../../electron-browser/browserViewPermissions.js';

class DeferredDialogService extends TestDialogService {
	readonly prompts: { options: IPrompt<unknown>; answer: DeferredPromise<number | undefined> }[] = [];

	override prompt<T>(prompt: IPromptWithCustomCancel<T>): Promise<IPromptResultWithCancel<T>>;
	override prompt<T>(prompt: IPromptWithDefaultCancel<T>): Promise<IPromptResult<T>>;
	override prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;
	override async prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>> {
		const answer = new DeferredPromise<number | undefined>();
		this.prompts.push({ options: prompt, answer });
		const index = await answer.p;
		const button = index === undefined
			? typeof prompt.cancelButton === 'object' ? prompt.cancelButton : undefined
			: prompt.buttons?.[index];
		return { result: await button?.run({}) };
	}
}

suite('BrowserViewPermissionHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const origin = 'https://canvas.example';
	const device: IBrowserViewDeviceRequest = {
		requestId: 'device-request', deviceType: 'usb',
		devices: [{ deviceId: 'one', label: 'First device' }],
	};

	function createFixture(failure?: Error) {
		const permission = store.add(new Emitter<IBrowserViewPermissionRequestEvent>());
		const willNavigate = store.add(new Emitter<string>());
		const navigate = store.add(new Emitter<IBrowserViewNavigationEvent>());
		const disposing = store.add(new Emitter<void>());
		const writes: Parameters<IBrowserViewModel['setPermissions']>[] = [];
		const selections: Parameters<IBrowserViewModel['selectDevice']>[] = [];
		const errors: Error[] = [];
		const notifications: string[] = [];
		let selectionResponse: Promise<void> | undefined;
		const model = upcastPartial<IBrowserViewModel>({
			id: 'browser-view', url: origin,
			onDidRequestPermission: permission.event,
			onWillNavigate: willNavigate.event,
			onDidNavigate: navigate.event,
			onWillDispose: disposing.event,
			setPermissions: async (...args) => {
				writes.push(args);
				if (failure) {
					throw failure;
				}
			},
			selectDevice: async (...args) => {
				selections.push(args);
				if (failure) {
					throw failure;
				}
				await selectionResponse;
			},
		});
		const dialogs = new DeferredDialogService();
		const pickers: {
			select(index: number): void;
			hide(): void;
			snapshot(): { visible: boolean; labels: string[]; listening: boolean[] };
		}[] = [];
		const quickInput = new class extends mock<IQuickInputService>() {
			override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
			override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T>;
			override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T> | IQuickPick<T, { useSeparators: true }> {
				assert.notStrictEqual(options?.useSeparators, true);
				const lifetime = store.add(new DisposableStore());
				const accept = lifetime.add(new Emitter<IQuickPickDidAcceptEvent>());
				const hide = lifetime.add(new Emitter<IQuickInputHideEvent>());
				let visible = false;
				const picker = upcastPartial<IQuickPick<T>>({
					items: [], activeItems: [], selectedItems: [],
					onDidAccept: accept.event, onDidHide: hide.event,
					show: () => { visible = true; },
					hide: () => { visible = false; hide.fire({ reason: QuickInputHideReason.Gesture }); },
					dispose: () => { picker.hide(); lifetime.dispose(); },
				});
				pickers.push({
					select: index => {
						const item = picker.items[index];
						assert.ok(item);
						picker.selectedItems = [item];
						accept.fire({ inBackground: false });
					},
					hide: () => picker.hide(),
					snapshot: () => ({ visible, labels: picker.items.map(item => item.label), listening: [accept.hasListeners(), hide.hasListeners()] }),
				});
				return picker;
			}
		}();
		const handler = store.add(new BrowserViewPermissionHandler(
			model, quickInput, dialogs,
			upcastPartial<INotificationService>({ error: message => notifications.push(String(message)) }),
			store.add(new class extends NullLogService {
				override error(_message: string, error: Error): void { errors.push(error); }
			}()),
		));
		return {
			handler, dialogs, pickers, writes, selections, errors, notifications, willNavigate, navigate, disposing,
			requestPermission: () => permission.fire({ origin, category: PermissionCategory.Clipboard }),
			requestDevice: (request = device) => permission.fire({ origin, category: PermissionCategory.Devices, device: request }),
			listeners: () => [permission.hasListeners(), willNavigate.hasListeners(), navigate.hasListeners(), disposing.hasListeners()],
			deferSelection: (response: Promise<void>) => { selectionResponse = response; },
		};
	}

	test('allow, block and explicit cancellation use the captured native permission write path', async () => {
		const fixture = createFixture();
		for (const index of [0, 1, undefined]) {
			fixture.requestPermission();
			await fixture.dialogs.prompts.at(-1)!.answer.complete(index);
			await timeout(0);
		}
		assert.deepStrictEqual({
			writes: fixture.writes,
			prompts: fixture.dialogs.prompts.map(({ options }) => ({
				custom: options.custom, cancellable: !!options.token,
				origin: options.message.includes('canvas.example'), category: options.message.includes('Clipboard'),
			})),
		}, {
			writes: ['allow', 'deny', null].map(state => [origin, [{ category: PermissionCategory.Clipboard, state }]]),
			prompts: Array.from({ length: 3 }, () => ({ custom: true, cancellable: true, origin: true, category: true })),
		});
	});

	test('detaching cancels the pending UI and cannot apply a late grant to either owner', async () => {
		const original = createFixture();
		original.requestPermission();
		original.handler.dispose();
		const replacement = createFixture();
		await original.dialogs.prompts[0].answer.complete(0);
		await timeout(0);
		assert.deepStrictEqual({
			cancelled: original.dialogs.prompts[0].options.token?.isCancellationRequested,
			original: original.writes, replacement: replacement.writes, listeners: original.listeners(),
		}, { cancelled: true, original: [[origin, [{ category: PermissionCategory.Clipboard, state: null }]]], replacement: [], listeners: [false, false, false, false] });
	});

	test('navigation coalesces duplicate prompts and an old completion cannot cancel the new request', async () => {
		const fixture = createFixture();
		fixture.requestPermission();
		fixture.requestPermission();
		fixture.willNavigate.fire(`${origin}/next`);
		fixture.navigate.fire(upcastPartial<IBrowserViewNavigationEvent>({ url: `${origin}/next` }));
		fixture.requestPermission();
		await fixture.dialogs.prompts[0].answer.complete(0);
		await timeout(0);
		const newPromptCancelled = fixture.dialogs.prompts[1].options.token?.isCancellationRequested;
		await fixture.dialogs.prompts[1].answer.complete(1);
		await timeout(0);
		assert.deepStrictEqual({ count: fixture.dialogs.prompts.length, newPromptCancelled, writes: fixture.writes }, {
			count: 2, newPromptCancelled: false,
			writes: [null, 'deny'].map(state => [origin, [{ category: PermissionCategory.Clipboard, state }]]),
		});
	});

	test('model disposal dismisses pending UI without writing to a destroyed native page', async () => {
		const fixture = createFixture();
		fixture.requestPermission();
		fixture.requestDevice();
		fixture.disposing.fire();
		await fixture.dialogs.prompts[0].answer.complete(0);
		await timeout(0);
		assert.deepStrictEqual({
			writes: fixture.writes, selections: fixture.selections,
			cancelled: fixture.dialogs.prompts[0].options.token?.isCancellationRequested,
			picker: fixture.pickers[0].snapshot(), listeners: fixture.listeners(),
		}, {
			writes: [], selections: [], cancelled: true,
			picker: { visible: false, labels: ['First device'], listening: [false, false] }, listeners: [false, false, false, false],
		});
	});

	test('one live device chooser updates and submits one selection while ignoring updates awaiting its acknowledgement', async () => {
		const fixture = createFixture();
		const selection = new DeferredPromise<void>();
		fixture.deferSelection(selection.p);
		fixture.requestDevice();
		const updated: IBrowserViewDeviceRequest = { ...device, devices: [...device.devices, { deviceId: 'two', label: 'Second device' }] };
		fixture.requestDevice(updated);
		fixture.pickers[0].select(1);
		fixture.requestDevice(updated);
		const beforeAcknowledgement = fixture.pickers.map(picker => picker.snapshot());
		await selection.complete();
		await timeout(0);
		fixture.handler.dispose();
		assert.deepStrictEqual({ beforeAcknowledgement, selections: fixture.selections, writes: fixture.writes, listeners: fixture.listeners() }, {
			beforeAcknowledgement: [{ visible: false, labels: ['First device', 'Second device'], listening: [false, false] }],
			selections: [['device-request', 'two']], writes: [], listeners: [false, false, false, false],
		});
	});

	test('navigation cancellation retains the chooser identity until its acknowledgement', async () => {
		for (const event of ['willNavigate', 'didNavigate']) {
			const fixture = createFixture();
			const cancellation = new DeferredPromise<void>();
			fixture.deferSelection(cancellation.p);
			fixture.requestDevice();
			if (event === 'willNavigate') {
				fixture.willNavigate.fire('https://other.example');
			} else {
				fixture.navigate.fire(upcastPartial<IBrowserViewNavigationEvent>({ url: 'https://other.example' }));
			}
			fixture.requestDevice({ ...device, devices: [{ deviceId: 'late', label: 'Late device discovery' }] });
			const beforeAcknowledgement = fixture.pickers.map(picker => picker.snapshot());
			await cancellation.complete();
			await timeout(0);
			fixture.handler.dispose();
			assert.deepStrictEqual({ beforeAcknowledgement, selections: fixture.selections, listeners: fixture.listeners() }, {
				beforeAcknowledgement: [{ visible: false, labels: ['First device'], listening: [false, false] }],
				selections: [['device-request', null]], listeners: [false, false, false, false],
			});
		}
	});

	test('hiding, navigating or detaching a device chooser sends exactly one cancellation', async () => {
		for (const reason of ['hide', 'navigate', 'detach']) {
			const fixture = createFixture();
			fixture.requestDevice();
			if (reason === 'hide') {
				fixture.pickers[0].hide();
			} else if (reason === 'navigate') {
				fixture.navigate.fire(upcastPartial<IBrowserViewNavigationEvent>({ url: 'https://other.example' }));
			} else {
				fixture.handler.dispose();
			}
			fixture.pickers[0].select(0);
			await timeout(0);
			fixture.handler.dispose();
			assert.deepStrictEqual({ selections: fixture.selections, picker: fixture.pickers[0].snapshot(), listeners: fixture.listeners() }, {
				selections: [['device-request', null]],
				picker: { visible: false, labels: ['First device'], listening: [false, false] }, listeners: [false, false, false, false],
			});
		}
	});

	test('prompt and native write failures are visible and preserve the original error without retries', async () => {
		for (const kind of ['prompt', 'permission', 'device']) {
			const failure = new Error('Controlled native permission write failure');
			const fixture = createFixture(kind === 'prompt' ? undefined : failure);
			if (kind === 'prompt') {
				fixture.requestPermission();
				await fixture.dialogs.prompts[0].answer.error(failure);
			} else if (kind === 'permission') {
				fixture.requestPermission();
				await fixture.dialogs.prompts[0].answer.complete(0);
			} else {
				fixture.requestDevice();
				fixture.pickers[0].select(0);
			}
			await timeout(0);
			assert.deepStrictEqual({ attempts: fixture.writes.length + fixture.selections.length, errors: fixture.errors, notifications: fixture.notifications.length }, {
				attempts: 1, errors: [failure], notifications: 1,
			});
		}
	});
});
