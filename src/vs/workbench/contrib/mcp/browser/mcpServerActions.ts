/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { disposeIfDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { Location } from '../../../../editor/common/languages.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IAccountQuery, IAuthenticationQueryService } from '../../../services/authentication/common/authenticationQuery.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { errorIcon, infoIcon, manageExtensionIcon, trustIcon, warningIcon } from '../../extensions/browser/extensionsIcons.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpSamplingService, IMcpServer, IMcpServerContainer, IMcpService, IMcpWorkbenchService, IWorkbenchMcpServer, McpCapability, McpConnectionState, McpServerEditorTab, McpServerEnablementState, McpServerInstallState } from '../common/mcpTypes.js';
import { startServerByFilter } from '../common/mcpTypesUtils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

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
		private readonly editor: boolean,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IMcpService private readonly mcpService: IMcpService,
	) {
		super('extensions.install', localize('install', "Install"), InstallAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = InstallAction.HIDE;
		if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
			return;
		}
		if (this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
			return;
		}
		this.class = InstallAction.CLASS;
		this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
	}

	override async run(): Promise<any> {
		if (!this.mcpServer) {
			return;
		}

		if (!this.editor) {
			this.mcpWorkbenchService.open(this.mcpServer);
			alert(localize('mcpServerInstallation', "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
		}

		type McpServerInstallClassification = {
			owner: 'sandy081';
			comment: 'Used to understand if the action to install the MCP server is used.';
			name?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The gallery name of the MCP server being installed' };
		};
		type McpServerInstall = {
			name?: string;
		};
		this.telemetryService.publicLog2<McpServerInstall, McpServerInstallClassification>('mcp:action:install', { name: this.mcpServer.gallery?.name });

		const installed = await this.mcpWorkbenchService.install(this.mcpServer);

		await startServerByFilter(this.mcpService, s => {
			return s.definition.label === installed.name;
		});
	}
}

export class InstallingLabelAction extends McpServerAction {

	private static readonly LABEL = localize('installing', "Installing");
	private static readonly CLASS = `${McpServerAction.LABEL_ACTION_CLASS} install installing`;

	constructor() {
		super('extension.installing', InstallingLabelAction.LABEL, InstallingLabelAction.CLASS, false);
	}

	update(): void {
		this.class = `${InstallingLabelAction.CLASS}${this.mcpServer && this.mcpServer.installState === McpServerInstallState.Installing ? '' : ' hide'}`;
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
		if (this.mcpServer.installState !== McpServerInstallState.Installed) {
			this.enabled = false;
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
			this.instantiationService.createInstance(AuthServerAction),
		]);
		groups.push([
			this.instantiationService.createInstance(ShowServerOutputAction),
			this.instantiationService.createInstance(ShowServerConfigurationAction),
			this.instantiationService.createInstance(ShowServerJsonConfigurationAction),
		]);
		groups.push([
			this.instantiationService.createInstance(ConfigureModelAccessAction),
			this.instantiationService.createInstance(ShowSamplingRequestsAction),
		]);
		groups.push([
			this.instantiationService.createInstance(BrowseResourcesAction),
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
		await server.start({ promptType: 'all-untrusted' });
		server.showOutput();
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
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
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
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
		await server.start({ promptType: 'all-untrusted' });
		server.showOutput();
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
	}
}

export class AuthServerAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent account`;
	private static readonly HIDE = `${this.CLASS} hide`;

	private static readonly SIGN_OUT = localize('mcp.signOut', 'Sign Out');
	private static readonly DISCONNECT = localize('mcp.disconnect', 'Disconnect Account');

	private _accountQuery: IAccountQuery | undefined;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@IAuthenticationQueryService private readonly _authenticationQueryService: IAuthenticationQueryService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService
	) {
		super('extensions.restart', localize('restart', "Restart Server"), RestartServerAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = AuthServerAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		const accountQuery = this.getAccountQuery();
		if (!accountQuery) {
			return;
		}
		this._accountQuery = accountQuery;
		this.class = AuthServerAction.CLASS;
		this.enabled = true;
		let label = accountQuery.entities().getEntityCount().total > 1 ? AuthServerAction.DISCONNECT : AuthServerAction.SIGN_OUT;
		label += ` (${accountQuery.accountName})`;
		this.label = label;
	}

	override async run(): Promise<void> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		const accountQuery = this.getAccountQuery();
		if (!accountQuery) {
			return;
		}
		await server.stop();
		const { providerId, accountName } = accountQuery;
		accountQuery.mcpServer(server.definition.id).setAccessAllowed(false, server.definition.label);
		if (this.label === AuthServerAction.SIGN_OUT) {
			const accounts = await this._authenticationService.getAccounts(providerId);
			const account = accounts.find(a => a.label === accountName);
			if (account) {
				const sessions = await this._authenticationService.getSessions(providerId, undefined, { account });
				for (const session of sessions) {
					await this._authenticationService.removeSession(providerId, session.id);
				}
			}
		}
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
	}

	private getAccountQuery(): IAccountQuery | undefined {
		const server = this.getServer();
		if (!server) {
			return undefined;
		}
		if (this._accountQuery) {
			return this._accountQuery;
		}
		const serverId = server.definition.id;
		const preferences = this._authenticationQueryService.mcpServer(serverId).getAllAccountPreferences();
		if (!preferences.size) {
			return undefined;
		}
		for (const [providerId, accountName] of preferences) {
			const accountQuery = this._authenticationQueryService.provider(providerId).account(accountName);
			if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
				continue; // skip accounts that are not allowed
			}
			return accountQuery;
		}
		return undefined;
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
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
	}
}

export class ShowServerConfigurationAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent config`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService
	) {
		super('extensions.config', localize('config', "Show Configuration"), ShowServerConfigurationAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ShowServerConfigurationAction.HIDE;
		if (!this.mcpServer?.local) {
			return;
		}
		this.class = ShowServerConfigurationAction.CLASS;
		this.enabled = true;
	}

	override async run(): Promise<any> {
		if (!this.mcpServer?.local) {
			return;
		}
		this.mcpWorkbenchService.open(this.mcpServer, { tab: McpServerEditorTab.Configuration });
	}

}

export class ShowServerJsonConfigurationAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent config`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super('extensions.jsonConfig', localize('configJson', "Show Configuration (JSON)"), ShowServerJsonConfigurationAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ShowServerJsonConfigurationAction.HIDE;
		const configurationTarget = this.getConfigurationTarget();
		if (!configurationTarget) {
			return;
		}
		this.class = ShowServerConfigurationAction.CLASS;
		this.enabled = true;
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

export class ConfigureModelAccessAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent config`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super('extensions.config', localize('mcp.configAccess', 'Configure Model Access'), ConfigureModelAccessAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ConfigureModelAccessAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		this.class = ConfigureModelAccessAction.CLASS;
		this.enabled = true;
		this.label = localize('mcp.configAccess', 'Configure Model Access');
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		this.commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, server);
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
	}
}

