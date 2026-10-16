/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader, observableFromEvent, observableSignal, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatViewId, IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../../chat/browser/chat.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { canvasOwnerKey, getCanvasDefinitionInstanceId, getCanvasDefinitionLabels, getCanvasInstanceLabels, getCanvasReferenceKey, ICanvasContext, ICanvasDefinition, ICanvasOwner, ICanvasReference, ICanvasService, isCanvasOwner } from '../common/canvas.js';
import { CanvasDefinitionStore } from '../common/canvasDefinitionStore.js';

export const OPEN_EDITOR_CANVAS_COMMAND_ID = 'workbench.action.chat.openCanvas';
export const REOPEN_EDITOR_CANVAS_COMMAND_ID = 'workbench.action.chat.reopenCanvas';
export const ChatNewCanvasMenuId = new MenuId('ChatNewCanvasMenu');

class CanvasMenuActionRegistration extends Disposable {

	private readonly menuRegistration = this._register(new MutableDisposable<IDisposable>());
	private title: string | undefined;
	private group: string | undefined;
	private order: number | undefined;
	private run: () => Promise<void>;

	constructor(
		readonly commandId: string,
		run: () => Promise<void>,
	) {
		super();
		this.run = run;
		this._register(CommandsRegistry.registerCommand(commandId, () => this.run()));
	}

	update(title: string, group: string, order: number, run: () => Promise<void>): void {
		this.run = run;
		if (this.title === title && this.group === group && this.order === order) {
			return;
		}
		this.title = title;
		this.group = group;
		this.order = order;
		this.menuRegistration.value = MenuRegistry.appendMenuItem(ChatNewCanvasMenuId, {
			command: {
				id: this.commandId,
				title,
				icon: Codicon.preview,
				precondition: ChatContextKeys.enabled,
			},
			group,
			order,
			when: ChatContextKeys.enabled,
		});
	}
}

