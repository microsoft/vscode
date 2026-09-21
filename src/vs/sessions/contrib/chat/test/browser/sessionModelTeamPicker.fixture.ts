/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { toAction } from '../../../../../base/common/actions.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ModelPickerActionItem } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { resolveModelIdentifier } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { NullLanguageModelsService } from '../../../../../workbench/contrib/chat/test/common/languageModels.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionModelTeam, ISessionModelTeamState, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionModelTeamContext, SessionModelTeamPicker } from '../../browser/sessionModelTeamPicker.js';

const models: ILanguageModelChatMetadataAndIdentifier[] = ['Lead model', 'Worker model with a long name', 'Scout model'].map((name, index) => ({
	identifier: `fixture-model-${index}`,
	metadata: {
		id: `fixture-model-${index}`, name, vendor: 'fixture', family: 'fixture', version: '1',
		extension: new ExtensionIdentifier('fixture.model-teams'),
		maxInputTokens: 128000, maxOutputTokens: 16000, isDefaultForLocation: {},
		configurationSchema: {
			properties: {
				thinkingLevel: {
					type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'],
					enumItemLabels: ['Low', 'Medium', 'High'], default: 'medium',
				},
			},
		},
	},
}));

interface IRolePanelFixtureOptions {
	readonly roleCount: 2 | 3;
	readonly width?: number;
	readonly persistent?: boolean;
	readonly paused?: boolean;
	readonly popup?: boolean;
	readonly choices?: 'model' | 'reasoning';
}

async function renderRolePanel({ container, disposableStore, theme }: ComponentFixtureContext, options: IRolePanelFixtureOptions): Promise<void> {
	const { roleCount, width = options.popup ? 560 : roleCount === 3 ? 480 : 320 } = options;
	container.style.width = `${width}px`;
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';
	const context = observableValue<ISessionModelTeamContext>('context', {
		sessionId: 'fixture-session', providerId: 'fixture', chatResource: URI.parse('chat:/model-team-fixture'), modelId: models[0].identifier,
	});
	const changes = disposableStore.add(new Emitter<void>());
	let state: ISessionModelTeamState = {
		supported: true, pending: false, leadModelConfiguration: { thinkingLevel: 'high' },
		selection: {
			workerModelId: models[1].identifier, workerModelConfiguration: { thinkingLevel: 'medium' },
			...(roleCount === 3 ? { scoutModelId: models[2].identifier, scoutModelConfiguration: { thinkingLevel: 'low' } } : {}),
		},
		...(options.persistent ? {
			members: [
				{ role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: !options.paused },
				...(roleCount === 3 ? [{ role: 'scout' as const, chatResource: URI.parse('chat:/persistent-scout'), status: options.paused ? SessionStatus.Completed : SessionStatus.NeedsInput, enabled: !options.paused }] : []),
			],
		} : {}),
	};
	if (options.paused) {
		state = { ...state, selection: undefined, rememberedSelection: state.selection };
	}
	const session = new class extends mock<ISession>() {
		override readonly sessionId = 'fixture-session';
	}();
	const provider = new class extends mock<ISessionsProvider>() {
		override readonly id = 'fixture';
		override readonly onDidChangeModels = Event.None;
		override readonly onDidChangeModelTeam = changes.event;
		override getModelsSnapshot() { return { models, modelTarget: undefined, desiredModelResolution: resolveModelIdentifier(models, context.get().modelId, true) }; }
		override getModelTeam() { return state; }
		override getSessions() { return [session]; }
		override async setModelTeam(_sessionId: string, _chatResource: URI, modelId: string, selection: ISessionModelTeam | undefined, configuration?: Readonly<Record<string, unknown>>): Promise<void> {
			state = {
				...state, selection, leadModelConfiguration: configuration ?? state.leadModelConfiguration,
				rememberedSelection: selection ? undefined : state.selection ?? state.rememberedSelection,
			};
			context.set({ ...context.get(), modelId }, undefined);
			changes.fire();
		}
	};
	const registeredProvider: ISessionsProvider = provider;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerChatFixtureServices(registration);
			if (options.popup) {
				registration.defineInstance(ILanguageModelsService, new class extends NullLanguageModelsService {
					override getLanguageModelIds() { return models.map(model => model.identifier); }
					override lookupLanguageModel(id: string) { return models.find(model => model.identifier === id)?.metadata; }
				}());
				registration.defineInstance(IProductService, upcastPartial<IProductService>({ version: '1.100.0' }));
				registration.defineInstance(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
				registration.defineInstance(ILayoutService, upcastPartial<ILayoutService>({
					getContainer: () => container, mainContainer: container, activeContainer: container, onDidLayoutContainer: Event.None,
				}));
				registration.define(IContextViewService, ContextViewService);
				registration.define(IActionWidgetService, ActionWidgetService);
			}
			registration.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override async openChat(): Promise<void> { }
			}());
			registration.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProvider<T extends ISessionsProvider>(): T { return registeredProvider as T; }
			}());
		},
	});
	const picker = disposableStore.add(instantiationService.createInstance(SessionModelTeamPicker, context, undefined));
	if (options.popup) {
		container.classList.add('interactive-session');
		container.style.position = 'relative';
		container.style.height = options.choices ? '560px' : '340px';
		const toolbars = append(container, $('.chat-input-toolbars'));
		const toolbar = append(toolbars, $('.chat-input-toolbar'));
		toolbar.style.position = 'absolute';
		toolbar.style.bottom = 'var(--vscode-spacing-size80)';
		toolbar.style.left = 'var(--vscode-spacing-size80)';
		const item = append(toolbar, $('div'));
		const currentModel = observableValue('fixture.currentModel', models[0]);
		const delegate = picker.decorate({
			currentModel,
			setModel: model => currentModel.set(model, undefined),
			getModels: () => models,
			getPresentationOptions: () => ({
				useGroupedModelPicker: true, showManageModelsAction: false, showUnavailableFeatured: false,
				showFeatured: false, showAutoModel: false, showModelIcon: true,
			}),
		});
		const modelPicker = disposableStore.add(instantiationService.createInstance(ModelPickerActionItem,
			toAction({ id: 'fixture.modelTeam', label: 'Models', run: () => { } }),
			delegate, { compact: constObservable(false) }));
		modelPicker.render(item);
		await Promise.resolve();
		modelPicker.show();
		if (options.choices) {
			const control = container.querySelector<HTMLElement>(`[data-role="worker"][data-control="${options.choices}"]`);
			if (!control) {
				throw new Error('The Worker selector must be rendered inside the team popup.');
			}
			control.click();
		}
		return;
	}
	const mounted = disposableStore.add(new MutableDisposable<DisposableStore>());
	const popup = {
		anchor: container,
		hide: () => mounted.clear(),
		reopen: () => {
			const content = picker.getAdditionalContent();
			if (!content) {
				throw new Error('The model-team fixture requires picker content.');
			}
			const renderStore = new DisposableStore();
			mounted.value = renderStore;
			if (content.renderHeader) {
				renderStore.add(content.renderHeader(container, popup));
			}
			if (content.render) {
				renderStore.add(content.render(container, popup));
			}
		},
	};
	popup.reopen();
}

const additionalThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'sessions/chat/modelTeam/' }, {
	TwoRolePanel: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['An enabled Team switch sits above two equal role cards. Each card has its own model and reasoning button; no Apply/Cancel form is visible.'],
		render: context => renderRolePanel(context, { roleCount: 2 }),
	}),
	ThreeRolePanel: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['Three compact role cards share one horizontal row in Lead, Worker, Scout order, with separate High, Medium, and Low reasoning choices and a Remove Scout action.'],
		render: context => renderRolePanel(context, { roleCount: 3 }),
	}),
	NarrowThreeRolePanel: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['In a narrow container, the three role cards reflow vertically without clipping their controls. Long model names have ellipses.'],
		render: context => renderRolePanel(context, { roleCount: 3, width: 240 }),
	}),
	PersistentTwoRolePanel: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The Worker card has a Ready status and an Open Chat action beneath its model and reasoning controls. Both roles have ordinary chat controls.'],
		render: context => renderRolePanel(context, { roleCount: 2, persistent: true }),
	}),
	PersistentThreeRolePicker: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The actual model-picker popup fits three compact cards in one horizontal row: Lead, Worker, then Scout. Model and reasoning controls, teammate status, Open Chat, and Reset remain visible without clipping.'],
		render: context => renderRolePanel(context, { roleCount: 3, persistent: true, popup: true }),
	}),
	PersistentInlineModels: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The Team popup keeps its three compact role cards visible above an embedded searchable Worker model list. The selected role is expanded, and no separate model popup replaces the Team controls. Role symbols use the badge foreground, not muted gray.'],
		render: context => renderRolePanel(context, { roleCount: 3, persistent: true, popup: true, choices: 'model' }),
	}),
	PersistentInlineReasoning: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The three Team cards remain visible above the embedded Worker Reasoning choices. Medium is checked and a Close Choices button returns focus to the Worker reasoning control without closing Team.'],
		render: context => renderRolePanel(context, { roleCount: 3, persistent: true, popup: true, choices: 'reasoning' }),
	}),
	PersistentNarrowThreeRolePanel: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['Three cards reflow vertically. Worker is Ready, Scout needs approval or input, and their chat actions fit within the narrow cards.'],
		render: context => renderRolePanel(context, { roleCount: 3, width: 240, persistent: true }),
	}),
	PersistentPausedHistory: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes,
		expectedVisualDescriptions: ['The Team switch is off and no model-team cards are visible. Rows marked Not in Team provide actions to open the saved Worker and Scout conversations.'],
		render: context => renderRolePanel(context, { roleCount: 3, width: 360, persistent: true, paused: true }),
	}),
});
