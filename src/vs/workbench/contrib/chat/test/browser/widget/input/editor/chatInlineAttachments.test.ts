/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../../base/test/common/timeTravelScheduler.js';
import { EditorAutoIndentStrategy } from '../../../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../../../../editor/common/core/selection.js';
import { MoveLinesCommand } from '../../../../../../../../editor/contrib/linesOperations/browser/moveLinesCommand.js';
import { CopyLinesCommand } from '../../../../../../../../editor/contrib/linesOperations/browser/copyLinesCommand.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService, IFileSystemWatcher } from '../../../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IHoverService } from '../../../../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../../../../platform/hover/browser/hoverService.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILayoutService } from '../../../../../../../../platform/layout/browser/layoutService.js';
import { AccessibleViewType } from '../../../../../../../../platform/accessibility/browser/accessibleView.js';
import { ISharedWebContentExtractorService } from '../../../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { ChatAttachmentModel } from '../../../../../browser/attachments/chatAttachmentModel.js';
import { ChatDynamicVariableModel } from '../../../../../browser/attachments/chatDynamicVariables.js';
import { IChatAttachmentResolveService } from '../../../../../browser/attachments/chatAttachmentResolveService.js';
import { IChatWidget } from '../../../../../browser/chat.js';
import { ChatInlineAttachments } from '../../../../../browser/widget/input/editor/chatInlineAttachments.js';
import { IChatWidgetContrib } from '../../../../../browser/widget/chatWidget.js';
import { ChatContextKeys } from '../../../../../common/actions/chatContextKeys.js';
import { IChatRequestVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable, toAttachedContextDynamicVariable } from '../../../../../common/attachments/chatVariables.js';
import { ChatConfiguration } from '../../../../../common/constants.js';
import { IParsedChatRequest } from '../../../../../common/requestParser/chatParserTypes.js';
import { workbenchInstantiationService } from '../../../../../../../test/browser/workbenchTestServices.js';
import { GitHubResourceDetailsResolver } from '../../../../../../github/browser/githubResourceDetails.js';
import { IWorkbenchGitHubService } from '../../../../../../../services/github/common/githubService.js';

