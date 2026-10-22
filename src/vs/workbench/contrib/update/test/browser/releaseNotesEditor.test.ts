/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SinonStub, spy, stub } from 'sinon';
import { $, addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { NullState } from '../../../../../editor/common/languages/nullTokenize.js';
import { TokenTheme } from '../../../../../editor/common/languages/supports/tokenization.js';
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
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
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
import { applyReleaseNotesTokenization, initializeReleaseNotesNavigation, ReleaseNotesManager } from '../../browser/releaseNotesEditor.js';

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
		instantiationService.stub(ILogService, new NullLogService());
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
			csp: true, scripts: 2, untrustedScript: false,
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
				states: [{ id: 'sample', index: 0, kind: 'hidden', label: '', ariaLabel: '', href: '', message: '', setupLabel: '', setupAriaLabel: '' }],
			}],
		});
	});

	test('retokenizes code metadata on a theme change without replacing the document or cancelling a tryout', async () => {
		const languageService = instantiationService.get(ILanguageService);
		const language = 'release-notes-theme-test';
		store.add(languageService.registerLanguage({ id: language }));
		const languageId = languageService.languageIdCodec.encodeLanguageId(language);
		let theme = TokenTheme.createFromRawTokenTheme([
			{ token: '', foreground: 'cccccc', background: '000000' },
			{ token: 'keyword', foreground: 'ff0000' },
		], []);
		const originalColorMap = TokenizationRegistry.getColorMap();
		store.add(toDisposable(() => TokenizationRegistry.setColorMap(originalColorMap!)));
		TokenizationRegistry.setColorMap(theme.getColorMap());
		store.add(TokenizationRegistry.register(language, {
			getInitialState: () => NullState,
			tokenize: () => { throw new Error('Only encoded tokenization is used'); },
			tokenizeEncoded: () => new EncodedTokenizationResult(new Uint32Array([0, theme.match(languageId, 'keyword')]), [], NullState),
		}));
		markdown += `\n\`\`\`${language}\nconst value = "<script>untrusted()</script>";\n\`\`\``;
		await manager.show('1.100.0', true);
		const originalDocumentId = documentId();
		const container = $('div');
		container.style.height = '100px';
		container.style.overflow = 'auto';
		safeSetInnerHtml(container, html[0], {
			allowedLinkProtocols: { override: [Schemas.command] },
			allowedTags: { augment: ['button'] },
			allowedAttributes: { augment: ['class', 'id', 'hidden'] },
		});
		container.appendChild($('style', { id: 'release-notes-tokenization' }));
		const spacer = container.appendChild($('div'));
		spacer.style.height = '2000px';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const targetDocument = new class extends mock<Document>() {
			override readonly scrollingElement = container;
			override getElementById(id: string) { return container.querySelector<HTMLElement>(`#${id}`); }
		};
		const code = container.querySelector('pre code')!;
		const initialClass = code.querySelector('span')?.className;
		const link = container.querySelector<HTMLAnchorElement>('.release-notes-tryout-link')!;
		link.focus({ preventScroll: true });
		const pending = new DeferredPromise<OnboardingTryoutResult>();
		let token: CancellationToken | undefined;
		run = async (_id, sourceToken) => {
			token = sourceToken;
			return pending.p;
		};
		onMessage.fire({ message: { type: 'releaseNotesTryout', documentId: originalDocumentId, id: 'sample', index: 0, action: 'run' } });
		messages.length = 0;

		theme = TokenTheme.createFromRawTokenTheme([
			{ token: '', foreground: '000000', background: 'ffffff' },
			{ token: 'comment', foreground: '00aa00' },
			{ token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
		], []);
		TokenizationRegistry.setColorMap(theme.getColorMap());
		await timeout(0);
		const update = messages.find((message): message is Parameters<typeof applyReleaseNotesTokenization>[1] & { type: string; documentId: string } => 'type' in message && message.type === 'releaseNotesTokenization')!;
		// Set the scroll position after the async work so only retokenization can change it.
		container.scrollTop = 75;
		const scrollTop = container.scrollTop;
		applyReleaseNotesTokenization(targetDocument, update);

		assert.deepStrictEqual({
			initialClass,
			updatedClass: code.querySelector('span')?.className,
			updatedColor: update.value.includes('.mtk4 { color: #0000ff; }'),
			codeText: code.textContent?.trim(),
			activeMarkup: code.querySelectorAll('script').length,
			htmlWrites: html.length,
			sameDocument: update.documentId === originalDocumentId,
			sameLink: container.querySelector('a') === link,
			focused: mainWindow.document.activeElement === link,
			scrollTop: container.scrollTop,
			cancelled: token?.isCancellationRequested,
		}, {
			initialClass: 'mtk3',
			updatedClass: 'mtk4 mtkb',
			updatedColor: true,
			codeText: 'const value = "<script>untrusted()</script>";',
			activeMarkup: 0,
			htmlWrites: 1,
			sameDocument: true,
			sameLink: true,
			focused: true,
			scrollTop,
			cancelled: false,
		});
		await pending.complete({ kind: 'opened' });
		await timeout(0);
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
			customLabels: provider.provideContent().includes('custom labels'),
			currentSection: provider.provideContent().includes('does not move keyboard focus'),
			unfocused, focusCount,
		}, {
			releaseNotes: true, find: false, other: false,
			id: AccessibleViewProviderId.ReleaseNotes, verbosity: AccessibilityVerbositySettingId.ReleaseNotes,
			unsentChat: true, otherWindow: true, explicitSetup: true, customLabels: true,
			currentSection: true,
			unfocused: undefined, focusCount: 1,
		});
	});

});

