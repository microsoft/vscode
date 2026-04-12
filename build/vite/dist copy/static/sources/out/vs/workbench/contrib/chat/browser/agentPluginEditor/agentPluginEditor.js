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
var AgentPluginEditor_1, UpdatePluginEditorAction_1;
import { $, EventType, addDisposableListener, append, reset, setParentFlowTo } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../../base/common/actions.js';
import * as arrays from '../../../../../base/common/arrays.js';
import { Cache } from '../../../../../base/common/cache.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas, matchesScheme } from '../../../../../base/common/network.js';
import { autorun, derived } from '../../../../../base/common/observable.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap } from '../../../../../editor/common/languages/supports/tokenization.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IRequestService, asText } from '../../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../../markdown/browser/markdownDocumentRenderer.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { hasSourceChanged, IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EnablementStatusWidget, pluginEnablementLabels } from '../enablementStatusWidget.js';
import { InstallPluginAction, UninstallPluginAction, createEnablePluginDropDown, createDisablePluginDropDown, EnablementDropDownAction, EnablementDropdownActionViewItem } from '../agentPluginActions.js';
import './media/agentPluginEditor.css';
var WebviewIndex;
(function (WebviewIndex) {
    WebviewIndex[WebviewIndex["Readme"] = 0] = "Readme";
})(WebviewIndex || (WebviewIndex = {}));
let AgentPluginEditor = class AgentPluginEditor extends EditorPane {
    static { AgentPluginEditor_1 = this; }
    static { this.ID = 'workbench.editor.agentPlugin'; }
    constructor(group, telemetryService, instantiationService, themeService, openerService, storageService, extensionService, webviewService, languageService, fileService, requestService, agentPluginService, pluginInstallService, pluginMarketplaceService, labelService, contextMenuService) {
        super(AgentPluginEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.openerService = openerService;
        this.extensionService = extensionService;
        this.webviewService = webviewService;
        this.languageService = languageService;
        this.fileService = fileService;
        this.requestService = requestService;
        this.agentPluginService = agentPluginService;
        this.pluginInstallService = pluginInstallService;
        this.pluginMarketplaceService = pluginMarketplaceService;
        this.labelService = labelService;
        this.contextMenuService = contextMenuService;
        this.pluginReadme = null;
        this.initialScrollProgress = new Map();
        this.currentIdentifier = '';
        this.layoutParticipants = [];
        this.contentDisposables = this._register(new DisposableStore());
        this.transientDisposables = this._register(new DisposableStore());
        this.activeElement = null;
    }
    createEditor(parent) {
        const root = append(parent, $('.extension-editor.agent-plugin-editor'));
        root.tabIndex = 0;
        root.style.outline = 'none';
        root.setAttribute('role', 'document');
        const header = append(root, $('.header'));
        const iconContainer = append(header, $('.icon-container'));
        const icon = append(iconContainer, $('span.codicon.codicon-extensions'));
        icon.style.fontSize = '64px';
        const details = append(header, $('.details'));
        const title = append(details, $('.title'));
        const name = append(title, $('span.name', { role: 'heading', tabIndex: 0 }));
        const description = append(details, $('.description'));
        const subtitle = append(details, $('.subtitle'));
        const marketplace = append(subtitle, $('span.subtitle-entry'));
        const actionsAndStatusContainer = append(details, $('.actions-status-container'));
        const actionBar = this._register(new ActionBar(actionsAndStatusContainer, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof EnablementDropDownAction) {
                    return new EnablementDropdownActionViewItem(action, {
                        ...options,
                        icon: true,
                        label: true,
                        menuActionsOrProvider: { getActions: () => action.menuActions },
                        menuActionClassNames: action.menuActionClassNames,
                    }, this.contextMenuService);
                }
                return undefined;
            },
            focusOnlyEnabledItems: true
        }));
        actionBar.setFocusable(true);
        const statusContainer = append(actionsAndStatusContainer, $('.status'));
        const body = append(root, $('.body'));
        const content = append(body, $('.content'));
        content.id = generateUuid();
        this.template = {
            content,
            description,
            header,
            name,
            marketplace,
            actionBar,
            statusContainer,
        };
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        if (this.template) {
            await this.render(input.item, this.template);
        }
    }
    async render(item, template) {
        this.activeElement = null;
        this.transientDisposables.clear();
        this.contentDisposables.clear();
        template.content.innerText = '';
        const cts = new CancellationTokenSource();
        this.transientDisposables.add(toDisposable(() => cts.dispose(true)));
        const token = cts.token;
        const itemId = item.kind === "installed" /* AgentPluginItemKind.Installed */ ? item.plugin.uri.toString() : `${item.marketplaceReference.canonicalId}/${item.source}`;
        if (this.currentIdentifier !== itemId) {
            this.initialScrollProgress.clear();
            this.currentIdentifier = itemId;
        }
        this.pluginReadme = new Cache(() => this.fetchReadme(item, token));
        template.name.textContent = item.name;
        template.description.textContent = item.description;
        // Set up marketplace link
        const marketplaceLabel = item.marketplace ?? '';
        const githubRepo = item.kind === "marketplace" /* AgentPluginItemKind.Marketplace */
            ? item.marketplaceReference.githubRepo
            : item.plugin.fromMarketplace?.marketplaceReference.githubRepo;
        if (marketplaceLabel && githubRepo) {
            const url = `https://github.com/${githubRepo}`;
            const link = $('a.marketplace-link', { href: url }, marketplaceLabel);
            this.transientDisposables.add(addDisposableListener(link, EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openerService.open(URI.parse(url));
            }));
            reset(template.marketplace, link);
        }
        else {
            reset(template.marketplace, marketplaceLabel);
        }
        const currentItem = derived(reader => {
            // Read observables to subscribe to changes
            const allPlugins = this.agentPluginService.plugins.read(reader);
            let currentItem = item;
            // If this was a marketplace item, check if it got installed
            if (item.kind === "marketplace" /* AgentPluginItemKind.Marketplace */) {
                const expectedUri = this.pluginInstallService.getPluginInstallUri({
                    name: item.name,
                    description: item.description,
                    version: '',
                    source: item.source,
                    sourceDescriptor: item.sourceDescriptor,
                    marketplace: item.marketplace,
                    marketplaceReference: item.marketplaceReference,
                    marketplaceType: item.marketplaceType,
                });
                const installedPlugin = allPlugins.find(p => p.uri.toString() === expectedUri.toString());
                if (installedPlugin) {
                    currentItem = this.installedPluginToItem(installedPlugin);
                }
            }
            else {
                // If this was an installed item, check if it got uninstalled
                const stillInstalled = allPlugins.find(p => p.uri.toString() === item.plugin.uri.toString());
                if (!stillInstalled) {
                    // Plugin was uninstalled — show as marketplace if we have the info
                    if (item.plugin.fromMarketplace) {
                        const mp = item.plugin.fromMarketplace;
                        currentItem = {
                            kind: "marketplace" /* AgentPluginItemKind.Marketplace */,
                            name: item.name,
                            description: mp.description,
                            source: mp.source,
                            sourceDescriptor: mp.sourceDescriptor,
                            marketplace: mp.marketplace,
                            marketplaceReference: mp.marketplaceReference,
                            marketplaceType: mp.marketplaceType,
                            readmeUri: mp.readmeUri,
                        };
                    }
                    else {
                        // Non-marketplace plugin was uninstalled — no actions to show
                        return;
                    }
                }
                else {
                    // Read enablement state for reactivity
                    stillInstalled.enablement.read(reader);
                    currentItem = this.installedPluginToItem(stillInstalled);
                }
            }
            return currentItem;
        });
        const storedPlugin = currentItem.map((item, r) => {
            if (!item || item.kind === "marketplace" /* AgentPluginItemKind.Marketplace */) {
                return undefined;
            }
            return this.pluginMarketplaceService.installedPlugins.read(r)
                .find(e => e.pluginUri.toString() === item.plugin.uri.toString())?.plugin
                ?? item.plugin.fromMarketplace;
        });
        // Set up actions reactively
        const actionDisposables = this.transientDisposables.add(new DisposableStore());
        this.transientDisposables.add(autorun(reader => {
            actionDisposables.clear();
            template.actionBar.clear();
            const current = currentItem.read(reader);
            if (!current) {
                return;
            }
            this.pluginMarketplaceService.lastFetchedPlugins.read(reader);
            const actions = this.getItemActions(current, storedPlugin.read(reader));
            if (actions.length > 0) {
                template.actionBar.push(actions, { icon: true, label: true });
            }
            for (const action of actions) {
                actionDisposables.add(action);
            }
            // Update enablement status widget
            if (current.kind === "installed" /* AgentPluginItemKind.Installed */) {
                actionDisposables.add(this.instantiationService.createInstance(EnablementStatusWidget, template.statusContainer, current.plugin.enablement, pluginEnablementLabels));
            }
        }));
        // Open readme
        this.activeElement = await this.openDetails(item, template, token);
    }
    getItemActions(item, storedPlugin) {
        if (item.kind === "marketplace" /* AgentPluginItemKind.Marketplace */) {
            return [this.instantiationService.createInstance(InstallPluginAction, item)];
        }
        const workspaceService = this.instantiationService.invokeFunction(a => a.get(IWorkspaceContextService));
        const actions = [];
        if (storedPlugin) {
            const cachedMarketplace = this.pluginMarketplaceService.lastFetchedPlugins.get();
            const key = `${storedPlugin.marketplaceReference.canonicalId}::${storedPlugin.name}`;
            const livePlugin = cachedMarketplace.find(mp => `${mp.marketplaceReference.canonicalId}::${mp.name}` === key);
            if (livePlugin && hasSourceChanged(storedPlugin.sourceDescriptor, livePlugin.sourceDescriptor)) {
                actions.push(this.instantiationService.createInstance(UpdatePluginEditorAction, item.plugin, livePlugin));
            }
        }
        actions.push(createEnablePluginDropDown(item.plugin, this.agentPluginService.enablementModel, workspaceService));
        actions.push(createDisablePluginDropDown(item.plugin, this.agentPluginService.enablementModel, workspaceService));
        actions.push(new UninstallPluginAction(item.plugin));
        return actions;
    }
    installedPluginToItem(plugin) {
        const name = plugin.label;
        const description = plugin.fromMarketplace?.description ?? this.labelService.getUriLabel(dirname(plugin.uri), { relative: true });
        const marketplace = plugin.fromMarketplace?.marketplace;
        return { kind: "installed" /* AgentPluginItemKind.Installed */, name, description, marketplace, plugin };
    }
    async fetchReadme(item, token) {
        let readmeUri;
        if (item.kind === "installed" /* AgentPluginItemKind.Installed */) {
            readmeUri = joinPath(item.plugin.uri, 'README.md');
        }
        else {
            readmeUri = item.readmeUri;
        }
        if (!readmeUri) {
            return '';
        }
        if (readmeUri.scheme === Schemas.file || readmeUri.scheme === Schemas.vscodeRemote) {
            try {
                const content = await this.fileService.readFile(readmeUri);
                return content.value.toString();
            }
            catch {
                return '';
            }
        }
        // For https GitHub URLs, convert blob URL to raw URL
        if (readmeUri.scheme === Schemas.https) {
            let rawUrl = readmeUri.toString();
            const githubBlobMatch = rawUrl.match(/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/blob\/(?<rest>.+)$/);
            if (githubBlobMatch?.groups) {
                rawUrl = `https://raw.githubusercontent.com/${githubBlobMatch.groups['owner']}/${githubBlobMatch.groups['repo']}/${githubBlobMatch.groups['rest']}`;
            }
            try {
                const context = await this.requestService.request({ type: 'GET', url: rawUrl, callSite: 'agentPluginEditor.fetchReadme' }, token);
                const text = await asText(context);
                return text ?? '';
            }
            catch {
                return '';
            }
        }
        return '';
    }
    async openDetails(item, template, token) {
        const details = append(template.content, $('.details'));
        const readmeContainer = append(details, $('.content-container'));
        const layout = () => details.classList.toggle('narrow', this.dimension !== undefined && this.dimension.width < 500);
        layout();
        this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
        return this.openMarkdown(this.pluginReadme.get(), localize('noReadme', "No README available."), readmeContainer, 0 /* WebviewIndex.Readme */, localize('Readme title', "Readme"), token);
    }
    async openMarkdown(cacheResult, noContentCopy, container, webviewIndex, title, token) {
        try {
            const body = await this.renderMarkdown(cacheResult, container, token);
            if (token.isCancellationRequested) {
                return null;
            }
            const webview = this.contentDisposables.add(this.webviewService.createWebviewOverlay({
                title,
                options: {
                    enableFindWidget: true,
                    tryRestoreScrollPosition: true,
                    disableServiceWorker: true,
                },
                contentOptions: {},
                extension: undefined,
            }));
            webview.initialScrollProgress = this.initialScrollProgress.get(webviewIndex) || 0;
            webview.claim(this, this.window, undefined);
            setParentFlowTo(webview.container, container);
            webview.layoutWebviewOverElement(container);
            webview.setHtml(body);
            webview.claim(this, this.window, undefined);
            this.contentDisposables.add(webview.onDidFocus(() => this._onDidFocus?.fire()));
            this.contentDisposables.add(webview.onDidScroll(() => this.initialScrollProgress.set(webviewIndex, webview.initialScrollProgress)));
            const removeLayoutParticipant = arrays.insert(this.layoutParticipants, {
                layout: () => {
                    webview.layoutWebviewOverElement(container);
                }
            });
            this.contentDisposables.add(toDisposable(removeLayoutParticipant));
            let isDisposed = false;
            this.contentDisposables.add(toDisposable(() => { isDisposed = true; }));
            this.contentDisposables.add(this.themeService.onDidColorThemeChange(async () => {
                const body = await this.renderMarkdown(cacheResult, container);
                if (!isDisposed) {
                    webview.setHtml(body);
                }
            }));
            this.contentDisposables.add(webview.onDidClickLink(link => {
                if (!link) {
                    return;
                }
                if (matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.mailto)) {
                    this.openerService.open(link);
                }
            }));
            return webview;
        }
        catch (e) {
            const p = append(container, $('p.nocontent'));
            p.textContent = noContentCopy;
            return p;
        }
    }
    async renderMarkdown(cacheResult, container, token) {
        const contents = await this.loadContents(() => cacheResult, container);
        if (token?.isCancellationRequested) {
            return '';
        }
        const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, {}, token);
        if (token?.isCancellationRequested) {
            return '';
        }
        return this.renderBody(content);
    }
    renderBody(body) {
        const nonce = generateUuid();
        const colorMap = TokenizationRegistry.getColorMap();
        const css = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
        return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}

					body {
						padding-bottom: 75px;
					}

					#scroll-to-top {
						position: fixed;
						width: 32px;
						height: 32px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-secondaryBackground);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-secondaryForeground);
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}
					${css}
				</style>
			</head>
			<body>
				<a id="scroll-to-top" role="button" aria-label="scroll to top" href="#"><span class="icon"></span></a>
				${body}
			</body>
		</html>`;
    }
    loadContents(loadingTask, container) {
        container.classList.add('loading');
        const result = this.contentDisposables.add(loadingTask());
        const onDone = () => container.classList.remove('loading');
        result.promise.then(onDone, onDone);
        return result.promise;
    }
    clearInput() {
        this.contentDisposables.clear();
        this.transientDisposables.clear();
        super.clearInput();
    }
    focus() {
        super.focus();
        this.activeElement?.focus();
    }
    get activeWebview() {
        if (!this.activeElement || !this.activeElement.runFindAction) {
            return undefined;
        }
        return this.activeElement;
    }
    layout(dimension) {
        this.dimension = dimension;
        this.layoutParticipants.forEach(p => p.layout());
    }
};
AgentPluginEditor = AgentPluginEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IInstantiationService),
    __param(3, IThemeService),
    __param(4, IOpenerService),
    __param(5, IStorageService),
    __param(6, IExtensionService),
    __param(7, IWebviewService),
    __param(8, ILanguageService),
    __param(9, IFileService),
    __param(10, IRequestService),
    __param(11, IAgentPluginService),
    __param(12, IPluginInstallService),
    __param(13, IPluginMarketplaceService),
    __param(14, ILabelService),
    __param(15, IContextMenuService)
], AgentPluginEditor);
export { AgentPluginEditor };
let UpdatePluginEditorAction = class UpdatePluginEditorAction extends Action {
    static { UpdatePluginEditorAction_1 = this; }
    static { this.ID = 'agentPlugin.editor.update'; }
    constructor(plugin, liveMarketplacePlugin, pluginInstallService, pluginMarketplaceService) {
        super(UpdatePluginEditorAction_1.ID, localize('update', "Update"), 'extension-action label prominent install');
        this.plugin = plugin;
        this.liveMarketplacePlugin = liveMarketplacePlugin;
        this.pluginInstallService = pluginInstallService;
        this.pluginMarketplaceService = pluginMarketplaceService;
    }
    async run() {
        if (await this.pluginInstallService.updatePlugin(this.liveMarketplacePlugin)) {
            this.pluginMarketplaceService.addInstalledPlugin(this.plugin.uri, this.liveMarketplacePlugin);
        }
    }
};
UpdatePluginEditorAction = UpdatePluginEditorAction_1 = __decorate([
    __param(2, IPluginInstallService),
    __param(3, IPluginMarketplaceService)
], UpdatePluginEditorAction);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5FZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5FZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQWEsU0FBUyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDcEksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSx1Q0FBdUMsQ0FBQztBQUN4RSxPQUFPLEtBQUssTUFBTSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQWUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxn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