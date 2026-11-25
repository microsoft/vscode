/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { OS } from '../../../../../../../../base/common/platform.js';
import { DisposableStore, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ICodeEditor, IMouseTarget, MouseTargetType } from '../../../../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorAutoIndentStrategy } from '../../../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { HoverStartMode, HoverStartSource } from '../../../../../../../../editor/contrib/hover/browser/hoverOperation.js';
import { Selection } from '../../../../../../../../editor/common/core/selection.js';
import { IMarkerDecorationsService } from '../../../../../../../../editor/common/services/markerDecorations.js';
import { EditorContributionCtor, EditorContributionInstantiation, MultiCommand } from '../../../../../../../../editor/browser/editorExtensions.js';
import { ContentHoverController } from '../../../../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { ShowOrFocusHoverAction } from '../../../../../../../../editor/contrib/hover/browser/hoverActions.js';
import { SHOW_OR_FOCUS_HOVER_ACTION_ID } from '../../../../../../../../editor/contrib/hover/browser/hoverActionIds.js';
import { EditorContextKeys } from '../../../../../../../../editor/common/editorContextKeys.js';
import { HoverAccessibleView, HoverAccessibilityHelp } from '../../../../../../../../editor/contrib/hover/browser/hoverAccessibleViews.js';
import { MoveLinesCommand } from '../../../../../../../../editor/contrib/linesOperations/browser/moveLinesCommand.js';
import { CopyLinesCommand } from '../../../../../../../../editor/contrib/linesOperations/browser/copyLinesCommand.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { IAgentHostConnectionsService } from '../../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextMenuService } from '../../../../../../../../platform/contextview/browser/contextView.js';
import { KeybindingsRegistry } from '../../../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver, ResultKind } from '../../../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { registerAction2 } from '../../../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CodeDataTransfers } from '../../../../../../../../platform/dnd/browser/dnd.js';
import { IFileService, IFileSystemWatcher } from '../../../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { ISharedWebContentExtractorService } from '../../../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IExtensionService } from '../../../../../../../services/extensions/common/extensions.js';
import { ChatAttachmentModel } from '../../../../../browser/attachments/chatAttachmentModel.js';
import { ChatDynamicVariableModel } from '../../../../../browser/attachments/chatDynamicVariables.js';
import { IChatAttachmentResolveService } from '../../../../../browser/attachments/chatAttachmentResolveService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../browser/chat.js';
import { ChatResponseAccessibleView } from '../../../../../browser/accessibility/chatResponseAccessibleView.js';
import { ChatSubmitAction } from '../../../../../browser/actions/chatExecuteActions.js';
import { ChatQueueMessageAction, ChatSteerWithMessageAction } from '../../../../../browser/actions/chatQueueActions.js';
import { IChatAttachmentWidgetRegistry } from '../../../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { ChatInlineAttachments } from '../../../../../browser/widget/input/editor/chatInlineAttachments.js';
import '../../../../../browser/widget/input/editor/chatInputEditorHover.js';
import { GitHubResourceDetailsResolver } from '../../../../../../github/browser/githubResourceDetails.js';
import { IManagedHover } from '../../../../../../../../base/browser/ui/hover/hover.js';
import { IWorkbenchGitHubService } from '../../../../../../../services/github/common/githubService.js';
import { IChatWidgetContrib } from '../../../../../browser/widget/chatWidget.js';
import { ChatDragAndDrop } from '../../../../../browser/widget/chatDragAndDrop.js';
import { ChatContextKeys } from '../../../../../common/actions/chatContextKeys.js';
import { IChatRequestVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable, toAttachedContextDynamicVariable } from '../../../../../common/attachments/chatVariables.js';
import { ChatConfiguration } from '../../../../../common/constants.js';
import { IParsedChatRequest } from '../../../../../common/requestParser/chatParserTypes.js';

