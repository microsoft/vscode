/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { getNewWindowBoundsAtDragEnd, isWindowDraggedOver } from '../../../../workbench/browser/dnd.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { registerSessionChatDragEndHandler } from '../../../../workbench/contrib/sessions/browser/dnd.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { ChatWindowsEnabledContext, openChatInWindow } from './openChatInWindow.js';

/**
 * What a chat dragged out of the window needs to open in a chat window.
 */
export interface IChatWindowDragOutContext {
	readonly hostService: IHostService;

	/** Whether chat windows can open: they are enabled and AI features show. */
	isEnabled(): boolean;

	/** Whether a drag out of the window opens a window, as for tabs (`workbench.editor.dragToOpenWindow`, toggled by Alt). */
	dragToOpenWindow(): boolean;

	/** Whether a chat window provider is registered. */
	readonly hasProvider: IObservable<boolean>;

	open(session: ISession, chat: URI | undefined, options: { readonly bounds: Partial<IRectangle> }): Promise<unknown>;
}

/**
 * Opens a chat window for a chat, or the chat a session shows, whose drag
 * from the main window ended outside the windows, where it ended, like a tab
 * dragged out of the window opens a new window, following the same setting
 * and Alt key. Inside a window, dropped into another app, or with chat
 * windows not enabled, nothing happens. Returns whether it opened one.
 */
export async function openChatWindowAtDragEnd(context: IChatWindowDragOutContext, e: DragEvent, offsetElement: HTMLElement, session: ISession, chat: URI | undefined, name: string): Promise<boolean> {
	if (
		!context.isEnabled() ||
		!context.hasProvider.get() ||
		getWindow(offsetElement) !== mainWindow || // from the main window only: a chat window already shows its chat
		(context.dragToOpenWindow() ? e.altKey : !e.altKey) ||
		(e.dataTransfer && e.dataTransfer.dropEffect !== 'none') || // dropped somewhere, such as into another app
		isWindowDraggedOver()
	) {
		return false;
	}

	const bounds = await getNewWindowBoundsAtDragEnd(context.hostService, e, offsetElement);
	if (!bounds) {
		return false;
	}

	await context.open(session, chat, { bounds });
	status(localize('openedChatInNewWindow', "Opened {0} in a new window", name));

	return true;
}

/**
 * Opens a chat in a chat window when its tab, its session's header, or its
 * (or its session's) row in the sessions list is dragged out of the window.
 */
export class ChatWindowDragOutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsChatWindowDragOut';

	constructor(
		@IChatWindowService chatWindowService: IChatWindowService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const context: IChatWindowDragOutContext = {
			hostService,
			isEnabled: () => contextKeyService.contextMatchesRules(ChatWindowsEnabledContext),
			dragToOpenWindow: () => configurationService.getValue<boolean>('workbench.editor.dragToOpenWindow') !== false,
			hasProvider: chatWindowService.hasProvider,
			open: (session, chat, options) => instantiationService.invokeFunction(openChatInWindow, session, chat, options)
		};
		this._register(registerSessionChatDragEndHandler((e, offsetElement, session, chat, name) => openChatWindowAtDragEnd(context, e, offsetElement, session, chat, name)));
	}
}

registerWorkbenchContribution2(ChatWindowDragOutContribution.ID, ChatWindowDragOutContribution, WorkbenchPhase.AfterRestored);
