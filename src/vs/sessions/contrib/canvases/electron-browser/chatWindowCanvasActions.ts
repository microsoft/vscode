/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { getCanvasDefinitionInstanceId, getCanvasDefinitionLabels, getCanvasInstanceLabels, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService, canvasOwnerKey, isCanvasOwner } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../../workbench/contrib/canvases/common/canvasDefinitionStore.js';
import { Menus } from '../../../browser/menus.js';
import { ChatWindowEditorGroupContext, IChatWindow, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';

/**
 * Offers the canvases of the session that a chat window shows in the Add Tab lists of its editor area. Entries are scoped to
 * the window through its editor group, and open in that editor group: the canvas service presents the canvases of a chat
 * that a chat window shows in the window's editor area, without changing the active session of the main window.
 */
export function registerChatWindowCanvasActions(
	chatWindowService: IChatWindowService,
	canvasService: ICanvasService,
	contextService: ICanvasContextService,
	logService: ILogService,
	notificationService: INotificationService,
): IDisposable {
	const store = new DisposableStore();
	const menus = store.add(new DisposableMap<IChatWindow, ChatWindowCanvasMenu>());
	store.add(autorun(reader => {
		const windows = chatWindowService.windows.read(reader).filter(window => !!window.editorGroup && !!window.content.read(reader).editorArea);
		for (const window of windows) {
			if (!menus.has(window)) {
				menus.set(window, new ChatWindowCanvasMenu(window, canvasService, contextService, logService, notificationService));
			}
		}
		for (const window of [...menus.keys()]) {
			if (!windows.includes(window)) {
				menus.deleteAndDispose(window);
			}
		}
	}));
	return store;
}

let commandSequence = 0;

class ChatWindowCanvasMenu extends Disposable {

	private readonly registration = this._register(new MutableDisposable<IDisposable>());
	private signature: string | undefined;

	constructor(
		window: IChatWindow,
		private readonly canvasService: ICanvasService,
		contextService: ICanvasContextService,
		logService: ILogService,
		private readonly notificationService: INotificationService,
	) {
		super();
		const groupId = window.editorGroup!.id;
		const when = ContextKeyExpr.and(ChatWindowEditorGroupContext.isEqualTo(groupId), ChatContextKeys.enabled);
		const context = derived<ICanvasContext | undefined>(this, reader => {
			const session = window.session.read(reader);
			const chat = session?.activeChat.read(reader);
			if (!session || !chat || !canvasService.enabled.read(reader)) {
				return undefined;
			}
			return contextService.contexts.read(reader).find(candidate => candidate.owner.providerId === session.providerId
				&& isEqual(candidate.owner.session, session.resource) && isEqual(candidate.owner.chat, chat.resource));
		});
		// Keyed on the owner: the context is rebuilt for unrelated changes (any chat model, any window's session), and each rebuild would list the canvases again.
		const definitionSource = derivedOpts<ICanvasContext | undefined>({
			owner: this,
			equalsFn: (a, b) => a === b || (!!a && !!b && !!a.definitionProvider === !!b.definitionProvider && canvasOwnerKey(a.owner) === canvasOwnerKey(b.owner))
		}, reader => context.read(reader));
		const definitions = this._register(new CanvasDefinitionStore(reader => {
			const current = definitionSource.read(reader);
			const provider = current?.definitionProvider;
			if (!current || !provider) {
				return undefined;
			}
			observableSignalFromEvent(reader.store, provider.onDidChangeDefinitions).read(reader);
			return { owner: current.owner, listCanvases: () => (context.get()?.definitionProvider ?? provider).listCanvases() };
		}, '[ChatWindowCanvasActions]', logService)).definitions;

		this._register(autorun(reader => {
			const current = context.read(reader);
			const available = definitions.read(reader);
			const targets = current ? canvasService.reopenableCanvases.read(reader).filter(target => isCanvasOwner(target.reference, current.owner)) : [];
			if (!current || available.length + targets.length === 0) {
				this.signature = undefined;
				this.registration.clear();
				return;
			}
			const definitionLabels = getCanvasDefinitionLabels(available);
			const definitionInstanceIds = new Set(available.map(getCanvasDefinitionInstanceId));
			const labels = getCanvasInstanceLabels(targets.map(target => target.canvas));
			const specs: { title: string; group: string; order: number; key: string; run: () => Promise<void> }[] = [
				...available.map((definition, index) => ({ title: definitionLabels[index], group: '1_available', order: index, key: getCanvasDefinitionInstanceId(definition), run: () => this.openDefinition(current, definition) })),
				...targets.flatMap((target, index) => !target.canvas.instanceId || !definitionInstanceIds.has(target.canvas.instanceId)
					? [{ title: labels[index], group: '2_open', order: index, key: target.canvas.resource.toString(), run: () => this.canvasService.reopenCanvas(target.reference) }]
					: []),
			];
			// An unrelated canvas change leaves the entries as they are, so they are not registered again.
			const signature = JSON.stringify([current.owner.session.toString(), current.owner.chat.toString(), specs.map(spec => [spec.group, spec.order, spec.title, spec.key])]);
			if (signature === this.signature && this.registration.value) {
				return;
			}
			this.signature = signature;
			const entries = new DisposableStore();
			for (const spec of specs) {
				const id = `sessions.chatWindow.canvas.${++commandSequence}`;
				entries.add(CommandsRegistry.registerCommand(id, async () => {
					try {
						await spec.run();
					} catch (error) {
						this.notificationService.error(localize('chatWindowCanvas.openFailed', "Could not open canvas {0}: {1}", spec.title, toErrorMessage(error)));
					}
				}));
				entries.add(MenuRegistry.appendMenuItem(Menus.ChatWindowAddTabCanvas, { command: { id, title: spec.title, icon: Codicon.preview }, group: spec.group, order: spec.order, when }));
			}
			const submenu = (menu: typeof Menus.SessionsEmptyEditorGroupAddTab) => MenuRegistry.appendMenuItem(menu, {
				submenu: Menus.ChatWindowAddTabCanvas,
				title: localize('chatWindowCanvas.submenu', "Canvas"),
				icon: Codicon.preview,
				group: 'navigation',
				order: 4,
				when,
			});
			this.registration.value = combinedDisposable(entries, submenu(Menus.SessionsEditorTabsBarAddTab), submenu(Menus.SessionsEmptyEditorGroupAddTab));
		}));
	}

	private async openDefinition(context: ICanvasContext, definition: ICanvasDefinition): Promise<void> {
		const provider = context.definitionProvider;
		if (!provider) {
			return;
		}
		const instanceId = getCanvasDefinitionInstanceId(definition);
		const existing = context.canvases.get()?.find(candidate => candidate.instanceId === instanceId);
		if (existing) {
			const reference: ICanvasReference = { ...context.owner, canvas: existing.resource };
			await this.canvasService.revealCanvas(reference);
			if (existing.source) {
				return;
			}
		}
		await provider.openCanvas(definition, instanceId);
	}
}
