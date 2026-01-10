/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDecoration, Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type IDetachedCompatibleTerminalContributionContext, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatRequestStringVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import './media/terminalSelectionDecoration.css';

// #region Terminal Contribution

class TerminalSelectionDecorationContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.selectionDecoration';

	static get(instance: ITerminalInstance): TerminalSelectionDecorationContribution | null {
		return instance.getContribution<TerminalSelectionDecorationContribution>(TerminalSelectionDecorationContribution.ID);
	}

	private _xterm: IXtermTerminal & { raw: RawXtermTerminal } | undefined;
	private readonly _decoration = this._register(new MutableDisposable<IDecoration>());
	private readonly _decorationListeners = this._register(new DisposableStore());
	private readonly _showDecorationScheduler: RunOnceScheduler;

	constructor(
		_ctx: ITerminalContributionContext | IDetachedCompatibleTerminalContributionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._showDecorationScheduler = this._register(new RunOnceScheduler(() => this._showDecoration(), 200));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		this._register(xterm.raw.onSelectionChange(() => this._onSelectionChange()));
	}

	private _onSelectionChange(): void {
		// TODO: Show decoration in intuitive position regardless of where it starts
		// TODO: Upstream to allow listening while selection is in progress
		// Clear decoration immediately when selection changes
		this._decoration.clear();
		this._decorationListeners.clear();

		// Only schedule showing the decoration if there's a selection
		if (this._xterm?.raw.hasSelection()) {
			this._showDecorationScheduler.schedule();
		} else {
			this._showDecorationScheduler.cancel();
		}
	}

	private _showDecoration(): void {
		if (!this._xterm) {
			return;
		}

		// Only show if there's a selection
		if (!this._xterm.raw.hasSelection()) {
			return;
		}

		const selectionPosition = this._xterm.raw.getSelectionPosition();
		if (!selectionPosition) {
			return;
		}

		// Create a marker at the start of the selection
		const marker = this._xterm.raw.registerMarker(selectionPosition.start.y - (this._xterm.raw.buffer.active.baseY + this._xterm.raw.buffer.active.cursorY));
		if (!marker) {
			return;
		}

		// Register the decoration
		const decoration = this._xterm.raw.registerDecoration({
			marker,
			x: selectionPosition.start.x,
			layer: 'top'
		});

		if (!decoration) {
			marker.dispose();
			return;
		}

		this._decoration.value = decoration;

		this._decorationListeners.add(decoration.onRender(element => {
			if (!element.classList.contains('terminal-selection-decoration')) {
				this._setupDecorationElement(element);
			}
		}));
	}

	private _setupDecorationElement(element: HTMLElement): void {
		element.classList.add('terminal-selection-decoration');

		// Create the action bar container
		const actionBarContainer = dom.append(element, dom.$('.terminal-selection-action-bar'));

		// Create a MenuWorkbenchToolBar for the actions
		this._decorationListeners.add(this._instantiationService.createInstance(
			MenuWorkbenchToolBar,
			actionBarContainer,
			MenuId.TerminalSelectionContext,
			{
				menuOptions: { shouldForwardArgs: true },
				toolbarOptions: { primaryGroup: () => true }
			}
		));

		this._decorationListeners.add(dom.addDisposableListener(actionBarContainer, dom.EventType.MOUSE_DOWN, (e) => {
			e.stopImmediatePropagation();
			e.preventDefault();
		}));
	}
}

registerTerminalContribution(TerminalSelectionDecorationContribution.ID, TerminalSelectionDecorationContribution, true);

// #endregion

// #region Actions

const enum TerminalSelectionCommandId {
	AttachSelectionToChat = 'workbench.action.terminal.attachSelectionToChat',
}

registerActiveXtermAction({
	id: TerminalSelectionCommandId.AttachSelectionToChat,
	title: localize2('workbench.action.terminal.attachSelectionToChat', 'Attach Selection to Chat'),
	icon: Codicon.sparkle,
	precondition: TerminalContextKeys.textSelectedInFocused,
	run: async (_xterm, accessor, activeInstance) => {
		const chatWidgetService = accessor.get(IChatWidgetService);

		const selection = activeInstance.selection;
		if (!selection) {
			return;
		}

		let widget = chatWidgetService.lastFocusedWidget ?? chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)?.find(w => w.attachmentCapabilities.supportsTerminalAttachments);

		if (!widget) {
			widget = await chatWidgetService.revealWidget();
		}

		if (!widget || !widget.attachmentCapabilities.supportsTerminalAttachments) {
			return;
		}

		// Clear the selection after attaching
		activeInstance.clearSelection();

		// Attach the selection as a string attachment
		const attachment: IChatRequestStringVariableEntry = {
			kind: 'string',
			id: `terminalSelection:${Date.now()}`,
			name: localize('terminal.selection', "Terminal Selection"),
			value: selection,
			icon: Codicon.terminal,
			uri: URI.parse(`terminal-selection:${Date.now()}`),
		};

		widget.attachmentModel.addContext(attachment);
		widget.focusInput();
	},
	menu: [
		{
			id: MenuId.TerminalSelectionContext,
			group: 'navigation',
			order: 1,
		}
	]
});

// #endregion
