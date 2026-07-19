/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { IModelPickerDelegate, ModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Menus } from '../../../browser/menus.js';
import { IsPhoneLayoutContext, SessionUsesCombinedConfigPickerContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionModelSelectionModel } from './sessionModelSelectionModel.js';
import { INewChatModelPickerService } from './newChatModelPicker.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';

/**
 * The sessions-core model picker. Unlike the previous per-provider pickers,
 * this single widget reads the model list from the active session's provider
 * via {@link ISessionsProvider.getModelsSnapshot}, remembers explicit model choices per
 * shared or targeted model pool, and applies the selection through the existing
 * {@link ISessionsProvider.setModel} API. It reuses the shared workbench
 * {@link ModelPickerActionItem} so the dropdown looks and behaves like the
 * other chat model pickers.
 */
export class ModelPicker extends Disposable {

	private readonly _delegate: IModelPickerDelegate;
	private readonly _modelPicker: ModelPickerActionItem;
	private _container: HTMLElement | undefined;

	constructor(
		compact: IObservable<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@INewChatModelPickerService private readonly _newChatModelPickerService: INewChatModelPickerService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ISessionContext private readonly _sessionContext: ISessionContext,
		@ISessionModelSelectionModel private readonly _selectionModel: ISessionModelSelectionModel,
	) {
		super();
		const currentModel = derived(this, reader => this._selectionModel.state.read(reader).currentModel);

		this._delegate = {
			currentModel,
			setModel: model => {
				const previousModel = this._selectionModel.state.get().currentModel;
				if (this._selectionModel.selectModel(model.identifier)) {
					reportNewChatPickerClosed(this._telemetryService, {
						id: 'NewChatModelPicker',
						optionIdBefore: previousModel?.identifier,
						optionIdAfter: model.identifier,
						optionLabelBefore: previousModel?.metadata.name,
						optionLabelAfter: model.metadata.name,
						isPII: false,
					});
				}
			},
			getModels: () => [...this._selectionModel.state.get().models],
			useGroupedModelPicker: () => this._selectionModel.state.get().options.useGroupedModelPicker,
			showManageModelsAction: () => this._selectionModel.state.get().options.showManageModelsAction,
			showUnavailableFeatured: () => this._selectionModel.state.get().options.showUnavailableFeatured,
			showFeatured: () => this._selectionModel.state.get().options.showFeatured,
			showAutoModel: () => this._selectionModel.state.get().options.showAutoModel,
			isCacheWarm: () => {
				const session = this._sessionContext.session.get();
				// The session's prompt cache is warm once its first request has
				// been sent (status leaves Untitled), matching the main-window
				// picker which warms as soon as the first request is added.
				return session ? session.status.get() !== SessionStatus.Untitled : false;
			},
		};

		const pickerOptions: IChatInputPickerOptions = {
			compact,
		};
		const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
		this._modelPicker = this._register(instantiationService.createInstance(ModelPickerActionItem, action, this._delegate, pickerOptions));
		this._register(this._newChatModelPickerService.registerModelPicker({
			open: () => this._modelPicker.openModelPicker(),
			switchToModel: modelIdentifier => this.switchToModel(modelIdentifier),
		}));

		this._register(autorun(reader => {
			this._selectionModel.state.read(reader);
			this._updatePickerState();
		}));

		// Re-evaluate when workspace trust changes (or finishes initializing): an
		// untrusted workspace disables the model providers, and the shared widget
		// then renders its Restricted Mode state. Visibility is recomputed so the
		// picker stays visible to surface the "Models" placeholder + the Trust
		// action instead of hiding as an empty picker.
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => this._updatePickerState()));
		this._workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
			if (!this._store.isDisposed) {
				this._updatePickerState();
			}
		});

		// Re-evaluate when entitlement / sentiment / anonymous access change: when
		// Chat needs sign-in the shared widget renders a Sign In state, so the
		// picker stays visible to surface it (e.g. after the user signs out/in).
		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._updatePickerState()));
		this._register(this._chatEntitlementService.onDidChangeSentiment(() => this._updatePickerState()));
		this._register(this._chatEntitlementService.onDidChangeAnonymous(() => this._updatePickerState()));
	}

	render(container: HTMLElement): void {
		this._container = container;
		this._modelPicker.render(container);
		this._updatePickerState();
	}

	switchToModel(modelIdentifier: string): boolean {
		return this._selectionModel.selectModel(modelIdentifier);
	}

	/**
	 * Whether the model picker should be shown for the given session. Visible
	 * when the session has models, when its Auto model is unavailable (so the
	 * widget can render the "No models available" empty state), or when the
	 * workspace is untrusted / Chat still needs sign-in (so the widget can render
	 * its Restricted Mode or Sign In state). Otherwise hidden, matching the
	 * historical behavior for providers that offer no models.
	 */
	private _shouldShowPicker(): boolean {
		const state = this._selectionModel.state.get();
		if (state.models.length > 0) {
			return true;
		}
		if (this._modelPicker.isRestrictedMode() || this._modelPicker.isSetupRequired()) {
			return true;
		}
		return !state.options.showAutoModel;
	}

	private _updatePickerState(): void {
		const visible = this._shouldShowPicker();
		this._modelPicker.setEnabled(visible);
		this._updateVisibility(visible);
	}

	private _updateVisibility(visible: boolean): void {
		if (this._container) {
			this._container.style.display = visible ? '' : 'none';
		}
	}
}

// -- Action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.modelPicker',
			title: localize2('sessionsModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				// Hidden on phone when the active provider supplies a combined
				// mode + model picker instead (see MobileChatInputConfigPicker).
				when: ContextKeyExpr.or(IsPhoneLayoutContext.negate(), SessionUsesCombinedConfigPickerContext.negate()),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Action View Item --

export class ModelPickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: ModelPicker) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}