export class ShowSamplingRequestsAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent config`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpSamplingService private readonly samplingService: IMcpSamplingService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super('extensions.config', localize('mcp.samplingLog', 'Show Sampling Requests'), ShowSamplingRequestsAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ShowSamplingRequestsAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		if (!this.samplingService.hasLogs(server)) {
			return;
		}
		this.class = ShowSamplingRequestsAction.CLASS;
		this.enabled = true;
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		if (!this.samplingService.hasLogs(server)) {
			return;
		}
		this.editorService.openEditor({
			resource: undefined,
			contents: this.samplingService.getLogText(server),
			label: localize('mcp.samplingLog.title', 'MCP Sampling: {0}', server.definition.label),
		});
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
	}
}

export class BrowseResourcesAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent config`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpService private readonly mcpService: IMcpService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super('extensions.config', localize('mcp.resources', 'Browse Resources'), BrowseResourcesAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = BrowseResourcesAction.HIDE;
		const server = this.getServer();
		if (!server) {
			return;
		}
		const capabilities = server.capabilities.get();
		if (capabilities !== undefined && !(capabilities & McpCapability.Resources)) {
			return;
		}
		this.class = BrowseResourcesAction.CLASS;
		this.enabled = true;
	}

	override async run(): Promise<any> {
		const server = this.getServer();
		if (!server) {
			return;
		}
		const capabilities = server.capabilities.get();
		if (capabilities !== undefined && !(capabilities & McpCapability.Resources)) {
			return;
		}
		return this.commandService.executeCommand(McpCommandIds.BrowseResources, server);
	}

	private getServer(): IMcpServer | undefined {
		if (!this.mcpServer) {
			return;
		}
		if (!this.mcpServer.local) {
			return;
		}
		return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
	}
}

