/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ICustomizationMarketplaceService } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, LayoutModeContext } from '../../../../workbench/common/contextkeys.js';
import { isWindowCommandContext } from '../../../../workbench/common/windowCommandContext.js';
import { AICustomizationManagementCommands, AICustomizationManagementOpenEditorTarget, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { isCustomizationDiscoveryAvailable } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMarketplaceConfiguration.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { INewSessionInAgentsWindowOptions } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { Menus, SessionActivityBarGroup } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus, SessionCanvasMenuGroup } from '../../../browser/agentsWindowMenus.js';
import { getCanvasIconUri, getCanvasInstanceLabels, ICanvasContextService, ICanvasReopenTarget, ICanvasService, isCanvasOwner } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { NEW_SESSION_ACTION_ID } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { SessionActiveChatResourceContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { getSessionCanvasDefinitionLabels, ISessionCanvasRegistryService, SessionCanvasActivityBarToggledContext, WindowCanvasesAvailableContext } from '../common/sessionCanvas.js';
import { getCanvasReferenceKey, ICanvasOwner } from '../../../../workbench/common/canvasReference.js';

export const OPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.openCanvas';
export const REOPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.reopenCanvas';
export const CREATE_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.createCanvas';
export const DISCOVER_SESSION_CANVASES_COMMAND_ID = 'workbench.action.agentSessions.discoverCanvases';

const canvasAvailableWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
)!;

const reopenCanvasWhen = ContextKeyExpr.and(
	canvasAvailableWhen,
	IsTopRightEditorGroupContext,
);

/** The Session Activity Bar of the main window and of chat windows, the auxiliary windows with layout modes. */
const activityBarCanvasWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	ContextKeyExpr.or(IsAuxiliaryWindowContext.toNegated(), LayoutModeContext),
)!;

/** Whether the Session Activity Bar is beside `chat`: each strip lists the canvases of its own chat. */
function activityBarChatIs(chat: URI): ContextKeyExpression {
	return ContextKeyExpr.and(activityBarCanvasWhen, ContextKeyExpr.equals(SessionActiveChatResourceContext.key, chat.toString()))!;
}

function isSameWhen(first: ContextKeyExpression | undefined, second: ContextKeyExpression | undefined): boolean {
	return first === second || (!!first && !!second && first.equals(second));
}

class CanvasMenuActionRegistration extends Disposable {

	private readonly menuRegistration = this._register(new MutableDisposable<IDisposable>());
	private readonly activityBarRegistration = this._register(new MutableDisposable<IDisposable>());
	private title: string | undefined;
	private group: string | undefined;
	private order: number | undefined;
	private activityBarWhen: ContextKeyExpression | undefined;
	private icon: ThemeIcon | URI;

	constructor(
		readonly commandId: string,
		run: (accessor: ServicesAccessor) => Promise<void>,
		private readonly menu = AgentsWindowMenus.SessionsEditorTabsBarAddTabCanvas,
		// Only reachable through a Canvas submenu entry, which applies the surface-specific gating.
		private readonly menuWhen: ContextKeyExpression = canvasAvailableWhen,
		private readonly defaultIcon: ThemeIcon = Codicon.preview,
	) {
		super();
		this.icon = defaultIcon;
		this._register(CommandsRegistry.registerCommand(commandId, run));
	}

	/**
	 * Shows the entry with `title`, and with `icon`, a canvas's own icon, or else its default icon. It also shows in the
	 * Session Activity Bar's Canvas submenu where `activityBarWhen` holds.
	 */
	update(title: string, group: string, order: number, activityBarWhen: ContextKeyExpression | undefined = undefined, icon: URI | undefined = undefined): void {
		const nextIcon = icon ?? this.defaultIcon;
		const changed = this.title !== title || this.group !== group || this.order !== order || !isSameMenuIcon(this.icon, nextIcon);
		if (changed) {
			this.title = title;
			this.group = group;
			this.order = order;
			this.icon = nextIcon;
			this.menuRegistration.value = this.appendMenuItem(this.menu, this.menuWhen);
		}
		if (changed || !isSameWhen(this.activityBarWhen, activityBarWhen)) {
			this.activityBarWhen = activityBarWhen;
			this.activityBarRegistration.value = activityBarWhen ? this.appendMenuItem(AgentsWindowMenus.SessionActivityBarCanvas, activityBarWhen) : undefined;
		}
	}

	private appendMenuItem(menu: MenuId, when: ContextKeyExpression): IDisposable {
		return MenuRegistry.appendMenuItem(menu, {
			command: {
				id: this.commandId,
				title: this.title!,
				icon: URI.isUri(this.icon) ? { dark: this.icon } : this.icon,
			},
			group: this.group,
			order: this.order,
			when,
		});
	}
}

