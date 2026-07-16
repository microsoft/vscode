/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../../../base/browser/dom.js';
import { IManagedHoverContent } from '../../../../../../../base/browser/ui/hover/hover.js';
import { getBaseLayerHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem } from '../../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../../base/common/observable.js';
import { localize } from '../../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { IChatInputPickerOptions } from '../chatInputPickerActionItem.js';
import { ModelPickerWidget } from './modelPickerWidget.js';

/**
 * Read/write access to a model's configuration (e.g. context size, thinking
 * effort). Implemented either by the global {@link ILanguageModelsService} or by
 * a per-editor override layer so that one editor's changes do not sync to other
 * already-open editors. Structurally satisfied by `ILanguageModelsService`.
 */
export interface IModelConfigurationAccess {
	getModelConfiguration(modelId: string): IStringDictionary<unknown> | undefined;
	setModelConfiguration(modelId: string, values: IStringDictionary<unknown>): Promise<void>;
	getModelConfigurationActions(modelId: string): IAction[];
	/**
	 * Fires when this access layer's configuration changes (e.g. user picks a
	 * new context size). Implementations that always read the global value can
	 * omit this and rely on `ILanguageModelsService.onDidChangeLanguageModels`.
	 */
	readonly onDidChange?: Event<string /* modelId */>;
}

export interface IModelPickerDelegate {
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined>;
	setModel(model: ILanguageModelChatMetadataAndIdentifier): void;
	getModels(): ILanguageModelChatMetadataAndIdentifier[];
	useGroupedModelPicker(): boolean;
	showManageModelsAction(): boolean;
	showUnavailableFeatured(): boolean;
	showFeatured(): boolean;
	useGenericModelIcon?(): boolean;
	/**
	 * Whether the synthetic "Auto" model is available for the current session,
	 * so it can fall back to Auto. Defaults to `true` when omitted. When this
	 * returns `false` and {@link getModels} is empty, the picker shows a
	 * "No models available" entry (and an upgrade prompt for Copilot Free /
	 * Student users) instead of an Auto entry.
	 */
	showAutoModel?(): boolean;
	/**
	 * The id of the current chat session, used to correlate model-picker
	 * changes with the session in telemetry. Matches the `chatSessionId`
	 * reported by other chat telemetry events (e.g. the chat request event).
	 * Returns `undefined` when no session is active.
	 */
	getChatSessionId?(): string | undefined;
	/**
	 * UI hint flag controlling whether the picker shows the cache-break hint.
	 * Returns `true` when the session has likely warmed the prompt cache (e.g. it
	 * has sent a request), inferred from request history / session status rather
	 * than the provider's actual cache state — so it does not account for cache
	 * expiry or a cache that was already reset. Defaults to `false` when omitted.
	 */
	isCacheWarm?(): boolean;
	/**
	 * Per-editor model configuration access. When omitted, the picker reads and
	 * writes configuration through the global {@link ILanguageModelsService}.
	 */
	readonly modelConfiguration?: IModelConfigurationAccess;
}

/**
 * Action view item for selecting a language model in the chat interface.
 *
 * Wraps a {@link ModelPickerWidget} and adapts it for use in an action bar,
 * providing curated model suggestions, upgrade prompts, and grouped layout.
 */
export class ModelPickerActionItem extends BaseActionViewItem {
	private readonly _pickerWidget: ModelPickerWidget;
	private readonly _managedHover = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		delegate: IModelPickerDelegate,
		private readonly pickerOptions: IChatInputPickerOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action);

		this._pickerWidget = this._register(instantiationService.createInstance(ModelPickerWidget, delegate));
		this._pickerWidget.setSelectedModel(delegate.currentModel.get());
		this._pickerWidget.setCompact(pickerOptions.compact);

		// Sync delegate → widget when model list or selection changes externally
		this._register(autorun(t => {
			const model = delegate.currentModel.read(t);
			this._pickerWidget.setSelectedModel(model);
			this._updateTooltip();
		}));

		// Sync widget → delegate when user picks a model
		this._register(this._pickerWidget.onDidChangeSelection(model => delegate.setModel(model)));
	}

	override render(container: HTMLElement): void {
		this._pickerWidget.render(container);
		this.element = this._pickerWidget.domNode;
		this._updateTooltip();
		container.classList.add('chat-input-picker-item');
	}

	private _getAnchorElement(): HTMLElement {
		if (this.element && getActiveWindow().document.contains(this.element)) {
			return this.element;
		}
		return this.pickerOptions.getOverflowAnchor?.() ?? this.element!;
	}

	public openModelPicker(): void {
		this._showPicker();
	}

	public show(): void {
		this._showPicker();
	}

	public setEnabled(enabled: boolean): void {
		this._pickerWidget.setEnabled(enabled);
	}

	/**
	 * Whether the picker has no usable model because the workspace is untrusted
	 * (Restricted Mode). Lets a host (e.g. the sessions picker) keep the picker
	 * visible to surface the "Models" placeholder and Trust Workspace action
	 * instead of hiding it as an empty/no-model picker.
	 */
	public isRestrictedMode(): boolean {
		return this._pickerWidget.isRestrictedMode();
	}

	/**
	 * Whether the picker has no usable model because Chat still needs sign-in /
	 * setup. Like {@link isRestrictedMode}, lets a host keep the picker visible to
	 * surface the "Models" placeholder and Sign In action.
	 */
	public isSetupRequired(): boolean {
		return this._pickerWidget.isSetupRequired();
	}

	private _showPicker(): void {
		this._pickerWidget.show(this._getAnchorElement());
	}

	private _updateTooltip(): void {
		const target = this._pickerWidget.nameButton;
		if (!target) {
			return;
		}
		// Use a content factory so the hover reflects the current state each time
		// it is shown — in particular the Restricted Mode / sign-in messages, which
		// depend on workspace trust / entitlement changing without this item being
		// re-rendered.
		this._managedHover.value = getBaseLayerHoverDelegate().setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			target,
			() => this._getHoverContents()
		);
	}

	private _getHoverContents(): IManagedHoverContent {
		// Keep the hover prefix in sync with the picker's visible "Models" label
		// (the same localization key) so the hover doesn't read "Pick Model • …".
		let label = localize('chat.modelPicker.modelsLabel', "Models");
		const keybindingLabel = this.keybindingService.lookupKeybinding(this._action.id, this._contextKeyService)?.getLabel();
		if (keybindingLabel) {
			label += ` (${keybindingLabel})`;
		}
		if (this._pickerWidget.isRestrictedMode()) {
			// Suffix avoids a leading "Models" so the hover doesn't stutter as
			// "Models • Models unavailable…" once the prefix is "Models".
			return localize('chat.modelPicker.restrictedHover', "{0} • Unavailable while in Restricted mode. Trust Workspace to enable models.", label);
		}
		if (this._pickerWidget.isSetupRequired()) {
			return localize('chat.modelPicker.setupRequiredHover', "{0} • Sign in to GitHub Copilot to choose a model.", label);
		}
		const { statusIcon, tooltip } = this._pickerWidget.selectedModel?.metadata || {};
		return statusIcon && tooltip ? `${label} • ${tooltip}` : label;
	}
}
