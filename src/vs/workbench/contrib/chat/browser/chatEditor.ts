/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { Memento } from '../../../common/memento.js';
import { clearChatEditor } from './actions/chatClear.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { ChatWidget, IChatViewState } from './chatWidget.js';
import { ChatAgentLocation } from '../common/chatAgents.js';
import { IChatModel, IExportableChatData, ISerializableChatData } from '../common/chatModel.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';

export interface IChatEditorOptions extends IEditorOptions {
	target?: { sessionId: string } | { data: IExportableChatData | ISerializableChatData };
}

export class ChatEditor extends EditorPane {
	private widget!: ChatWidget;

	private _scopedContextKeyService!: IScopedContextKeyService;
	override get scopedContextKeyService() {
		return this._scopedContextKeyService;
	}

	private _memento: Memento | undefined;
	private _viewState: IChatViewState | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(ChatEditorInput.EditorID, group, telemetryService, themeService, storageService);
	}

	private async clear() {
		if (this.input) {
			return this.instantiationService.invokeFunction(clearChatEditor, this.input as ChatEditorInput);
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));

		this.widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Panel,
				undefined,
				{ supportsFileReferences: true },
				{
					listForeground: editorForeground,
					listBackground: editorBackground,
					overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this._register(this.widget.onDidClear(() => this.clear()));
		this.widget.render(parent);
		this.widget.setVisible(true);
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		this.widget?.setVisible(visible);
	}

	public override focus(): void {
		super.focus();

		this.widget?.focusInput();
	}

	override clearInput(): void {
		this.saveState();
		super.clearInput();
	}

	override async setInput(input: ChatEditorInput, options: IChatEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		super.setInput(input, options, context, token);

		const editorModel = await input.resolve();
		if (!editorModel) {
			throw new Error(`Failed to get model for chat editor. id: ${input.sessionId}`);
		}

		if (!this.widget) {
			throw new Error('ChatEditor lifecycle issue: no editor widget');
		}

		this.updateModel(editorModel.model, options?.viewState ?? input.options.viewState);
	}

	private updateModel(model: IChatModel, viewState?: IChatViewState): void {
		this._memento = new Memento('interactive-session-editor-' + CHAT_PROVIDER_ID, this.storageService);
		this._viewState = viewState ?? this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IChatViewState;
		this.widget.setModel(model, { ...this._viewState });
	}

	protected override saveState(): void {
		this.widget?.saveState();

		if (this._memento && this._viewState) {
			const widgetViewState = this.widget.getViewState();

			// Need to set props individually on the memento
			this._viewState.inputValue = widgetViewState.inputValue;
			this._viewState.selectedLanguageModelId = widgetViewState.selectedLanguageModelId;
			this._memento.saveMemento();
		}
	}

	override getViewState(): object | undefined {
		return { ...this._viewState };
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		if (this.widget) {
			this.widget.layout(dimension.height, dimension.width);
		}
	}
}