suite('ChatInlineAttachments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	interface ITestInput {
		readonly editor: ICodeEditor;
		readonly attachments: ChatAttachmentModel;
		readonly controller: ChatInlineAttachments;
		readonly instantiationService: TestInstantiationService;
		readonly attachmentResolvers: (GitHubResourceDetailsResolver | undefined)[];
		setSessionResource(resource: URI): void;
		/** Adds a reference to the input, as accepting a completion does. */
		addReference(reference: IDynamicVariable): void;
		/** Whether the pill right before the cursor is active, which Enter opens. */
		isActive(): boolean;
		/** The prompt that the input stands for, and the ids of its attachments. */
		state(): { prompt: string; attachments: string[] };
		/** What the pills that were rendered last show. */
		readonly rendered: IChatRequestVariableEntry[];
	}

	/**
	 * @param showsPills Whether the input's host shows pills, which a host
	 * whose chat widget does not own the input, such as the Automation dialog's,
	 * does not.
	 * @param showsSessionLinks Whether a widget can show the sessions that links in the input link to, as in the Agents window.
	 */
	function createInput(text: string, showsPills = true, renderEditor = false, showsSessionLinks = false, preview?: () => HTMLElement, previewHover?: IManagedHover): ITestInput {
		const disposables = store.add(new DisposableStore());
		const configurationService = new TestConfigurationService({ [ChatConfiguration.InlineAttachmentsEnabled]: true });
		const instantiationService = createCodeEditorServices(disposables, new ServiceCollection([IConfigurationService, configurationService]));
		if (renderEditor && preview) {
			instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(configurationService)));
		}
		instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
			override getUriLabel(uri: URI): string { return uri.path; }
		});
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override createWatcher(): IFileSystemWatcher { return { onDidChange: Event.None, dispose: () => { } }; }
		});
		instantiationService.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { });
		instantiationService.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { });
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({ onDidChangeDefaultClient: Event.None }));
		instantiationService.stub(IMarkerDecorationsService, upcastPartial<IMarkerDecorationsService>({ getMarker: () => null }));
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({
			onDidShowContextMenu: Event.None,
			onDidHideContextMenu: Event.None,
		}));

		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResourceIdentity: () => undefined,
		}));
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override readonly extensions = [];
		});
		instantiationService.stub(IProductService, upcastPartial<IProductService>({ urlProtocol: 'code-oss' }));
		instantiationService.stub(IChatAttachmentWidgetRegistry, upcastPartial<IChatAttachmentWidgetRegistry>({
			hasFactory: kind => showsSessionLinks && kind === 'sessionLink',
		}));

		const model = disposables.add(instantiateTextModel(instantiationService, text));
		let editor: ICodeEditor;
		if (renderEditor) {
			const container = dom.append(document.body, dom.$('.interactive-session'));
			disposables.add(toDisposable(() => container.remove()));
			const overflowWidgetsDomNode = preview ? dom.append(document.body, dom.$('div')) : undefined;
			if (overflowWidgetsDomNode) {
				disposables.add(toDisposable(() => overflowWidgetsDomNode.remove()));
			}
			editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, dom.append(container, dom.$('div')), {
				dimension: { width: 600, height: 200 },
				overflowWidgetsDomNode,
			}, {
				contributions: preview ? [{ id: ContentHoverController.ID, ctor: ContentHoverController as EditorContributionCtor, instantiation: EditorContributionInstantiation.Lazy }] : [],
				isSimpleWidget: true,
			}));
			editor.setModel(model);
		} else {
			editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
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
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetByInputUri: () => widget }));
		const attachmentResolvers: (GitHubResourceDetailsResolver | undefined)[] = [];
		let sessionResource = URI.parse('chat-session:test-1');
		const dnd = renderEditor ? disposables.add(instantiationService.createInstance(ChatDragAndDrop, () => widget, {
			get attachments() { return attachments.attachments; },
			addAttachments: entries => attachments.addContext(...entries),
		}, { overlayBackground: 'editor.background', listForeground: 'editor.foreground', listBackground: 'editor.background' })) : undefined;
		if (dnd) {
			const container = editor.getContainerDomNode().parentElement!;
			dnd.addOverlay(container, container, editor.getContainerDomNode());
		}
		const rendered: IChatRequestVariableEntry[] = [];
		const controller = disposables.add(instantiationService.createInstance(ChatInlineAttachments, editor, attachments, {
			widget: showsPills ? widget : undefined,
			get sessionResource() { return sessionResource; },
			createAttachmentWidget: (attachment, container, options) => {
				attachmentResolvers.push(options.gitHubResourceDetailsResolver);
				rendered.push(attachment);
				const element = dom.append(container, dom.$('span.chat-attached-context-attachment', undefined, attachment.name));
				const onDidChangePreview = new Emitter<void>();
				return {
					element, supportsPreview: !!preview, getPreviewHoverContent: preview, previewHover,
					onDidChangePreview: onDidChangePreview.event, onDidDelete: Event.None, onDidOpen: Event.None,
					dispose: () => { onDidChangePreview.fire(); onDidChangePreview.dispose(); element.remove(); },
				};
			},
			removeAttachments: (removed: readonly IChatRequestVariableEntry[]) => attachments.delete(...removed.map(attachment => attachment.id)),
			resetDragState: () => dnd?.resetDragState(),
		}));

		return {
			editor,
			attachments,
			controller,
			instantiationService,
			attachmentResolvers,
			setSessionResource: resource => { sessionResource = resource; },
			addReference: reference => dynamicVariableModel.addReference(reference),
			isActive: () => !!editor.invokeWithinContext(accessor => accessor.get(IContextKeyService).getContextKeyValue<boolean>(ChatContextKeys.inputInlineAttachmentActive.key)),
			state: () => ({
				prompt: controller.project()?.text ?? editor.getValue(),
				attachments: attachments.attachments.map(attachment => attachment.id),
			}),
			rendered,
		};
	}

	function file(name: string): IChatRequestVariableEntry {
		return { kind: 'file', id: `file:${name}`, name, value: URI.file(`/${name}`) };
	}

	/** Lets the pills catch up with the input, which they do once the current task settled. */
	function settle(): Promise<void> {
		return timeout(0);
	}

	test('Show or Focus Hover is scoped to the composer text input, not its toolbar or attachments', () => {
		const binding = KeybindingsRegistry.getDefaultKeybindings().find(binding =>
			binding.command === SHOW_OR_FOCUS_HOVER_ACTION_ID &&
			binding.when?.keys().includes(ChatContextKeys.inChatInput.key));
		assert.ok(binding?.when);
		const configuration = new TestConfigurationService();
		const context = store.add(new ContextKeyService(configuration));
		ChatContextKeys.inChatInput.bindTo(context).set(true);
		const textInputFocus = EditorContextKeys.textInputFocus.bindTo(context);
		const toolbarOrAttachment = context.contextMatchesRules(binding.when);
		textInputFocus.set(true);
		const composer = context.contextMatchesRules(binding.when);
		textInputFocus.set(false);
		configuration.setUserConfiguration(ChatConfiguration.InlineAttachmentsEnabled, false);
		assert.deepStrictEqual({
			toolbarOrAttachment,
			composer,
			toolbarOrAttachmentWithInlineDisabled: context.contextMatchesRules(binding.when),
		}, { toolbarOrAttachment: false, composer: true, toolbarOrAttachmentWithInlineDisabled: false });
	});

	test('Enter in the focused reference hover does not open the active pill or submit the draft', async () => {
		// Other suites in the same run may have registered these actions already, and the registry rejects duplicates.
		for (const action of [ChatSubmitAction, ChatQueueMessageAction, ChatSteerWithMessageAction]) {
			if (!CommandsRegistry.getCommand(action.ID)) {
				store.add(registerAction2(action));
			}
		}
		const items = KeybindingsRegistry.getDefaultKeybindingsForOS(OS).flatMap(item => {
			if (!item.keybinding || ![ChatSubmitAction.ID, ChatQueueMessageAction.ID, ChatSteerWithMessageAction.ID, 'workbench.action.chat.openInlineAttachment'].includes(item.command ?? '')) {
				return [];
			}
			return [new ResolvedKeybindingItem(USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0], item.command, item.commandArgs, item.when ?? undefined, true, null, false)];
		});
		const resolver = new KeybindingResolver(items, [], () => { });
		const actual: { activePill: boolean; composerCommand: string | null | undefined; enterCommands: (string | null | undefined)[]; enterPrevented: boolean[] }[] = [];
		for (const [position, defaultAction] of [
			[new Position(1, 9), 'queue'],
			[new Position(1, 8), 'queue'],
			[new Position(1, 9), 'steer'],
			[new Position(1, 8), 'steer'],
		] as const) {
			const content = dom.$('div');
			const link = dom.append(content, dom.$('a', { href: '#reference' }, 'Reference'));
			const button = dom.append(content, dom.$('button', { type: 'button' }, 'Branch'));
			const input = createInput('review ', true, true, false, () => content);
			input.editor.setPosition(new Position(1, 8));
			input.attachments.addContext({
				kind: 'generic',
				id: 'github-context:https://github.com/microsoft/vscode/issues/123',
				name: 'microsoft/vscode#123',
				value: '',
			});
			await settle();
			input.editor.invokeWithinContext(accessor => {
				const context = accessor.get(IContextKeyService);
				ChatContextKeys.enabled.bindTo(context).set(true);
				ChatContextKeys.inChatInput.bindTo(context).set(true);
				ChatContextKeys.inputHasText.bindTo(context).set(true);
				ChatContextKeys.inputHasSendableContent.bindTo(context).set(true);
				ChatContextKeys.chatSessionOptionsValid.bindTo(context).set(true);
				ChatContextKeys.requestInProgress.bindTo(context).set(true);
				context.createKey(`config.${ChatConfiguration.RequestQueueingDefaultAction}`, defaultAction);
			});
			const contextService = input.instantiationService.get(IContextKeyService);
			const resolveEnter = (target: Element) => {
				const result = resolver.resolve(contextService.getContext(target), [], 'Enter');
				return result.kind === ResultKind.KbFound ? result.commandId : undefined;
			};
			input.editor.focus();
			input.editor.setPosition(position, 'keyboard');
			const activePill = input.isActive();
			const composerCommand = resolveEnter(input.editor.getDomNode()!);
			ContentHoverController.get(input.editor)!.showContentHover(new Range(1, 9, 1, 9), HoverStartMode.Immediate, HoverStartSource.Keyboard, true);
			await settle();
			const enterCommands: (string | null | undefined)[] = [];
			const enterPrevented: boolean[] = [];
			const container = content.closest<HTMLElement>('.monaco-hover')!;
			const keydownListener = store.add(dom.addDisposableListener(dom.getWindow(container).document, 'keydown', event => {
				if (event.key === 'Enter' && event.target instanceof Element) {
					const command = resolveEnter(event.target);
					enterCommands.push(command);
					if (command) {
						event.preventDefault();
					}
				}
			}));
			for (const target of [container, link, button]) {
				target.focus();
				target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
				enterPrevented.push(!target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })));
			}
			keydownListener.dispose();
			actual.push({ activePill, composerCommand, enterCommands, enterPrevented });
			ContentHoverController.get(input.editor)!.hideContentHover();
			await settle();
		}
		assert.deepStrictEqual(actual, [
			{ activePill: true, composerCommand: 'workbench.action.chat.openInlineAttachment', enterCommands: [undefined, undefined, undefined], enterPrevented: [false, false, false] },
			{ activePill: false, composerCommand: ChatQueueMessageAction.ID, enterCommands: [undefined, undefined, undefined], enterPrevented: [false, false, false] },
			{ activePill: true, composerCommand: 'workbench.action.chat.openInlineAttachment', enterCommands: [undefined, undefined, undefined], enterPrevented: [false, false, false] },
			{ activePill: false, composerCommand: ChatSteerWithMessageAction.ID, enterCommands: [undefined, undefined, undefined], enterPrevented: [false, false, false] },
		]);
	});

	test('keyboard activation reveals the shared hover without focusing it or showing it after edits', async () => {
		const events: string[] = [];
		const previewHover: IManagedHover = {
			show: focus => events.push(`show:${focus}`),
			hide: () => events.push('hide'),
			update: async () => { },
			dispose: () => { },
		};
		const input = createInput('review  tail', true, true, false, () => dom.$('div'), previewHover);
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext({
			kind: 'generic',
			id: 'github-context:https://github.com/microsoft/vscode/issues/123',
			name: 'microsoft/vscode#123',
			value: '',
		});
		await settle();
		const afterInsertion = [...events];
		input.editor.focus();
		input.editor.trigger('keyboard', 'cursorLeft', {});
		input.editor.trigger('keyboard', 'cursorRight', {});
		const afterKeyboardActivation = [...events];
		input.editor.trigger('keyboard', 'cursorRight', {});
		input.editor.setPosition(new Position(1, 9));
		assert.deepStrictEqual({
			afterInsertion,
			afterKeyboardActivation,
			afterLeavingAndProgrammaticReturn: events,
			focusInComposer: input.editor.hasTextFocus(),
		}, { afterInsertion: [], afterKeyboardActivation: ['show:false'], afterLeavingAndProgrammaticReturn: ['show:false', 'hide'], focusInComposer: true });
	});

	test('Show or Focus Hover displays reference details and Escape returns to the draft', async () => {
		const content = dom.$('div', undefined, 'Issue title and description');
		let rendered = 0;
		let sharedPreviewVisible = false;
		const previewHover = upcastPartial<IManagedHover>({
			show: () => { sharedPreviewVisible = true; },
			hide: () => { sharedPreviewVisible = false; },
		});
		const input = createInput('review ', true, true, false, () => {
			rendered++;
			return content;
		}, previewHover);
		const hover = ContentHoverController.get(input.editor)!;
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext({
			kind: 'generic',
			id: 'github-context:https://github.com/microsoft/vscode/issues/123',
			name: 'microsoft/vscode#123',
			value: '',
		});
		await settle();
		input.editor.focus();
		input.editor.trigger('keyboard', 'cursorLeft', {});
		input.editor.trigger('keyboard', 'cursorRight', {});
		await settle();
		input.editor.setPosition(new Position(1, 9), 'keyboard');
		hover.showContentHover(Range.fromPositions(input.editor.getPosition()!), HoverStartMode.Immediate, HoverStartSource.Mouse, false);
		await settle();
		const shownForMouse = hover.isHoverVisible;
		const renderedBeforeCommand = rendered;
		const sharedPreviewBeforeCommand = sharedPreviewVisible;
		const before = input.state();
		input.editor.focus();
		const context = input.editor.invokeWithinContext(accessor => {
			const contextKeyService = accessor.get(IContextKeyService);
			ChatContextKeys.inChatInput.bindTo(contextKeyService).set(true);
			ChatContextKeys.inChatSession.bindTo(contextKeyService).set(true);
			return { getValue: <T>(key: string) => contextKeyService.getContextKeyValue<T>(key) };
		});
		const hoverBinding = KeybindingsRegistry.getDefaultKeybindings().some(binding =>
			binding.command === SHOW_OR_FOCUS_HOVER_ACTION_ID &&
			binding.when?.evaluate(context));
		assert.deepStrictEqual({ editorTextFocus: EditorContextKeys.editorTextFocus.evaluate(context), hoverBinding }, {
			editorTextFocus: false, hoverBinding: true,
		});
		input.editor.invokeWithinContext(accessor => new ShowOrFocusHoverAction().run(accessor, input.editor, { focus: true }));
		await settle();
		const shown = hover.isHoverVisible;
		const accessibleView = new HoverAccessibleView();
		const accessibilityHelp = new HoverAccessibilityHelp();
		const command = new MultiCommand({ id: 'test.referenceAccessibleView', precondition: undefined });
		let provider: ReturnType<HoverAccessibleView['getProvider']>;
		const chatResponse = new ChatResponseAccessibleView();
		store.add(command.addImplementation(chatResponse.priority, chatResponse.name, () => true, chatResponse.when));
		store.add(command.addImplementation(accessibleView.priority, accessibleView.name, accessor => {
			provider = accessibleView.getProvider(accessor);
			return !!provider;
		}, accessibleView.when));
		// Hidden Electron test windows don't dispatch native focus events.
		const focusedElement = dom.getActiveElement();
		focusedElement?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		const focusedContext = input.instantiationService.get(IContextKeyService).getContext(focusedElement);
		assert.deepStrictEqual({
			outsideEditor: !input.editor.getDomNode()!.contains(focusedElement),
			accessibleViewAvailable: accessibleView.when.evaluate(focusedContext),
			accessibilityHelpAvailable: accessibilityHelp.when.evaluate(focusedContext),
		}, { outsideEditor: true, accessibleViewAvailable: true, accessibilityHelpAvailable: true });
		input.instantiationService.invokeFunction(accessor => command.runCommand(accessor, undefined));
		assert.ok(provider);
		store.add(provider);
		provider.onOpen?.();
		const accessibleContent = provider.provideContent();
		assert.deepStrictEqual({ shownForMouse, renderedBeforeCommand, renderedAfterCommand: rendered > 0, sharedPreviewBeforeCommand, sharedPreviewAfterCommand: sharedPreviewVisible, shown, accessibleContent }, {
			shownForMouse: false, renderedBeforeCommand: 0, renderedAfterCommand: true, sharedPreviewBeforeCommand: true, sharedPreviewAfterCommand: false, shown: true, accessibleContent: 'Issue title and description',
		});
		let contentUpdates = 0;
		store.add(hover.onHoverContentsChanged(() => contentUpdates++));
		content.textContent = 'Refreshed issue description';
		await settle();
		const refreshedAccessibleContent = provider.provideContent();
		provider.onClose();
		const container = content.closest('.monaco-hover');
		assert.ok(container);
		container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		await settle();
		assert.deepStrictEqual({
			contentUpdated: contentUpdates > 0,
			refreshedAccessibleContent,
			dismissed: !hover.isHoverVisible,
			focusReturned: input.editor.hasTextFocus(),
			draft: input.state(),
		}, { contentUpdated: true, refreshedAccessibleContent: 'Refreshed issue description', dismissed: true, focusReturned: true, draft: before });
		input.editor.invokeWithinContext(accessor => new ShowOrFocusHoverAction().run(accessor, input.editor, { focus: true }));
		await settle();
		input.controller.refresh();
		await settle();
		const reference = input.editor.getDomNode()!.querySelector<HTMLElement>('.chat-inline-attachment .chat-attached-context-attachment');
		assert.ok(reference);
		const sandbox = sinon.createSandbox();
		store.add(toDisposable(() => sandbox.restore()));
		const click = sandbox.spy(reference, 'click');
		assert.deepStrictEqual({
			dismissedOnRefresh: !hover.isHoverVisible,
			opensActiveReference: input.controller.openActivePill(),
			clicks: click.callCount,
			draft: input.state(),
		}, { dismissedOnRefresh: true, opensActiveReference: true, clicks: 1, draft: before });
	});

	test('the input owns one GitHub resolver across pill rerenders and warms only new arrivals', async () => {
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

	function dispatchDrag(element: HTMLElement, type: string, dataTransfer: DataTransfer): DragEvent {
		const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
		element.dispatchEvent(event);
		return event;
	}

	function dropTarget(position: Position): IMouseTarget {
		return upcastPartial<IMouseTarget>({ type: MouseTargetType.CONTENT_TEXT, position });
	}

	for (const endEvent of [dom.EventType.DROP, dom.EventType.DRAG_END]) {
		test(`external drag feedback and enter/leave tracking recover after an internal pill ${endEvent}`, async () => {
			const input = createInput('text ', true, true);
			input.editor.setPosition(new Position(1, 6));
			input.attachments.addContext(file('a.ts'));
			await settle();
			const editor = input.editor.getContainerDomNode();
			const outer = editor.parentElement!;
			const pill = editor.querySelector<HTMLElement>('.chat-attached-context-attachment')!;
			const overlay = outer.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			const internal = new DataTransfer();
			const external = new DataTransfer();
			external.setData(CodeDataTransfers.EDITORS, JSON.stringify([{ resource: URI.file('/external.ts') }]));
			sinon.stub(input.editor, 'getTargetAtClientPoint').returns(dropTarget(new Position(1, 1)));

			dispatchDrag(outer, dom.EventType.DRAG_ENTER, external);
			dispatchDrag(outer, dom.EventType.DRAG_OVER, external);
			const before = overlay.classList.contains('visible');
			dispatchDrag(outer, dom.EventType.DRAG_LEAVE, external);

			dispatchDrag(pill, dom.EventType.DRAG_START, internal);
			dispatchDrag(outer, dom.EventType.DRAG_ENTER, internal);
			dispatchDrag(outer, dom.EventType.DRAG_OVER, internal);
			dispatchDrag(editor, dom.EventType.DRAG_ENTER, internal);
			dispatchDrag(outer, dom.EventType.DRAG_LEAVE, internal);
			dispatchDrag(endEvent === dom.EventType.DROP ? editor : pill, endEvent, internal);
			await settle();

			dispatchDrag(outer, dom.EventType.DRAG_ENTER, external);
			dispatchDrag(outer, dom.EventType.DRAG_OVER, external);
			const after = overlay.classList.contains('visible');
			dispatchDrag(outer, dom.EventType.DRAG_LEAVE, external);
			const afterLeaving = overlay.classList.contains('visible');
			dispatchDrag(outer, dom.EventType.DRAG_ENTER, external);
			dispatchDrag(outer, dom.EventType.DRAG_OVER, external);
			const afterReentering = overlay.classList.contains('visible');
			dispatchDrag(outer, dom.EventType.DRAG_LEAVE, external);

			assert.deepStrictEqual({ before, after, afterLeaving, afterReentering, afterLeavingAgain: overlay.classList.contains('visible') }, {
				before: true, after: true, afterLeaving: false, afterReentering: true, afterLeavingAgain: false,
			});
		});
	}

	test('dragging moves only the picked-up pill with its metadata and a pill-only preview, and supports undo and redo', async () => {
		const input = createInput('first \nsecond ', true, true);
		input.editor.setPosition(new Position(1, 7));
		const image: IChatRequestVariableEntry = { kind: 'image', id: 'image', name: 'photo.png', value: new Uint8Array([1, 2, 3]) };
		input.attachments.addContext(file('a.ts'), image);
		await settle();
		const added = input.state();
		const model = input.editor.getModel()!;
		input.editor.setSelection(model.getFullModelRange(), 'keyboard');

		const container = input.editor.getContainerDomNode();
		const pill = container.querySelectorAll<HTMLElement>('.chat-inline-attachment')[1];
		const widget = pill.querySelector<HTMLElement>('.chat-attached-context-attachment')!;
		const resourceDrag = sinon.spy();
		store.add(dom.addDisposableListener(widget, dom.EventType.DRAG_START, resourceDrag));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData('text/uri-list', 'file:///photo.png');
		const setDragImage = sinon.spy(dataTransfer, 'setDragImage');
		sinon.stub(input.editor, 'getTargetAtClientPoint').returns(dropTarget(new Position(2, 8)));
		dispatchDrag(widget, dom.EventType.DRAG_START, dataTransfer);
		const dragOver = dispatchDrag(container, dom.EventType.DRAG_OVER, dataTransfer);
		const marker = model.getAllDecorations().filter(decoration => decoration.options.description === 'chat-inline-attachment-drop-target').map(decoration => decoration.range.toString());
		const duringMove: string[][] = [];
		const listener = store.add(input.editor.onDidChangeModelContent(() => {
			duringMove.push(input.controller.getPillReferences().map(reference => `${reference.id} ${Range.lift(reference.range)}`));
		}));
		dispatchDrag(container, dom.EventType.DROP, dataTransfer);
		listener.dispose();
		await settle();
		const moved = input.state();
		const activeAfterMove = input.isActive();
		const keepsImage = input.attachments.attachments.find(attachment => attachment.id === image.id) === image;
		const markersAfterDrop = model.getAllDecorations().filter(decoration => decoration.options.description === 'chat-inline-attachment-drop-target').length;
		model.undo();
		await settle();
		const undone = input.state();
		model.redo();
		await settle();

		assert.deepStrictEqual({
			added, moved, undone, redone: input.state(), activeAfterMove, keepsImage, duringMove, marker, markersAfterDrop,
			previewIsOnlyPill: setDragImage.calledOnce && setDragImage.firstCall.args[0] === pill,
			resourceDrag: resourceDrag.callCount,
			transferTypes: dataTransfer.types,
			acceptsDrop: dragOver.defaultPrevented,
		}, {
			added: { prompt: 'first #attachment:a.ts #attachment:photo.png\nsecond ', attachments: ['file:a.ts', 'image'] },
			moved: { prompt: 'first #attachment:a.ts \nsecond #attachment:photo.png', attachments: ['file:a.ts', 'image'] },
			undone: added,
			redone: moved,
			activeAfterMove: false,
			keepsImage: true,
			duringMove: [['file:a.ts [1,7 -> 1,8]', 'image [2,8 -> 2,9]']],
			marker: ['[2,8 -> 2,8]'],
			markersAfterDrop: 0,
			previewIsOnlyPill: true,
			resourceDrag: 0,
			transferTypes: ['application/vnd.code.chat-inline-attachment'],
			acceptsDrop: true,
		});
	});

	test('holds the drag preview at its bottom-left corner regardless of where the pill was grabbed', async () => {
		const input = createInput('', true, true);
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.render(true);
		const pill = input.editor.getContainerDomNode().querySelector<HTMLElement>('.chat-inline-attachment')!;
		const widget = pill.querySelector<HTMLElement>('.chat-attached-context-attachment')!;
		const rect = pill.getBoundingClientRect();
		assert.ok(rect.width > 0 && rect.height > 0);
		const dataTransfer = new DataTransfer();
		const setDragImage = sinon.spy(dataTransfer, 'setDragImage');

		for (const fraction of [0.25, 0.75]) {
			widget.dispatchEvent(new DragEvent(dom.EventType.DRAG_START, {
				bubbles: true, cancelable: true, dataTransfer,
				clientX: rect.left + rect.width * fraction,
				clientY: rect.top + rect.height * fraction,
			}));
			dispatchDrag(widget, dom.EventType.DRAG_END, dataTransfer);
		}

		assert.deepStrictEqual(setDragImage.args.map(([, x, y]) => ({ x, y })), [
			{ x: 0, y: rect.height },
			{ x: 0, y: rect.height },
		]);
	});

	test('dragging backwards across another pill keeps their identities through undo and redo', async () => {
		const input = createInput('\n', true, true);
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(2, 1));
		input.attachments.addContext(file('b.ts'));
		await settle();
		const before = input.state();
		const container = input.editor.getContainerDomNode();
		const pill = container.querySelectorAll<HTMLElement>('.chat-attached-context-attachment')[1];
		const dataTransfer = new DataTransfer();
		sinon.stub(input.editor, 'getTargetAtClientPoint').returns(dropTarget(new Position(1, 1)));
		dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
		dispatchDrag(container, dom.EventType.DROP, dataTransfer);
		await settle();
		const moved = input.state();
		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();
		input.editor.getModel()!.redo();
		await settle();

		assert.deepStrictEqual({ moved, undone, redone: input.state() }, {
			moved: { prompt: '#attachment:b.ts #attachment:a.ts\n ', attachments: ['file:a.ts', 'file:b.ts'] },
			undone: before,
			redone: moved,
		});
	});

	test('cancelled, out-of-input and same-position drops leave the pill and undo history unchanged', async () => {
		const input = createInput('text ', true, true);
		input.editor.setPosition(new Position(1, 6));
		input.attachments.addContext(file('a.ts'));
		await settle();
		const before = input.state();
		const model = input.editor.getModel()!;
		const version = model.getAlternativeVersionId();
		const container = input.editor.getContainerDomNode();
		const pill = container.querySelector<HTMLElement>('.chat-attached-context-attachment')!;
		const hitTest = sinon.stub(input.editor, 'getTargetAtClientPoint');
		const dataTransfer = new DataTransfer();

		hitTest.returns(dropTarget(new Position(1, 1)));
		dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
		dispatchDrag(container, dom.EventType.DRAG_OVER, dataTransfer);
		dispatchDrag(pill, dom.EventType.DRAG_END, dataTransfer);
		dispatchDrag(container, dom.EventType.DROP, dataTransfer);

		hitTest.returns(null);
		dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
		dispatchDrag(container, dom.EventType.DROP, dataTransfer);

		for (const column of [6, 7]) {
			hitTest.returns(dropTarget(new Position(1, column)));
			dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
			dispatchDrag(container, dom.EventType.DROP, dataTransfer);
		}
		await settle();

		assert.deepStrictEqual({
			state: input.state(),
			version: model.getAlternativeVersionId(),
			markers: model.getAllDecorations().filter(decoration => decoration.options.description === 'chat-inline-attachment-drop-target').length,
		}, { state: before, version, markers: 0 });
	});

	test('a pill cannot move to another input or start moving from a read-only input', async () => {
		const input = createInput('source ', true, true);
		const other = createInput('destination ', true, true);
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		const before = input.state();
		const container = input.editor.getContainerDomNode();
		const pill = container.querySelector<HTMLElement>('.chat-attached-context-attachment')!;
		const dataTransfer = new DataTransfer();
		sinon.stub(other.editor, 'getTargetAtClientPoint').returns(dropTarget(new Position(1, 1)));
		dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
		dispatchDrag(other.editor.getContainerDomNode(), dom.EventType.DROP, dataTransfer);
		dispatchDrag(pill, dom.EventType.DRAG_END, dataTransfer);
		input.editor.updateOptions({ readOnly: true });
		const dragStart = dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
		await settle();

		assert.deepStrictEqual({ source: input.state(), other: other.state(), cancelled: dragStart.defaultPrevented }, {
			source: before,
			other: { prompt: 'destination ', attachments: [] },
			cancelled: true,
		});
	});

	test('changing the input during a drag cancels the move', async () => {
		const input = createInput('text ', true, true);
		input.editor.setPosition(new Position(1, 6));
		input.attachments.addContext(file('a.ts'));
		await settle();
		const container = input.editor.getContainerDomNode();
		const pill = container.querySelector<HTMLElement>('.chat-attached-context-attachment')!;
		const dataTransfer = new DataTransfer();
		sinon.stub(input.editor, 'getTargetAtClientPoint').returns(dropTarget(new Position(1, 1)));
		dispatchDrag(pill, dom.EventType.DRAG_START, dataTransfer);
		input.editor.executeEdits('test', [{ range: new Range(1, 1, 1, 1), text: 'new ' }]);
		dispatchDrag(container, dom.EventType.DROP, dataTransfer);
		await settle();

		assert.deepStrictEqual(input.state(), { prompt: 'new text #attachment:a.ts ', attachments: ['file:a.ts'] });
	});

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

	test('a session link becomes a pill that shows the session where a widget can, while the prompt keeps the link', async () => {
		const link = 'code-oss://agents/agent-host-session/copilotcli/session-1';
		const text = `continue ${link} please`;
		const shown = createInput(text, true, false, true);
		const hidden = createInput(text);
		await settle();

		assert.deepStrictEqual({
			shown: {
				input: shown.editor.getValue(),
				...shown.state(),
				forModel: shown.controller.project([], { forModel: true })?.text,
				rendered: shown.rendered.map(entry => ({ kind: entry.kind, name: entry.name, value: String(entry.value) })),
			},
			hidden: { input: hidden.editor.getValue(), rendered: hidden.rendered.length },
		}, {
			shown: {
				input: 'continue \uFFFC please',
				prompt: text,
				attachments: [],
				forModel: text,
				rendered: [{ kind: 'sessionLink', name: 'Session', value: 'agent-host-session://copilotcli/session-1' }],
			},
			hidden: { input: text, rendered: 0 },
		});
	});

	test('a session link within other text becomes a pill too, which the prompt says exactly where it is', async () => {
		const link = 'agent-host-session://copilotcli/session-1';
		const collapse = async (text: string) => {
			const input = createInput(text, true, false, true);
			await settle();
			return { input: input.editor.getValue(), prompt: input.state().prompt };
		};

		// A pill right after a link ends the link, which becomes a pill too.
		assert.deepStrictEqual(await Promise.all([`check (${link}), then`, `{"session":"${link}"}`, `${link}\uFFFC`].map(collapse)), [
			{ input: 'check (\uFFFC), then', prompt: `check (${link}), then` },
			{ input: '{"session":"\uFFFC"}', prompt: `{"session":"${link}"}` },
			{ input: '\uFFFC\uFFFC', prompt: link },
		]);
	});

	test('a session link pill dragged into parentheses keeps the link exactly where it is, during and after the move', async () => {
		const link = 'agent-host-session://copilotcli/session-1';
		const input = createInput(`see () ${link}`, true, true, true);
		await settle();
		const container = input.editor.getContainerDomNode();
		const widget = container.querySelector<HTMLElement>('.chat-inline-attachment .chat-attached-context-attachment')!;
		const dataTransfer = new DataTransfer();
		sinon.stub(input.editor, 'getTargetAtClientPoint').returns(dropTarget(new Position(1, 6)));
		const duringMove: (string | undefined)[] = [];
		const listener = input.editor.onDidChangeModelContent(() => duringMove.push(input.controller.project()?.text));
		dispatchDrag(widget, dom.EventType.DRAG_START, dataTransfer);
		dispatchDrag(container, dom.EventType.DRAG_OVER, dataTransfer);
		dispatchDrag(container, dom.EventType.DROP, dataTransfer);
		listener.dispose();
		await settle();

		assert.deepStrictEqual({ duringMove, moved: input.state().prompt }, {
			duringMove: [`see (${link}) `],
			moved: `see (${link}) `,
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
