/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { getCanvasInstanceLabels, getCanvasReferenceKey, ICanvasContextService, ICanvasReopenTarget, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { getSessionCanvasDefinitionInstanceId, getSessionCanvasDefinitionLabels, ISessionCanvasRegistryService } from '../common/sessionCanvas.js';

export const OPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.openCanvas';
export const REOPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.reopenCanvas';

const canvasAvailableWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
);

const reopenCanvasWhen = ContextKeyExpr.and(
	canvasAvailableWhen,
	IsTopRightEditorGroupContext,
);

class CanvasMenuActionRegistration extends Disposable {

	private readonly menuRegistration = this._register(new MutableDisposable<IDisposable>());
	private readonly activityBarRegistration = this._register(new MutableDisposable<IDisposable>());
	private title: string | undefined;
	private group: string | undefined;
	private order: number | undefined;
	private inActivityBar = false;

	constructor(
		readonly commandId: string,
		run: () => Promise<void>,
		private readonly menu = Menus.SessionsEditorTabsBarAddTabCanvas,
	) {
		super();
		this._register(CommandsRegistry.registerCommand(commandId, run));
	}

	update(title: string, group: string, order: number, inActivityBar = false): void {
		const changed = this.title !== title || this.group !== group || this.order !== order;
		if (changed) {
			this.title = title;
			this.group = group;
			this.order = order;
			this.menuRegistration.value = this.appendMenuItem(this.menu);
		}
		if (changed || this.inActivityBar !== inActivityBar) {
			this.inActivityBar = inActivityBar;
			this.activityBarRegistration.value = inActivityBar ? this.appendMenuItem(Menus.SessionActivityBarCanvas) : undefined;
		}
	}

	private appendMenuItem(menu: MenuId): IDisposable {
		return MenuRegistry.appendMenuItem(menu, {
			command: {
				id: this.commandId,
				title: this.title!,
				icon: Codicon.preview,
			},
			group: this.group,
			order: this.order,
			// Only reachable through a Canvas submenu entry, which applies the surface-specific gating.
			when: canvasAvailableWhen,
		});
	}
}

/**
 * A menu registration that is replaced only when its shape changes. Every registration change rebuilds each toolbar
 * that shows the menu, in every window, so re-runs with an unchanged shape must not re-register.
 */
class KeyedMenuRegistration extends Disposable {

	private readonly registration = this._register(new MutableDisposable<IDisposable>());
	private key: string | undefined;

	/** Registers with `register` when `key` changes; `undefined` removes the registration. */
	update(key: string | undefined, register: () => IDisposable): void {
		if (this.key === key) {
			return;
		}
		this.key = key;
		this.registration.value = key === undefined ? undefined : register();
	}
}

function appendCanvasSubmenu(menu: MenuId, when: ContextKeyExpression | undefined, group = 'navigation', submenu = Menus.SessionsEditorTabsBarAddTabCanvas): IDisposable {
	return MenuRegistry.appendMenuItem(menu, {
		submenu,
		title: localize('sessionCanvases.canvasSubmenu', "Canvas"),
		icon: Codicon.preview,
		group,
		order: 4,
		when,
	});
}

export function registerSessionCanvasActions(canvasService: ICanvasService, registryService: ISessionCanvasRegistryService, contextService: ICanvasContextService): IDisposable {
	const store = new DisposableStore();
	const activeCanvases = derived(reader => canvasService.enabled.read(reader)
		? contextService.contexts.read(reader).flatMap(context => (context.canvases.read(reader) ?? []).map(canvas => ({
			reference: { ...context.owner, canvas: canvas.resource },
			canvas,
		})))
		: []);
	store.add(registerSessionCanvasActivityBarActions(canvasService, activeCanvases));
	const registrations = store.add(new DisposableMap<string, CanvasMenuActionRegistration>());
	const submenuRegistration = store.add(new KeyedMenuRegistration());
	let commandSequence = 0;
	store.add(autorun(reader => {
		const definitions = registryService.availableCanvases.read(reader);
		const definitionLabels = getSessionCanvasDefinitionLabels(definitions);
		const targets = canvasService.reopenableCanvases.read(reader);
		const targetLabels = getCanvasInstanceLabels(targets.map(target => target.canvas));
		const definitionInstanceIds = new Set(definitions.map(getSessionCanvasDefinitionInstanceId));
		// Without canvases of its own, the Session Activity Bar offers the same entries as Add Tab.
		const inActivityBar = activeCanvases.read(reader).length === 0;
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
			registration.update(definitionLabels[index], '1_available', index, inActivityBar);
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
			registration.update(targetLabels[index], '2_open', index, inActivityBar);
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
		}
		submenuRegistration.update(activeKeys.size > 0 ? `addTab:${inActivityBar}` : undefined, () => combinedDisposable(
			appendCanvasSubmenu(Menus.SessionsEditorTabsBarAddTab, reopenCanvasWhen),
			appendCanvasSubmenu(Menus.SessionsEmptyEditorGroupAddTab, reopenCanvasWhen),
			inActivityBar
				? appendCanvasSubmenu(Menus.SessionActivityBar, canvasAvailableWhen, SessionActivityBarGroup.SidePanel, Menus.SessionActivityBarCanvas)
				: Disposable.None,
		));
	}));
	return store;
}

function registerSessionCanvasActivityBarActions(canvasService: ICanvasService, activeCanvases: IObservable<readonly ICanvasReopenTarget[]>): IDisposable {
	const store = new DisposableStore();
	const registrations = store.add(new DisposableMap<string, CanvasMenuActionRegistration>());
	const activityBarRegistration = store.add(new KeyedMenuRegistration());
	let commandSequence = 0;
	// Match the submenu ID so persisted toolbar hiding survives single/multiple canvas transitions.
	store.add(CommandsRegistry.registerCommand(Menus.SessionActivityBarCanvas.id, async () => {
		const targets = activeCanvases.get();
		if (targets.length === 1) {
			await canvasService.revealCanvas(targets[0].reference);
		}
	}));
	store.add(autorun(reader => {
		const targets = activeCanvases.read(reader);
		const labels = getCanvasInstanceLabels(targets.map(target => target.canvas));
		const activeKeys = new Set<string>();
		for (let index = 0; index < targets.length; index++) {
			const target = targets[index];
			const key = getCanvasReferenceKey(target.reference);
			activeKeys.add(key);
			let registration = registrations.get(key);
			if (!registration) {
				registration = new CanvasMenuActionRegistration(
					`${OPEN_SESSION_CANVAS_COMMAND_ID}.reveal.${++commandSequence}`,
					() => canvasService.revealCanvas(target.reference),
					Menus.SessionActivityBarCanvas,
				);
				registrations.set(key, registration);
			}
			registration.update(labels[index], 'navigation', index);
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
		}
		if (targets.length === 1) {
			const title = labels[0];
			activityBarRegistration.update(`single:${title}`, () => MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
				command: { id: Menus.SessionActivityBarCanvas.id, title, icon: Codicon.preview },
				group: SessionActivityBarGroup.SidePanel,
				order: 4,
				when: canvasAvailableWhen,
			}));
		} else {
			activityBarRegistration.update(targets.length > 1 ? 'multiple' : undefined, () => appendCanvasSubmenu(Menus.SessionActivityBar, canvasAvailableWhen, SessionActivityBarGroup.SidePanel, Menus.SessionActivityBarCanvas));
		}
	}));
	return store;
}
