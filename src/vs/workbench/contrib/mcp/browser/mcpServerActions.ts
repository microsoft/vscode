/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { disposeIfDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { manageExtensionIcon } from '../../extensions/browser/extensionsIcons.js';
import { getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { IMcpServer, IMcpServerContainer, IMcpService, IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState } from '../common/mcpTypes.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { URI } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export abstract class McpServerAction extends Action implements IMcpServerContainer {

	static readonly EXTENSION_ACTION_CLASS = 'extension-action';
	static readonly TEXT_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} text`;
	static readonly LABEL_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} label`;
	static readonly PROMINENT_LABEL_ACTION_CLASS = `${McpServerAction.LABEL_ACTION_CLASS} prominent`;
	static readonly ICON_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} icon`;

	private _mcpServer: IWorkbenchMcpServer | null = null;
	get mcpServer(): IWorkbenchMcpServer | null { return this._mcpServer; }
	set mcpServer(mcpServer: IWorkbenchMcpServer | null) { this._mcpServer = mcpServer; this.update(); }

	abstract update(): void;
}

export abstract class DropDownAction extends McpServerAction {

	constructor(
		id: string,
		label: string,
		cssClass: string,
		enabled: boolean,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(id, label, cssClass, enabled);
	}

	private _actionViewItem: DropDownExtensionActionViewItem | null = null;
	createActionViewItem(options: IActionViewItemOptions): DropDownExtensionActionViewItem {
		this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
		return this._actionViewItem;
	}

	public override run(actionGroups: IAction[][]): Promise<any> {
		this._actionViewItem?.showMenu(actionGroups);
		return Promise.resolve();
	}
}

export class DropDownExtensionActionViewItem extends ActionViewItem {

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super(null, action, { ...options, icon: true, label: true });
	}

	public showMenu(menuActionGroups: IAction[][]): void {
		if (this.element) {
			const actions = this.getActions(menuActionGroups);
			const elementPosition = getDomNodePagePosition(this.element);
			const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => actions,
				actionRunner: this.actionRunner,
				onHide: () => disposeIfDisposable(actions)
			});
		}
	}

	private getActions(menuActionGroups: IAction[][]): IAction[] {
		let actions: IAction[] = [];
		for (const menuActions of menuActionGroups) {
			actions = [...actions, ...menuActions, new Separator()];
		}
		return actions.length ? actions.slice(0, actions.length - 1) : actions;
	}
}

export class InstallAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent install`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
	) {
		super('extensions.install', localize('install', "Install"), InstallAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = InstallAction.HIDE;
		if (!this.mcpServer?.gallery) {
			return;
		}
		if (this.mcpServer.local) {
			return;
		}
		this.class = InstallAction.CLASS;
		this.enabled = true;
		this.label = localize('install', "Install");
	}

	override async run(): Promise<any> {
		if (!this.mcpServer) {
			return;
		}
		await this.mcpWorkbenchService.install(this.mcpServer);
	}
}

export class UninstallAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent uninstall`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
	) {
		super('extensions.uninstall', localize('uninstall', "Uninstall"), UninstallAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = UninstallAction.HIDE;
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		this.class = UninstallAction.CLASS;
		this.enabled = true;
		this.label = localize('uninstall', "Uninstall");
	}

	override async run(): Promise<any> {
		if (!this.mcpServer) {
			return;
		}
		await this.mcpWorkbenchService.uninstall(this.mcpServer);
	}
}

export class ManageMcpServerAction extends DropDownAction {

	static readonly ID = 'mcpServer.manage';

	private static readonly Class = `${McpServerAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
	private static readonly HideManageExtensionClass = `${this.Class} hide`;

	constructor(
		private readonly isEditorAction: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
	) {

		super(ManageMcpServerAction.ID, '', '', true, instantiationService);
		this.tooltip = localize('manage', "Manage");
		this.update();
	}

	async getActionGroups(): Promise<IAction[][]> {
		const groups: IAction[][] = [];
		groups.push([
			this.instantiationService.createInstance(StartServerAction),
		]);
		groups.push([
			this.instantiationService.createInstance(StopServerAction),
			this.instantiationService.createInstance(RestartServerAction),
		]);
		groups.push([
			this.instantiationService.createInstance(ShowServerOutputAction),
			this.instantiationService.createInstance(ShowServerConfigurationAction),
		]);
		if (!this.isEditorAction) {
			groups.push([
				this.instantiationService.createInstance(UninstallAction),
			]);
		}
		groups.forEach(group => group.forEach(extensionAction => {
			if (extensionAction instanceof McpServerAction) {
				extensionAction.mcpServer = this.mcpServer;
			}
		}));

		return groups;
	}

	override async run(): Promise<any> {
		return super.run(await this.getActionGroups());
	}

	update(): void {
		this.class = ManageMcpServerAction.HideManageExtensionClass;
		this.enabled = false;
		if (this.mcpServer) {
			this.enabled = !!this.mcpServer.local;
			this.class = this.enabled ? ManageMcpServerAction.Class : ManageMcpServerAction.HideManageExtensionClass;
		}
	}
}