suite('Release notes navigation', () => {
	for (const serialized of [false, true]) {
		suite(serialized ? 'serialized' : 'direct', () => {
			const store = ensureNoDisposablesAreLeakedInTestSuite();
			let targetDocument: Document;
			let targetWindow: Window & typeof globalThis;
			let navigationWindow: Window & typeof globalThis;
			let links: HTMLAnchorElement[];
			let frames: Map<number, FrameRequestCallback>;
			let resizeObservers: Set<() => void>;

			setup(async () => {
				// WebKit replaces about:blank documents when following fragment links.
				const url = mainWindow.URL.createObjectURL(new Blob(['<!DOCTYPE html><html><head></head><body></body></html>'], { type: 'text/html' }));
				store.add(toDisposable(() => mainWindow.URL.revokeObjectURL(url)));
				const iframe = $<HTMLIFrameElement>('iframe', { src: url });
				const loaded = new DeferredPromise<void>();
				store.add(addDisposableListener(iframe, 'load', () => { loaded.complete(); }));
				iframe.style.position = 'fixed';
				iframe.style.top = '0';
				iframe.style.left = '0';
				iframe.style.width = '600px';
				iframe.style.height = '300px';
				mainWindow.document.body.appendChild(iframe);
				store.add(toDisposable(() => iframe.remove()));
				await loaded.p;
				targetDocument = iframe.contentDocument!;
				targetWindow = getWindow(targetDocument.body);
				frames = new Map();
				resizeObservers = new Set();
				let nextFrame = 0;
				navigationWindow = upcastPartial<Window & typeof globalThis>({
					Node: targetWindow.Node,
					console: targetWindow.console,
					ResizeObserver: class implements ResizeObserver {
						private readonly notify: () => void;
						constructor(callback: ResizeObserverCallback) {
							this.notify = () => callback([], this);
							resizeObservers.add(this.notify);
						}
						observe(): void { }
						unobserve(): void { }
						disconnect(): void { resizeObservers.delete(this.notify); }
					},
					requestAnimationFrame: callback => {
						frames.set(++nextFrame, callback);
						return nextFrame;
					},
					cancelAnimationFrame: handle => { frames.delete(handle); },
					addEventListener: (...args: Parameters<Window['addEventListener']>) => targetWindow.addEventListener(...args),
					removeEventListener: (...args: Parameters<Window['removeEventListener']>) => targetWindow.removeEventListener(...args),
				});
				targetDocument.documentElement.style.overflowAnchor = 'none';
				targetDocument.body.style.margin = '0';
				const nav = $('nav', { id: 'toc-nav' });
				nav.style.position = 'fixed';
				links = ['first', 'second', 'last'].map(id => {
					const link = $<HTMLAnchorElement>('a', { href: `#${id}` }, id);
					nav.appendChild(link);
					return link;
				});
				const introduction = $('div');
				introduction.style.height = '120px';
				const content = $('div.notes-main');
				for (const id of ['first', 'subsection', 'second', 'last']) {
					const heading = $(id === 'subsection' ? 'h3' : 'h2', { id }, id);
					heading.style.margin = '0';
					heading.style.height = '30px';
					const paragraph = $('p');
					paragraph.style.margin = '0';
					paragraph.style.height = id === 'last' ? '100px' : '350px';
					content.append(heading, paragraph);
				}
				targetDocument.body.append(nav, introduction, content);
			});

			function initialize(): void {
				const initializer: typeof initializeReleaseNotesNavigation = serialized
					? new Function(`return (${initializeReleaseNotesNavigation.toString()});`)()
					: initializeReleaseNotesNavigation;
				store.add(toDisposable(initializer(targetDocument, navigationWindow)));
			}

			async function render(): Promise<void> {
				await timeout(0);
				for (const notify of resizeObservers) {
					notify();
				}
				const callbacks = [...frames.values()];
				frames.clear();
				callbacks.forEach(callback => callback(0));
			}

			async function scrollTo(id: string): Promise<void> {
				const target = targetDocument.getElementById(id)!;
				targetWindow.scrollTo(0, target.getBoundingClientRect().top + targetWindow.scrollY - 24);
				targetWindow.dispatchEvent(new targetWindow.Event('scroll'));
				await render();
			}

			function current(): string[] {
				return links.filter(link => link.getAttribute('aria-current') === 'location').map(link => link.textContent!);
			}

			test('tracks major sections in both directions without moving focus or changing the URL', async () => {
				initialize();
				links[0].focus();
				const url = targetWindow.location.href;
				const states: string[][] = [];
				await render();
				states.push(current());
				for (const id of ['first', 'subsection', 'second', 'first']) {
					await scrollTo(id);
					states.push(current());
				}
				targetWindow.scrollTo(0, 0);
				await render();
				states.push(current());
				assert.deepStrictEqual({
					states,
					focused: targetDocument.activeElement === links[0],
					url: targetWindow.location.href,
				}, {
					states: [[], ['first'], ['first'], ['second'], ['first'], []],
					focused: true,
					url,
				});
			});

			test('uses restored scroll positions and keeps the final section current at the bottom', async () => {
				await scrollTo('second');
				initialize();
				await render();
				const restored = current();
				targetWindow.scrollTo(0, targetDocument.documentElement.scrollHeight);
				await render();
				assert.deepStrictEqual({ restored, bottom: current() }, { restored: ['second'], bottom: ['last'] });
			});

			test('tracks native anchor jumps and encoded fragments', async () => {
				targetDocument.getElementById('second')!.id = 'second: section';
				links[1].setAttribute('href', '#second%3A%20section');
				initialize();
				const navigated = new DeferredPromise<void>();
				store.add(addDisposableListener(targetWindow, 'hashchange', () => { navigated.complete(); }));
				links[1].click();
				await navigated.p;
				await render();
				assert.deepStrictEqual({ current: current(), hash: targetWindow.location.hash }, {
					current: ['second'],
					hash: '#second%3A%20section',
				});
			});

			test('bounds heading layout reads for a long table of contents', async () => {
				const headings = Array.from({ length: 128 }, (_, index) => {
					const heading = $('h2', { id: `section-${index}` }, `Section ${index}`);
					heading.style.margin = '0';
					heading.style.height = '100px';
					return heading;
				});
				links = headings.map(heading => $<HTMLAnchorElement>('a', { href: `#${heading.id}` }, heading.id));
				targetDocument.getElementById('toc-nav')!.replaceChildren(...links);
				targetDocument.querySelector('.notes-main')!.replaceChildren(...headings);
				await scrollTo('section-96');
				const layoutReads = headings.map(heading => {
					const read = spy(heading, 'getBoundingClientRect');
					store.add(toDisposable(() => read.restore()));
					return read;
				});
				initialize();
				await render();
				assert.deepStrictEqual({
					current: current(),
					layoutReads: layoutReads.reduce((count, read) => count + read.callCount, 0),
				}, {
					current: ['section-96'],
					layoutReads: 7,
				});
			});

			test('updates when content above the reading position changes height', async () => {
				initialize();
				await scrollTo('second');
				targetDocument.getElementById('first')!.nextElementSibling!.setAttribute('style', 'height: 700px; margin: 0');
				await render();
				assert.deepStrictEqual(current(), ['first']);
			});

			test('updates the bottom boundary when the viewport is resized', async () => {
				targetDocument.getElementById('last')!.nextElementSibling!.setAttribute('style', 'height: 600px; margin: 0');
				initialize();
				await scrollTo('second');
				targetWindow.frameElement!.setAttribute('style', 'position: fixed; top: 0; left: 0; width: 600px; height: 1600px');
				await render();
				assert.deepStrictEqual(current(), ['last']);
			});

			test('handles missing targets and duplicate links without multiple current entries', async () => {
				targetDocument.getElementById('second')!.remove();
				const duplicate = $<HTMLAnchorElement>('a', { href: '#first' }, 'duplicate');
				links.push(duplicate);
				targetDocument.getElementById('toc-nav')!.appendChild(duplicate);
				initialize();
				await scrollTo('subsection');
				assert.deepStrictEqual(current(), ['first']);
			});

			test('allows documents without a TOC or without matching targets', async () => {
				links.forEach(link => link.setAttribute('href', '#missing'));
				initialize();
				targetDocument.getElementById('toc-nav')!.remove();
				initialize();
				await render();
				assert.deepStrictEqual(current(), []);
			});

			test('stops pending and future updates when the document is hidden', async () => {
				initialize();
				await scrollTo('first');
				targetWindow.dispatchEvent(new targetWindow.Event('resize'));
				targetWindow.dispatchEvent(new targetWindow.PageTransitionEvent('pagehide'));
				await scrollTo('second');
				targetWindow.dispatchEvent(new targetWindow.Event('resize'));
				targetDocument.getElementById('first')!.nextElementSibling!.setAttribute('style', 'height: 700px; margin: 0');
				await render();
				assert.deepStrictEqual({ current: current(), frames: frames.size, observers: resizeObservers.size }, {
					current: ['first'], frames: 0, observers: 0,
				});
			});
		});
	}
});
