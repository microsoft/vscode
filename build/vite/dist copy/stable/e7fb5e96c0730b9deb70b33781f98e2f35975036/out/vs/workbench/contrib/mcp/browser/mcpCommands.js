/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { $, addDisposableListener, disposableWindowInterval, EventType } from '../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { findLast } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { groupBy } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { mcpAutoStartConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from '../../../browser/actions/workspaceCommands.js';
import { ActiveEditorContext, RemoteNameContext, ResourceContextKey, WorkbenchStateContext, WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IAuthenticationQueryService } from '../../../services/authentication/common/authenticationQuery.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../../services/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IRemoteUserDataProfilesService } from '../../../services/userDataProfile/common/remoteUserDataProfiles.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { CHAT_CONFIG_MENU_ID } from '../../chat/browser/actions/chatActions.js';
import { ChatViewId, IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../chat/common/tools/languageModelToolsService.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { extensionsFilterSubMenu, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { TEXT_FILE_EDITOR_ID } from '../../files/common/files.js';
import { McpContextKeys } from '../common/mcpContextKeys.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { HasInstalledMcpServersContext, IMcpSamplingService, IMcpService, IMcpWorkbenchService, InstalledMcpServersViewId, McpConnectionState, mcpPromptPrefix, McpStartServerInteraction } from '../common/mcpTypes.js';
import { McpAddConfigurationCommand, McpInstallFromManifestCommand } from './mcpCommandsAddConfiguration.js';
import { McpResourceQuickAccess, McpResourceQuickPick } from './mcpResourceQuickAccess.js';
import { startServerAndWaitForLiveTools } from '../common/mcpTypesUtils.js';
import { isContributionDisabled } from '../../chat/common/enablement.js';
import './media/mcpServerAction.css';
import { openPanelChatAndGetWidget } from './openPanelChatAndGetWidget.js';
// acroynms do not get localized
const category = {
    original: 'MCP',
    value: 'MCP',
};
export class ListMcpServerCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.listServer" /* McpCommandIds.ListServer */,
            title: localize2('mcp.list', 'List Servers'),
            icon: Codicon.server,
            category,
            f1: true,
            precondition: ChatContextKeys.Setup.hidden.negate(),
            menu: [{
                    when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals(`config.${mcpAutoStartConfig}`, "never" /* McpAutoStartValue.Never */), McpContextKeys.hasUnknownTools), McpContextKeys.hasServersWithErrors), ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.Setup.hidden.negate()),
                    id: MenuId.ChatInput,
                    group: 'navigation',
                    order: 101,
                }],
        });
    }
    async run(accessor) {
        const mcpService = accessor.get(IMcpService);
        const commandService = accessor.get(ICommandService);
        const quickInput = accessor.get(IQuickInputService);
        const mcpWorkbenchService = accessor.get(IMcpWorkbenchService);
        const store = new DisposableStore();
        const pick = quickInput.createQuickPick({ useSeparators: true });
        pick.placeholder = localize('mcp.selectServer', 'Select an MCP Server');
        mcpService.activateCollections();
        store.add(pick);
        store.add(autorun(reader => {
            const servers = groupBy(mcpService.servers.read(reader).slice().sort((a, b) => (a.collection.presentation?.order || 0) - (b.collection.presentation?.order || 0)), s => s.collection.id);
            const firstRun = pick.items.length === 0;
            pick.items = [
                { id: '$add', label: localize('mcp.addServer', 'Add Server'), description: localize('mcp.addServer.description', 'Add a new server configuration'), alwaysShow: true, iconClass: ThemeIcon.asClassName(Codicon.add) },
                ...Object.values(servers).filter(s => s.length).flatMap((servers) => [
                    { type: 'separator', label: servers[0].collection.label, id: servers[0].collection.id },
                    ...servers.map(server => {
                        const disabled = isContributionDisabled(server.enablement.read(reader));
                        return {
                            id: server.definition.id,
                            label: server.definition.label,
                            description: disabled
                                ? localize('mcp.disabled', 'Disabled')
                                : McpConnectionState.toString(server.connectionState.read(reader)),
                        };
                    }),
                ]),
            ];
            if (firstRun && pick.items.length > 3) {
                pick.activeItems = pick.items.slice(2, 3); // select the first server by default
            }
        }));
        const picked = await new Promise(resolve => {
            store.add(pick.onDidAccept(() => {
                resolve(pick.activeItems[0]);
            }));
            store.add(pick.onDidHide(() => {
                resolve(undefined);
            }));
            pick.show();
        });
        store.dispose();
        if (!picked) {
            // no-op
        }
        else if (picked.id === '$add') {
            commandService.executeCommand("workbench.mcp.addConfiguration" /* McpCommandIds.AddConfiguration */);
        }
        else {
            const server = mcpService.servers.get().find(s => s.definition.id === picked.id);
            if (server && isContributionDisabled(server.enablement.get())) {
                const workbenchServer = mcpWorkbenchService.local.find(s => s.id === picked.id);
                if (workbenchServer) {
                    mcpWorkbenchService.open(workbenchServer);
                }
            }
            else {
                commandService.executeCommand("workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */, picked.id);
            }
        }
    }
}
export class McpConfirmationServerOptionsCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.serverOptionsInConfirmation" /* McpCommandIds.ServerOptionsInConfirmation */,
            title: localize2('mcp.options', 'Server Options'),
            category,
            icon: Codicon.settingsGear,
            f1: false,
            menu: [{
                    id: MenuId.ChatConfirmationMenu,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('chatConfirmationPartSource', 'mcp'), ContextKeyExpr.or(ContextKeyExpr.equals('chatConfirmationPartType', 'chatToolConfirmation'), ContextKeyExpr.equals('chatConfirmationPartType', 'elicitation'))),
                    group: 'navigation'
                }],
        });
    }
    async run(accessor, arg) {
        const toolsService = accessor.get(ILanguageModelToolsService);
        if (arg.kind === 'toolInvocation') {
            const tool = toolsService.getTool(arg.toolId);
            if (tool?.source.type === 'mcp') {
                accessor.get(ICommandService).executeCommand("workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */, tool.source.definitionId);
            }
        }
        else if (arg.kind === 'elicitation2') {
            if (arg.source?.type === 'mcp') {
                accessor.get(ICommandService).executeCommand("workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */, arg.source.definitionId);
            }
        }
        else {
            assertNever(arg);
        }
    }
}
export class McpServerOptionsCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */,
            title: localize2('mcp.options', 'Server Options'),
            category,
            f1: false,
        });
    }
    async run(accessor, id) {
        const mcpService = accessor.get(IMcpService);
        const quickInputService = accessor.get(IQuickInputService);
        const mcpRegistry = accessor.get(IMcpRegistry);
        const editorService = accessor.get(IEditorService);
        const commandService = accessor.get(ICommandService);
        const samplingService = accessor.get(IMcpSamplingService);
        const authenticationQueryService = accessor.get(IAuthenticationQueryService);
        const authenticationService = accessor.get(IAuthenticationService);
        const server = mcpService.servers.get().find(s => s.definition.id === id);
        if (!server) {
            return;
        }
        const collection = mcpRegistry.collections.get().find(c => c.id === server.collection.id);
        const serverDefinition = collection?.serverDefinitions.get().find(s => s.id === server.definition.id);
        const items = [];
        const serverState = server.connectionState.get();
        items.push({ type: 'separator', label: localize('mcp.actions.status', 'Status') });
        // Only show start when server is stopped or in error state
        if (McpConnectionState.canBeStarted(serverState.state)) {
            items.push({
                label: localize('mcp.start', 'Start Server'),
                action: 'start'
            });
        }
        else {
            items.push({
                label: localize('mcp.stop', 'Stop Server'),
                action: 'stop'
            });
            items.push({
                label: localize('mcp.restart', 'Restart Server'),
                action: 'restart'
            });
        }
        items.push(...this._getAuthActions(authenticationQueryService, server.definition.id));
        const configTarget = serverDefinition?.presentation?.origin || collection?.presentation?.origin;
        if (configTarget) {
            items.push({
                label: localize('mcp.config', 'Show Configuration'),
                action: 'config',
            });
        }
        items.push({
            label: localize('mcp.showOutput', 'Show Output'),
            action: 'showOutput'
        });
        items.push({ type: 'separator', label: localize('mcp.actions.sampling', 'Sampling') }, {
            label: localize('mcp.configAccess', 'Configure Model Access'),
            description: localize('mcp.showOutput.description', 'Set the models the server can use via MCP sampling'),
            action: 'configSampling'
        });
        if (samplingService.hasLogs(server)) {
            items.push({
                label: localize('mcp.samplingLog', 'Show Sampling Requests'),
                description: localize('mcp.samplingLog.description', 'Show the sampling requests for this server'),
                action: 'samplingLog',
            });
        }
        const capabilities = server.capabilities.get();
        if (capabilities === undefined || (capabilities & 16 /* McpCapability.Resources */)) {
            items.push({ type: 'separator', label: localize('mcp.actions.resources', 'Resources') });
            items.push({
                label: localize('mcp.resources', 'Browse Resources'),
                action: 'resources',
            });
        }
        const pick = await quickInputService.pick(items, {
            placeHolder: localize('mcp.selectAction', 'Select action for \'{0}\'', server.definition.label),
        });
        if (!pick) {
            return;
        }
        switch (pick.action) {
            case 'start':
                await server.start({ promptType: 'all-untrusted' });
                server.showOutput();
                break;
            case 'stop':
                await server.stop();
                break;
            case 'restart':
                await server.stop();
                await server.start({ promptType: 'all-untrusted' });
                break;
            case 'disconnect':
                await server.stop();
                await this._handleAuth(authenticationService, pick.accountQuery, server.definition, false);
                break;
            case 'signout':
                await server.stop();
                await this._handleAuth(authenticationService, pick.accountQuery, server.definition, true);
                break;
            case 'showOutput':
                server.showOutput();
                break;
            case 'config':
                editorService.openEditor({
                    resource: URI.isUri(configTarget) ? configTarget : configTarget.uri,
                    options: { selection: URI.isUri(configTarget) ? undefined : configTarget.range }
                });
                break;
            case 'configSampling':
                return commandService.executeCommand("workbench.mcp.configureSamplingModels" /* McpCommandIds.ConfigureSamplingModels */, server);
            case 'resources':
                return commandService.executeCommand("workbench.mcp.browseResources" /* McpCommandIds.BrowseResources */, server);
            case 'samplingLog':
                editorService.openEditor({
                    resource: undefined,
                    contents: samplingService.getLogText(server),
                    label: localize('mcp.samplingLog.title', 'MCP Sampling: {0}', server.definition.label),
                });
                break;
            default:
                assertNever(pick);
        }
    }
    _getAuthActions(authenticationQueryService, serverId) {
        const result = [];
        // Really, this should only ever have one entry.
        for (const [providerId, accountName] of authenticationQueryService.mcpServer(serverId).getAllAccountPreferences()) {
            const accountQuery = authenticationQueryService.provider(providerId).account(accountName);
            if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
                continue; // skip accounts that are not allowed
            }
            // If there are multiple allowed servers/extensions, other things are using this provider
            // so we show a disconnect action, otherwise we show a sign out action.
            if (accountQuery.entities().getEntityCount().total > 1) {
                result.push({
                    action: 'disconnect',
                    label: localize('mcp.disconnect', 'Disconnect Account'),
                    description: `(${accountName})`,
                    accountQuery
                });
            }
            else {
                result.push({
                    action: 'signout',
                    label: localize('mcp.signOut', 'Sign Out'),
                    description: `(${accountName})`,
                    accountQuery
                });
            }
        }
        return result;
    }
    async _handleAuth(authenticationService, accountQuery, definition, signOut) {
        const { providerId, accountName } = accountQuery;
        accountQuery.mcpServer(definition.id).setAccessAllowed(false, definition.label);
        if (signOut) {
            const accounts = await authenticationService.getAccounts(providerId);
            const account = accounts.find(a => a.label === accountName);
            if (account) {
                const sessions = await authenticationService.getSessions(providerId, undefined, { account });
                for (const session of sessions) {
                    await authenticationService.removeSession(providerId, session.id);
                }
            }
        }
    }
}
let MCPServerActionRendering = class MCPServerActionRendering extends Disposable {
    constructor(actionViewItemService, mcpService, instaService, commandService, configurationService) {
        super();
        const hoverIsOpen = observableValue(this, false);
        const config = observableConfigValue(mcpAutoStartConfig, "newAndOutdated" /* McpAutoStartValue.NewAndOutdated */, configurationService);
        let DisplayedState;
        (function (DisplayedState) {
            DisplayedState[DisplayedState["None"] = 0] = "None";
            DisplayedState[DisplayedState["NewTools"] = 1] = "NewTools";
            DisplayedState[DisplayedState["Error"] = 2] = "Error";
            DisplayedState[DisplayedState["Refreshing"] = 3] = "Refreshing";
        })(DisplayedState || (DisplayedState = {}));
        function isServer(s) {
            return typeof s.start === 'function';
        }
        const displayedStateCurrent = derived((reader) => {
            const servers = mcpService.servers.read(reader);
            const serversPerState = [];
            for (const server of servers) {
                let thisState = 0 /* DisplayedState.None */;
                switch (server.cacheState.read(reader)) {
                    case 0 /* McpServerCacheState.Unknown */:
                    case 2 /* McpServerCacheState.Outdated */:
                        thisState = server.connectionState.read(reader).state === 3 /* McpConnectionState.Kind.Error */ ? 2 /* DisplayedState.Error */ : 1 /* DisplayedState.NewTools */;
                        break;
                    case 3 /* McpServerCacheState.RefreshingFromUnknown */:
                        thisState = 3 /* DisplayedState.Refreshing */;
                        break;
                    default:
                        thisState = server.connectionState.read(reader).state === 3 /* McpConnectionState.Kind.Error */ ? 2 /* DisplayedState.Error */ : 0 /* DisplayedState.None */;
                        break;
                }
                serversPerState[thisState] ??= [];
                serversPerState[thisState].push(server);
            }
            const unknownServerStates = mcpService.lazyCollectionState.read(reader);
            if (unknownServerStates.state === 1 /* LazyCollectionState.LoadingUnknown */) {
                serversPerState[3 /* DisplayedState.Refreshing */] ??= [];
                serversPerState[3 /* DisplayedState.Refreshing */].push(...unknownServerStates.collections);
            }
            else if (unknownServerStates.state === 0 /* LazyCollectionState.HasUnknown */) {
                serversPerState[1 /* DisplayedState.NewTools */] ??= [];
                serversPerState[1 /* DisplayedState.NewTools */].push(...unknownServerStates.collections);
            }
            let maxState = (serversPerState.length - 1);
            if (maxState === 1 /* DisplayedState.NewTools */ && config.read(reader) !== "never" /* McpAutoStartValue.Never */) {
                maxState = 0 /* DisplayedState.None */;
            }
            return { state: maxState, servers: serversPerState[maxState] || [] };
        });
        // avoid hiding the hover if a state changes while it's open:
        const displayedState = derivedObservableWithCache(this, (reader, last) => {
            if (last && hoverIsOpen.read(reader)) {
                return last;
            }
            else {
                return displayedStateCurrent.read(reader);
            }
        });
        const actionItemState = displayedState.map(s => s.state);
        this._store.add(actionViewItemService.register(MenuId.ChatInput, "workbench.mcp.listServer" /* McpCommandIds.ListServer */, (action, options) => {
            if (!(action instanceof MenuItemAction)) {
                return undefined;
            }
            return instaService.createInstance(class extends MenuEntryActionViewItem {
                render(container) {
                    super.render(container);
                    container.classList.add('chat-mcp');
                    container.style.position = 'relative';
                    const stateIndicator = container.appendChild($('.chat-mcp-state-indicator'));
                    stateIndicator.style.display = 'none';
                    this._register(autorun(r => {
                        const displayed = displayedState.read(r);
                        const { state } = displayed;
                        this.updateTooltip();
                        stateIndicator.ariaLabel = this.getLabelForState(displayed);
                        stateIndicator.className = 'chat-mcp-state-indicator';
                        if (state === 1 /* DisplayedState.NewTools */) {
                            stateIndicator.style.display = 'block';
                            stateIndicator.classList.add('chat-mcp-state-new', ...ThemeIcon.asClassNameArray(Codicon.refresh));
                        }
                        else if (state === 2 /* DisplayedState.Error */) {
                            stateIndicator.style.display = 'block';
                            stateIndicator.classList.add('chat-mcp-state-error', ...ThemeIcon.asClassNameArray(Codicon.warning));
                        }
                        else if (state === 3 /* DisplayedState.Refreshing */) {
                            stateIndicator.style.display = 'block';
                            stateIndicator.classList.add('chat-mcp-state-refreshing', ...ThemeIcon.asClassNameArray(spinningLoading));
                        }
                        else {
                            stateIndicator.style.display = 'none';
                        }
                    }));
                }
                async onClick(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const { state, servers } = displayedStateCurrent.get();
                    if (state === 1 /* DisplayedState.NewTools */) {
                        const interaction = new McpStartServerInteraction();
                        servers.filter(isServer).forEach(server => server.stop().then(() => server.start({ interaction })));
                        mcpService.activateCollections();
                    }
                    else if (state === 3 /* DisplayedState.Refreshing */) {
                        findLast(servers, isServer)?.showOutput();
                    }
                    else if (state === 2 /* DisplayedState.Error */) {
                        const server = findLast(servers, isServer);
                        if (server) {
                            await server.showOutput(true);
                            commandService.executeCommand("workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */, server.definition.id);
                        }
                    }
                    else {
                        commandService.executeCommand("workbench.mcp.listServer" /* McpCommandIds.ListServer */);
                    }
                }
                getTooltip() {
                    return this.getLabelForState() || super.getTooltip();
                }
                getHoverContents({ state, servers } = displayedStateCurrent.get()) {
                    const link = (s) => createMarkdownCommandLink({
                        text: s.definition.label,
                        id: "workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */,
                        arguments: [s.definition.id],
                        tooltip: localize('mcp.server.options.tooltip', 'Show server options for {0}', s.definition.label),
                    });
                    const single = servers.length === 1;
                    const names = servers.map(s => isServer(s) ? link(s) : '`' + s.label + '`').map(l => single ? l : `- ${l}`).join('\n');
                    let markdown;
                    if (state === 1 /* DisplayedState.NewTools */) {
                        markdown = new MarkdownString(single
                            ? localize('mcp.newTools.md.single', "MCP server {0} has been updated and may have new tools available.", names)
                            : localize('mcp.newTools.md.multi', "MCP servers have been updated and may have new tools available:\n\n{0}", names));
                    }
                    else if (state === 2 /* DisplayedState.Error */) {
                        markdown = new MarkdownString(single
                            ? localize('mcp.err.md.single', "MCP server {0} was unable to start successfully.", names)
                            : localize('mcp.err.md.multi', "Multiple MCP servers were unable to start successfully:\n\n{0}", names));
                    }
                    else {
                        return this.getLabelForState() || undefined;
                    }
                    return {
                        element: (token) => {
                            hoverIsOpen.set(true, undefined);
                            const store = new DisposableStore();
                            store.add(toDisposable(() => hoverIsOpen.set(false, undefined)));
                            store.add(token.onCancellationRequested(() => {
                                store.dispose();
                            }));
                            // todo@connor4312/@benibenj: workaround for #257923
                            store.add(disposableWindowInterval(mainWindow, () => {
                                if (!container.isConnected) {
                                    store.dispose();
                                }
                            }, 2000));
                            const container = $('div.mcp-hover-contents');
                            // Render markdown content
                            markdown.isTrusted = true;
                            const markdownResult = store.add(renderMarkdown(markdown));
                            container.appendChild(markdownResult.element);
                            // Add divider
                            const divider = $('hr.mcp-hover-divider');
                            container.appendChild(divider);
                            // Add checkbox for mcpAutoStartConfig setting
                            const checkboxContainer = $('div.mcp-hover-setting');
                            const settingLabelStr = localize('mcp.autoStart', "Automatically start MCP servers when sending a chat message");
                            const checkbox = store.add(new Checkbox(settingLabelStr, config.get() !== "never" /* McpAutoStartValue.Never */, { ...defaultCheckboxStyles }));
                            checkboxContainer.appendChild(checkbox.domNode);
                            // Add label next to checkbox
                            const settingLabel = $('span.mcp-hover-setting-label', undefined, settingLabelStr);
                            checkboxContainer.appendChild(settingLabel);
                            const onChange = () => {
                                const newValue = checkbox.checked ? "newAndOutdated" /* McpAutoStartValue.NewAndOutdated */ : "never" /* McpAutoStartValue.Never */;
                                configurationService.updateValue(mcpAutoStartConfig, newValue);
                            };
                            store.add(checkbox.onChange(onChange));
                            store.add(addDisposableListener(settingLabel, EventType.CLICK, () => {
                                checkbox.checked = !checkbox.checked;
                                onChange();
                            }));
                            container.appendChild(checkboxContainer);
                            return container;
                        },
                    };
                }
                getLabelForState({ state, servers } = displayedStateCurrent.get()) {
                    if (state === 1 /* DisplayedState.NewTools */) {
                        return localize('mcp.newTools', "New tools available ({0})", servers.length || 1);
                    }
                    else if (state === 2 /* DisplayedState.Error */) {
                        return localize('mcp.toolError', "Error loading {0} tool(s)", servers.length || 1);
                    }
                    else if (state === 3 /* DisplayedState.Refreshing */) {
                        return localize('mcp.toolRefresh', "Discovering tools...");
                    }
                    else {
                        return null;
                    }
                }
            }, action, { ...options, keybindingNotRenderedWithLabel: true });
        }, Event.fromObservableLight(actionItemState)));
    }
};
MCPServerActionRendering = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IMcpService),
    __param(2, IInstantiationService),
    __param(3, ICommandService),
    __param(4, IConfigurationService)
], MCPServerActionRendering);
export { MCPServerActionRendering };
export class ResetMcpTrustCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.resetTrust" /* McpCommandIds.ResetTrust */,
            title: localize2('mcp.resetTrust', "Reset Trust"),
            category,
            f1: true,
            precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate()),
        });
    }
    run(accessor) {
        const mcpService = accessor.get(IMcpService);
        mcpService.resetTrust();
    }
}
export class ResetMcpCachedTools extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.resetCachedTools" /* McpCommandIds.ResetCachedTools */,
            title: localize2('mcp.resetCachedTools', "Reset Cached Tools"),
            category,
            f1: true,
            precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate()),
        });
    }
    run(accessor) {
        const mcpService = accessor.get(IMcpService);
        mcpService.resetCaches();
    }
}
export class AddConfigurationAction extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.addConfiguration" /* McpCommandIds.AddConfiguration */,
            title: localize2('mcp.addConfiguration', "Add Server..."),
            metadata: {
                description: localize2('mcp.addConfiguration.description', "Installs a new Model Context protocol to the mcp.json settings"),
            },
            category,
            f1: true,
            precondition: ChatContextKeys.Setup.hidden.negate(),
            menu: {
                id: MenuId.EditorContent,
                when: ContextKeyExpr.and(ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]mcp\.json$/), ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), ChatContextKeys.Setup.hidden.negate())
            }
        });
    }
    async run(accessor, configUri) {
        const instantiationService = accessor.get(IInstantiationService);
        const workspaceService = accessor.get(IWorkspaceContextService);
        const target = configUri ? workspaceService.getWorkspaceFolder(URI.parse(configUri)) : undefined;
        return instantiationService.createInstance(McpAddConfigurationCommand, target ?? undefined).run();
    }
}
export class InstallFromManifestAction extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.installFromManifest" /* McpCommandIds.InstallFromManifest */,
            title: localize2('mcp.installFromManifest', "Install Server from Manifest..."),
            metadata: {
                description: localize2('mcp.installFromManifest.description', "Install an MCP server from a JSON manifest file"),
            },
            category,
            f1: true,
            precondition: ChatContextKeys.Setup.hidden.negate(),
        });
    }
    async run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        return instantiationService.createInstance(McpInstallFromManifestCommand).run();
    }
}
export class RemoveStoredInput extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.removeStoredInput" /* McpCommandIds.RemoveStoredInput */,
            title: localize2('mcp.resetCachedTools', "Reset Cached Tools"),
            category,
            f1: false,
        });
    }
    run(accessor, scope, id) {
        accessor.get(IMcpRegistry).clearSavedInputs(scope, id);
    }
}
export class EditStoredInput extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.editStoredInput" /* McpCommandIds.EditStoredInput */,
            title: localize2('mcp.editStoredInput', "Edit Stored Input"),
            category,
            f1: false,
        });
    }
    run(accessor, inputId, uri, configSection, target) {
        const workspaceFolder = uri && accessor.get(IWorkspaceContextService).getWorkspaceFolder(uri);
        accessor.get(IMcpRegistry).editSavedInput(inputId, workspaceFolder || undefined, configSection, target);
    }
}
export class ShowConfiguration extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.showConfiguration" /* McpCommandIds.ShowConfiguration */,
            title: localize2('mcp.command.showConfiguration', "Show Configuration"),
            category,
            f1: false,
        });
    }
    run(accessor, collectionId, serverId) {
        const collection = accessor.get(IMcpRegistry).collections.get().find(c => c.id === collectionId);
        if (!collection) {
            return;
        }
        const server = collection?.serverDefinitions.get().find(s => s.id === serverId);
        const editorService = accessor.get(IEditorService);
        if (server?.presentation?.origin) {
            editorService.openEditor({
                resource: server.presentation.origin.uri,
                options: { selection: server.presentation.origin.range }
            });
        }
        else if (collection.presentation?.origin) {
            editorService.openEditor({
                resource: collection.presentation.origin,
            });
        }
    }
}
export class ShowOutput extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.showOutput" /* McpCommandIds.ShowOutput */,
            title: localize2('mcp.command.showOutput', "Show Output"),
            category,
            f1: false,
        });
    }
    run(accessor, serverId) {
        accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId)?.showOutput();
    }
}
export class RestartServer extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.restartServer" /* McpCommandIds.RestartServer */,
            title: localize2('mcp.command.restartServer', "Restart Server"),
            category,
            f1: false,
        });
    }
    async run(accessor, serverId, opts) {
        const s = accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId);
        s?.showOutput();
        await s?.stop();
        await s?.start({ promptType: 'all-untrusted', ...opts });
    }
}
export class StartServer extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.startServer" /* McpCommandIds.StartServer */,
            title: localize2('mcp.command.startServer', "Start Server"),
            category,
            f1: false,
        });
    }
    async run(accessor, serverId, opts) {
        let servers = accessor.get(IMcpService).servers.get();
        if (serverId !== '*') {
            servers = servers.filter(s => s.definition.id === serverId);
        }
        const startOpts = { promptType: 'all-untrusted', ...opts };
        if (opts?.waitForLiveTools) {
            await Promise.all(servers.map(s => startServerAndWaitForLiveTools(s, startOpts)));
        }
        else {
            await Promise.all(servers.map(s => s.start(startOpts)));
        }
    }
}
export class StopServer extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.stopServer" /* McpCommandIds.StopServer */,
            title: localize2('mcp.command.stopServer', "Stop Server"),
            category,
            f1: false,
        });
    }
    async run(accessor, serverId) {
        const s = accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId);
        await s?.stop();
    }
}
export class McpBrowseCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.browseServers" /* McpCommandIds.Browse */,
            title: localize2('mcp.command.browse', "MCP Servers"),
            tooltip: localize2('mcp.command.browse.tooltip', "Browse MCP Servers"),
            category,
            icon: Codicon.search,
            precondition: ChatContextKeys.Setup.hidden.negate(),
            menu: [{
                    id: extensionsFilterSubMenu,
                    group: '1_predefined',
                    order: 1,
                    when: ChatContextKeys.Setup.hidden.negate(),
                }, {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('view', InstalledMcpServersViewId), ChatContextKeys.Setup.hidden.negate()),
                    group: 'navigation',
                }],
        });
    }
    async run(accessor) {
        accessor.get(IExtensionsWorkbenchService).openSearch('@mcp ');
    }
}
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: "workbench.mcp.browseServers" /* McpCommandIds.Browse */,
        title: localize2('mcp.command.browse.mcp', "Browse MCP Servers"),
        category,
        precondition: ChatContextKeys.Setup.hidden.negate(),
    },
});
export class ShowInstalledMcpServersCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.showInstalledServers" /* McpCommandIds.ShowInstalled */,
            title: localize2('mcp.command.show.installed', "Show Installed Servers"),
            category,
            precondition: ContextKeyExpr.and(HasInstalledMcpServersContext, ChatContextKeys.Setup.hidden.negate()),
            f1: true,
        });
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = await viewsService.openView(InstalledMcpServersViewId, true);
        if (!view) {
            await viewsService.openViewContainer(VIEW_CONTAINER.id);
            await viewsService.openView(InstalledMcpServersViewId, true);
        }
    }
}
MenuRegistry.appendMenuItem(CHAT_CONFIG_MENU_ID, {
    command: {
        id: "workbench.mcp.showInstalledServers" /* McpCommandIds.ShowInstalled */,
        title: localize2('mcp.servers', "MCP Servers")
    },
    when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
    order: 10,
    group: '2_level'
});
class OpenMcpResourceCommand extends Action2 {
    async run(accessor) {
        const fileService = accessor.get(IFileService);
        const editorService = accessor.get(IEditorService);
        const resource = await this.getURI(accessor);
        if (!(await fileService.exists(resource))) {
            await fileService.createFile(resource, VSBuffer.fromString(JSON.stringify({ servers: {} }, null, '\t')));
        }
        await editorService.openEditor({ resource });
    }
}
export class OpenUserMcpResourceCommand extends OpenMcpResourceCommand {
    constructor() {
        super({
            id: "workbench.mcp.openUserMcpJson" /* McpCommandIds.OpenUserMcp */,
            title: localize2('mcp.command.openUserMcp', "Open User Configuration"),
            category,
            f1: true,
            precondition: ChatContextKeys.Setup.hidden.negate(),
        });
    }
    getURI(accessor) {
        const userDataProfileService = accessor.get(IUserDataProfileService);
        return Promise.resolve(userDataProfileService.currentProfile.mcpResource);
    }
}
export class OpenRemoteUserMcpResourceCommand extends OpenMcpResourceCommand {
    constructor() {
        super({
            id: "workbench.mcp.openRemoteUserMcpJson" /* McpCommandIds.OpenRemoteUserMcp */,
            title: localize2('mcp.command.openRemoteUserMcp', "Open Remote User Configuration"),
            category,
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), RemoteNameContext.notEqualsTo(''))
        });
    }
    async getURI(accessor) {
        const userDataProfileService = accessor.get(IUserDataProfileService);
        const remoteUserDataProfileService = accessor.get(IRemoteUserDataProfilesService);
        const remoteProfile = await remoteUserDataProfileService.getRemoteProfile(userDataProfileService.currentProfile);
        return remoteProfile.mcpResource;
    }
}
export class OpenWorkspaceFolderMcpResourceCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.openWorkspaceFolderMcpJson" /* McpCommandIds.OpenWorkspaceFolderMcp */,
            title: localize2('mcp.command.openWorkspaceFolderMcp', "Open Workspace Folder MCP Configuration"),
            category,
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), WorkspaceFolderCountContext.notEqualsTo(0))
        });
    }
    async run(accessor) {
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const commandService = accessor.get(ICommandService);
        const editorService = accessor.get(IEditorService);
        const workspaceFolders = workspaceContextService.getWorkspace().folders;
        const workspaceFolder = workspaceFolders.length === 1 ? workspaceFolders[0] : await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        if (workspaceFolder) {
            await editorService.openEditor({ resource: workspaceFolder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]) });
        }
    }
}
export class OpenWorkspaceMcpResourceCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.openWorkspaceMcpJson" /* McpCommandIds.OpenWorkspaceMcp */,
            title: localize2('mcp.command.openWorkspaceMcp', "Open Workspace MCP Configuration"),
            category,
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), WorkbenchStateContext.isEqualTo('workspace'))
        });
    }
    async run(accessor) {
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const editorService = accessor.get(IEditorService);
        const workspaceConfiguration = workspaceContextService.getWorkspace().configuration;
        if (workspaceConfiguration) {
            await editorService.openEditor({ resource: workspaceConfiguration });
        }
    }
}
export class McpBrowseResourcesCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.browseResources" /* McpCommandIds.BrowseResources */,
            title: localize2('mcp.browseResources', "Browse Resources..."),
            category,
            precondition: ContextKeyExpr.and(McpContextKeys.serverCount.greater(0), ChatContextKeys.Setup.hidden.negate()),
            f1: true,
        });
    }
    run(accessor, server) {
        if (server) {
            accessor.get(IInstantiationService).createInstance(McpResourceQuickPick, server).pick();
        }
        else {
            accessor.get(IQuickInputService).quickAccess.show(McpResourceQuickAccess.PREFIX);
        }
    }
}
export class McpConfigureSamplingModels extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.configureSamplingModels" /* McpCommandIds.ConfigureSamplingModels */,
            title: localize2('mcp.configureSamplingModels', "Configure SamplingModel"),
            category,
        });
    }
    async run(accessor, server) {
        const quickInputService = accessor.get(IQuickInputService);
        const lmService = accessor.get(ILanguageModelsService);
        const mcpSampling = accessor.get(IMcpSamplingService);
        const existingIds = new Set(mcpSampling.getConfig(server).allowedModels);
        const allItems = lmService.getLanguageModelIds().map(id => {
            const model = lmService.lookupLanguageModel(id);
            if (!model.isUserSelectable) {
                return undefined;
            }
            return {
                label: model.name,
                description: model.tooltip,
                id,
                picked: existingIds.size ? existingIds.has(id) : model.isDefaultForLocation[ChatAgentLocation.Chat],
            };
        }).filter(isDefined);
        allItems.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0) || a.label.localeCompare(b.label));
        // do the quickpick selection
        const picked = await quickInputService.pick(allItems, {
            placeHolder: localize('mcp.configureSamplingModels.ph', 'Pick the models {0} can access via MCP sampling', server.definition.label),
            canPickMany: true,
        });
        if (picked) {
            await mcpSampling.updateConfig(server, c => c.allowedModels = picked.map(p => p.id));
        }
        return picked?.length || 0;
    }
}
export class McpStartPromptingServerCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.startPromptForServer" /* McpCommandIds.StartPromptForServer */,
            title: localize2('mcp.startPromptingServer', "Start Prompting Server"),
            category,
            f1: false,
        });
    }
    async run(accessor, server) {
        const widget = await openPanelChatAndGetWidget(accessor.get(IViewsService), accessor.get(IChatWidgetService));
        if (!widget) {
            return;
        }
        const editor = widget.inputEditor;
        const model = editor.getModel();
        if (!model) {
            return;
        }
        const range = (editor.getSelection() || model.getFullModelRange()).collapseToEnd();
        const text = mcpPromptPrefix(server.definition) + '.';
        model.applyEdits([{ range, text }]);
        editor.setSelection(Range.fromPositions(range.getEndPosition().delta(0, text.length)));
        widget.focusInput();
        SuggestController.get(editor)?.triggerSuggest();
    }
}
export class McpSkipCurrentAutostartCommand extends Action2 {
    constructor() {
        super({
            id: "workbench.mcp.skipAutostart" /* McpCommandIds.SkipCurrentAutostart */,
            title: localize2('mcp.skipCurrentAutostart', "Skip Current Autostart"),
            category,
            f1: false,
        });
    }
    async run(accessor) {
        accessor.get(IMcpService).cancelAutostart();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwQ29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvYnJvd3Nlci9tY3BDb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLHdCQUF3QixFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0SCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7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