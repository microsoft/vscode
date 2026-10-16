/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IModelPickerDelegate, ModelPickerActionItem } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { MockChatSessionsService } from '../../../../../workbench/contrib/chat/test/common/mockChatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Menus } from '../../../../browser/menus.js';
import { IsPhoneLayoutContext, SessionUsesCombinedConfigPickerContext } from '../../../../common/contextkeys.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionConfigProvider, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ModelPicker, ModelPickerActionViewItem } from '../../browser/modelPicker.js';
import { INewChatModelPickerService, NewChatModelPickerService } from '../../browser/newChatModelPicker.js';
import { ISessionModelSelection } from '../../browser/sessionModelSelection.js';
import { createModelSelectionState, EMPTY_MODEL_SELECTION_STATE, hasSelectableModel, hasSendableModelSelection, normalizeModelPickerOptions } from '../../browser/sessionModelPickerState.js';

const aModel = { identifier: 'copilot-gpt-4o', metadata: {} } as ILanguageModelChatMetadataAndIdentifier;

suite('ModelPicker selectability', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns true when models are available', () => {
		assert.strictEqual(hasSelectableModel([aModel], normalizeModelPickerOptions({
			showUnavailableFeatured: false,
			showManageModelsAction: false,
			showAutoModel: false,
		})), true);
	});

	test('returns false when empty and Auto is unavailable', () => {
		assert.strictEqual(hasSelectableModel([], normalizeModelPickerOptions({
			showUnavailableFeatured: false,
			showManageModelsAction: false,
			showAutoModel: false,
		})), false);
	});

	test('returns true when empty and Auto support is omitted', () => {
		assert.strictEqual(hasSelectableModel([], normalizeModelPickerOptions({
			showUnavailableFeatured: false,
			showManageModelsAction: false,
		})), true);
	});

	test('allows an unresolved selection only when Auto is available', () => {
		const pendingSelection = { reference: 'pending-model' };
		const options = {
			showUnavailableFeatured: false,
			showManageModelsAction: false,
		};
		const autoOptions = normalizeModelPickerOptions({ ...options, showAutoModel: true });
		const explicitModelOptions = normalizeModelPickerOptions({ ...options, showAutoModel: false });

		assert.deepStrictEqual({
			auto: hasSendableModelSelection(createModelSelectionState([], autoOptions, undefined, pendingSelection)),
			explicitModel: hasSendableModelSelection(createModelSelectionState([], explicitModelOptions, undefined, pendingSelection)),
		}, {
			auto: true,
			explicitModel: false,
		});
	});
});

suite('ModelPicker automation toolbar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes the model picker inside the automation prompt with AI and phone gating', () => {
		const item = MenuRegistry.getMenuItems(Menus.AutomationsDialogInputToolbar).find(item => isIMenuItem(item) && item.command.id === 'sessions.modelPicker');
		assert.ok(item && isIMenuItem(item));
		const context = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const enabledKey = ChatContextKeys.enabled.bindTo(context);
		const inDialogKey = ChatContextKeys.inAutomationsDialog.bindTo(context);
		const phoneKey = IsPhoneLayoutContext.bindTo(context);
		const combinedKey = SessionUsesCombinedConfigPickerContext.bindTo(context);
		const visible = (enabled: boolean, inDialog: boolean, phone: boolean, combined: boolean) => {
			enabledKey.set(enabled);
			inDialogKey.set(inDialog);
			phoneKey.set(phone);
			combinedKey.set(combined);
			return context.contextMatchesRules(item.when);
		};
		assert.deepStrictEqual({
			desktop: visible(true, true, false, true),
			phone: visible(true, true, true, false),
			combinedPhone: visible(true, true, true, true),
			aiDisabled: visible(false, true, false, false),
			outsideDialog: visible(true, false, false, false),
		}, {
			desktop: true,
			phone: true,
			combinedPhone: false,
			aiDisabled: false,
			outsideDialog: false,
		});
	});

	test('preserves responsive state and opens the registered model picker from its anchor', () => {
		const compact = observableValue('compact', false);
		const anchor = document.createElement('div');
		let openedAt: HTMLElement | undefined;
		const picker = new class extends mock<ModelPicker>() {
			override show(element?: HTMLElement): void { openedAt = element; }
			override dispose(): void { }
		}();
		const item = disposables.add(new ModelPickerActionViewItem(picker, compact));
		item.setCompact(true);
		item.show(anchor);
		assert.deepStrictEqual({ compact: compact.get(), itemCompact: item.isCompact(), openedAt }, {
			compact: true, itemCompact: true, openedAt: anchor,
		});
	});
});

