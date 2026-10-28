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
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { getCanvasDefinitionInstanceId, getCanvasDefinitionLabels, getCanvasInstanceLabels, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService, canvasOwnerKey, isCanvasOwner } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../../workbench/contrib/canvases/common/canvasDefinitionStore.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { ChatWindowIdContext, IChatWindow, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';

/**
 * Offers the canvases of the session that a chat window shows in the Add Tab lists of its editor area. Entries are scoped to
 * the window through its id, and open in its editor area: the canvas service presents the canvases of a chat
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
		const windows = chatWindowService.windows.read(reader).filter(window => !!window.editorArea);
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

interface ICanvasSpec {
	readonly title: string;
	readonly group: string;
	readonly order: number;
	readonly key: string;
	readonly run: () => Promise<void>;
}

class ChatWindowCanvasMenu extends Disposable {

	private readonly registration = this._register(new MutableDisposable<IDisposable>());
	private signature: string | undefined;
	private readonly activityBarRegistration = this._register(new MutableDisposable<IDisposable>());
	private activityBarSignature: string | undefined;
	private readonly activityBarItem = this._register(new MutableDisposable<IDisposable>());
	private activityBarItemKey: string | undefined;

	constructor(
		window: IChatWindow,
		private readonly canvasService: ICanvasService,
		contextService: ICanvasContextService,
		logService: ILogService,
		private readonly notificationService: INotificationService,
	) {
		super();
		const when = ContextKeyExpr.and(ChatWindowIdContext.isEqualTo(window.windowId), ChatContextKeys.enabled);
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
			// The provider is a new object on every rebuild, so its source of changes (the canvases of the chat, new after a reconnect) tells whether it is another one.
			equalsFn: (a, b) => a === b || (!!a && !!b && !!a.definitionProvider === !!b.definitionProvider && a.canvases === b.canvases && canvasOwnerKey(a.owner) === canvasOwnerKey(b.owner))
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

		const entries = derived<{ readonly context: ICanvasContext; readonly specs: readonly ICanvasSpec[] } | undefined>(this, reader => {
			const current = context.read(reader);
			const available = definitions.read(reader);
			const targets = current ? canvasService.reopenableCanvases.read(reader).filter(target => isCanvasOwner(target.reference, current.owner)) : [];
			if (!current || available.length + targets.length === 0) {
				return undefined;
			}
			const definitionLabels = getCanvasDefinitionLabels(available);
			const definitionInstanceIds = new Set(available.map(getCanvasDefinitionInstanceId));
			const labels = getCanvasInstanceLabels(targets.map(target => target.canvas));
			const specs: ICanvasSpec[] = [
				...available.map((definition, index) => ({ title: definitionLabels[index], group: '1_available', order: index, key: getCanvasDefinitionInstanceId(definition), run: () => this.openDefinition(current, definition) })),
				...targets.flatMap((target, index) => !target.canvas.instanceId || !definitionInstanceIds.has(target.canvas.instanceId)
					? [{ title: labels[index], group: '2_open', order: index, key: target.canvas.resource.toString(), run: () => this.canvasService.reopenCanvas(target.reference) }]
					: []),
			];
			return { context: current, specs };
		});

		this._register(autorun(reader => {
			const current = entries.read(reader);
			if (!current) {
				this.signature = undefined;
				this.registration.clear();
				return;
			}
			const { context: { owner }, specs } = current;
			// An unrelated canvas change leaves the entries as they are, so they are not registered again.
			const signature = JSON.stringify([owner.providerId, owner.session.toString(), owner.chat.toString(), specs.map(spec => [spec.group, spec.order, spec.title, spec.key])]);
			if (signature === this.signature && this.registration.value) {
				return;
			}
			this.signature = signature;
			const store = new DisposableStore();
			this.registerEntries(store, Menus.ChatWindowAddTabCanvas, specs, when);
			const submenu = (menu: typeof Menus.SessionsEditorTabsBarAddTab) => MenuRegistry.appendMenuItem(menu, {
				submenu: Menus.ChatWindowAddTabCanvas,
				title: localize('chatWindowCanvas.submenu', "Canvas"),
				icon: Codicon.preview,
				group: 'navigation',
				order: 4,
				when,
			});
			this.registration.value = combinedDisposable(store, submenu(Menus.SessionsEditorTabsBarAddTab), submenu(Menus.SessionsEmptyEditorGroupAddTab));
		}));

		// The Session Activity Bar of the window offers the canvases of its chat like the one of the main window: the canvas itself, a Canvas menu for several, or what Add Tab offers without any.
		this._register(autorun(reader => {
			const current = context.read(reader);
			const canvases = current?.canvases.read(reader) ?? [];
			const offered = canvases.length === 0 ? entries.read(reader) : undefined;
			if (!current || (canvases.length === 0 && !offered)) {
				this.activityBarSignature = undefined;
				this.activityBarItemKey = undefined;
				this.activityBarRegistration.clear();
				this.activityBarItem.clear();
				return;
			}
			const labels = getCanvasInstanceLabels(canvases);
			const reveals: ICanvasSpec[] = canvases.map((canvas, index) => ({
				title: labels[index], group: 'navigation', order: index, key: canvas.resource.toString(),
				run: () => this.canvasService.revealCanvas({ ...current.owner, canvas: canvas.resource }),
			}));
			const specs = offered ? offered.specs : reveals;
			const direct = canvases.length === 1;
			// The item in the strip changes only with the shape of the offer: the Canvas menu is registered once and its entries change on their own, so the strips of the other windows are not rebuilt.
			const itemKey = direct ? JSON.stringify([current.owner.providerId, current.owner.session.toString(), current.owner.chat.toString(), reveals[0].key, reveals[0].title]) : 'menu';
			if (itemKey !== this.activityBarItemKey || !this.activityBarItem.value) {
				this.activityBarItemKey = itemKey;
				const store = new DisposableStore();
				if (direct) {
					const id = this.registerCommand(store, reveals[0]);
					store.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { command: { id, title: reveals[0].title, icon: Codicon.preview }, group: SessionActivityBarGroup.SidePanel, order: 4, when }));
				} else {
					store.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { submenu: Menus.ChatWindowActivityBarCanvas, title: localize('chatWindowCanvas.submenu', "Canvas"), icon: Codicon.preview, group: SessionActivityBarGroup.SidePanel, order: 4, when }));
				}
				this.activityBarItem.value = store;
			}
			const signature = direct ? undefined : JSON.stringify([current.owner.providerId, current.owner.session.toString(), current.owner.chat.toString(), specs.map(spec => [spec.group, spec.order, spec.title, spec.key])]);
			if (signature === this.activityBarSignature && (direct || this.activityBarRegistration.value)) {
				return;
			}
			this.activityBarSignature = signature;
			const store = new DisposableStore();
			if (!direct) {
				this.registerEntries(store, Menus.ChatWindowActivityBarCanvas, specs, when);
			}
			this.activityBarRegistration.value = store;
		}));
	}

	private registerCommand(store: DisposableStore, spec: ICanvasSpec): string {
		const id = `sessions.chatWindow.canvas.${++commandSequence}`;
		store.add(CommandsRegistry.registerCommand(id, async () => {
			try {
				await spec.run();
			} catch (error) {
				this.notificationService.error(localize('chatWindowCanvas.openFailed', "Could not open canvas {0}: {1}", spec.title, toErrorMessage(error)));
			}
		}));
		return id;
	}

	private registerEntries(store: DisposableStore, menu: MenuId, specs: readonly ICanvasSpec[], when: ContextKeyExpression | undefined): void {
		for (const spec of specs) {
			const id = this.registerCommand(store, spec);
			store.add(MenuRegistry.appendMenuItem(menu, { command: { id, title: spec.title, icon: Codicon.preview }, group: spec.group, order: spec.order, when }));
		}
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
