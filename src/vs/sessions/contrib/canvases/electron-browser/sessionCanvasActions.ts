/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { getCanvasReferenceKey, ICanvasReference, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { getSessionCanvasDefinitionInstanceId, getSessionCanvasDefinitionLabels, getSessionCanvasInstanceLabels, ISessionCanvasRegistryService, REVEAL_SESSION_CANVAS_COMMAND_ID } from '../common/sessionCanvas.js';

export const OPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.openCanvas';
export const REOPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.reopenCanvas';

const reopenCanvasWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext,
);

class CanvasMenuActionRegistration extends Disposable {

	private readonly menuRegistration = this._register(new MutableDisposable<IDisposable>());
	private title: string | undefined;
	private group: string | undefined;
	private order: number | undefined;

	constructor(
		readonly commandId: string,
		run: () => Promise<void>,
	) {
		super();
		this._register(CommandsRegistry.registerCommand(commandId, run));
	}

	update(title: string, group: string, order: number): void {
		if (this.title === title && this.group === group && this.order === order) {
			return;
		}
		this.title = title;
		this.group = group;
		this.order = order;
		this.menuRegistration.value = MenuRegistry.appendMenuItem(Menus.SessionsEditorTabsBarAddTabCanvas, {
			command: {
				id: this.commandId,
				title,
				icon: Codicon.preview,
			},
			group,
			order,
			when: reopenCanvasWhen,
		});
	}
}

export function registerSessionCanvasActions(canvasService: ICanvasService, registryService: ISessionCanvasRegistryService): IDisposable {
	const store = new DisposableStore();
	const registrations = store.add(new DisposableMap<string, CanvasMenuActionRegistration>());
	const submenuRegistration = store.add(new MutableDisposable<IDisposable>());
	let commandSequence = 0;
	store.add(CommandsRegistry.registerCommand(REVEAL_SESSION_CANVAS_COMMAND_ID, (_accessor, reference: ICanvasReference) => canvasService.revealCanvas(reference)));
	store.add(autorun(reader => {
		const definitions = registryService.availableCanvases.read(reader);
		const definitionLabels = getSessionCanvasDefinitionLabels(definitions);
		const targets = canvasService.reopenableCanvases.read(reader);
		const targetLabels = getSessionCanvasInstanceLabels(targets.map(target => target.canvas));
		const definitionInstanceIds = new Set(definitions.map(getSessionCanvasDefinitionInstanceId));
		const activeKeys = new Set<string>();
		for (let index = 0; index < definitions.length; index++) {
			const canvas = definitions[index];
			const key = `definition:${canvas.extensionId}\u0000${canvas.canvasId}`;
			activeKeys.add(key);
			let registration = registrations.get(key);
			if (!registration) {
				registration = new CanvasMenuActionRegistration(
					`${OPEN_SESSION_CANVAS_COMMAND_ID}.${++commandSequence}`,
					() => registryService.openCanvas(canvas),
				);
				registrations.set(key, registration);
			}
			registration.update(definitionLabels[index], '1_available', index);
		}
		for (let index = 0; index < targets.length; index++) {
			const target = targets[index];
			if (target.canvas.instanceId && definitionInstanceIds.has(target.canvas.instanceId)) {
				continue;
			}
			const key = `reopen:${getCanvasReferenceKey(target.reference)}`;
			activeKeys.add(key);
			let registration = registrations.get(key);
			if (!registration) {
				registration = new CanvasMenuActionRegistration(
					`${REOPEN_SESSION_CANVAS_COMMAND_ID}.${++commandSequence}`,
					() => canvasService.reopenCanvas(target.reference),
				);
				registrations.set(key, registration);
			}
			registration.update(targetLabels[index], '2_open', index);
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
		}
		submenuRegistration.value = activeKeys.size > 0
			? MenuRegistry.appendMenuItem(Menus.SessionsEditorTabsBarAddTab, {
				submenu: Menus.SessionsEditorTabsBarAddTabCanvas,
				title: localize('sessionCanvases.addTab', "Canvas"),
				icon: Codicon.preview,
				group: 'navigation',
				order: 4,
				when: reopenCanvasWhen,
			})
			: undefined;
	}));
	return store;
}