export type McpServerStatus = { readonly message: IMarkdownString; readonly icon?: ThemeIcon };

export class McpServerStatusAction extends McpServerAction {

	private static readonly CLASS = `${McpServerAction.ICON_ACTION_CLASS} extension-status`;

	private _status: McpServerStatus[] = [];
	get status(): McpServerStatus[] { return this._status; }

	private readonly _onDidChangeStatus = this._register(new Emitter<void>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	constructor(
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super('extensions.status', '', `${McpServerStatusAction.CLASS} hide`, false);
		this.update();
	}

	update(): void {
		this.computeAndUpdateStatus();
	}

	private computeAndUpdateStatus(): void {
		this.updateStatus(undefined, true);
		this.enabled = false;

		if (!this.mcpServer) {
			return;
		}

		if ((this.mcpServer.gallery || this.mcpServer.installable) && this.mcpServer.installState === McpServerInstallState.Uninstalled) {
			const result = this.mcpWorkbenchService.canInstall(this.mcpServer);
			if (result !== true) {
				this.updateStatus({ icon: warningIcon, message: result }, true);
				return;
			}
		}

		if (this.mcpServer.local && this.mcpServer.installState === McpServerInstallState.Installed && this.mcpServer.enablementState === McpServerEnablementState.DisabledByAccess) {
			const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
			if (this.configurationService.getValue(mcpAccessConfig) === McpAccessValue.None) {
				this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('disabled - all not allowed', "This MCP Server is disabled because MCP servers are configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink)) }, true);
			} else {
				this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('disabled - some not allowed', "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink)) }, true);
			}
			return;
		}
	}

	private updateStatus(status: McpServerStatus | undefined, updateClass: boolean): void {
		if (status) {
			if (this._status.some(s => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
				return;
			}
		} else {
			if (this._status.length === 0) {
				return;
			}
			this._status = [];
		}

		if (status) {
			this._status.push(status);
			this._status.sort((a, b) =>
				b.icon === trustIcon ? -1 :
					a.icon === trustIcon ? 1 :
						b.icon === errorIcon ? -1 :
							a.icon === errorIcon ? 1 :
								b.icon === warningIcon ? -1 :
									a.icon === warningIcon ? 1 :
										b.icon === infoIcon ? -1 :
											a.icon === infoIcon ? 1 :
												0
			);
		}

		if (updateClass) {
			if (status?.icon === errorIcon) {
				this.class = `${McpServerStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
			}
			else if (status?.icon === warningIcon) {
				this.class = `${McpServerStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
			}
			else if (status?.icon === infoIcon) {
				this.class = `${McpServerStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
			}
			else if (status?.icon === trustIcon) {
				this.class = `${McpServerStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
			}
			else {
				this.class = `${McpServerStatusAction.CLASS} hide`;
			}
		}
		this._onDidChangeStatus.fire();
	}

	override async run(): Promise<any> {
		if (this._status[0]?.icon === trustIcon) {
			return this.commandService.executeCommand('workbench.trust.manage');
		}
	}
}