/** Registers the active Chat view's canvases in a separate section of the New Chat menu. */
export function registerEditorCanvasActions(
	canvasService: ICanvasService,
	widgetService: IChatWidgetService,
	logService: ILogService,
	notificationService: INotificationService,
): IDisposable {
	const store = new DisposableStore();
	const registrations = store.add(new DisposableMap<string, CanvasMenuActionRegistration>());
	const submenuRegistration = store.add(new MutableDisposable<IDisposable>());
	const widgetStateChanged = observableSignal(store);
	const widgets = observableFromEvent(
		store,
		Event.any(widgetService.onDidAddWidget, widgetService.onDidRemoveWidget),
		() => widgetService.getAllWidgets().slice(),
	);
	const currentContext = derived<ICanvasContext | undefined>(store, reader => {
		const currentWidgets = widgets.read(reader);
		for (const widget of currentWidgets) {
			if (isChatViewWidget(widget)) {
				reader.store.add(widget.onDidChangeViewModel(() => widgetStateChanged.trigger(undefined)));
			}
		}
		widgetStateChanged.read(reader);
		return canvasService.enabled.read(reader) ? getChatViewCanvasContext(currentWidgets, reader) : undefined;
	});
	const availableDefinitions = store.add(new CanvasDefinitionStore(reader => {
		const context = currentContext.read(reader);
		const definitionProvider = context?.definitionProvider;
		if (!context || !definitionProvider) {
			return undefined;
		}
		observableSignalFromEvent(reader.store, definitionProvider.onDidChangeDefinitions).read(reader);
		return { owner: context.owner, listCanvases: () => definitionProvider.listCanvases() };
	}, '[EditorCanvasActions]', logService)).definitions;
	let commandSequence = 0;

	store.add(autorun(reader => {
		const context = currentContext.read(reader);
		const definitions = availableDefinitions.read(reader);
		const targets = context
			? canvasService.reopenableCanvases.read(reader).filter(target => isCanvasOwner(target.reference, context.owner))
			: [];
		const activeKeys = new Set<string>();
		if (context) {
			const ownerKey = canvasOwnerKey(context.owner);
			const definitionLabels = getCanvasDefinitionLabels(definitions);
			const definitionInstanceIds = new Set(definitions.map(getCanvasDefinitionInstanceId));
			for (let index = 0; index < definitions.length; index++) {
				const canvas = definitions[index];
				const label = definitionLabels[index];
				const key = `definition:${ownerKey}\u0000${canvas.extensionId}\u0000${canvas.canvasId}`;
				activeKeys.add(key);
				let registration = registrations.get(key);
				if (!registration) {
					registration = new CanvasMenuActionRegistration(`${OPEN_EDITOR_CANVAS_COMMAND_ID}.${++commandSequence}`, () => openCanvasDefinition(context.owner, canvas, label));
					registrations.set(key, registration);
				}
				registration.update(
					label,
					'1_available',
					index,
					() => openCanvasDefinition(context.owner, canvas, label),
				);
			}

			const targetLabels = getCanvasInstanceLabels(targets.map(target => target.canvas));
			for (let index = 0; index < targets.length; index++) {
				const target = targets[index];
				if (target.canvas.instanceId && definitionInstanceIds.has(target.canvas.instanceId)) {
					continue;
				}
				const label = targetLabels[index];
				const key = `reopen:${getCanvasReferenceKey(target.reference)}`;
				activeKeys.add(key);
				let registration = registrations.get(key);
				if (!registration) {
					registration = new CanvasMenuActionRegistration(`${REOPEN_EDITOR_CANVAS_COMMAND_ID}.${++commandSequence}`, () => reopenCanvas(target.reference, label));
					registrations.set(key, registration);
				}
				registration.update(
					label,
					'2_open',
					index,
					() => reopenCanvas(target.reference, label),
				);
			}
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
		}
		submenuRegistration.value = activeKeys.size > 0
			? MenuRegistry.appendMenuItem(MenuId.ChatNewMenu, {
				submenu: ChatNewCanvasMenuId,
				title: localize('editorCanvas.submenu', "Canvas"),
				icon: Codicon.preview,
				group: 'z_canvas',
				order: 1,
				when: ChatContextKeys.enabled,
			})
			: undefined;
	}));

	async function openCanvasDefinition(owner: ICanvasOwner, canvas: ICanvasDefinition, label: string): Promise<void> {
		const context = currentContext.get();
		const definitionAvailable = availableDefinitions.get().some(candidate => candidate.extensionId === canvas.extensionId && candidate.canvasId === canvas.canvasId);
		if (!canvasService.enabled.get() || !context?.definitionProvider || !isCanvasOwner(context.owner, owner) || !definitionAvailable) {
			return;
		}
		try {
			const instanceId = getCanvasDefinitionInstanceId(canvas);
			const existing = context.canvases.get()?.find(candidate => candidate.instanceId === instanceId);
			if (existing) {
				await canvasService.revealCanvas({ ...context.owner, canvas: existing.resource });
				if (existing.source) {
					return;
				}
			}
			await context.definitionProvider.openCanvas(canvas, instanceId);
		} catch (error) {
			notificationService.error(localize('editorCanvas.openFailed', "Could not open canvas {0}: {1}", label, toErrorMessage(error)));
		}
	}

	async function reopenCanvas(reference: ICanvasReference, label: string): Promise<void> {
		const context = currentContext.get();
		if (!canvasService.enabled.get() || !context || !isCanvasOwner(context.owner, reference)) {
			return;
		}
		try {
			await canvasService.reopenCanvas(reference);
		} catch (error) {
			notificationService.error(localize('editorCanvas.openFailed', "Could not open canvas {0}: {1}", label, toErrorMessage(error)));
		}
	}

	return store;
}

function isChatViewWidget(widget: IChatWidget): boolean {
	return isIChatViewViewContext(widget.viewContext) && widget.viewContext.viewId === ChatViewId;
}

function getChatViewCanvasContext(widgets: readonly IChatWidget[], reader: IReader): ICanvasContext | undefined {
	return widgets.find(isChatViewWidget)?.viewModel?.model.canvasContext?.read(reader);
}