/** Icons are theme icons or canvas icon data URIs, whose path holds the whole image. */
function isSameMenuIcon(first: ThemeIcon | URI, second: ThemeIcon | URI): boolean {
	return URI.isUri(first) || URI.isUri(second)
		? URI.isUri(first) && URI.isUri(second) && first.path === second.path
		: first.id === second.id;
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

function appendCanvasSubmenu(menu: MenuId, when: ContextKeyExpression | undefined, group = 'navigation', submenu = AgentsWindowMenus.SessionsEditorTabsBarAddTabCanvas, toggled?: ContextKeyExpression): IDisposable {
	return MenuRegistry.appendMenuItem(menu, {
		submenu,
		title: localize('sessionCanvases.canvasSubmenu', "Canvas"),
		icon: Codicon.preview,
		group,
		order: 4,
		// The window's canvases have a Canvas entry of their own, in the main window only.
		when: ContextKeyExpr.and(when, ContextKeyExpr.or(WindowCanvasesAvailableContext.negate(), IsAuxiliaryWindowContext)),
		toggled,
	});
}

export interface IDiscoverCanvasEntry {
	readonly key: string;
	readonly commandId: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly run: (accessor: ServicesAccessor) => Promise<void>;
}

/** Entries that help find or author canvases, offered whenever the active chat supports canvases and by New Canvas. */
export const discoverCanvasEntries: readonly IDiscoverCanvasEntry[] = [{
	key: 'discover:create',
	commandId: CREATE_SESSION_CANVAS_COMMAND_ID,
	title: localize('sessionCanvases.createCanvas', "Create a Canvas..."),
	icon: Codicon.add,
	run: async accessor => {
		const options: INewSessionInAgentsWindowOptions = { prompt: '/create-canvas ', prefillPrompt: true };
		await accessor.get(ICommandService).executeCommand(NEW_SESSION_ACTION_ID, options);
	},
}, {
	key: 'discover:browse',
	commandId: DISCOVER_SESSION_CANVASES_COMMAND_ID,
	title: localize('sessionCanvases.browseCanvases', "Browse Canvases"),
	icon: Codicon.search,
	run: async accessor => {
		const commandService = accessor.get(ICommandService);
		// Without a marketplace to browse, the installed canvases are the closest match.
		const target: AICustomizationManagementOpenEditorTarget = isCustomizationDiscoveryAvailable(accessor.get(IConfigurationService), accessor.get(ICustomizationMarketplaceService))
			? { showDiscover: true, searchQuery: '@type:canvas' }
			: AICustomizationManagementSection.Canvases;
		await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, target);
	},
}];

export function registerSessionCanvasActions(canvasService: ICanvasService, registryService: ISessionCanvasRegistryService, contextService: ICanvasContextService): IDisposable {
	const store = new DisposableStore();
	const activeCanvases = derived(reader => canvasService.enabled.read(reader)
		? contextService.contexts.read(reader).flatMap(context => (context.canvases.read(reader) ?? []).map(canvas => ({
			reference: { ...context.owner, canvas: canvas.resource },
			canvas,
		})))
		: []);
	store.add(registerSessionCanvasActivityBarActions(canvasService, registryService.owner, activeCanvases));
	const registrations = store.add(new DisposableMap<string, CanvasMenuActionRegistration>());
	const submenuRegistration = store.add(new KeyedMenuRegistration());
	let commandSequence = 0;
	store.add(autorun(reader => {
		const definitions = registryService.availableCanvases.read(reader);
		const definitionLabels = getSessionCanvasDefinitionLabels(definitions);
		const canvases = activeCanvases.read(reader);
		// Running lists the canvases the focused chat's canvas pill does, whether or not their tab is open, and not those
		// of chats other windows show.
		const owner = registryService.owner.read(reader);
		const targets = owner
			? canvases.filter(({ reference, canvas }) => isCanvasOwner(reference, owner) && canvas.source !== undefined && canvasService.isOwnerPresentable(reference, reader))
			: [];
		const targetLabels = getCanvasInstanceLabels(targets.map(target => target.canvas));
		// Beside the focused chat while it has no canvases of its own, the Session Activity Bar offers the same entries as Add
		// Tab: they list the canvas types of that chat and open them in it.
		const withoutCanvasesWhen = owner && !getCanvasChats(canvases).some(chat => isEqual(chat, owner.chat)) ? activityBarChatIs(owner.chat) : undefined;
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
			registration.update(definitionLabels[index], SessionCanvasMenuGroup.Available, index, withoutCanvasesWhen, getCanvasIconUri(canvas.icon));
		}
		for (let index = 0; index < targets.length; index++) {
			const target = targets[index];
			const key = `reopen:${getCanvasReferenceKey(target.reference)}`;
			activeKeys.add(key);
			let registration = registrations.get(key);
			if (!registration) {
				registration = new CanvasMenuActionRegistration(
					`${REOPEN_SESSION_CANVAS_COMMAND_ID}.${++commandSequence}`,
					() => canvasService.revealCanvas(target.reference),
				);
				registrations.set(key, registration);
			}
			// The focused chat's own canvases, which the Session Activity Bar beside it lists instead.
			registration.update(targetLabels[index], SessionCanvasMenuGroup.Running, index, undefined, target.canvas.icon);
		}
		if (registryService.supportsCanvases.read(reader)) {
			for (let index = 0; index < discoverCanvasEntries.length; index++) {
				const entry = discoverCanvasEntries[index];
				activeKeys.add(entry.key);
				let registration = registrations.get(entry.key);
				if (!registration) {
					registration = new CanvasMenuActionRegistration(entry.commandId, entry.run, AgentsWindowMenus.SessionsEditorTabsBarAddTabCanvas, canvasAvailableWhen, entry.icon);
					registrations.set(entry.key, registration);
				}
				registration.update(entry.title, SessionCanvasMenuGroup.Discover, index, withoutCanvasesWhen);
			}
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
		}
		submenuRegistration.update(activeKeys.size > 0 ? `addTab:${withoutCanvasesWhen?.serialize()}` : undefined, () => combinedDisposable(
			appendCanvasSubmenu(AgentsWindowMenus.SessionsEditorTabsBarAddTab, reopenCanvasWhen),
			appendCanvasSubmenu(AgentsWindowMenus.SessionsEmptyEditorGroupAddTab, reopenCanvasWhen),
			withoutCanvasesWhen
				? appendCanvasSubmenu(Menus.SessionActivityBar, withoutCanvasesWhen, SessionActivityBarGroup.SidePanel, AgentsWindowMenus.SessionActivityBarCanvas, SessionCanvasActivityBarToggledContext)
				: Disposable.None,
		));
	}));
	return store;
}

