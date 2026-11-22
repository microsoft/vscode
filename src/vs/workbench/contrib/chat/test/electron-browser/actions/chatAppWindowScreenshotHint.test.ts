/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { MarkdownRenderOptions, renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IAppWindowScreenshotService } from '../../../../screenshotTool/electron-browser/appWindowScreenshot.js';
import { ChatImageAttachGesture, IChatUserImageAttachmentEvent, IChatUserImageAttachmentService } from '../../../browser/attachments/chatUserImageAttachments.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../browser/widget/input/chatInputNoticeHost.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { AppWindowScreenshotHint } from '../../../electron-browser/actions/chatAppWindowScreenshotHint.js';

suite('AppWindowScreenshotHint', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const COMMAND = { id: 'test.attachAppWindowScreenshot', title: 'Attach Screenshot of App Window' };
	const INPUT = URI.parse('vscode-chat-input:input-1');
	const KEYBINDING = createUSLayoutResolvedKeybinding(KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyS, OperatingSystem.Linux)!;
	const KEY = KEYBINDING.getLabel();

	function createHint(options: { readonly enabled?: boolean; readonly keybinding?: 'none' | 'inChat' | 'systemWide'; readonly storageService?: TestStorageService } = {}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.AppWindowScreenshotsEnabled]: options.enabled ?? true }));
		const storageService = options.storageService ?? store.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(IContextKeyService, new MockContextKeyService());

		const onDidAttachImages = store.add(new Emitter<IChatUserImageAttachmentEvent>());
		instantiationService.stub(IChatUserImageAttachmentService, { onDidAttachImages: onDidAttachImages.event });

		let hasCaptured = false;
		const onDidChangeHasCaptured = store.add(new Emitter<void>());
		instantiationService.stub(IAppWindowScreenshotService, {
			get hasCaptured() { return hasCaptured; },
			onDidChangeHasCaptured: onDidChangeHasCaptured.event,
		});

		instantiationService.stub(IKeybindingService, {
			lookupKeybinding: () => options.keybinding === 'none' ? undefined : KEYBINDING,
			getKeybindings: () => options.keybinding === 'systemWide' ? [new ResolvedKeybindingItem(KEYBINDING, COMMAND.id, undefined, undefined, false, null, false, true)] : [],
		});

		const executed: string[] = [];
		instantiationService.stub(IMarkdownRendererService, { render: (markdown: IMarkdownString, options?: MarkdownRenderOptions) => renderMarkdown(markdown, options) });

		const events: string[] = [];
		instantiationService.stub(ITelemetryService, new class extends mock<ITelemetryService>() {
			override publicLog2(eventName: string, data?: unknown): void {
				const { action, gesture, copy, imageCount } = data as { action: string; gesture: string; copy: string; imageCount: number };
				events.push(`${eventName} ${action} ${gesture} ${copy} ${imageCount}`);
			}
		});

		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const container = $('.chat-attachment-hint-container');
		const attachmentIds: string[] = [];
		const onDidChangeAttachments = store.add(new Emitter<void>());
		const onDidChangeDraft = store.add(new Emitter<void>());
		store.add(instantiationService.createInstance(AppWindowScreenshotHint, {
			inputUri: INPUT,
			noticeHost,
			container,
			getAttachmentIds: () => attachmentIds,
			onDidChangeAttachments: onDidChangeAttachments.event,
			onDidChangeDraft: onDidChangeDraft.event,
			canAttachScreenshots: () => true,
		}, { ...COMMAND, run: () => executed.push(COMMAND.id) }));

		return {
			events,
			executed,
			noticeHost,
			storageService,
			text: () => container.textContent ?? '',
			clickLink: () => container.querySelector<HTMLElement>('a')?.click(),
			attach(id: string, gesture: ChatImageAttachGesture = 'paste') {
				attachmentIds.push(id);
				onDidAttachImages.fire({ inputUri: INPUT, attachmentIds: [id], gesture });
			},
			attachToOtherInput(id: string) {
				onDidAttachImages.fire({ inputUri: URI.parse('vscode-chat-input:input-2'), attachmentIds: [id], gesture: 'paste' });
			},
			remove(id: string) {
				attachmentIds.splice(attachmentIds.indexOf(id), 1);
				onDidChangeAttachments.fire();
			},
			send() {
				attachmentIds.length = 0;
				onDidChangeDraft.fire();
			},
			capture() {
				hasCaptured = true;
				onDidChangeHasCaptured.fire();
			},
		};
	}

	/** Lets the hint claim its one showing, which it does asynchronously, across windows. */
	const claimed = () => timeout(0);

	const IN_CHAT = `Showing the agent your app? Next time, switch from your app to chat and press ${KEY} to attach a screenshot of its window.`;

	test('shows once, above its own input, after other notices and until its images go', async () => {
		const hint = createHint();
		const text: Record<string, string> = {};

		hint.attachToOtherInput('other');
		text.otherInput = hint.text();
		const notification = hint.noticeHost.occupy(ChatInputNoticeLane.Notification);
		hint.attach('image1');
		text.behindNotification = hint.text();
		notification.dispose();
		await claimed();
		text.afterNotification = hint.text();
		const onboarding = hint.noticeHost.occupy(ChatInputNoticeLane.Onboarding);
		text.behindOnboarding = hint.text();
		onboarding.dispose();
		text.afterOnboarding = hint.text();
		hint.remove('image1');
		text.imageRemoved = hint.text();
		hint.attach('image2');
		await claimed();
		text.nextPaste = hint.text();

		assert.deepStrictEqual({
			text,
			events: hint.events,
			shownStored: !!hint.storageService.get('chat.appWindowScreenshots.hintShown', StorageScope.APPLICATION_SHARED),
		}, {
			text: {
				otherInput: '',
				behindNotification: '',
				afterNotification: IN_CHAT,
				behindOnboarding: '',
				afterOnboarding: IN_CHAT,
				imageRemoved: '',
				nextPaste: '',
			},
			events: [
				'screenshotTool.appWindowHint opportunity paste none 1',
				'screenshotTool.appWindowHint shown paste inApp 1',
				'screenshotTool.appWindowHint expired paste inApp 1',
			],
			shownStored: true,
		});
	});

	test('does nothing with the feature off, and shows later when it went away unseen', async () => {
		const off = createHint({ enabled: false });
		off.attach('image1');

		const hint = createHint();
		const notification = hint.noticeHost.occupy(ChatInputNoticeLane.Notification);
		hint.attach('image1');
		hint.send();
		notification.dispose();
		const afterSend = hint.text();
		hint.attach('image2', 'drop');
		await claimed();
		const afterDrop = hint.text();
		hint.capture();

		assert.deepStrictEqual({
			off: { text: off.text(), events: off.events },
			afterSend,
			afterDrop,
			afterCapture: hint.text(),
			events: hint.events,
		}, {
			off: { text: '', events: [] },
			afterSend: '',
			afterDrop: IN_CHAT,
			afterCapture: '',
			events: [
				'screenshotTool.appWindowHint opportunity paste none 1',
				'screenshotTool.appWindowHint shown drop inApp 1',
				'screenshotTool.appWindowHint used drop inApp 1',
			],
		});
	});

	test('keeps its one showing when the draft goes while it claims it', async () => {
		let onWillSwap: (() => void) | undefined;
		const storageService = disposables.add(new class extends TestStorageService {
			override compareAndSwapApplicationSharedValue(key: string, expectedValue: string | undefined, newValue: string) {
				onWillSwap?.();
				return super.compareAndSwapApplicationSharedValue(key, expectedValue, newValue);
			}
		});
		const hint = createHint({ storageService });
		hint.attach('image1');
		hint.send();
		await claimed();
		onWillSwap = () => {
			onWillSwap = undefined;
			hint.send();
		};
		hint.attach('image2');
		await claimed();
		const otherWindow = createHint({ storageService });
		otherWindow.attach('image3');
		await claimed();

		assert.strictEqual(otherWindow.text(), IN_CHAT);
	});

	test('shows in only one window when two get images at once', async () => {
		const storageService = disposables.add(new TestStorageService());
		const first = createHint({ storageService });
		const second = createHint({ storageService });
		first.attach('image1');
		second.attach('image1');
		await claimed();

		assert.deepStrictEqual([first.text(), second.text()], [IN_CHAT, '']);
	});

	test('names the keybinding, where it works, or the command when there is none, and links it to the command', async () => {
		const shown = [];
		for (const keybinding of ['none', 'inChat', 'systemWide'] as const) {
			const hint = createHint({ keybinding });
			hint.attach('image1');
			await claimed();
			const text = hint.text();
			hint.clickLink();
			shown.push({ text, events: hint.events.slice(1), executed: hint.executed });
		}

		assert.deepStrictEqual(shown, [
			{
				text: `Showing the agent your app? Next time, switch from your app to chat and run ${COMMAND.title} from the Command Palette to attach a screenshot of its window.`,
				events: ['screenshotTool.appWindowHint shown paste palette 1', 'screenshotTool.appWindowHint clicked paste palette 1'],
				executed: [COMMAND.id],
			},
			{
				text: IN_CHAT,
				events: ['screenshotTool.appWindowHint shown paste inApp 1', 'screenshotTool.appWindowHint clicked paste inApp 1'],
				executed: [COMMAND.id],
			},
			{
				text: `Showing the agent your app? Next time, press ${KEY} while your app is in front to attach a screenshot of its window.`,
				events: ['screenshotTool.appWindowHint shown paste systemWide 1', 'screenshotTool.appWindowHint clicked paste systemWide 1'],
				executed: [COMMAND.id],
			},
		]);
	});
});
