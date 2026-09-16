/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SinonStub, stub } from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { AccessibleViewProviderId } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { createOnboardingTryoutUri, IOnboardingTryoutService, OnboardingTryoutAvailability, OnboardingTryoutResult, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../../onboarding/common/onboardingTryout.js';
import { IOverlayWebview, WebviewMessageReceivedEvent } from '../../../webview/browser/webview.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../../webviewPanel/browser/webviewWorkbenchService.js';
import { ReleaseNotesAccessibilityHelp } from '../../browser/releaseNotesAccessibilityHelp.js';
import { ReleaseNotesManager } from '../../browser/releaseNotesEditor.js';

suite('Release notes editor Try This integration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = createOnboardingTryoutUri('sample');
	let markdown: string;
	let html: string[];
	let messages: object[];
	let changes: Emitter<void>;
	let onMessage: Emitter<WebviewMessageReceivedEvent>;
	let onClick: Emitter<string>;
	let availability: OnboardingTryoutAvailability;
	let run: IOnboardingTryoutService['run'];
	let whenExtensionsRegistered: () => Promise<boolean>;
	let instantiationService: TestInstantiationService;
	let manager: ReleaseNotesManager;
	let input: WebviewInput;
	let activeEditor: WebviewInput | undefined;
	let focused: boolean;
	let focusCount: number;
	let open: SinonStub<Parameters<IOpenerService['open']>, Promise<boolean>>;

	setup(() => {
		markdown = `# Release Notes\n[Try](${uri})`;
		html = [];
		messages = [];
		focused = true;
		focusCount = 0;
		availability = { kind: 'ready' };
		run = async () => ({ kind: 'opened' });
		whenExtensionsRegistered = async () => true;
		changes = store.add(new Emitter<void>());
		onMessage = store.add(new Emitter<WebviewMessageReceivedEvent>());
		onClick = store.add(new Emitter<string>());
		const onDispose = store.add(new Emitter<void>());
		instantiationService = store.add(new TestInstantiationService());
		const webview = new class extends mock<IOverlayWebview>() {
			override readonly container = $('div');
			override readonly onMessage = onMessage.event;
			override readonly onDidDispose = onDispose.event;
			override readonly onDidClickLink = onClick.event;
			override readonly onDidFocus = Event.None;
			override readonly onDidBlur = Event.None;
			override get isFocused() { return focused; }
			override setHtml(value: string): void { html.push(value); }
			override setTitle(): void { }
			override async postMessage(message: object): Promise<boolean> { messages.push(message); return true; }
			override focus(): void { focusCount++; }
			override dispose(): void { onDispose.fire(); }
		};
		input = store.add(new WebviewInput({ viewType: 'releaseNotes', providedId: undefined, name: 'Release Notes', iconPath: undefined }, webview, new TestThemeService()));
		activeEditor = input;
		instantiationService.stub(IWebviewWorkbenchService, {
			onDidChangeActiveWebviewEditor: Event.None,
			openWebview: () => input,
			revealWebview: () => undefined,
		});
		instantiationService.stub(IEditorService, { get activeEditor() { return activeEditor; } });
		instantiationService.stub(IEditorGroupsService, { activeGroup: new class extends mock<IEditorGroup>() { } });
		instantiationService.stub(ICodeEditorService, {
			getActiveCodeEditor: () => new class extends mock<ICodeEditor>() {
				override getModel(): ITextModel {
					return new class extends mock<ITextModel>() {
						override readonly uri = URI.file('release-notes.md');
						override getValue() { return markdown; }
					};
				}
			},
		});
		instantiationService.stub(IOnboardingTryoutService, {
			onDidChange: changes.event,
			getTryout: id => id === 'sample' ? { id, trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID }, presentation: { kind: 'test', payload: {} }, tryout: { title: 'Example', description: 'Description.' } } : undefined,
			getAvailability: () => availability,
			run: (id, token) => run(id, token),
		});
		instantiationService.stub(ICommandService, { executeCommand: stub().resolves(undefined) });
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ update: { showReleaseNotes: true } }));
		instantiationService.stub(IProductService, { quality: 'stable', enableTelemetry: false });
		instantiationService.stub(IEnvironmentService, { isBuilt: false });
		instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: () => whenExtensionsRegistered() });
		instantiationService.stub(ILanguageService, store.add(new LanguageService()));
		instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
		open = stub<Parameters<IOpenerService['open']>, Promise<boolean>>().resolves(true);
		instantiationService.stub(IOpenerService, { open });
		manager = store.add(instantiationService.createInstance(ReleaseNotesManager));
	});

	function documentId(): string {
		return /const documentId = "(?<id>[^"]+)"/.exec(html[html.length - 1])!.groups!.id;
	}

	test('preserves the CSP and only extends the existing command allowlist with the dispatcher', async () => {
		markdown += '\n<script>untrustedScript()</script>';
		await manager.show('1.100.0', true);
		for (const command of ['workbench.action.openSettings', 'summarize.release.notes', 'not.allowed']) {
			onClick.fire(`command:${command}`);
		}
		await timeout(0);
		assert.deepStrictEqual({
			csp: html[0].includes('default-src \'none\'; img-src https: data:; media-src https:; style-src \'nonce-'),
			scripts: (html[0].match(/<script /g) ?? []).length,
			untrustedScript: html[0].includes('untrustedScript()'),
			options: open.getCalls().map(call => call.args[1]),
		}, {
			csp: true, scripts: 1, untrustedScript: false,
			options: Array(3).fill({ allowCommands: ['workbench.action.openSettings', 'summarize.release.notes', RUN_ONBOARDING_TRYOUT_COMMAND_ID] }),
		});
	});

	test('context changes update states instead of replacing the webview HTML', async () => {
		await manager.show('1.100.0', true);
		onMessage.fire({ message: { type: 'releaseNotesTryoutsReady', documentId: documentId() } });
		messages.length = 0;
		availability = { kind: 'hidden' };
		changes.fire();
		changes.fire();
		assert.deepStrictEqual({ htmlWrites: html.length, messages }, {
			htmlWrites: 1,
			messages: [{
				type: 'releaseNotesTryouts', documentId: documentId(),
				states: [{ id: 'sample', kind: 'hidden', label: '', ariaLabel: '', href: '', message: '', setupLabel: '', setupAriaLabel: '' }],
			}],
		});
	});

	test('reusing the webview cancels the old document and ignores its late result', async () => {
		await manager.show('1.100.0', true);
		const oldDocument = documentId();
		const pending = new DeferredPromise<OnboardingTryoutResult>();
		let token: CancellationToken | undefined;
		let runs = 0;
		run = async (_id, sourceToken) => {
			runs++;
			token = sourceToken;
			return pending.p;
		};
		onMessage.fire({ message: { type: 'releaseNotesTryout', documentId: oldDocument, id: 'sample', index: 0, action: 'run' } });
		await manager.show('1.101.0', true);
		messages.length = 0;
		onMessage.fire({ message: { type: 'releaseNotesTryout', documentId: oldDocument, id: 'sample', index: 0, action: 'run' } });
		await pending.complete({ kind: 'cancelled' });
		await timeout(0);
		assert.deepStrictEqual({ runs, cancelled: token?.isCancellationRequested, changedDocument: documentId() !== oldDocument, messages, focusCount }, {
			runs: 1, cancelled: true, changedDocument: true, messages: [], focusCount: 0,
		});
	});

	test('closing the source while rendering prevents late HTML writes', async () => {
		await manager.show('1.100.0', true);
		const started = new DeferredPromise<void>();
		const pending = new DeferredPromise<boolean>();
		whenExtensionsRegistered = () => {
			void started.complete();
			return pending.p;
		};
		markdown = '# New notes\n```text\ncode\n```';
		const showing = manager.show('1.101.0', true);
		await started.p;
		input.dispose();
		await pending.complete(true);
		const shown = await showing;
		assert.deepStrictEqual({ shown, htmlWrites: html.length }, { shown: false, htmlWrites: 1 });
	});

	test('accessibility help is scoped to release notes content, not Webview Find or other editors', () => {
		const help = new ReleaseNotesAccessibilityHelp();
		const matches = (panel: string, find: boolean) => {
			const context = store.add(new MockContextKeyService());
			context.createKey('activeWebviewPanelId', panel);
			context.createKey('webviewFindWidgetFocused', find);
			return help.when!.evaluate({ getValue: key => context.getContextKeyValue(key) });
		};
		const provider = store.add(instantiationService.invokeFunction(accessor => help.getProvider(accessor))!);
		provider.onClose();
		focused = false;
		const unfocused = instantiationService.invokeFunction(accessor => help.getProvider(accessor));
		activeEditor = undefined;
		provider.onClose();
		assert.deepStrictEqual({
			releaseNotes: matches('releaseNotes', false),
			find: matches('releaseNotes', true),
			other: matches('otherWebview', false),
			id: provider.id,
			verbosity: provider.verbositySettingKey,
			unsentChat: provider.provideContent().includes('do not send it automatically'),
			otherWindow: provider.provideContent().includes('another editor or window'),
			explicitSetup: provider.provideContent().includes('Setup does not automatically run the example'),
			unfocused, focusCount,
		}, {
			releaseNotes: true, find: false, other: false,
			id: AccessibleViewProviderId.ReleaseNotes, verbosity: AccessibilityVerbositySettingId.ReleaseNotes,
			unsentChat: true, otherWindow: true, explicitSetup: true,
			unfocused: undefined, focusCount: 1,
		});
	});
});
