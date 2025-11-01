/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, type ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatCodeBlockContextProviderService, showChatView } from '../../../chat/browser/chat.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { isDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { TerminalChatWidget } from './terminalChatWidget.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import type { ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import type { IChatModel } from '../../../chat/common/chatModel.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';

export class TerminalChatController extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.chat';

	static get(instance: ITerminalInstance): TerminalChatController | null {
		return instance.getContribution<TerminalChatController>(TerminalChatController.ID);
	}
	/**
	 * The controller for the currently focused chat widget. This is used to track action context since 'active terminals'
	 * are only tracked for non-detached terminal instanecs.
	 */
	static activeChatController?: TerminalChatController;

	/**
	 * The chat widget for the controller, this is lazy as we don't want to instantiate it until
	 * both it's required and xterm is ready.
	 */
	private _terminalChatWidget: Lazy<TerminalChatWidget> | undefined;

	/**
	 * The terminal chat widget for the controller, this will be undefined if xterm is not ready yet (ie. the
	 * terminal is still initializing). This wraps the inline chat widget.
	 */
	get terminalChatWidget(): TerminalChatWidget | undefined { return this._terminalChatWidget?.value; }

	private _lastResponseContent: string | undefined;
	get lastResponseContent(): string | undefined {
		return this._lastResponseContent;
	}

	get scopedContextKeyService(): IContextKeyService {
		return this._terminalChatWidget?.value.inlineChatWidget.scopedContextKeyService ?? this._contextKeyService;
	}

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IChatCodeBlockContextProviderService chatCodeBlockContextProviderService: IChatCodeBlockContextProviderService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		this._register(chatEntitlementService.onDidChangeSentiment(() => {
			if (chatEntitlementService.sentiment.hidden) {
				this._terminalChatWidget?.value.clear();
			}
		}));

		this._register(chatCodeBlockContextProviderService.registerProvider({
			getCodeBlockContext: (editor) => {
				if (!editor || !this._terminalChatWidget?.hasValue || !this.hasFocus()) {
					return;
				}
				return {
					element: editor,
					code: editor.getValue(),
					codeBlockIndex: 0,
					languageId: editor.getModel()!.getLanguageId(),
					chatSessionResource: this._terminalChatWidget.value.inlineChatWidget.chatWidget.viewModel?.sessionResource
				};
			}
		}, 'terminal'));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._terminalChatWidget = new Lazy(() => {
			const chatWidget = this._register(this._instantiationService.createInstance(TerminalChatWidget, this._ctx.instance.domElement!, this._ctx.instance, xterm));
			this._register(chatWidget.focusTracker.onDidFocus(() => {
				TerminalChatController.activeChatController = this;
				if (!isDetachedTerminalInstance(this._ctx.instance)) {
					this._terminalService.setActiveInstance(this._ctx.instance);
				}
			}));
			this._register(chatWidget.focusTracker.onDidBlur(() => {
				TerminalChatController.activeChatController = undefined;
				this._ctx.instance.resetScrollbarVisibility();
			}));
			if (!this._ctx.instance.domElement) {
				throw new Error('FindWidget expected terminal DOM to be initialized');
			}
			return chatWidget;
		});
	}

	private _forcedPlaceholder: string | undefined = undefined;

	private _updatePlaceholder(): void {
		const inlineChatWidget = this._terminalChatWidget?.value.inlineChatWidget;
		if (inlineChatWidget) {
			inlineChatWidget.placeholder = this._getPlaceholderText();
		}
	}

	private _getPlaceholderText(): string {
		return this._forcedPlaceholder ?? '';
	}

	setPlaceholder(text: string): void {
		this._forcedPlaceholder = text;
		this._updatePlaceholder();
	}

	resetPlaceholder(): void {
		this._forcedPlaceholder = undefined;
		this._updatePlaceholder();
	}

	updateInput(text: string, selectAll = true): void {
		const widget = this._terminalChatWidget?.value.inlineChatWidget;
		if (widget) {
			widget.value = text;
			if (selectAll) {
				widget.selectAll();
			}
		}
	}

	focus(): void {
		this._terminalChatWidget?.value.focus();
	}

	hasFocus(): boolean {
		return this._terminalChatWidget?.rawValue?.hasFocus() ?? false;
	}

	async viewInChat(): Promise<void> {
		const chatModel = this.terminalChatWidget?.inlineChatWidget.chatWidget.viewModel?.model;
		if (chatModel) {
			await this._instantiationService.invokeFunction(moveToPanelChat, chatModel);
		}
		this._terminalChatWidget?.rawValue?.hide();
	}
}

async function moveToPanelChat(accessor: ServicesAccessor, model: IChatModel | undefined) {
	const viewsService = accessor.get(IViewsService);
	const chatService = accessor.get(IChatService);
	const layoutService = accessor.get(IWorkbenchLayoutService);

	const widget = await showChatView(viewsService, layoutService);

	if (widget && widget.viewModel && model) {
		for (const request of model.getRequests().slice()) {
			await chatService.adoptRequest(widget.viewModel.model.sessionResource, request);
		}
		widget.focusResponseItem();
	}
}
