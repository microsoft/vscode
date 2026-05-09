/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { IChatPhoneInputPresenter, IChatPhonePresenterImpl } from '../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IModePickerDelegate } from '../../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IModelPickerDelegate } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { showMobilePickerSheet, IMobilePickerSheetItem } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { agentHostModelPickerStorageKey } from '../agentHost/agentHostModelPicker.js';
import { isWellKnownModeSchema } from '../agentHost/agentHostPermissionPickerDelegate.js';

function getAgentHostModeIcon(value: string | undefined): ThemeIcon | undefined {
	switch (value) {
		case 'plan': return Codicon.checklist;
		case 'autopilot': return Codicon.rocket;
		case 'interactive': return Codicon.comment;
		default: return undefined;
	}
}

/**
 * Action id passed to the workbench `ToggleAgentModeActionId` command when
 * the user picks a mode row. The arg shape is
 * {@link IToggleChatModeArgs}.
 */
type ChatPhonePickerAction =
	| { kind: 'mode'; mode: IChatMode }
	| { kind: 'model'; model: ILanguageModelChatMetadataAndIdentifier }
	| { kind: 'agentHostMode'; value: string }
	| { kind: 'agentHostModel'; model: ILanguageModelChatMetadataAndIdentifier };

/**
 * Sessions-side implementation of {@link IChatPhoneInputPresenter}.
 *
 * On phone-layout viewports of the agents window, intercepts the
 * workbench {@link ChatInputPart}'s Mode + Model pickers and routes them
 * through the shared {@link showMobilePickerSheet} bottom sheet — the
 * same primitive used by the empty new-chat input (see
 * {@link MobileChatInputConfigPicker}). Workbench code does not depend on
 * the sheet primitive: it only sees the {@link IChatPhoneInputPresenter}
 * decorator interface, so this wiring stays out of the workbench layer.
 */