suite('ChatInlineAttachments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestInput {
		readonly editor: ITestCodeEditor;
		readonly attachments: ChatAttachmentModel;
		readonly controller: ChatInlineAttachments;
		readonly instantiationService: TestInstantiationService;
		/** Adds a reference to the input, as accepting a completion does. */
		addReference(reference: IDynamicVariable): void;
		/** Whether the pill right before the cursor is active, which Enter opens. */
		isActive(): boolean;
		/** The prompt that the input stands for, and the ids of its attachments. */
		state(): { prompt: string; attachments: string[] };
		readonly attachmentElements: HTMLElement[];
		readonly attachmentResolvers: (GitHubResourceDetailsResolver | undefined)[];
		setSessionResource(resource: URI): void;
	}

	/**
	 * @param showsPills Whether the input's host shows pills, which a host
	 * whose chat widget does not own the input, such as the Automation dialog's,
	 * does not.
	 */
	function createInput(text: string, showsPills = true, hoverContent?: HTMLElement | (() => HTMLElement), hoverService: IHoverService = NullHoverService): ITestInput {
		const disposables = store.add(new DisposableStore());
		const configurationService = new TestConfigurationService({ [ChatConfiguration.InlineAttachmentsEnabled]: true });
		const instantiationService = createCodeEditorServices(disposables, new ServiceCollection([IConfigurationService, configurationService]));
		instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
			override getUriLabel(uri: URI): string { return uri.path; }
		});
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override createWatcher(): IFileSystemWatcher { return { onDidChange: Event.None, dispose: () => { } }; }
		});
		instantiationService.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { });
		instantiationService.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { });
		instantiationService.stub(IHoverService, hoverService);
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({ onDidChangeDefaultClient: Event.None }));

		const model = disposables.add(instantiateTextModel(instantiationService, text));
		const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
		if (hoverService !== NullHoverService) {
			const sandbox = sinon.createSandbox();
			disposables.add(toDisposable(() => sandbox.restore()));
			const host = dom.$('div', { tabIndex: 0 });
			sandbox.stub(editor, 'getContainerDomNode').returns(host);
			sandbox.stub(editor, 'focus').callsFake(() => host.focus());
			sandbox.stub(editor, 'hasTextFocus').callsFake(() => dom.getActiveElement() === host);
			sandbox.stub(editor, 'hasWidgetFocus').callsFake(() => dom.isAncestorOfActiveElement(host));
		}
		const attachments = disposables.add(instantiationService.createInstance(ChatAttachmentModel));
		const onDidChangeParsedInput = disposables.add(new Emitter<void>());
		const onDidChangeReferences = disposables.add(new Emitter<void>());
		const references: IDynamicVariable[] = [];
		const dynamicVariableModel = upcastPartial<ChatDynamicVariableModel>({
			variables: references,
			onDidChangeReferences: onDidChangeReferences.event,
			addReference: reference => {
				references.push(reference);
				onDidChangeReferences.fire();
			},
		});
		const widget = new class extends mock<IChatWidget>() {
			override readonly inputEditor = editor;
			override readonly parsedInput: IParsedChatRequest = { text: '', parts: [] };
			override readonly onDidChangeParsedInput = onDidChangeParsedInput.event;
			override getContrib<T extends IChatWidgetContrib>(id: string): T | undefined {
				return id === ChatDynamicVariableModel.ID ? dynamicVariableModel as IChatWidgetContrib as T : undefined;
			}
			override refreshParsedInput(): void { }
		};
		const attachmentElements: HTMLElement[] = [];
		const attachmentResolvers: (GitHubResourceDetailsResolver | undefined)[] = [];
		let sessionResource = URI.parse('chat-session:test-1');
		const controller = disposables.add(instantiationService.createInstance(ChatInlineAttachments, editor, attachments, {
			widget: showsPills ? widget : undefined,
			get sessionResource() { return sessionResource; },
			createAttachmentWidget: (attachment: IChatRequestVariableEntry, container: HTMLElement, options: { gitHubResourceDetailsResolver?: GitHubResourceDetailsResolver }) => {
				attachmentResolvers.push(options.gitHubResourceDetailsResolver);
				const element = dom.append(container, dom.$('span.chat-attached-context-attachment', undefined, attachment.name));
				const preview = typeof hoverContent === 'function' ? hoverContent() : hoverContent;
				attachmentElements.push(element);
				return {
					element, onDidDelete: Event.None, onDidOpen: Event.None,
					supportsPreview: !!hoverContent,
					getPreviewHoverContent: () => preview ? {
						element: preview,
						get tabbableElements() { return [...preview.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]; },
					} : undefined,
					dispose: () => element.remove(),
				};
			},
			removeAttachments: (removed: readonly IChatRequestVariableEntry[]) => attachments.delete(...removed.map(attachment => attachment.id)),
		}));

		return {
			editor,
			attachments,
			controller,
			instantiationService,
			attachmentElements,
			attachmentResolvers,
			setSessionResource: resource => { sessionResource = resource; },
			addReference: reference => dynamicVariableModel.addReference(reference),
			isActive: () => !!editor.invokeWithinContext(accessor => accessor.get(IContextKeyService).getContextKeyValue<boolean>(ChatContextKeys.inputInlineAttachmentActive.key)),
			state: () => ({
				prompt: controller.project()?.text ?? editor.getValue(),
				attachments: attachments.attachments.map(attachment => attachment.id),
			}),
		};
	}

	function focusPreview(input: ITestInput): void {
		input.editor.getContainerDomNode().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
	}

	test('the input owns one GitHub resolver across pill rerenders and warms new arrivals through shared retention', async () => {
		const sandbox = sinon.createSandbox();
		store.add(toDisposable(() => sandbox.restore()));
		const prefetch = sandbox.stub(GitHubResourceDetailsResolver.prototype, 'prefetchIssue').resolves(undefined);
		const input = createInput('review ');
		input.editor.setPosition(new Position(1, 8));
		const issue = (number: number): IChatRequestVariableEntry => ({
			kind: 'generic',
			id: `github-context:https://github.com/microsoft/vscode/issues/${number}`,
			name: `microsoft/vscode#${number}`,
			value: '',
		});
		input.attachments.addContext(issue(123));
		await settle();
		const resolver = input.attachmentResolvers[0];
		input.controller.refresh();
		await settle();
		input.attachments.addContext(issue(456));
		await settle();
		input.setSessionResource(URI.parse('chat-session:test-2'));
		input.attachments.delete(issue(123).id, issue(456).id);
		input.editor.getModel()!.setValue('review ');
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(issue(789));
		await settle();
		assert.deepStrictEqual({
			hasResolver: !!resolver,
			sameResolver: input.attachmentResolvers.every(value => value === resolver),
			warmed: prefetch.args.map(([target]) => target.number),
		}, { hasResolver: true, sameResolver: true, warmed: [456] });
	});

	test('keyboard selection requests a delayed preview without changing the draft and restores Accessible View focus', async () => {
		const preview = dom.$('div');
		const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
		let shown = 0;
		let disposed = 0;
		const hoverService: IHoverService = {
			...NullHoverService,
			showDelayedHover: options => {
				shown++;
				assert.strictEqual(options.content, preview);
				dom.getActiveDocument().body.appendChild(preview);
				options.onDidShow?.();
				let isDisposed = false;
				return {
					get isDisposed() { return isDisposed; },
					dispose: () => {
						if (!isDisposed) {
							isDisposed = true;
							disposed++;
							preview.remove();
						}
					},
				};
			},
		};
		const input = createInput('review ', true, preview, hoverService);
		const host = input.editor.getContainerDomNode();
		dom.getActiveDocument().body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		assert.strictEqual(shown, 0, 'Adding an attachment must not open the preview');

		input.editor.setPosition(new Position(1, 8), 'keyboard');
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		assert.strictEqual(shown, 1, 'Arrow navigation delegates preview timing to the hover service');
		focusPreview(input);
		const before = input.state();
		const press = (key: string, shiftKey = false) => {
			const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
			dom.getActiveElement()!.dispatchEvent(event);
			return event.defaultPrevented;
		};
		const opened = shown;
		const linkFocused = dom.getActiveElement() === link;
		const provider = store.add(input.controller.getAccessiblePreviewProvider(AccessibleViewType.View)!);
		assert.strictEqual(ChatInlineAttachments.getPreviewOwner(link), input.controller);
		assert.ok(provider.provideContent().includes('Repository'));
		const observation = provider.onOpen?.();
		if (observation) {
			store.add(observation);
		}
		const accessibleHost = dom.append(dom.getActiveDocument().body, dom.$('div', { tabIndex: 0 }));
		store.add(toDisposable(() => accessibleHost.remove()));
		accessibleHost.focus();
		accessibleHost.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		assert.strictEqual(disposed, 0, 'Accessible View must not dispose the preview it reads');
		provider.onClose();
		assert.strictEqual(dom.getActiveElement(), link, 'Closing Accessible View restores its invoking link');
		provider.dispose();
		const backTabConsumed = press('Tab', true);
		const inputFocused = input.editor.hasTextFocus();
		const escaped = disposed;
		input.controller.refresh();
		await settle();
		assert.strictEqual(shown, 1, 'Rerender must not reopen an Escape-dismissed preview');
		input.editor.setPosition(new Position(1, 8), 'keyboard');
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		focusPreview(input);
		input.controller.refresh();
		await settle();
		assert.strictEqual(shown, 3, 'Rerender must reopen a previously visible preview');
		input.editor.setPosition(new Position(1, 10), 'keyboard');
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		focusPreview(input);
		const outside = dom.append(dom.getActiveDocument().body, dom.$('button'));
		store.add(toDisposable(() => outside.remove()));
		outside.focus();
		assert.strictEqual(dom.getActiveElement(), outside);
		outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		const closedOnBlur = disposed;
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8), 'keyboard');
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		focusPreview(input);
		input.editor.setSelection(new Selection(1, 8, 1, 9), 'keyboard');

		assert.deepStrictEqual({
			opened, linkFocused, backTabConsumed, inputFocused, escaped,
			closedOnBlur, shown, disposed, unchanged: input.state(),
		}, {
			opened: 1, linkFocused: true, backTabConsumed: true, inputFocused: true, escaped: 1,
			closedOnBlur: 4, shown: 5, disposed: 5, unchanged: before,
		});
	});

	test('Accessible View resnapshots details that finish loading while its help is open', async () => {
		const preview = dom.$('div', undefined, 'Loading reference details');
		dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode/pull/123' }, 'Open Pull Request #123'));
		preview.setAttribute('aria-busy', 'true');
		const input = createInput('review ', true, preview, {
			...NullHoverService,
			showDelayedHover: () => {
				dom.getActiveDocument().body.appendChild(preview);
				return { isDisposed: false, setVisible: () => { }, dispose: () => preview.remove() };
			},
		});
		const host = input.editor.getContainerDomNode();
		dom.getActiveDocument().body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		focusPreview(input);
		const provider = store.add(input.controller.getAccessiblePreviewProvider(AccessibleViewType.View)!);
		const firstOpen = provider.onOpen?.();
		assert.ok(firstOpen);
		store.add(firstOpen);
		const initial = provider.provideContent();
		firstOpen.dispose();
		preview.replaceChildren(
			dom.$('h3', undefined, 'Resolved reference title'),
			dom.$('div', undefined, 'Merged'),
			dom.$('p', undefined, 'Resolved reference description'));
		preview.setAttribute('aria-busy', 'false');
		await settle();
		const whileHelpOpen = provider.provideContent();
		const reopened = provider.onOpen?.();
		assert.ok(reopened);
		store.add(reopened);
		assert.deepStrictEqual({ initial, whileHelpOpen, restored: provider.provideContent() }, {
			initial: 'Loading reference detailsOpen Pull Request #123',
			whileHelpOpen: 'Loading reference detailsOpen Pull Request #123',
			restored: 'Resolved reference title\nMerged\nResolved reference description',
		});
	});

	function createRealHoverService(fixture: HTMLElement, delay = 0): HoverService {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ 'workbench.hover.delay': delay }));
		instantiationService.stub(ILayoutService, {
			activeContainer: fixture,
			mainContainer: fixture,
			getContainer: () => fixture,
			onDidLayoutContainer: Event.None,
		});
		const hoverService = store.add(instantiationService.createInstance(HoverService));
		instantiationService.stub(IHoverService, hoverService);
		return hoverService;
	}

	test('Accessible View preserves its hidden delayed preview when a toolbar requests an instant hover', async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div');
		const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
		const hoverService = createRealHoverService(fixture);
		const input = createInput('review ', true, preview, hoverService);
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		host.appendChild(input.attachmentElements[0].closest('.chat-inline-attachment')!);
		input.editor.setPosition(new Position(1, 2), 'keyboard');
		input.attachmentElements[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await settle();
		focusPreview(input);
		const provider = store.add(input.controller.getAccessiblePreviewProvider(AccessibleViewType.View)!);
		const opened = provider.onOpen?.();
		assert.ok(opened);
		store.add(opened);
		const toolbarAction = dom.append(fixture, dom.$('button', undefined, 'Accessible View action'));
		const tooltip = hoverService.showInstantHover({ content: 'Toolbar tooltip', target: toolbarAction });
		const preserved = preview.isConnected;
		opened.dispose();
		provider.onClose?.();
		assert.deepStrictEqual({
			tooltipRejected: !tooltip,
			preserved,
			returnedToLink: dom.getActiveElement() === link,
			ownerRetained: ChatInlineAttachments.getPreviewOwner(link) === input.controller,
		}, { tooltipRejected: true, preserved: true, returnedToLink: true, ownerRetained: true });
	});

	for (const state of ['loading', 'unavailable']) {
		test(`${state} hover uses passive shared presentation without a focusable placeholder`, async () => {
			const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
			store.add(toDisposable(() => fixture.remove()));
			const preview = dom.$('.chat-pill-hover-content', undefined, state === 'loading' ? 'Pull Request #123' : 'https://github.com/microsoft/vscode/pull/123');
			preview.setAttribute('aria-busy', String(state === 'loading'));
			const input = createInput('review ', true, preview, createRealHoverService(fixture));
			const host = input.editor.getContainerDomNode();
			fixture.appendChild(host);
			input.editor.focus();
			input.editor.setPosition(new Position(1, 8));
			input.attachments.addContext(file('a.ts'));
			await settle();
			const pill = input.attachmentElements[0].closest('.chat-inline-attachment');
			assert.ok(pill);
			host.appendChild(pill);
			input.editor.setPosition(new Position(1, 9), 'keyboard');
			await timeout(0);
			assert.deepStrictEqual({
				editorFocused: input.editor.hasTextFocus(),
				contentFocusable: preview.hasAttribute('tabindex'),
				contentFocused: dom.getActiveElement() === preview,
				role: preview.closest('.monaco-hover')?.getAttribute('role'),
				links: preview.querySelectorAll('a,button').length,
				accessiblePreview: input.controller.getAccessiblePreviewProvider(AccessibleViewType.View),
			}, { editorFocused: true, contentFocusable: false, contentFocused: false, role: 'tooltip', links: 0, accessiblePreview: undefined });
			host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
			assert.deepStrictEqual({ dismissed: !preview.isConnected, editorFocused: input.editor.hasTextFocus() }, { dismissed: true, editorFocused: true });
		});
	}

	for (const type of [AccessibleViewType.View, AccessibleViewType.Help]) {
		test(`${type} mouse interaction preserves the real hover and invoking link`, async () => {
			const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
			store.add(toDisposable(() => fixture.remove()));
			const hoverService = createRealHoverService(fixture);
			const preview = dom.$('div');
			const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode/pull/123' }, 'Open Pull Request #123'));
			const input = createInput('review ', true, preview, hoverService);
			const host = input.editor.getContainerDomNode();
			fixture.appendChild(host);
			input.editor.focus();
			input.editor.setPosition(new Position(1, 8));
			input.attachments.addContext(file('a.ts'));
			await settle();
			const pill = input.attachmentElements[0].closest('.chat-inline-attachment');
			assert.ok(pill);
			host.appendChild(pill);
			input.editor.setPosition(new Position(1, 9), 'keyboard');
			await timeout(0);
			focusPreview(input);
			const provider = store.add(input.controller.getAccessiblePreviewProvider(type)!);
			const observation = provider.onOpen?.();
			if (observation) {
				store.add(observation);
			}
			const accessibleEditor = dom.append(fixture, dom.$('div', { tabIndex: 0 }));
			const toolbarButton = dom.append(accessibleEditor, dom.$('button'));
			accessibleEditor.focus();
			accessibleEditor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			const afterEditorClick = ChatInlineAttachments.getPreviewOwner(link) === input.controller;
			toolbarButton.focus();
			toolbarButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			const afterToolbarClick = ChatInlineAttachments.getPreviewOwner(link) === input.controller;
			provider.onClose();
			const returnedToInvokingLink = dom.getActiveElement() === link;
			const previewConnected = preview.isConnected;
			link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			assert.deepStrictEqual({
				afterEditorClick,
				afterToolbarClick,
				previewConnected,
				returnedToInvokingLink,
				previewDismissed: !preview.isConnected,
				escapeReturnsToEditor: input.editor.hasTextFocus(),
			}, { afterEditorClick: true, afterToolbarClick: true, previewConnected: true, returnedToInvokingLink: true, previewDismissed: true, escapeReturnsToEditor: true });
		});

		test(`${type} preserves the invoking link while existing details refresh`, async () => {
			const preview = dom.$('div');
			preview.setAttribute('aria-busy', 'true');
			const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
			const input = createInput('review ', true, preview, {
				...NullHoverService,
				showDelayedHover: () => {
					dom.getActiveDocument().body.appendChild(preview);
					return { isDisposed: false, setVisible: () => { }, dispose: () => preview.remove() };
				},
			});
			const host = input.editor.getContainerDomNode();
			dom.getActiveDocument().body.appendChild(host);
			store.add(toDisposable(() => host.remove()));
			input.editor.focus();
			input.editor.setPosition(new Position(1, 8));
			input.attachments.addContext(file('a.ts'));
			await settle();
			input.editor.setPosition(new Position(1, 9), 'keyboard');
			focusPreview(input);
			const provider = store.add(input.controller.getAccessiblePreviewProvider(type)!);
			const observation = provider.onOpen?.();
			if (observation) {
				store.add(observation);
			}
			const accessibleHost = dom.append(dom.getActiveDocument().body, dom.$('div', { tabIndex: 0 }));
			store.add(toDisposable(() => accessibleHost.remove()));
			accessibleHost.focus();
			dom.append(preview, dom.$('p', undefined, 'Resolved reference details'));
			preview.setAttribute('aria-busy', 'false');
			await settle();
			const readingPreserved = dom.getActiveElement() === accessibleHost;
			const placeholderTabIndex = preview.getAttribute('tabindex');
			const textUpdated = type === AccessibleViewType.Help || provider.provideContent().includes('Resolved reference details');
			provider.onClose();
			assert.deepStrictEqual({
				readingPreserved,
				placeholderTabIndex,
				textUpdated,
				returnedToLink: dom.getActiveElement() === link,
			}, { readingPreserved: true, placeholderTabIndex: null, textUpdated: true, returnedToLink: true });
		});

		test(`${type} retains preview ownership through a deferred composer refresh`, async () => {
			const preview = dom.$('div');
			dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
			const reference = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode/pull/123' }, 'Reference'));
			let shown = 0;
			let disposed = 0;
			let visible = true;
			const input = createInput('review ', true, preview, {
				...NullHoverService,
				showDelayedHover: () => {
					shown++;
					dom.getActiveDocument().body.appendChild(preview);
					let isDisposed = false;
					return {
						get isDisposed() { return isDisposed; },
						setVisible: value => { visible = value; },
						dispose: () => {
							if (!isDisposed) {
								isDisposed = true;
								disposed++;
								preview.remove();
							}
						},
					};
				},
			});
			const host = input.editor.getContainerDomNode();
			dom.getActiveDocument().body.appendChild(host);
			store.add(toDisposable(() => host.remove()));
			input.editor.focus();
			input.editor.setPosition(new Position(1, 8));
			input.attachments.addContext(file('a.ts'));
			await settle();
			input.editor.setPosition(new Position(1, 9), 'keyboard');
			focusPreview(input);
			reference.focus();
			const provider = store.add(input.controller.getAccessiblePreviewProvider(type)!);
			const observation = provider.onOpen?.();
			if (observation) {
				store.add(observation);
			}
			const accessibleHost = dom.append(dom.getActiveDocument().body, dom.$('div', { tabIndex: 0 }));
			store.add(toDisposable(() => accessibleHost.remove()));
			accessibleHost.focus();
			input.controller.refresh();
			await settle();
			const reading = {
				shown, disposed, visible,
				focusPreserved: dom.getActiveElement() === accessibleHost,
				ownerPreserved: ChatInlineAttachments.getPreviewOwner(reference) === input.controller,
				widgetRenders: input.attachmentElements.length,
			};
			provider.onClose();
			provider.dispose();
			await settle();
			const returned = { shown, disposed, visible, focusPreserved: dom.getActiveElement() === reference };
			input.controller.openActivePill();
			await settle();
			assert.deepStrictEqual({
				reading, returned,
				dismissed: { shown, disposed, editorFocused: input.editor.hasTextFocus(), widgetRenders: input.attachmentElements.length },
			}, {
				reading: { shown: 1, disposed: 0, visible: false, focusPreserved: true, ownerPreserved: true, widgetRenders: 1 },
				returned: { shown: 1, disposed: 0, visible: true, focusPreserved: true },
				dismissed: { shown: 1, disposed: 1, editorFocused: true, widgetRenders: 2 },
			});
		});
	}

	test('unresolved details stay passive and Tab reaches links only after they arrive', async () => {
		const preview = dom.$('div');
		preview.setAttribute('aria-busy', 'true');
		const input = createInput('review ', true, preview, {
			...NullHoverService,
			showDelayedHover: () => {
				dom.getActiveDocument().body.appendChild(preview);
				return { isDisposed: false, dispose: () => preview.remove() };
			},
		});
		const host = input.editor.getContainerDomNode();
		dom.getActiveDocument().body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 8), 'keyboard');
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		assert.notStrictEqual(dom.getActiveElement(), preview);
		assert.ok(input.editor.hasTextFocus());
		assert.strictEqual(preview.hasAttribute('tabindex'), false);
		assert.strictEqual(input.controller.getAccessiblePreviewProvider(AccessibleViewType.View), undefined);
		const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
		preview.setAttribute('aria-busy', 'false');
		await settle();
		assert.deepStrictEqual({
			editorStillFocused: input.editor.hasTextFocus(),
			role: preview.getAttribute('role'),
			label: preview.getAttribute('aria-label'),
		}, { editorStillFocused: true, role: null, label: null });
		host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		assert.strictEqual(dom.getActiveElement(), link);
		input.attachments.delete('file:a.ts');
		await settle();
		assert.strictEqual(preview.isConnected, false);
	});

	for (const shiftKey of [false, true]) {
		test(`${shiftKey ? 'Shift+Tab' : 'Tab'} leaves a preview with no interactive controls`, async () => {
			const preview = dom.$('div');
			const input = createInput('review ', true, preview, {
				...NullHoverService,
				showDelayedHover: () => {
					dom.getActiveDocument().body.appendChild(preview);
					return { isDisposed: false, dispose: () => preview.remove() };
				},
			});
			const host = input.editor.getContainerDomNode();
			dom.getActiveDocument().body.appendChild(host);
			store.add(toDisposable(() => host.remove()));
			input.editor.focus();
			input.editor.setPosition(new Position(1, 8));
			input.attachments.addContext(file('a.ts'));
			await settle();
			input.editor.setPosition(new Position(1, 9), 'keyboard');
			const draft = input.editor.getValue();
			assert.deepStrictEqual({
				editorFocused: input.editor.hasTextFocus(),
				focusablePlaceholder: preview.hasAttribute('tabindex'),
				accessiblePreview: input.controller.getAccessiblePreviewProvider(AccessibleViewType.View),
			}, { editorFocused: true, focusablePlaceholder: false, accessiblePreview: undefined });
			const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
			preview.dispatchEvent(event);
			assert.deepStrictEqual({
				dismissed: !preview.isConnected,
				editorFocused: input.editor.hasTextFocus(),
				consumed: event.defaultPrevented,
				draftUnchanged: input.editor.getValue() === draft,
			}, { dismissed: true, editorFocused: true, consumed: true, draftUnchanged: true });
		});
	}

	test('hover requests a preview while click and Enter activate the attachment', async () => {
		const preview = dom.$('div');
		dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
		let shown = 0;
		const input = createInput('review ', true, preview, {
			...NullHoverService,
			showDelayedHover: () => {
				shown++;
				dom.getActiveDocument().body.appendChild(preview);
				return { isDisposed: false, dispose: () => preview.remove() };
			},
		});
		const host = input.editor.getContainerDomNode();
		dom.getActiveDocument().body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 2), 'keyboard');
		const before = input.state();
		const position = input.editor.getPosition();
		let opened = 0;
		store.add(dom.addDisposableListener(input.attachmentElements[0], dom.EventType.CLICK, () => opened++));
		input.attachmentElements[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		input.attachmentElements[0].click();
		const mouse = { shown, opened, focusStayedInComposer: input.editor.hasTextFocus(), position: input.editor.getPosition(), state: input.state() };
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		const openedByEnter = input.controller.openActivePill();
		assert.deepStrictEqual({ mouse, openedByEnter, opened, dismissed: !preview.isConnected }, {
			mouse: { shown: 1, opened: 1, focusStayedInComposer: true, position, state: before },
			openedByEnter: true, opened: 2, dismissed: true,
		});
	});

	for (const trigger of ['mouse', 'keyboard']) {
		for (const delay of [500, 700]) {
			test(`${trigger} preview waits for the configured ${delay}ms hover delay without stealing focus`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
				const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
				store.add(toDisposable(() => fixture.remove()));
				const preview = dom.$('div');
				const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode/pull/123' }, 'Open Pull Request #123'));
				const input = createInput('review ', true, preview, createRealHoverService(fixture, delay));
				const host = input.editor.getContainerDomNode();
				fixture.appendChild(host);
				input.editor.focus();
				input.editor.setPosition(new Position(1, 8));
				input.attachments.addContext(file('a.ts'));
				await settle();
				const pill = input.attachmentElements[0].closest('.chat-inline-attachment');
				assert.ok(pill);
				host.appendChild(pill);
				input.editor.setPosition(new Position(1, 2), 'keyboard');
				if (trigger === 'mouse') {
					input.attachmentElements[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				} else {
					input.editor.setPosition(new Position(1, 9), 'keyboard');
				}
				await timeout(delay - 1);
				const beforeDeadline = { visible: preview.isConnected, expanded: input.attachmentElements[0].getAttribute('aria-expanded') === 'true' };
				await timeout(1);
				const afterDeadline = { visible: preview.isConnected, expanded: input.attachmentElements[0].getAttribute('aria-expanded'), editorFocused: input.editor.hasTextFocus() };
				focusPreview(input);
				assert.deepStrictEqual({ beforeDeadline, afterDeadline, enteredLink: dom.getActiveElement() === link }, {
					beforeDeadline: { visible: false, expanded: false },
					afterDeadline: { visible: true, expanded: 'true', editorFocused: true },
					enteredLink: true,
				});
			}));
		}
	}

	test('moving the keyboard selection away cancels the pending preview', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div', undefined, 'Details');
		const input = createInput('review ', true, preview, createRealHoverService(fixture, 500));
		fixture.appendChild(input.editor.getContainerDomNode());
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		await timeout(499);
		input.editor.setPosition(new Position(1, 10), 'keyboard');
		await timeout(501);
		assert.deepStrictEqual({ visible: preview.isConnected, editorFocused: input.editor.hasTextFocus() }, { visible: false, editorFocused: true });
	}));

	test('moving between visible pointer previews shares the hover group without a second delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		let sequence = 0;
		const previews: HTMLElement[] = [];
		const input = createInput('review ', true, () => {
			const preview = dom.$('div', undefined, `Reference ${++sequence}`);
			previews.push(preview);
			return preview;
		}, createRealHoverService(fixture, 500));
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'), file('b.ts'));
		await settle();
		for (const target of input.attachmentElements) {
			host.appendChild(target.closest('.chat-inline-attachment')!);
		}
		input.editor.setPosition(new Position(1, 2), 'keyboard');
		input.attachmentElements[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(500);
		const firstShown = previews[0].isConnected;
		input.attachmentElements[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		assert.deepStrictEqual({
			firstShown,
			firstDismissed: !previews[0].isConnected,
			secondShownImmediately: previews[1].isConnected,
			secondExpanded: input.attachmentElements[1].getAttribute('aria-expanded'),
		}, { firstShown: true, firstDismissed: true, secondShownImmediately: true, secondExpanded: 'true' });
	}));

	test('a rejected pointer replacement preserves the locked keyboard preview and its owner', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const previews: HTMLElement[] = [];
		const input = createInput('review ', true, () => {
			const preview = dom.$('div');
			dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, `Reference ${previews.length + 1}`));
			previews.push(preview);
			return preview;
		}, createRealHoverService(fixture, 500));
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'), file('b.ts'));
		await settle();
		for (const target of input.attachmentElements) {
			host.appendChild(target.closest('.chat-inline-attachment')!);
		}
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		await timeout(500);
		const previewId = previews[0].id;
		input.attachmentElements[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(500);
		focusPreview(input);
		assert.deepStrictEqual({
			firstVisible: previews[0].isConnected,
			secondVisible: previews[1].isConnected,
			firstOwner: ChatInlineAttachments.getPreviewOwner(previews[0]) === input.controller,
			firstControls: input.attachmentElements[0].getAttribute('aria-controls'),
			focusedText: dom.getActiveElement()?.textContent,
		}, { firstVisible: true, secondVisible: false, firstOwner: true, firstControls: previewId, focusedText: 'Reference 1' });
	}));

	test('modified Tab shortcuts are not intercepted at either preview boundary', async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div');
		const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
		const input = createInput('review ', true, preview, createRealHoverService(fixture));
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		host.appendChild(input.attachmentElements[0].closest('.chat-inline-attachment')!);
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		await settle();
		focusPreview(input);
		const modifiers = ['ctrlKey', 'altKey', 'metaKey'] as const;
		const results: { modifier: string; shiftKey: boolean; prevented: boolean; previewVisible: boolean }[] = [];
		for (const modifier of modifiers) {
			for (const shiftKey of [false, true]) {
				const event = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey, [modifier]: true, bubbles: true, cancelable: true });
				link.dispatchEvent(event);
				results.push({ modifier, shiftKey, prevented: event.defaultPrevented, previewVisible: preview.isConnected });
			}
		}
		assert.deepStrictEqual(results, modifiers.flatMap(modifier => [false, true].map(shiftKey => ({ modifier, shiftKey, prevented: false, previewVisible: true }))));
	});

	test('grouped duplicate references preserve the owner of their shared cached preview', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div');
		const link = dom.append(preview, dom.$('a', { href: 'https://github.com/microsoft/vscode' }, 'Repository'));
		const input = createInput('review ', true, preview, createRealHoverService(fixture, 500));
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 1), 'keyboard');
		input.editor.executeCommand('test', new CopyLinesCommand(input.editor.getSelection()!, true));
		await settle();
		const targets = input.attachmentElements.slice(-2);
		for (const target of targets) {
			host.appendChild(target.closest('.chat-inline-attachment')!);
		}
		input.editor.setPosition(new Position(1, 2), 'keyboard');
		targets[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(500);
		targets[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		focusPreview(input);
		const owner = ChatInlineAttachments.getPreviewOwner(link);
		const provider = owner?.getAccessiblePreviewProvider(AccessibleViewType.View);
		assert.deepStrictEqual({
			visible: preview.isConnected,
			ownerRetained: owner === input.controller,
			linkFocused: dom.getActiveElement() === link,
			accessibleText: provider?.provideContent(),
		}, { visible: true, ownerRetained: true, linkFocused: true, accessibleText: 'Repository' });
		provider?.dispose();
	}));

	test('rerender restarts a pending preview for the still-selected keyboard pill', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div', undefined, 'Details');
		const input = createInput('review ', true, preview, createRealHoverService(fixture, 500));
		fixture.appendChild(input.editor.getContainerDomNode());
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.getContainerDomNode().appendChild(input.attachmentElements[0].closest('.chat-inline-attachment')!);
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		await timeout(250);
		input.controller.refresh();
		await settle();
		await timeout(500);
		assert.deepStrictEqual({ visible: preview.isConnected, editorFocused: input.editor.hasTextFocus() }, { visible: true, editorFocused: true });
	}));

	test('rerender does not resurrect a pending preview cancelled by another surface', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div', undefined, 'Details');
		const hoverService = createRealHoverService(fixture, 500);
		const input = createInput('review ', true, preview, hoverService);
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		host.appendChild(input.attachmentElements[0].closest('.chat-inline-attachment')!);
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		await timeout(250);
		hoverService.hideHover();
		input.controller.refresh();
		await settle();
		await timeout(1000);
		assert.deepStrictEqual({
			visible: preview.isConnected,
			expanded: input.attachmentElements.at(-1)?.getAttribute('aria-expanded') === 'true',
			editorFocused: input.editor.hasTextFocus(),
		}, { visible: false, expanded: false, editorFocused: true });
	}));

	test('leaving the mouse target just before the deadline cancels without a late flash', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div', undefined, 'Details');
		const input = createInput('review ', true, preview, createRealHoverService(fixture, 500));
		fixture.appendChild(input.editor.getContainerDomNode());
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 2), 'keyboard');
		const target = input.attachmentElements[0];
		target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(499);
		target.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(1);
		const atDeadline = preview.isConnected;
		await timeout(300);
		assert.deepStrictEqual({ atDeadline, later: preview.isConnected, expanded: target.getAttribute('aria-expanded') }, { atDeadline: false, later: false, expanded: 'false' });
	}));

	test('leaving after Escape cancels a pending pointer preview even while its pill stays selected', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = dom.append(dom.getActiveDocument().body, dom.$('div'));
		store.add(toDisposable(() => fixture.remove()));
		const preview = dom.$('div', undefined, 'Details');
		const input = createInput('review ', true, preview, createRealHoverService(fixture, 500));
		const host = input.editor.getContainerDomNode();
		fixture.appendChild(host);
		input.editor.focus();
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		const target = input.attachmentElements[0];
		host.appendChild(target.closest('.chat-inline-attachment')!);
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		await timeout(500);
		host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		const selectedAfterEscape = input.isActive();
		target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(499);
		target.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(1);
		const atDeadline = preview.isConnected;
		await timeout(300);
		assert.deepStrictEqual({ selectedAfterEscape, atDeadline, later: preview.isConnected }, { selectedAfterEscape: true, atDeadline: false, later: false });
	}));

	function file(name: string): IChatRequestVariableEntry {
		return { kind: 'file', id: `file:${name}`, name, value: URI.file(`/${name}`) };
	}

	/** Lets the pills catch up with the input, which they do once the current task settled. */
	function settle(): Promise<void> {
		return timeout(0);
	}

	test('moving a line moves the pills on it, and undo moves them back', async () => {
		const input = createInput('summarize\nreview ');
		input.editor.setPosition(new Position(2, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		const added = input.state();

		input.editor.setPosition(new Position(1, 1));
		input.editor.executeCommand('test', input.instantiationService.createInstance(MoveLinesCommand, input.editor.getSelection()!, true, EditorAutoIndentStrategy.None));
		await settle();
		const moved = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();

		assert.deepStrictEqual({ added, moved, undone }, {
			added: { prompt: 'summarize\nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
			moved: { prompt: 'review #attachment:a.ts \nsummarize', attachments: ['file:a.ts'] },
			undone: { prompt: 'summarize\nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
		});
	});

	test('undo brings back the pill that the undone edit removed, rather than one removed later at the same place', async () => {
		const input = createInput('fix ');
		input.editor.setPosition(new Position(1, 5));
		input.attachments.addContext(file('a.ts'));
		await settle();

		// Delete the pill and the space after it, as Backspace would.
		input.editor.executeEdits('test', [{ range: new Range(1, 5, 1, 7), text: '' }]);
		input.editor.pushUndoStop();
		await settle();
		const removed = input.state();

		input.attachments.addContext(file('b.ts'));
		await settle();
		const replaced = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undoneAdd = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undoneRemove = input.state();

		input.editor.getModel()!.redo();
		await settle();
		const redoneRemove = input.state();

		assert.deepStrictEqual({ removed, replaced, undoneAdd, undoneRemove, redoneRemove }, {
			removed: { prompt: 'fix ', attachments: [] },
			replaced: { prompt: 'fix #attachment:b.ts ', attachments: ['file:b.ts'] },
			undoneAdd: { prompt: 'fix ', attachments: [] },
			undoneRemove: { prompt: 'fix #attachment:a.ts ', attachments: ['file:a.ts'] },
			redoneRemove: { prompt: 'fix ', attachments: [] },
		});
	});

	test('undo brings back a pill whose attachment was removed, along with the attachment', async () => {
		const input = createInput('explain ');
		input.editor.setPosition(new Position(1, 9));
		input.attachments.addContext(file('a.ts'));
		await settle();

		input.attachments.delete('file:a.ts');
		await settle();
		const removed = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();

		assert.deepStrictEqual({ removed, undone }, {
			removed: { prompt: 'explain ', attachments: [] },
			undone: { prompt: 'explain #attachment:a.ts ', attachments: ['file:a.ts'] },
		});
	});

	test('shows an attachment inline only once a pill stands for it', async () => {
		const withPills = createInput('explain ');
		const withoutPills = createInput('explain ', false);
		const attachment = file('a.ts');
		for (const input of [withPills, withoutPills]) {
			input.editor.setPosition(new Position(1, 9));
			input.attachments.addContext(attachment);
		}
		const beforePill = withPills.controller.isShownInline(attachment);
		await settle();

		assert.deepStrictEqual({
			beforePill,
			withPills: { input: withPills.editor.getValue(), shownInline: withPills.controller.isShownInline(attachment) },
			withoutPills: { input: withoutPills.editor.getValue(), shownInline: withoutPills.controller.isShownInline(attachment) },
		}, {
			beforePill: false,
			withPills: { input: 'explain \uFFFC ', shownInline: true },
			withoutPills: { input: 'explain ', shownInline: false },
		});
	});

	test('copying a line copies the pills on it, which stand for the same attachment', async () => {
		const input = createInput('review ');
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();

		input.editor.setPosition(new Position(1, 1));
		input.editor.executeCommand('test', new CopyLinesCommand(input.editor.getSelection()!, true));
		await settle();
		const copied = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();

		input.editor.getModel()!.redo();
		await settle();
		const redone = input.state();

		assert.deepStrictEqual({ copied, undone, redone }, {
			copied: { prompt: 'review #attachment:a.ts \nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
			undone: { prompt: 'review #attachment:a.ts ', attachments: ['file:a.ts'] },
			redone: { prompt: 'review #attachment:a.ts \nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
		});
	});

	test('undoing the pills that mentions became leaves each mention standing for its attachment', async () => {
		const input = createInput('');
		input.editor.executeEdits('test', [{ range: new Range(1, 1, 1, 1), text: '#attachment:a.ts #attachment:b.ts' }]);
		input.editor.pushUndoStop();
		input.attachments.addContext(file('a.ts'), file('b.ts'));
		await settle();
		const collapsed = { input: input.editor.getValue(), ...input.state() };

		input.editor.getModel()!.undo();
		await settle();
		const undone = { input: input.editor.getValue(), ...input.state() };

		assert.deepStrictEqual({ collapsed, undone }, {
			collapsed: { input: '\uFFFC \uFFFC', prompt: '#attachment:a.ts #attachment:b.ts', attachments: ['file:a.ts', 'file:b.ts'] },
			undone: { input: '#attachment:a.ts #attachment:b.ts', prompt: '#attachment:a.ts #attachment:b.ts', attachments: ['file:a.ts', 'file:b.ts'] },
		});
	});

	test('the prompt for the model reads each pill as the name and location of its attachment, which is attached once', async () => {
		const input = createInput('review ');
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 1));
		input.editor.executeCommand('test', new CopyLinesCommand(input.editor.getSelection()!, true));
		await settle();

		const forModel = input.controller.project([], { forModel: true });
		const persisted = input.controller.project();
		assert.deepStrictEqual({
			text: persisted?.text,
			forModel: forModel?.references.map(reference => [reference.id, reference.promptText]),
			persisted: persisted?.references.map(reference => [reference.id, reference.promptText]),
			attachments: input.state().attachments,
		}, {
			text: 'review #attachment:a.ts \nreview #attachment:a.ts ',
			forModel: [['file:a.ts', '[a.ts](file:///a.ts)'], ['file:a.ts', '[a.ts](file:///a.ts)']],
			persisted: [['file:a.ts', undefined], ['file:a.ts', undefined]],
			attachments: ['file:a.ts'],
		});
	});

	test('shows images inline', async () => {
		const input = createInput('look at ');
		input.editor.setPosition(new Position(1, 9));
		const image: IChatRequestVariableEntry = { kind: 'image', id: 'image', name: 'Pasted Image', value: new Uint8Array([1]) };
		input.attachments.addContext(image);
		await settle();

		assert.deepStrictEqual({
			input: input.editor.getValue(),
			...input.state(),
			shownInline: input.controller.isShownInline(image),
			forModel: input.controller.project([], { forModel: true })?.references.map(reference => reference.promptText),
		}, {
			input: 'look at \uFFFC ',
			prompt: 'look at #attachment:Pasted Image ',
			attachments: ['image'],
			shownInline: true,
			forModel: ['Pasted Image'],
		});
	});

	test('a completion that becomes a pill leaves the cursor right after the pill, which it highlights', async () => {
		const complete = async (insertText: string) => {
			const input = createInput('fix ');
			input.editor.setPosition(new Position(1, 5));
			// A completion inserts the text of a reference, and then adds the reference.
			input.editor.executeEdits('snippet', [{ range: new Range(1, 5, 1, 5), text: insertText }], () => [new Selection(1, 5 + insertText.length, 1, 5 + insertText.length)]);
			const referenceText = insertText.trimEnd();
			input.addReference({ id: 'file:///a.ts', range: new Range(1, 5, 1, 5 + referenceText.length), data: URI.file('/a.ts'), isFile: true });
			await settle();
			return { input: input.editor.getValue(), cursor: input.editor.getPosition()?.toString(), active: input.isActive() };
		};

		assert.deepStrictEqual({
			withSpace: await complete('#file:a.ts '),
			withoutSpace: await complete('#a.ts'),
		}, {
			withSpace: { input: 'fix \uFFFC', cursor: '(1,6)', active: true },
			withoutSpace: { input: 'fix \uFFFC', cursor: '(1,6)', active: true },
		});
	});

	test('undo brings back every pill that an edit removed', async () => {
		const input = createInput('');
		input.attachments.addContext(...Array.from({ length: 60 }, (_, i) => file(`f${i}.ts`)));
		await settle();
		const added = input.state().attachments.length;

		const model = input.editor.getModel()!;
		input.editor.executeEdits('test', [{ range: model.getFullModelRange(), text: '' }]);
		input.editor.pushUndoStop();
		await settle();
		const removed = input.state().attachments.length;

		model.undo();
		await settle();
		const undone = input.state();

		assert.deepStrictEqual({ added, removed, undone: undone.attachments.length, mentions: undone.prompt.split('#attachment:').length - 1 }, { added: 60, removed: 0, undone: 60, mentions: 60 });
	});

	test('finds the references that pills stand for, from the edit that adds the pills until their anchors are removed', async () => {
		// As the Integrated Browser comments on an element: it attaches the element, mentions it, and follows the mention with the comment.
		const input = createInput('');
		const element = file('a.ts');
		input.attachments.addContext(element);
		input.editor.executeEdits('comment', [{ range: new Range(1, 1, 1, 1), text: '@a.ts fix like #file:b.ts' }]);
		input.addReference(toAttachedContextDynamicVariable(element, new Range(1, 1, 1, 6)));
		input.addReference({ id: 'file:///b.ts', range: new Range(1, 16, 1, 26), data: URI.file('/b.ts'), isFile: true });
		input.editor.setPosition(new Position(1, 26));
		const pillReferences = () => input.controller.getPillReferences().map(reference => `${reference.id} ${Range.lift(reference.range)}${reference.isAttachmentReference ? ' attachment' : ''}`);
		// The input's references change while the pills replace their text, before the pills exist.
		const whileReplaced: string[][] = [];
		const listener = input.editor.onDidChangeModelContent(() => whileReplaced.push(pillReferences()));
		await settle();
		listener.dispose();
		const model = input.editor.getModel()!;
		const pills = { input: model.getValue(), references: pillReferences(), comment: input.controller.getPromptText(new Range(1, 2, 1, model.getLineMaxColumn(1))) };
		input.editor.executeEdits('test', [{ range: model.getFullModelRange(), text: '' }]);

		assert.deepStrictEqual({ whileReplaced, pills, removed: pillReferences() }, {
			whileReplaced: [['file:a.ts [1,1 -> 1,2] attachment', 'file:///b.ts [1,12 -> 1,13]']],
			pills: { input: '\uFFFC fix like \uFFFC', references: ['file:a.ts [1,1 -> 1,2] attachment', 'file:///b.ts [1,12 -> 1,13]'], comment: ' fix like #file:b.ts' },
			removed: [],
		});
		await settle();
	});
});