/** The chats that own `canvases`, each once. */
function getCanvasChats(canvases: readonly ICanvasReopenTarget[]): readonly URI[] {
	return distinct(canvases.map(({ reference }) => reference.chat), chat => chat.toString());
}

function registerSessionCanvasActivityBarActions(canvasService: ICanvasService, owner: IObservable<ICanvasOwner | undefined>, activeCanvases: IObservable<readonly ICanvasReopenTarget[]>): IDisposable {
	const store = new DisposableStore();
	const registrations = store.add(new DisposableMap<string, CanvasMenuActionRegistration>());
	const activityBarRegistration = store.add(new KeyedMenuRegistration());
	let commandSequence = 0;
	// Match the submenu ID so persisted toolbar hiding survives single/multiple canvas transitions.
	store.add(CommandsRegistry.registerCommand(AgentsWindowMenus.SessionActivityBarCanvas.id, async (accessor, context?: unknown) => {
		// The chat of the window the strip is in, which may not have focus yet as a click activates it.
		const chat = isWindowCommandContext(context)
			? accessor.get(ISessionHostService).getHostOfWindow(context.windowId)?.chat.get()?.resource
			: owner.get()?.chat;
		const targets = chat ? activeCanvases.get().filter(({ reference }) => isEqual(reference.chat, chat)) : [];
		if (targets.length === 1) {
			await canvasService.revealCanvas(targets[0].reference);
		}
	}));
	store.add(autorun(reader => {
		const targets = activeCanvases.read(reader);
		const activeKeys = new Set<string>();
		const entries: Array<{ readonly key: string; readonly register: () => IDisposable }> = [];
		for (const chat of getCanvasChats(targets)) {
			const chatTargets = targets.filter(({ reference }) => isEqual(reference.chat, chat));
			const labels = getCanvasInstanceLabels(chatTargets.map(target => target.canvas));
			const when = activityBarChatIs(chat);
			for (let index = 0; index < chatTargets.length; index++) {
				const target = chatTargets[index];
				const key = getCanvasReferenceKey(target.reference);
				activeKeys.add(key);
				let registration = registrations.get(key);
				if (!registration) {
					registration = new CanvasMenuActionRegistration(
						`${OPEN_SESSION_CANVAS_COMMAND_ID}.reveal.${++commandSequence}`,
						() => canvasService.revealCanvas(target.reference),
						AgentsWindowMenus.SessionActivityBarCanvas,
						when,
					);
					registrations.set(key, registration);
				}
				registration.update(labels[index], 'navigation', index, undefined, target.canvas.icon);
			}
			if (chatTargets.length === 1) {
				const title = labels[0];
				entries.push({
					key: `single:${chat}\u0000${title}`, register: () => MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
						command: { id: AgentsWindowMenus.SessionActivityBarCanvas.id, title, icon: Codicon.preview, toggled: SessionCanvasActivityBarToggledContext },
						group: SessionActivityBarGroup.SidePanel,
						order: 4,
						when,
					})
				});
			} else {
				entries.push({ key: `multiple:${chat}`, register: () => appendCanvasSubmenu(Menus.SessionActivityBar, when, SessionActivityBarGroup.SidePanel, AgentsWindowMenus.SessionActivityBarCanvas, SessionCanvasActivityBarToggledContext) });
			}
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
		}
		activityBarRegistration.update(entries.length ? entries.map(entry => entry.key).join('\u0001') : undefined, () => combinedDisposable(...entries.map(entry => entry.register())));
	}));
	return store;
}