export class StartServerAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent start`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super('extensions.start', localize('start', "Start Server"), StartServerAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = StartServerAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		const serverState = server.connectionState.get();
		if (!McpConnectionState.canBeStarted(serverState.state)) {
			return;
		}
		this.class = StartServerAction.CLASS;
		this.enabled = true;
		this.label = localize('start', "Start Server");
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		await server.start({ isFromInteraction: true });
		server.showOutput();
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.label === this.mcpServer?.name);
	}
}

export class StopServerAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent stop`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super('extensions.stop', localize('stop', "Stop Server"), StopServerAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = StopServerAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		const serverState = server.connectionState.get();
		if (McpConnectionState.canBeStarted(serverState.state)) {
			return;
		}
		this.class = StopServerAction.CLASS;
		this.enabled = true;
		this.label = localize('stop', "Stop Server");
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		await server.stop();
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.label === this.mcpServer?.name);
	}
}

export class RestartServerAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent restart`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super('extensions.restart', localize('restart', "Restart Server"), RestartServerAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = RestartServerAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		const serverState = server.connectionState.get();
		if (McpConnectionState.canBeStarted(serverState.state)) {
			return;
		}
		this.class = RestartServerAction.CLASS;
		this.enabled = true;
		this.label = localize('restart', "Restart Server");
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		await server.stop();
		await server.start({ isFromInteraction: true });
		server.showOutput();
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.label === this.mcpServer?.name);
	}
}

export class ShowServerOutputAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent output`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super('extensions.output', localize('output', "Show Output"), ShowServerOutputAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ShowServerOutputAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		this.class = ShowServerOutputAction.CLASS;
		this.enabled = true;
		this.label = localize('output', "Show Output");
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		server.showOutput();
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.label === this.mcpServer?.name);
	}
}

export class ShowServerConfigurationAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent config`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super('extensions.config', localize('config', "Show Configuration"), ShowServerConfigurationAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ShowServerConfigurationAction.HIDE;
		const configurationTarget = this.getConfigurationTarget();
		if (!configurationTarget) {
			return;
		}
		this.class = ShowServerConfigurationAction.CLASS;
		this.enabled = true;
		this.label = localize('config', "Show Configuration");
	}

	override async run(): Promise<any> {
		const configurationTarget = this.getConfigurationTarget();
		if (!configurationTarget) {
			return;
		}
		this.editorService.openEditor({
			resource: URI.isUri(configurationTarget) ? configurationTarget : configurationTarget!.uri,
			options: { selection: URI.isUri(configurationTarget) ? undefined : configurationTarget!.range }
		});
	}

	private getConfigurationTarget(): Location | URI | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		const server = this.mcpService.servers.get().find(s => s.definition.label === this.mcpServer?.name);
		if (!server) {
			return;
		}
		const collection = this.mcpRegistry.collections.get().find(c => c.id === server.collection.id);
		const serverDefinition = collection?.serverDefinitions.get().find(s => s.id === server.definition.id);
		return serverDefinition?.presentation?.origin || collection?.presentation?.origin;
	}
}
