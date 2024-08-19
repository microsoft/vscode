/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground, editorForeground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { Memento } from 'vs/workbench/common/memento';
import { clearChatEditor } from 'vs/workbench/contrib/chat/browser/actions/chatClear';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatWidget, IChatViewState } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatModel, IExportableChatData, ISerializableChatData } from 'vs/workbench/contrib/chat/common/chatModel';
import { CHAT_PROVIDER_ID } from 'vs/workbench/contrib/chat/common/chatParticipantContribTypes';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

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
			this._viewState.inputValue = widgetViewState.inputValue;
			this._memento.saveMemento();
		}
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		if (this.widget) {
			this.widget.layout(dimension.height, dimension.width);
		}
	}
}
