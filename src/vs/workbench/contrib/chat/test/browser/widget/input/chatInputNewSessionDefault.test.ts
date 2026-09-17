/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TestEditorService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';
import { ChatInputModelSelectionController } from '../../../../browser/widget/input/chatInputModelSelectionController.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { ChatModeKind } from '../../../../common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelNewSessionDefault } from '../../../../common/languageModels.js';
import { IChatModelInputState, IInputModel } from '../../../../common/model/chatModel.js';
import { IIntendedModelSelection } from '../../../../common/modelSelection.js';

suite('Chat input new session default lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function state(selectedModel?: ILanguageModelChatMetadataAndIdentifier): IChatModelInputState {
		return { selectedModel, mode: { id: 'agent', kind: ChatModeKind.Agent }, inputText: 'Draft', attachments: [], selections: [], contrib: {} };
	}

	class InputModel implements IInputModel {
		readonly state = observableValue<IChatModelInputState | undefined>(this, undefined);
		intendedModel: IIntendedModelSelection | undefined;
		isNewSession = true;
		setIntendedModel(selection: IIntendedModelSelection | undefined) { this.intendedModel = selection; }
		setState(value: Partial<IChatModelInputState>) { this.state.set({ ...state(), ...this.state.get(), ...value }, undefined); }
		clearState() { this.state.set(undefined, undefined); }
		toJSON() { return undefined; }
		markSessionStarted() { this.isNewSession = false; }
	}

	function setup() {
		const models: ILanguageModelChatMetadataAndIdentifier[] = ['previous', 'auto', 'model-b'].map(id => ({
			identifier: `copilot/${id}`,
			metadata: {
				extension: new ExtensionIdentifier('test.extension'), vendor: 'copilot', id, name: id,
				family: id, version: '1', maxInputTokens: 1, maxOutputTokens: 1, isDefaultForLocation: {},
			},
		}));
		let bound = new InputModel();
		let resource = URI.parse('vscode-chat-session:/one');
		let decision: ILanguageModelNewSessionDefault | undefined;
		const sharedDraft = observableValue<IChatModelInputState | undefined>('sharedDraft', undefined);
		const input = Object.create(ChatInputPart.prototype) as ChatInputPart;
		const controller = store.add(new ChatInputModelSelectionController({
			getCurrentSessionType: () => 'local',
			getModels: () => models,
			getAllModels: () => models,
			getConfiguredModelValue: () => undefined,
			isEmpty: () => true,
			isNewSession: () => bound.isNewSession,
			getNewSessionDefault: () => decision,
			isModelSupportedHere: () => true,
			getDeclaredDefaultModel: () => models[0],
			getBoundConversationKey: () => resource.toString(),
			getIntentHolder: () => bound,
			applyModel: () => input.flushInputStateToModel(),
		}));
		Object.assign(input, {
			_inputModel: bound,
			_inputModelSessionResource: resource,
			_modelSelectionController: controller,
			_modelConfigStore: { getModelConfiguration: () => undefined },
			_emptyInputState: sharedDraft,
			_chatSessionIsEmpty: true,
			_newSessionDefaultRefresh: 0,
			logService: new NullLogService(),
			getCurrentInputState: () => ({ ...state(controller.currentModel.get()), selectedModelReason: controller.selectionReason }),
		});
		controller.initialize(models[0].identifier);
		return {
			input, controller, sharedDraft, models,
			get bound() { return bound; },
			setDecision(value: ILanguageModelNewSessionDefault | undefined) { decision = value; controller.applyConfiguredDefault(); },
			bindNext() {
				input.flushInputStateToModel();
				bound = new InputModel();
				resource = URI.parse('vscode-chat-session:/two');
				Object.assign(input, { _inputModel: bound, _inputModelSessionResource: resource });
				controller.beginConversationSwitch();
				decision = undefined;
				const inherited = sharedDraft.get()!;
				bound.setState(inherited);
				controller.syncFromConversationState(inherited.selectedModel!, inherited.modelConfiguration, 'local', resource.toString());
				controller.applyConfiguredDefault();
			},
			rebind(model: InputModel) {
				input.flushInputStateToModel();
				bound = model;
				resource = URI.parse('vscode-chat-session:/one');
				Object.assign(input, { _inputModel: bound, _inputModelSessionResource: resource });
				controller.beginConversationSwitch();
				decision = undefined;
				const ownDraft = bound.state.get()!;
				controller.syncFromConversationState(ownDraft.selectedModel!, ownDraft.modelConfiguration, 'local', resource.toString());
			},
		};
	}

	for (const variant of [undefined, 'control'] as const) {
		test(`an unsubmitted treatment draft does not contaminate a new ${variant ?? 'unassigned'} chat`, () => {
			const harness = setup();
			harness.setDecision({ variant: 'treatment', assignmentContext: 'fixture:treatment' });
			const first = harness.controller.currentModel.get()?.identifier;
			const ownDraft = harness.bound.state.get()?.selectedModel?.identifier;
			const inherited = harness.sharedDraft.get()?.selectedModel?.identifier;
			harness.bindNext();
			harness.setDecision(variant ? { variant, assignmentContext: 'fixture:control' } : undefined);
			assert.deepStrictEqual({ first, ownDraft, inherited, next: harness.controller.currentModel.get()?.identifier }, {
				first: 'copilot/auto', ownDraft: 'copilot/auto', inherited: 'copilot/previous', next: 'copilot/previous',
			});
		});

		test(`a deliberate model B choice is inherited by a new ${variant ?? 'unassigned'} chat`, () => {
			const harness = setup();
			harness.setDecision({ variant: 'treatment', assignmentContext: 'fixture:treatment' });
			harness.controller.applySelection(harness.models[2], () => harness.input.flushInputStateToModel(), true);
			harness.bindNext();
			harness.setDecision(variant ? { variant, assignmentContext: 'fixture:control' } : undefined);
			assert.deepStrictEqual({
				inherited: harness.sharedDraft.get()?.selectedModel?.identifier,
				next: harness.controller.currentModel.get()?.identifier,
			}, { inherited: 'copilot/model-b', next: 'copilot/model-b' });
		});
	}

	test('reopening the unsubmitted treatment conversation keeps Auto without contaminating the shared draft', () => {
		const harness = setup();
		harness.setDecision({ variant: 'treatment', assignmentContext: 'fixture:treatment' });
		const treatmentConversation = harness.bound;
		harness.bindNext();
		harness.rebind(treatmentConversation);
		assert.deepStrictEqual({
			own: harness.controller.currentModel.get()?.identifier,
			inherited: harness.sharedDraft.get()?.selectedModel?.identifier,
		}, { own: 'copilot/auto', inherited: 'copilot/previous' });
		harness.bindNext();
		assert.strictEqual(harness.controller.currentModel.get()?.identifier, 'copilot/previous');
	});

	test('Send freezes the model before a deferred save and submit handler', async () => {
		const harness = setup();
		const saving = new DeferredPromise<void>();
		const saved = new DeferredPromise<void>();
		const editorService = store.add(new class extends TestEditorService {
			override async saveAll() {
				await saving.complete();
				await saved.p;
				return { success: true, editors: [] };
			}
		});
		let submittedModel: string | undefined;
		const viewModel = { sessionResource: URI.parse('vscode-chat-session:/one') };
		const widget = Object.create(ChatWidget.prototype) as ChatWidget;
		Object.defineProperties(widget, {
			input: { value: harness.input },
			inputEditor: { value: {} },
			_viewModel: { value: viewModel },
			viewModel: { value: viewModel },
			configurationService: { value: new TestConfigurationService() },
			editorService: { value: editorService },
			viewOptions: { value: { submitHandler: async () => { submittedModel = harness.controller.currentModel.get()?.identifier; return true; } } },
		});
		Object.assign(harness.input, { getAttachedContext: () => ({ asArray: () => [] }) });
		Object.defineProperty(harness.input, 'currentModeKind', { value: ChatModeKind.Agent });
		const submission = widget.acceptInput('Hello');
		await saving.p;
		harness.setDecision({ variant: 'treatment', assignmentContext: 'fixture:treatment' });
		const duringSave = harness.controller.currentModel.get()?.identifier;
		await saved.complete();
		await submission;
		assert.deepStrictEqual({ duringSave, submittedModel }, { duringSave: 'copilot/previous', submittedModel: 'copilot/previous' });
	});
});
