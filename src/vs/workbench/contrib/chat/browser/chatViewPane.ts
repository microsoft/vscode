/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { Memento } from 'vs/workbench/common/memento';
import { SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IChatViewPane } from 'vs/workbench/contrib/chat/browser/chat';
import { IViewState, ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export interface IChatViewOptions {
	readonly providerId: string;
}

interface IViewPaneState extends IViewState {
	sessionId?: string;
}

export const CHAT_SIDEBAR_PANEL_ID = 'workbench.panel.chatSidebar';
export class ChatViewPane extends ViewPane implements IChatViewPane {
	static ID = 'workbench.panel.chat.view';

	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private viewState: IViewPaneState;

	constructor(
		private readonly chatViewOptions: IChatViewOptions,
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		this.memento = new Memento('interactive-session-view-' + this.chatViewOptions.providerId, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
	}

	private updateModel(model?: IChatModel | undefined): void {
		this.modelDisposables.clear();

		model = model ?? (this.chatService.transferredSessionId
			? this.chatService.getOrRestoreSession(this.chatService.transferredSessionId)
			: this.chatService.startSession(this.chatViewOptions.providerId, CancellationToken.None));
		if (!model) {
			throw new Error('Could not start chat session');
		}

		this._widget.setModel(model, { ...this.viewState });
		this.viewState.sessionId = model.sessionId;
	}

	protected override renderBody(parent: HTMLElement): void {
		try {
			super.renderBody(parent);

			const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));

			this._widget = this._register(scopedInstantiationService.createInstance(
				ChatWidget,
				{ viewId: this.id },
				{
					listForeground: SIDE_BAR_FOREGROUND,
					listBackground: this.getBackgroundColor(),
					inputEditorBackground: this.getBackgroundColor(),
					resultEditorBackground: editorBackground
				}));
			this._register(this.onDidChangeBodyVisibility(visible => {
				this._widget.setVisible(visible);
			}));
			this._widget.render(parent);

			const sessionId = this.chatService.transferredSessionId ?? this.viewState.sessionId;
			const initialModel = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;
			this.updateModel(initialModel);
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	acceptInput(query?: string): void {
		this._widget.acceptInput(query);
	}

	async clear(): Promise<void> {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}
		this.updateModel();
	}

	loadSession(sessionId: string): void {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}

		const newModel = this.chatService.getOrRestoreSession(sessionId);
		this.updateModel(newModel);
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	override focus(): void {
		super.focus();
		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget.layout(height, width);
	}

	override saveState(): void {
		if (this._widget) {
			// Since input history is per-provider, this is handled by a separate service and not the memento here.
			// TODO multiple chat views will overwrite each other
			this._widget.saveState();

			const widgetViewState = this._widget.getViewState();
			this.viewState.inputValue = widgetViewState.inputValue;
			this.memento.saveMemento();
		}

		super.saveState();
	}
}


