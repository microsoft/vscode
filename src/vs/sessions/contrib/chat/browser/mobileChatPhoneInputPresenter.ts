/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { observableContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../../../../workbench/contrib/chat/browser/actions/chatExecuteActions.js';
import { IChatPhoneInputPresenter, IChatPhonePresenterImpl } from '../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IModePickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { IChatMode } from '../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { showMobilePickerSheet, IMobilePickerSheetItem } from '../../../browser/parts/mobile/mobilePickerSheet.js';

/**
 * Action id passed to the workbench `ToggleAgentModeActionId` command when
 * the user picks a mode row. The arg shape is
 * {@link IToggleChatModeArgs}.
 */
type ChatPhonePickerAction =
	| { kind: 'mode'; mode: IChatMode }
	| { kind: 'model'; model: ILanguageModelChatMetadataAndIdentifier };

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
		modeDelegate: IModePickerDelegate,
		modelDelegate: IModelPickerDelegate,
	): Promise<void> {
		const modes = modeDelegate.currentChatModes.get();
		const currentMode = modeDelegate.currentMode.get();
		const modelItems = modelDelegate.getModels();
		const currentModel = modelDelegate.currentModel.get();

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

		if (sheetItems.length === 0) {
			return;
		}

		const id = await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('chatPhoneInput.title', "Configure Session"),
			sheetItems,
		);

		if (!id) {
			return;
		}
		const action = idToAction.get(id);
		if (!action) {
			return;
		}

		if (action.kind === 'mode') {
			// Same dispatch the desktop mode picker uses (see
			// `modePickerActionItem.ts` — the row's `run()` invokes
			// `ToggleAgentModeActionId` with `{ modeId, sessionResource }`).
			await this._commandService.executeCommand(
				ToggleAgentModeActionId,
				{ modeId: action.mode.id, sessionResource: modeDelegate.sessionResource() } satisfies IToggleChatModeArgs,
			).catch(() => { /* best-effort */ });
		} else {
			// Same dispatch the desktop model picker uses (see
			// `ModelPickerActionItem` — `onDidChangeSelection` routes to
			// `delegate.setModel`).
			modelDelegate.setModel(action.model);
		}
	}
}

class MobileChatPhoneInputPresenterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.mobileChatPhoneInputPresenter';

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatPhoneInputPresenter presenter: IChatPhoneInputPresenter,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super();

		const impl = this._register(new MobileChatPhoneInputPresenter(contextKeyService, commandService, layoutService));

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