class MobileChatPhoneInputPresenter extends Disposable implements IChatPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();

		// Track the phone-layout context key (`sessionsIsPhoneLayout`) so
		// the workbench toolbar refreshes its action view items the moment
		// we cross the phone breakpoint. This key is the source of truth
		// for "is this viewport phone-classified" — the layout policy
		// updates it through the workbench's main `layout()` pass.
		const isPhoneCtx = observableContextKey<boolean>('sessionsIsPhoneLayout', contextKeyService);
		this.enabled = derived(this, reader => isPhoneCtx.read(reader) === true);
	}

	async showCombinedModeAndModelSheet(
		_target: HTMLElement,
		modeDelegate: IModePickerDelegate | undefined,
		modelDelegate: IModelPickerDelegate | undefined,
	): Promise<void> {
		// Side table from opaque sheet-row id back to the action it
		// represents. Mirrors {@link MobileChatInputConfigPicker} so
		// values containing `:` or other separator-unsafe characters
		// (e.g. model identifiers like `copilot:gpt-4o`) round-trip
		// safely through the sheet's string id contract.
		const idToAction = new Map<string, ChatPhonePickerAction>();
		const registerAction = (action: ChatPhonePickerAction): string => {
			const id = `chat-phone-picker-row-${idToAction.size}`;
			idToAction.set(id, action);
			return id;
		};

		const sheetItems: IMobilePickerSheetItem[] = [];

		// If the active session is an agent-host session, show its
		// agent-host config (interactive / plan / autopilot via
		// {@link SessionConfigKey.Mode}) and the resource-scheme-filtered
		// model list — the same data path as the empty new-chat input
		// picker (see `MobileChatInputConfigPicker`). The workbench
		// chat-modes (Ask / Edit / Agent) and unfiltered model list
		// surfaced through `modeDelegate`/`modelDelegate` belong to the
		// default Copilot chat protocol and are wrong for agent-host
		// sessions.
		const activeSession = this._sessionsManagementService.activeSession.get();
		const rawProvider = activeSession ? this._sessionsProvidersService.getProvider(activeSession.providerId) : undefined;
		const agentHostProvider = rawProvider && isAgentHostProvider(rawProvider) ? rawProvider : undefined;

		if (activeSession && agentHostProvider) {
			const config = agentHostProvider.getSessionConfig(activeSession.sessionId);
			const modeSchema = config?.schema.properties[SessionConfigKey.Mode];
			const modeItems = (modeSchema && isWellKnownModeSchema(modeSchema))
				? (modeSchema.enum ?? []).map((value, index) => ({
					value,
					label: modeSchema.enumLabels?.[index] ?? value,
					description: modeSchema.enumDescriptions?.[index],
				}))
				: [];
			const rawCurrentMode = config?.values[SessionConfigKey.Mode] ?? modeSchema?.default;
			const currentModeValue = (typeof rawCurrentMode === 'string' && modeItems.some(i => i.value === rawCurrentMode))
				? rawCurrentMode
				: modeItems[0]?.value;

			modeItems.forEach((item, index) => {
				sheetItems.push({
					id: registerAction({ kind: 'agentHostMode', value: item.value }),
					label: item.label,
					description: item.description,
					icon: getAgentHostModeIcon(item.value),
					checked: item.value === currentModeValue,
					sectionTitle: index === 0
						? localize('chatPhoneInput.modeSection', "Agent Mode")
						: undefined,
				});
			});

			// Filter the language models by the session's resource
			// scheme — same logic as `getAgentHostModels` in
			// `agentHostModelPicker.ts` and `mobileChatInputConfigPicker.ts`.
			const resourceScheme = activeSession.resource.scheme;
			const agentHostModels = this._languageModelsService.getLanguageModelIds()
				.map(id => {
					const metadata = this._languageModelsService.lookupLanguageModel(id);
					return metadata ? { metadata, identifier: id } : undefined;
				})
				.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === resourceScheme);
			// Match desktop `agentHostModelPicker.ts`: only fall back to
			// the per-scheme storage key for untitled sessions. A saved
			// session has its own `modelId`.
			const isUntitled = activeSession.status.get() === SessionStatus.Untitled;
			const storedModelId = isUntitled
				? this._storageService.get(agentHostModelPickerStorageKey(resourceScheme), StorageScope.PROFILE)
				: undefined;
			const currentModelId = activeSession.modelId.get() ?? storedModelId;

			agentHostModels.forEach((model, index) => {
				sheetItems.push({
					id: registerAction({ kind: 'agentHostModel', model }),
					label: model.metadata.name,
					checked: model.identifier === currentModelId,
					sectionTitle: index === 0
						? localize('chatPhoneInput.modelSection', "Model")
						: undefined,
				});
			});
		} else {
			// Default Copilot chat path: requires the workbench
			// delegates. Callers without delegates (e.g. the agent-host
			// mode pill on phone, when no agent-host session is active)
			// have nothing to show.
			if (!modeDelegate || !modelDelegate) {
				return;
			}
			const modes = modeDelegate.currentChatModes.get();
			const currentMode = modeDelegate.currentMode.get();
			const modelItems = modelDelegate.getModels();
			const currentModel = modelDelegate.currentModel.get();

			const allModes = [...modes.builtin, ...modes.custom];
			allModes.forEach((mode, index) => {
				const icon = mode.icon.get();
				sheetItems.push({
					id: registerAction({ kind: 'mode', mode }),
					label: mode.label.get(),
					icon: ThemeIcon.isThemeIcon(icon) ? icon : undefined,
					checked: mode.id === currentMode.id,
					sectionTitle: index === 0
						? localize('chatPhoneInput.modeSection', "Agent Mode")
						: undefined,
				});
			});

			modelItems.forEach((model, index) => {
				sheetItems.push({
					id: registerAction({ kind: 'model', model }),
					label: model.metadata.name,
					checked: model.identifier === currentModel?.identifier,
					sectionTitle: index === 0
						? localize('chatPhoneInput.modelSection', "Model")
						: undefined,
				});
			});
		}

		if (sheetItems.length === 0) {
			return;
		}

		const performAction = (action: ChatPhonePickerAction): void => {
			// Re-resolve the active session and its provider on every
			// tap. The sheet stays open across multiple selections via
			// `stayOpenOnSelect`, and the active session can change
			// while it's open (e.g. background switch). Capturing once
			// at sheet-open would silently apply later writes to the
			// stale session.
			const session = this._sessionsManagementService.activeSession.get();
			const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
			const ahProvider = provider && isAgentHostProvider(provider) ? provider : undefined;

			switch (action.kind) {
				case 'mode':
					// Same dispatch the desktop mode picker uses (see
					// `modePickerActionItem.ts` — the row's `run()` invokes
					// `ToggleAgentModeActionId` with `{ modeId, sessionResource }`).
					this._commandService.executeCommand(
						ToggleAgentModeActionId,
						{ modeId: action.mode.id, sessionResource: modeDelegate?.sessionResource() } satisfies IToggleChatModeArgs,
					).catch(() => { /* best-effort */ });
					break;
				case 'model':
					// Same dispatch the desktop model picker uses (see
					// `ModelPickerActionItem` — `onDidChangeSelection` routes to
					// `delegate.setModel`).
					modelDelegate?.setModel(action.model);
					break;
				case 'agentHostMode':
					// Same write path as `MobileChatInputConfigPicker` and
					// `AgentHostModePicker._showPicker`'s `onSelect`.
					if (session && ahProvider) {
						ahProvider.setSessionConfigValue(session.sessionId, SessionConfigKey.Mode, action.value)
							.catch(() => { /* best-effort */ });
					}
					break;
				case 'agentHostModel':
					// Drive the workbench delegate (when present) so the
					// chip's `currentModel` observable updates immediately
					// and the input toolbar repaints.
					if (modelDelegate) {
						modelDelegate.setModel(action.model);
					} else if (session) {
						// Caller (e.g. the agent-host mode pill) didn't
						// pass a delegate. Look up the chat widget by
						// the active session's resource — this is the
						// input that owns the `_currentLanguageModel`
						// observable the workbench chip reads. Using
						// `lastFocusedWidget` would be a global focus
						// tracker and could push the chip update into a
						// different input than the model write.
						this._chatWidgetService.getWidgetBySessionResource(session.resource)
							?.input.setCurrentLanguageModel(action.model);
					}
					if (session && ahProvider) {
						// Persist to the shared storage key so the empty
						// new-chat picker (`MobileChatInputConfigPicker`)
						// remembers the same selection across surfaces,
						// and push to the agent-host provider so the
						// next send goes out with the picked model.
						this._storageService.store(agentHostModelPickerStorageKey(session.resource.scheme), action.model.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
						ahProvider.setModel(session.sessionId, action.model.identifier);
					}
					break;
			}
		};

		// Use `stayOpenOnSelect` so tapping a row applies the choice but
		// keeps the sheet visible until the user explicitly hits Done
		// (or the backdrop / Escape). This matches the multi-property
		// sheets in the agents window where users adjust several values
		// in one session.
		await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('chatPhoneInput.title', "Configure Session"),
			sheetItems,
			{
				stayOpenOnSelect: true,
				onDidSelect: id => {
					const action = idToAction.get(id);
					if (action) {
						performAction(action);
					}
				},
			},
		);
	}
}

class MobileChatPhoneInputPresenterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.mobileChatPhoneInputPresenter';

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatPhoneInputPresenter presenter: IChatPhoneInputPresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const impl = this._register(instantiationService.createInstance(MobileChatPhoneInputPresenter));

		// Keep the registration mounted for the lifetime of the
		// contribution. The workbench presenter's `enabled` observable
		// already gates the actual sheet path on phone layout, so no
		// dynamic mount/unmount is needed here.
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(
	MobileChatPhoneInputPresenterContribution.ID,
	MobileChatPhoneInputPresenterContribution,
	WorkbenchPhase.AfterRestored,
);