suite('ModelPicker controls', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createControls(session: IObservable<IActiveSession | undefined> = constObservable(undefined), provider?: ISessionsProvider) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
		instantiationService.stub(ISessionsProvidersService, { onDidChangeProviders: Event.None });
		instantiationService.stub(ISessionsProvidersService, 'getProvider', () => provider);
		const modelPickers = new NewChatModelPickerService();
		const selectedModels: string[] = [];
		let opens = 0;
		let disposed = 0;
		instantiationService.stub(ISessionContext, new SessionContext(session));
		instantiationService.stub(ISessionModelSelection, {
			state: constObservable(EMPTY_MODEL_SELECTION_STATE),
			selectModel: id => { selectedModels.push(id); return true; },
		});
		instantiationService.stub(ITelemetryService, {});
		instantiationService.stub(IChatPetService, {});
		instantiationService.stub(INewChatModelPickerService, modelPickers);
		instantiationService.stub(IWorkspaceTrustManagementService, {
			onDidChangeTrust: Event.None,
			workspaceTrustInitialized: Promise.resolve(),
		});
		instantiationService.stub(IChatEntitlementService, {
			onDidChangeEntitlement: Event.None,
			onDidChangeSentiment: Event.None,
			onDidChangeAnonymous: Event.None,
		});
		instantiationService.stubInstance(ModelPickerActionItem, {
			render: () => { },
			openModelPicker: () => opens++,
			setEnabled: () => { },
			isRestrictedMode: () => false,
			isSetupRequired: () => false,
			dispose: () => disposed++,
		});
		const picker = disposables.add(instantiationService.createInstance(ModelPicker, constObservable(false)));
		return { picker, modelPickers, selectedModels, get opens() { return opens; }, get disposed() { return disposed; } };
	}

	test('exposes the rendered picker and its existing operations without a session', () => {
		const rig = createControls();
		const { picker, modelPickers, selectedModels } = rig;
		const control = modelPickers.activePicker;
		assert.ok(control);
		const beforeRender = control.getDomNode();
		const first = document.createElement('div');
		const second = document.createElement('div');
		picker.render(first);
		const firstMatches = control.getDomNode() === first;
		picker.render(second);
		control.open();
		const switched = control.switchToModel('vendor/model');
		const secondMatches = control.getDomNode() === second;
		picker.dispose();

		assert.deepStrictEqual({
			beforeRender, firstMatches, secondMatches, opens: rig.opens, switched, selectedModels, disposed: rig.disposed,
			activePicker: modelPickers.activePicker,
		}, {
			beforeRender: undefined, firstMatches: true, secondMatches: true, opens: 1, switched: true,
			selectedModels: ['vendor/model'], disposed: 1, activePicker: undefined,
		});
	});

	test('the Images control persists the scoped session preference without selecting a chat model', async () => {
		const key = SessionConfigKey.ImageGenerationEnabled;
		const chat = URI.parse('opaque:/image-chat');
		const config: ResolveSessionConfigResult = {
			schema: { type: 'object', properties: { [key]: { type: 'boolean', title: 'Image Generation', default: true, sessionMutable: true } } },
			values: { [key]: true },
		};
		const changed = disposables.add(new Emitter<string>());
		const resolving = observableValue('resolving', false);
		const writes: { session: string; chat: URI; property: string; value: unknown }[] = [];
		const sessionConfig: ISessionConfigProvider = {
			onDidChangeSessionConfig: changed.event,
			getSessionConfig: (_session, target) => {
				assert.strictEqual(target, chat);
				return config;
			},
			getCreateSessionConfig: () => ({}),
			isSessionConfigResolving: (_session, target) => {
				assert.strictEqual(target, chat);
				return resolving;
			},
			setSessionConfigValue: async (session, chat, property, value) => {
				writes.push({ session, chat, property, value });
				config.values[property] = value;
				changed.fire(session);
			},
		};
		const provider = new class extends mock<ISessionsProvider>() {
			override readonly id = 'opaque-provider';
			override readonly sessionConfig = sessionConfig;
		}();
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = 'opaque-owner';
			override readonly providerId = provider.id;
			override readonly activeChat = constObservable(new class extends mock<IChat>() {
				override readonly resource = chat;
			}());
		}();
		const active = observableValue<IActiveSession | undefined>('active', session);
		const rig = createControls(active, provider);
		const delegate = Reflect.get(rig.picker, '_delegate') as IModelPickerDelegate;
		const control = delegate.imageGeneration!;
		let changes = 0;
		disposables.add(control.onDidChange(() => changes++));
		assert.deepStrictEqual(control.getState(), { enabled: true, readOnly: false });
		await control.setEnabled(false);
		assert.deepStrictEqual(control.getState(), { enabled: false, readOnly: false });
		assert.strictEqual(changes, 1);
		assert.deepStrictEqual(writes, [{ session: session.sessionId, chat, property: key, value: false }]);
		resolving.set(true, undefined);
		assert.deepStrictEqual(control.getState(), { enabled: false, readOnly: true });
		await assert.rejects(() => control.setEnabled(true), /Canceled/);
		active.set(undefined, undefined);
		assert.strictEqual(control.getState(), undefined);
		await assert.rejects(() => control.setEnabled(true), /Canceled/);
		assert.deepStrictEqual(rig.selectedModels, []);
		assert.strictEqual(writes.length, 1);
	});
});
