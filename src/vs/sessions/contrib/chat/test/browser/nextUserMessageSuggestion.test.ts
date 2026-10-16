/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { AsyncIterableObject, DeferredPromise } from '../../../../../base/common/async.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { NextUserMessageSuggestionActionViewItem } from '../../browser/nextUserMessageSuggestionActionViewItem.js';
import { withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { InlineCompletionsController } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { InlineCompletionsModel } from '../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ResponseModelState } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatResponseModelChangeReason, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { InlineCompletionContextKeys } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys.js';
import { Context as SuggestContext } from '../../../../../editor/contrib/suggest/browser/suggest.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID, NextUserMessageSuggestionController, shouldDismissNextUserMessageSuggestion } from '../../browser/nextUserMessageSuggestion.js';
import { cleanNextUserMessageSuggestion, createNextUserMessageContext, createNextUserMessagePrompt, truncateSuggestionContext } from '../../common/nextUserMessageSuggestion.js';

suite('Sessions - Next User Message Suggestion', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('preserves the head and tail when bounding context', () => {
		assert.deepStrictEqual([
			truncateSuggestionContext('abcdefghijklmnopqrstuvwxyz', 24),
			truncateSuggestionContext('abcdefghij', 5),
		], [
			'abc\n...[truncated]...\nyz',
			'abcde',
		]);
	});

	test('dismisses through the remappable inline suggestion command', () => {
		assert.deepStrictEqual([
			shouldDismissNextUserMessageSuggestion('editor.action.inlineSuggest.hide', true),
			shouldDismissNextUserMessageSuggestion('editor.action.inlineSuggest.hide', false),
			shouldDismissNextUserMessageSuggestion('other.command', true),
		], [true, false, false]);
	});

	test('accepts with Right Arrow while Tab keeps its editor behavior', () => {
		const keybindings = KeybindingsRegistry.getDefaultKeybindings();
		const accept = keybindings.find(keybinding => keybinding.command === ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID);
		const tab = keybindings.find(keybinding => keybinding.command === 'tab' && keybinding.when?.serialize().includes('sessionsNextUserMessageSuggestionAvailable'));
		const acceptChord = accept?.keybinding?.chords[0];
		const tabChord = tab?.keybinding?.chords[0];

		assert.deepStrictEqual({
			acceptKey: acceptChord instanceof KeyCodeChord ? acceptChord.keyCode : undefined,
			acceptIsScoped: accept?.when?.serialize().includes('sessionsNextUserMessageSuggestionAvailable'),
			tabKey: tabChord instanceof KeyCodeChord ? tabChord.keyCode : undefined,
			tabIsScoped: tab?.when?.serialize().includes('sessionsNextUserMessageSuggestionAvailable'),
		}, {
			acceptKey: KeyCode.RightArrow,
			acceptIsScoped: true,
			tabKey: KeyCode.Tab,
			tabIsScoped: true,
		});
	});

	test('only claims Right Arrow for an available suggestion without IME or popup interaction', () => {
		const binding = KeybindingsRegistry.getDefaultKeybindings().find(keybinding => keybinding.command === ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID);
		assert.ok(binding?.when);
		const when = binding.when;
		const context = new MockContextKeyService();
		context.createKey('sessionsNextUserMessageSuggestionAvailable', true);
		ChatContextKeys.enabled.bindTo(context).set(true);
		EditorContextKeys.textInputFocus.bindTo(context).set(true);
		InlineCompletionContextKeys.inlineSuggestionVisible.bindTo(context).set(true);
		InlineCompletionContextKeys.cursorBeforeGhostText.bindTo(context).set(true);
		const composing = EditorContextKeys.isComposing.bindTo(context);
		const popup = SuggestContext.Visible.bindTo(context);
		const hover = EditorContextKeys.hoverFocused.bindTo(context);
		const matches = () => when.evaluate({ getValue: key => context.getContextKeyValue(key) });
		const normal = matches();
		composing.set(true);
		const duringComposition = matches();
		composing.reset();
		popup.set(true);
		const withPopup = matches();
		popup.reset();
		hover.set(true);
		const withHover = matches();
		hover.reset();
		EditorContextKeys.textInputFocus.bindTo(context).set(false);
		const outsideEditor = matches();
		assert.deepStrictEqual({ normal, duringComposition, withPopup, withHover, outsideEditor }, {
			normal: true, duringComposition: false, withPopup: false, withHover: false, outsideEditor: false,
		});
	});

	test('keycap updates after remapping and retains an accessible insertion label', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const changed = store.add(new Emitter<void>());
		let binding: ResolvedKeybinding | undefined = new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, false, false, KeyCode.RightArrow)], OS);
		instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
			override get onDidUpdateKeybindings() { return changed.event; }
			override lookupKeybinding() { return binding; }
		}());
		const action = instantiationService.createInstance(MenuItemAction, {
			id: ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID, title: 'Insert Suggestion',
		}, undefined, {}, undefined, undefined);
		const item = store.add(instantiationService.createInstance(NextUserMessageSuggestionActionViewItem, action, { keybinding: 'RightArrow', keybindingNotRenderedWithLabel: true }));
		const container = document.createElement('div');
		item.render(container);
		const snapshot = () => ({
			keycaps: container.querySelectorAll('.monaco-keybinding-key').length,
			duplicateShortcut: container.querySelector('.keybinding') !== null,
			label: container.querySelector('.action-label')?.getAttribute('aria-label'),
			text: container.textContent,
		});
		const initial = snapshot();
		binding = new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, false, false, KeyCode.F6)], OS);
		changed.fire();
		const remapped = snapshot();
		binding = undefined;
		changed.fire();
		const unbound = snapshot();
		assert.deepStrictEqual({
			initialHasKeycap: initial.keycaps === 1,
			initialHasDuplicateShortcut: initial.duplicateShortcut,
			initialExplainsInsertion: initial.label?.startsWith('Insert suggestion ('),
			remapped,
			unbound,
		}, {
			initialHasKeycap: true,
			initialHasDuplicateShortcut: false,
			initialExplainsInsertion: true,
			remapped: { keycaps: 1, duplicateShortcut: false, label: 'Insert suggestion (F6). Does not send.', text: 'F6' },
			unbound: { keycaps: 0, duplicateShortcut: false, label: 'Insert suggestion. Does not send.', text: 'Insert' },
		});
	});

	test('accepts an unfocused suggestion through Monaco without submitting and clears availability', async () => {
		await withAsyncTestCodeEditor('', { hasTextFocus: false }, async (editor, _viewModel, services) => {
			assert.ok(editor instanceof CodeEditorWidget);
			const inputEditor = editor;
			const changed = store.add(new Emitter<ChatResponseModelChangeReason>());
			const response = new class extends mock<IChatResponseModel>() {
				override readonly id = 'response';
				override readonly state = ResponseModelState.Complete;
				override readonly onDidChange = changed.event;
				override readonly response = new class extends mock<IChatResponseModel['response']>() {
					override getFinalResponse() { return 'Would you like me to run the tests?'; }
				}();
			}();
			const request = new class extends mock<IChatRequestModel>() {
				override readonly response = response;
				override readonly message = { text: 'Implement the change', parts: [] };
			}();
			const model = new class extends mock<IChatModel>() {
				override readonly lastRequestObs = constObservable(request);
				override readonly onDidChange = Event.None;
			}();
			let placeholder: string | undefined;
			const presented = new DeferredPromise<void>();
			const viewModel = new class extends mock<ChatViewModel>() {
				override get model() { return model; }
				override get inputPlaceholder() { return placeholder; }
				override setInputPlaceholder(value: string) {
					placeholder = value;
					void presented.complete();
				}
				override resetInputPlaceholder() { placeholder = undefined; }
			}();
			const inputPart = new class extends mock<ChatInputPart>() {
				override readonly inputUri = editor.getModel()!.uri;
				override get inputEditor() { return inputEditor; }
			}();
			const widget = new class extends mock<ChatWidget>() {
				override get viewModel() { return viewModel; }
				override get visible() { return true; }
				override get inputPart() { return inputPart; }
				override readonly onDidChangeViewModel = Event.None;
				override readonly onDidChangeActiveInputEditor = Event.None;
				override readonly onDidAcceptInput = Event.None;
				override getInput() { return editor.getValue(); }
				override async acceptInput(): Promise<never> { assert.fail('Accepting a suggestion must not submit'); }
			}();
			const context = new MockContextKeyService();
			const languageFeatures = services.get(ILanguageFeaturesService);
			const controller = new NextUserMessageSuggestionController(widget, languageFeatures,
				new class extends mock<ICommandService>() { override readonly onWillExecuteCommand = Event.None; }(),
				context,
				new class extends mock<ILanguageModelsService>() {
					override async selectLanguageModels() { return ['utility']; }
					override async sendChatRequest() {
						return { stream: AsyncIterableObject.fromArray([{ type: 'text' as const, value: 'Run the focused tests' }]), result: Promise.resolve({}) };
					}
				}(),
				new class extends mock<IWorkbenchAssignmentService>() {
					override readonly onDidRefetchAssignments = Event.None;
					override async getTreatment<T extends string | number | boolean>() { return true as T; }
				}(),
				new class extends mock<IChatEntitlementService>() {
					override readonly onDidChangeSentiment = Event.None;
					override readonly sentiment = {};
				}(), new NullLogService());
			editor.registerDisposable(controller);
			await Promise.resolve();
			changed.fire({ reason: 'completedRequest' });
			await presented.p;

			const nativeModel = new class extends mock<InlineCompletionsModel>() {
				override async triggerExplicitly() { }
				override async accept() { editor.setValue('Run the focused tests'); }
			}();
			sinon.stub(InlineCompletionsController, 'get').returns(new class extends mock<InlineCompletionsController>() {
				override readonly model = constObservable(nativeModel);
			}());
			const availableBefore = context.getContextKeyValue('sessionsNextUserMessageSuggestionAvailable');
			await controller.accept();
			assert.deepStrictEqual({
				availableBefore,
				text: editor.getValue(),
				availableAfter: context.getContextKeyValue('sessionsNextUserMessageSuggestionAvailable'),
				placeholder: viewModel.inputPlaceholder,
			}, { availableBefore: true, text: 'Run the focused tests', availableAfter: false, placeholder: undefined });
		});
	});

	test('builds a prompt from bounded untrusted fields', () => {
		const prompt = createNextUserMessagePrompt();
		const context = createNextUserMessageContext(`request-start-${'r'.repeat(2000)}-request-end`, `response-start-${'s'.repeat(10000)}-response-end`);
		assert.deepStrictEqual({
			hasPredictionContract: prompt.includes('Predict what they would actually type'),
			prioritizesFinalResponse: prompt.includes('Prefer responding to its explicit question, offer, or concrete next step'),
			prefersRequests: prompt.includes('Prefer a concise request or action over a question'),
			requestLength: context.latestRequest.length,
			requestStart: context.latestRequest.startsWith('request-start-'),
			requestEnd: context.latestRequest.endsWith('-request-end'),
			responseLength: context.finalResponse.length,
			responseStart: context.finalResponse.startsWith('response-start-'),
			responseEnd: context.finalResponse.endsWith('-response-end'),
		}, {
			hasPredictionContract: true,
			prioritizesFinalResponse: true,
			prefersRequests: true,
			requestLength: 2000,
			requestStart: true,
			requestEnd: true,
			responseLength: 10000,
			responseStart: true,
			responseEnd: true,
		});
	});

	test('accepts natural continuations', () => {
		assert.deepStrictEqual([
			cleanNextUserMessageSuggestion('Run the focused tests'),
			cleanNextUserMessageSuggestion('"Can you show the diff?"'),
			cleanNextUserMessageSuggestion('“Can you show the diff?”'),
			cleanNextUserMessageSuggestion('继续运行测试'),
		], [
			'Run the focused tests',
			'Can you show the diff?',
			'Can you show the diff?',
			'继续运行测试',
		]);
	});

	test('rejects absent, malformed, vague, and assistant-like output', () => {
		assert.deepStrictEqual([
			cleanNextUserMessageSuggestion('NONE'),
			cleanNextUserMessageSuggestion('Done'),
			cleanNextUserMessageSuggestion('Suggestion: Run tests'),
			cleanNextUserMessageSuggestion('- Run tests'),
			cleanNextUserMessageSuggestion('/test everything'),
			cleanNextUserMessageSuggestion('Thanks for your help'),
			cleanNextUserMessageSuggestion('Sorry, I cannot help'),
			cleanNextUserMessageSuggestion('No suggestion available'),
			cleanNextUserMessageSuggestion('**Run the tests**'),
			cleanNextUserMessageSuggestion('Run tests\nthen commit'),
		], [
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});
});
