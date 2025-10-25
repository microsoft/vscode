/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mcpServerEditor.css';
import { $, Dimension, append, clearNode, setParentFlowTo } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import * as arrays from '../../../../base/common/arrays.js';
import { Cache, CacheResult } from '../../../../base/common/cache.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas, matchesScheme } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../markdown/browser/markdownDocumentRenderer.js';
import { IWebview, IWebviewService } from '../../webview/browser/webview.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IMcpServerContainer, IMcpServerEditorOptions, IMcpWorkbenchService, IWorkbenchMcpServer, McpServerContainers, McpServerInstallState } from '../common/mcpTypes.js';
import { StarredWidget, McpServerIconWidget, McpServerStatusWidget, McpServerWidget, onClick, PublisherWidget, McpServerScopeBadgeWidget, LicenseWidget } from './mcpServerWidgets.js';
import { ButtonWithDropDownExtensionAction, ButtonWithDropdownExtensionActionViewItem, DropDownAction, InstallAction, InstallingLabelAction, InstallInRemoteAction, InstallInWorkspaceAction, ManageMcpServerAction, McpServerStatusAction, UninstallAction } from './mcpServerActions.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';
import { ILocalMcpServer, IGalleryMcpServerConfiguration, IMcpServerPackage, IMcpServerKeyValueInput, RegistryType } from '../../../../platform/mcp/common/mcpManagement.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getMcpGalleryManifestResourceUri, IMcpGalleryManifestService, McpGalleryResourceType } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { fromNow } from '../../../../base/common/date.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';

const enum McpServerEditorTab {
	Readme = 'readme',
	Configuration = 'configuration',
	Manifest = 'manifest',
}

class NavBar extends Disposable {

	private _onChange = this._register(new Emitter<{ id: string | null; focus: boolean }>());
	get onChange(): Event<{ id: string | null; focus: boolean }> { return this._onChange.event; }

	private _currentId: string | null = null;
	get currentId(): string | null { return this._currentId; }

	private actions: Action[];
	private actionbar: ActionBar;

	constructor(container: HTMLElement) {
		super();
		const element = append(container, $('.navbar'));
		this.actions = [];
		this.actionbar = this._register(new ActionBar(element));
	}

	push(id: string, label: string, tooltip: string, index?: number): void {
		const action = new Action(id, label, undefined, true, () => this.update(id, true));

		action.tooltip = tooltip;

		if (typeof index === 'number') {
			this.actions.splice(index, 0, action);
		} else {
			this.actions.push(action);
		}
		this.actionbar.push(action, { index });

		if (this.actions.length === 1) {
			this.update(id);
		}
	}

	remove(id: string): void {
		const index = this.actions.findIndex(action => action.id === id);
		if (index !== -1) {
			this.actions.splice(index, 1);
			this.actionbar.pull(index);
			if (this._currentId === id) {
				this.switch(this.actions[0]?.id);
			}
		}
	}

	clear(): void {
		this.actions = dispose(this.actions);
		this.actionbar.clear();
	}

	switch(id: string): boolean {
		const action = this.actions.find(action => action.id === id);
		if (action) {
			action.run();
			return true;
		}
		return false;
	}

	has(id: string): boolean {
		return this.actions.some(action => action.id === id);
	}

	private update(id: string, focus?: boolean): void {
		this._currentId = id;
		this._onChange.fire({ id, focus: !!focus });
		this.actions.forEach(a => a.checked = a.id === id);
	}
}

interface ILayoutParticipant {
	layout(): void;
}

interface IActiveElement {
	focus(): void;
}

interface IExtensionEditorTemplate {
	name: HTMLElement;
	description: HTMLElement;
	actionsAndStatusContainer: HTMLElement;
	actionBar: ActionBar;
	navbar: NavBar;
	content: HTMLElement;
	header: HTMLElement;
	mcpServer: IWorkbenchMcpServer;
}

const enum WebviewIndex {
	Readme,
	Changelog
}

export class McpServerEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.mcpServer';

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IScopedContextKeyService>());
	private template: IExtensionEditorTemplate | undefined;

	private mcpServerReadme: Cache<string> | null;
	private mcpServerManifest: Cache<IGalleryMcpServerConfiguration> | null;

	// Some action bar items use a webview whose vertical scroll position we track in this map
	private initialScrollProgress: Map<WebviewIndex, number> = new Map();

	// Spot when an ExtensionEditor instance gets reused for a different extension, in which case the vertical scroll positions must be zeroed
	private currentIdentifier: string = '';

	private layoutParticipants: ILayoutParticipant[] = [];
	private readonly contentDisposables = this._register(new DisposableStore());
	private readonly transientDisposables = this._register(new DisposableStore());
	private activeElement: IActiveElement | null = null;
	private dimension: Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super(McpServerEditor.ID, group, telemetryService, themeService, storageService);
		this.mcpServerReadme = null;
		this.mcpServerManifest = null;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService.value;
	}

	protected createEditor(parent: HTMLElement): void {
		const root = append(parent, $('.extension-editor.mcp-server-editor'));
		this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
		this._scopedContextKeyService.value.createKey('inExtensionEditor', true);

		root.tabIndex = 0; // this is required for the focus tracker on the editor
		root.style.outline = 'none';
		root.setAttribute('role', 'document');
		const header = append(root, $('.header'));

		const iconContainer = append(header, $('.icon-container'));
		const iconWidget = this.instantiationService.createInstance(McpServerIconWidget, iconContainer);
		const scopeWidget = this.instantiationService.createInstance(McpServerScopeBadgeWidget, iconContainer);

		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		const name = append(title, $('span.name.clickable', { role: 'heading', tabIndex: 0 }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), name, localize('name', "Extension name")));

		const subtitle = append(details, $('.subtitle'));
		const subTitleEntryContainers: HTMLElement[] = [];

		const publisherContainer = append(subtitle, $('.subtitle-entry'));
		subTitleEntryContainers.push(publisherContainer);
		const publisherWidget = this.instantiationService.createInstance(PublisherWidget, publisherContainer, false);

		const starredContainer = append(subtitle, $('.subtitle-entry'));
		subTitleEntryContainers.push(starredContainer);
		const installCountWidget = this.instantiationService.createInstance(StarredWidget, starredContainer, false);

		const licenseContainer = append(subtitle, $('.subtitle-entry'));
		subTitleEntryContainers.push(licenseContainer);
		const licenseWidget = this.instantiationService.createInstance(LicenseWidget, licenseContainer);

		const widgets: McpServerWidget[] = [
			iconWidget,
			publisherWidget,
			installCountWidget,
			scopeWidget,
			licenseWidget
		];

		const description = append(details, $('.description'));

		const actions = [
			this.instantiationService.createInstance(InstallAction, false),
			this.instantiationService.createInstance(InstallingLabelAction),
			this.instantiationService.createInstance(ButtonWithDropDownExtensionAction, 'extensions.uninstall', UninstallAction.CLASS, [
				[
					this.instantiationService.createInstance(UninstallAction),
					this.instantiationService.createInstance(InstallInWorkspaceAction, false),
					this.instantiationService.createInstance(InstallInRemoteAction, false)
				]
			]),
			this.instantiationService.createInstance(ManageMcpServerAction, true),
		];

		const actionsAndStatusContainer = append(details, $('.actions-status-container.mcp-server-actions'));
		const actionBar = this._register(new ActionBar(actionsAndStatusContainer, {
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof DropDownAction) {
					return action.createActionViewItem(options);
				}
				if (action instanceof ButtonWithDropDownExtensionAction) {
					return new ButtonWithDropdownExtensionActionViewItem(
						action,
						{
							...options,
							icon: true,
							label: true,
							menuActionsOrProvider: { getActions: () => action.menuActions },
							menuActionClassNames: action.menuActionClassNames
						},
						this.contextMenuService);
				}
				return undefined;
			},
			focusOnlyEnabledItems: true
		}));

		actionBar.push(actions, { icon: true, label: true });
		actionBar.setFocusable(true);
		// update focusable elements when the enablement of an action changes
		this._register(Event.any(...actions.map(a => Event.filter(a.onDidChange, e => e.enabled !== undefined)))(() => {
			actionBar.setFocusable(false);
			actionBar.setFocusable(true);
		}));

		const otherContainers: IMcpServerContainer[] = [];
		const mcpServerStatusAction = this.instantiationService.createInstance(McpServerStatusAction);
		const mcpServerStatusWidget = this._register(this.instantiationService.createInstance(McpServerStatusWidget, append(actionsAndStatusContainer, $('.status')), mcpServerStatusAction));
		this._register(Event.any(mcpServerStatusWidget.onDidRender)(() => {
			if (this.dimension) {
				this.layout(this.dimension);
			}
		}));

		otherContainers.push(mcpServerStatusAction, new class extends McpServerWidget {
			render() {
				actionsAndStatusContainer.classList.toggle('list-layout', this.mcpServer?.installState === McpServerInstallState.Installed);
			}
		}());

		const mcpServerContainers: McpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets, ...otherContainers]);
		for (const disposable of [...actions, ...widgets, ...otherContainers, mcpServerContainers]) {
			this._register(disposable);
		}

		const onError = Event.chain(actionBar.onDidRun, $ =>
			$.map(({ error }) => error)
				.filter(error => !!error)
		);

		this._register(onError(this.onError, this));

		const body = append(root, $('.body'));
		const navbar = new NavBar(body);

		const content = append(body, $('.content'));
		content.id = generateUuid(); // An id is needed for the webview parent flow to

		this.template = {
			content,
			description,
			header,
			name,
			navbar,
			actionsAndStatusContainer,
			actionBar: actionBar,
			set mcpServer(mcpServer: IWorkbenchMcpServer) {
				mcpServerContainers.mcpServer = mcpServer;
				let lastNonEmptySubtitleEntryContainer;
				for (const subTitleEntryElement of subTitleEntryContainers) {
					subTitleEntryElement.classList.remove('last-non-empty');
					if (subTitleEntryElement.children.length > 0) {
						lastNonEmptySubtitleEntryContainer = subTitleEntryElement;
					}
				}
				if (lastNonEmptySubtitleEntryContainer) {
					lastNonEmptySubtitleEntryContainer.classList.add('last-non-empty');
				}
			}
		};
	}

	override async setInput(input: McpServerEditorInput, options: IMcpServerEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (this.template) {
			await this.render(input.mcpServer, this.template, !!options?.preserveFocus);
		}
	}

	private async render(mcpServer: IWorkbenchMcpServer, template: IExtensionEditorTemplate, preserveFocus: boolean): Promise<void> {
		this.activeElement = null;
		this.transientDisposables.clear();

		const token = this.transientDisposables.add(new CancellationTokenSource()).token;

		this.mcpServerReadme = new Cache(() => mcpServer.getReadme(token));
		this.mcpServerManifest = new Cache(() => mcpServer.getManifest(token));
		template.mcpServer = mcpServer;

		template.name.textContent = mcpServer.label;
		template.name.classList.toggle('clickable', !!mcpServer.gallery?.webUrl);
		template.description.textContent = mcpServer.description;
		if (mcpServer.gallery?.webUrl) {
			this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(mcpServer.gallery?.webUrl!))));
		}

		this.renderNavbar(mcpServer, template, preserveFocus);
	}

	override setOptions(options: IMcpServerEditorOptions | undefined): void {
		super.setOptions(options);
		if (options?.tab) {
			this.template?.navbar.switch(options.tab);
		}
	}

	private renderNavbar(extension: IWorkbenchMcpServer, template: IExtensionEditorTemplate, preserveFocus: boolean): void {
		template.content.innerText = '';
		template.navbar.clear();

		if (this.currentIdentifier !== extension.id) {
			this.initialScrollProgress.clear();
			this.currentIdentifier = extension.id;
		}

		if (extension.readmeUrl || extension.gallery?.readme) {
			template.navbar.push(McpServerEditorTab.Readme, localize('details', "Details"), localize('detailstooltip', "Extension details, rendered from the extension's 'README.md' file"));
		}

		if (extension.gallery || extension.local?.manifest) {
			template.navbar.push(McpServerEditorTab.Manifest, localize('manifest', "Manifest"), localize('manifesttooltip', "Server manifest details"));
		}

		if (extension.config) {
			template.navbar.push(McpServerEditorTab.Configuration, localize('configuration', "Configuration"), localize('configurationtooltip', "Server configuration details"));
		}

		this.transientDisposables.add(this.mcpWorkbenchService.onChange(e => {
			if (e === extension) {
				if (e.config && !template.navbar.has(McpServerEditorTab.Configuration)) {
					template.navbar.push(McpServerEditorTab.Configuration, localize('configuration', "Configuration"), localize('configurationtooltip', "Server configuration details"), extension.readmeUrl ? 1 : 0);
				}
				if (!e.config && template.navbar.has(McpServerEditorTab.Configuration)) {
					template.navbar.remove(McpServerEditorTab.Configuration);
				}
			}
		}));

		if ((<IMcpServerEditorOptions | undefined>this.options)?.tab) {
			template.navbar.switch((<IMcpServerEditorOptions>this.options).tab!);
		}

		if (template.navbar.currentId) {
			this.onNavbarChange(extension, { id: template.navbar.currentId, focus: !preserveFocus }, template);
		}
		template.navbar.onChange(e => this.onNavbarChange(extension, e, template), this, this.transientDisposables);
	}

	override clearInput(): void {
		this.contentDisposables.clear();
		this.transientDisposables.clear();

		super.clearInput();
	}

	override focus(): void {
		super.focus();
		this.activeElement?.focus();
	}

	showFind(): void {
		this.activeWebview?.showFind();
	}

	runFindAction(previous: boolean): void {
		this.activeWebview?.runFindAction(previous);
	}

	public get activeWebview(): IWebview | undefined {
		if (!this.activeElement || !(this.activeElement as IWebview).runFindAction) {
			return undefined;
		}
		return this.activeElement as IWebview;
	}

	private onNavbarChange(extension: IWorkbenchMcpServer, { id, focus }: { id: string | null; focus: boolean }, template: IExtensionEditorTemplate): void {
		this.contentDisposables.clear();
		template.content.innerText = '';
		this.activeElement = null;
		if (id) {
			const cts = new CancellationTokenSource();
			this.contentDisposables.add(toDisposable(() => cts.dispose(true)));
			this.open(id, extension, template, cts.token)
				.then(activeElement => {
					if (cts.token.isCancellationRequested) {
						return;
					}
					this.activeElement = activeElement;
					if (focus) {
						this.focus();
					}
				});
		}
	}

	private open(id: string, extension: IWorkbenchMcpServer, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		switch (id) {
			case McpServerEditorTab.Configuration: return this.openConfiguration(extension, template, token);
			case McpServerEditorTab.Readme: return this.openDetails(extension, template, token);
			case McpServerEditorTab.Manifest: return extension.readmeUrl ? this.openManifest(extension, template.content, token) : this.openManifestWithAdditionalDetails(extension, template, token);
		}
		return Promise.resolve(null);
	}

	private async openMarkdown(extension: IWorkbenchMcpServer, cacheResult: CacheResult<string>, noContentCopy: string, container: HTMLElement, webviewIndex: WebviewIndex, title: string, token: CancellationToken): Promise<IActiveElement | null> {
		try {
			const body = await this.renderMarkdown(extension, cacheResult, container, token);
			if (token.isCancellationRequested) {
				return Promise.resolve(null);
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

			webview.claim(this, this.window, this.scopedContextKeyService);
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
				// Render again since syntax highlighting of code blocks may have changed
				const body = await this.renderMarkdown(extension, cacheResult, container);
				if (!isDisposed) { // Make sure we weren't disposed of in the meantime
					webview.setHtml(body);
				}
			}));

			this.contentDisposables.add(webview.onDidClickLink(link => {
				if (!link) {
					return;
				}
				// Only allow links with specific schemes
				if (matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.mailto)) {
					this.openerService.open(link);
				}
			}));

			return webview;
		} catch (e) {
			const p = append(container, $('p.nocontent'));
			p.textContent = noContentCopy;
			return p;
		}
	}

	private async renderMarkdown(extension: IWorkbenchMcpServer, cacheResult: CacheResult<string>, container: HTMLElement, token?: CancellationToken): Promise<string> {
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

	private renderBody(body: TrustedHTML): string {
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

					/* prevent scroll-to-top button from blocking the body text */
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
						/* Chevron up icon */
						webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
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

	private async openDetails(extension: IWorkbenchMcpServer, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		const details = append(template.content, $('.details'));
		const readmeContainer = append(details, $('.readme-container'));
		const additionalDetailsContainer = append(details, $('.additional-details-container'));

		const layout = () => details.classList.toggle('narrow', this.dimension && this.dimension.width < 500);
		layout();
		this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));

		const activeElement = await this.openMarkdown(extension, this.mcpServerReadme!.get(), localize('noReadme', "No README available."), readmeContainer, WebviewIndex.Readme, localize('Readme title', "Readme"), token);
		this.renderAdditionalDetails(additionalDetailsContainer, extension);
		return activeElement;
	}

	private async openConfiguration(mcpServer: IWorkbenchMcpServer, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		const configContainer = append(template.content, $('.configuration'));
		const content = $('div', { class: 'configuration-content' });

		this.renderConfigurationDetails(content, mcpServer);

		const scrollableContent = new DomScrollableElement(content, {});
		const layout = () => scrollableContent.scanDomNode();
		this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));

		append(configContainer, scrollableContent.getDomNode());

		return { focus: () => content.focus() };
	}

	private async openManifestWithAdditionalDetails(mcpServer: IWorkbenchMcpServer, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		const details = append(template.content, $('.details'));

		const readmeContainer = append(details, $('.readme-container'));
		const additionalDetailsContainer = append(details, $('.additional-details-container'));

		const layout = () => details.classList.toggle('narrow', this.dimension && this.dimension.width < 500);
		layout();
		this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));

		const activeElement = await this.openManifest(mcpServer, readmeContainer, token);

		this.renderAdditionalDetails(additionalDetailsContainer, mcpServer);
		return activeElement;
	}

	private async openManifest(mcpServer: IWorkbenchMcpServer, parent: HTMLElement, token: CancellationToken): Promise<IActiveElement | null> {
		const manifestContainer = append(parent, $('.manifest'));
		const content = $('div', { class: 'manifest-content' });

		try {
			const manifest = await this.loadContents(() => this.mcpServerManifest!.get(), content);
			if (token.isCancellationRequested) {
				return null;
			}
			this.renderManifestDetails(content, manifest);
		} catch (error) {
			// Handle error - show no manifest message
			while (content.firstChild) {
				content.removeChild(content.firstChild);
			}
			const noManifestMessage = append(content, $('.no-manifest'));
			noManifestMessage.textContent = localize('noManifest', "No manifest available for this MCP server.");
		}

		const scrollableContent = new DomScrollableElement(content, {});
		const layout = () => scrollableContent.scanDomNode();
		this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));

		append(manifestContainer, scrollableContent.getDomNode());

		return { focus: () => content.focus() };
	}

	private renderConfigurationDetails(container: HTMLElement, mcpServer: IWorkbenchMcpServer): void {
		clearNode(container);

		const config = mcpServer.config;

		if (!config) {
			const noConfigMessage = append(container, $('.no-config'));
			noConfigMessage.textContent = localize('noConfig', "No configuration available for this MCP server.");
			return;
		}

		// Server Name
		const nameSection = append(container, $('.config-section'));
		const nameLabel = append(nameSection, $('.config-label'));
		nameLabel.textContent = localize('serverName', "Name:");
		const nameValue = append(nameSection, $('.config-value'));
		nameValue.textContent = mcpServer.name;

		// Server Type
		const typeSection = append(container, $('.config-section'));
		const typeLabel = append(typeSection, $('.config-label'));
		typeLabel.textContent = localize('serverType', "Type:");
		const typeValue = append(typeSection, $('.config-value'));
		typeValue.textContent = config.type;

		// Type-specific configuration
		if (config.type === McpServerType.LOCAL) {
			// Command
			const commandSection = append(container, $('.config-section'));
			const commandLabel = append(commandSection, $('.config-label'));
			commandLabel.textContent = localize('command', "Command:");
			const commandValue = append(commandSection, $('code.config-value'));
			commandValue.textContent = config.command;

			// Arguments (if present)
			if (config.args && config.args.length > 0) {
				const argsSection = append(container, $('.config-section'));
				const argsLabel = append(argsSection, $('.config-label'));
				argsLabel.textContent = localize('arguments', "Arguments:");
				const argsValue = append(argsSection, $('code.config-value'));
				argsValue.textContent = config.args.join(' ');
			}
		} else if (config.type === McpServerType.REMOTE) {
			// URL
			const urlSection = append(container, $('.config-section'));
			const urlLabel = append(urlSection, $('.config-label'));
			urlLabel.textContent = localize('url', "URL:");
			const urlValue = append(urlSection, $('code.config-value'));
			urlValue.textContent = config.url;
		}
	}

	private renderManifestDetails(container: HTMLElement, manifest: IGalleryMcpServerConfiguration): void {
		clearNode(container);

		if (manifest.packages && manifest.packages.length > 0) {
			const packagesByType = new Map<RegistryType, IMcpServerPackage[]>();
			for (const pkg of manifest.packages) {
				const type = pkg.registryType;
				let packages = packagesByType.get(type);
				if (!packages) {
					packagesByType.set(type, packages = []);
				}
				packages.push(pkg);
			}

			append(container, $('.manifest-section', undefined, $('.manifest-section-title', undefined, localize('packages', "Packages"))));

			for (const [packageType, packages] of packagesByType) {
				const packageSection = append(container, $('.package-section', undefined, $('.package-section-title', undefined, packageType.toUpperCase())));
				const packagesGrid = append(packageSection, $('.package-details'));

				for (let i = 0; i < packages.length; i++) {
					const pkg = packages[i];
					append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('packageName', "Package:")), $('.detail-value', undefined, pkg.identifier)));
					if (pkg.packageArguments && pkg.packageArguments.length > 0) {
						const argStrings: string[] = [];
						for (const arg of pkg.packageArguments) {
							if (arg.type === 'named') {
								argStrings.push(arg.name);
								if (arg.value) {
									argStrings.push(arg.value);
								}
							}
							if (arg.type === 'positional') {
								const val = arg.value ?? arg.valueHint;
								if (val) {
									argStrings.push(val);
								}
							}
						}
						append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('packagearguments', "Package Arguments:")), $('code.detail-value', undefined, argStrings.join(' '))));
					}
					if (pkg.runtimeArguments && pkg.runtimeArguments.length > 0) {
						const argStrings: string[] = [];
						for (const arg of pkg.runtimeArguments) {
							if (arg.type === 'named') {
								argStrings.push(arg.name);
								if (arg.value) {
									argStrings.push(arg.value);
								}
							}
							if (arg.type === 'positional') {
								const val = arg.value ?? arg.valueHint;
								if (val) {
									argStrings.push(val);
								}
							}
						}
						append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('runtimeargs', "Runtime Arguments:")), $('code.detail-value', undefined, argStrings.join(' '))));
					}
					if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
						const envStrings = pkg.environmentVariables.map((envVar: IMcpServerKeyValueInput) => `${envVar.name}=${envVar.value ?? ''}`);
						append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('environmentVariables', "Environment Variables:")), $('code.detail-value', undefined, envStrings.join(' '))));
					}
					if (i < packages.length - 1) {
						append(packagesGrid, $('.package-separator'));
					}
				}
			}
		}

		if (manifest.remotes && manifest.remotes.length > 0) {
			const packageSection = append(container, $('.package-section', undefined, $('.package-section-title', undefined, localize('remotes', "Remote").toLocaleUpperCase())));
			for (const remote of manifest.remotes) {
				const packagesGrid = append(packageSection, $('.package-details'));
				append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('url', "URL:")), $('.detail-value', undefined, remote.url)));
				if (remote.type) {
					append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('transport', "Transport:")), $('.detail-value', undefined, remote.type)));
				}
				if (remote.headers && remote.headers.length > 0) {
					const headerStrings = remote.headers.map((header: IMcpServerKeyValueInput) => `${header.name}: ${header.value ?? ''}`);
					append(packagesGrid, $('.package-detail', undefined, $('.detail-label', undefined, localize('headers', "Headers:")), $('.detail-value', undefined, headerStrings.join(', '))));
				}
			}
		}
	}

	private renderAdditionalDetails(container: HTMLElement, extension: IWorkbenchMcpServer): void {
		const content = $('div', { class: 'additional-details-content', tabindex: '0' });
		const scrollableContent = new DomScrollableElement(content, {});
		const layout = () => scrollableContent.scanDomNode();
		const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
		this.contentDisposables.add(toDisposable(removeLayoutParticipant));
		this.contentDisposables.add(scrollableContent);

		this.contentDisposables.add(this.instantiationService.createInstance(AdditionalDetailsWidget, content, extension));

		append(container, scrollableContent.getDomNode());
		scrollableContent.scanDomNode();
	}

	private loadContents<T>(loadingTask: () => CacheResult<T>, container: HTMLElement): Promise<T> {
		container.classList.add('loading');

		const result = this.contentDisposables.add(loadingTask());
		const onDone = () => container.classList.remove('loading');
		result.promise.then(onDone, onDone);

		return result.promise;
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.layoutParticipants.forEach(p => p.layout());
	}

	private onError(err: Error): void {
		if (isCancellationError(err)) {
			return;
		}

		this.notificationService.error(err);
	}
}

class AdditionalDetailsWidget extends Disposable {

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		extension: IWorkbenchMcpServer,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.render(extension);
		this._register(this.mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => this.render(extension)));
	}

	private render(extension: IWorkbenchMcpServer): void {
		this.container.innerText = '';
		this.disposables.clear();

		if (extension.local) {
			this.renderInstallInfo(this.container, extension.local);
		}

		if (extension.gallery) {
			this.renderMarketplaceInfo(this.container, extension);
		}
		this.renderTags(this.container, extension);
		this.renderExtensionResources(this.container, extension);
	}

	private renderTags(container: HTMLElement, extension: IWorkbenchMcpServer): void {
		if (extension.gallery?.topics?.length) {
			const categoriesContainer = append(container, $('.categories-container.additional-details-element'));
			append(categoriesContainer, $('.additional-details-title', undefined, localize('tags', "Tags")));
			const categoriesElement = append(categoriesContainer, $('.categories'));
			for (const category of extension.gallery.topics) {
				append(categoriesElement, $('span.category', { tabindex: '0' }, category));
			}
		}
	}

	private async renderExtensionResources(container: HTMLElement, extension: IWorkbenchMcpServer): Promise<void> {
		const resources: [string, ThemeIcon, URI][] = [];
		const manifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (extension.repository) {
			try {
				resources.push([localize('repository', "Repository"), ThemeIcon.fromId(Codicon.repo.id), URI.parse(extension.repository)]);
			} catch (error) {/* Ignore */ }
		}
		if (manifest) {
			const supportUri = getMcpGalleryManifestResourceUri(manifest, McpGalleryResourceType.ContactSupportUri);
			if (supportUri) {
				try {
					resources.push([localize('support', "Contact Support"), ThemeIcon.fromId(Codicon.commentDiscussion.id), URI.parse(supportUri)]);
				} catch (error) {/* Ignore */ }
			}
		}
		if (resources.length) {
			const extensionResourcesContainer = append(container, $('.resources-container.additional-details-element'));
			append(extensionResourcesContainer, $('.additional-details-title', undefined, localize('resources', "Resources")));
			const resourcesElement = append(extensionResourcesContainer, $('.resources'));
			for (const [label, icon, uri] of resources) {
				const resourceElement = append(resourcesElement, $('.resource'));
				append(resourceElement, $(ThemeIcon.asCSSSelector(icon)));
				append(resourceElement, $('a', { tabindex: '0' }, label));
				this.disposables.add(onClick(resourceElement, () => this.openerService.open(uri)));
				this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), resourceElement, uri.toString()));
			}
		}
	}

	private renderInstallInfo(container: HTMLElement, extension: ILocalMcpServer): void {
		const installInfoContainer = append(container, $('.more-info-container.additional-details-element'));
		append(installInfoContainer, $('.additional-details-title', undefined, localize('Install Info', "Installation")));
		const installInfo = append(installInfoContainer, $('.more-info'));
		append(installInfo,
			$('.more-info-entry', undefined,
				$('div.more-info-entry-name', undefined, localize('id', "Identifier")),
				$('code', undefined, extension.name)
			));
		if (extension.version) {
			append(installInfo,
				$('.more-info-entry', undefined,
					$('div.more-info-entry-name', undefined, localize('Version', "Version")),
					$('code', undefined, extension.version)
				)
			);
		}
	}

	private renderMarketplaceInfo(container: HTMLElement, extension: IWorkbenchMcpServer): void {
		const gallery = extension.gallery;
		const moreInfoContainer = append(container, $('.more-info-container.additional-details-element'));
		append(moreInfoContainer, $('.additional-details-title', undefined, localize('Marketplace Info', "Marketplace")));
		const moreInfo = append(moreInfoContainer, $('.more-info'));
		if (gallery) {
			if (!extension.local) {
				append(moreInfo,
					$('.more-info-entry', undefined,
						$('div.more-info-entry-name', undefined, localize('id', "Identifier")),
						$('code', undefined, extension.name)
					));
				if (gallery.version) {
					append(moreInfo,
						$('.more-info-entry', undefined,
							$('div.more-info-entry-name', undefined, localize('Version', "Version")),
							$('code', undefined, gallery.version)
						)
					);
				}
			}
			if (gallery.lastUpdated) {
				append(moreInfo,
					$('.more-info-entry', undefined,
						$('div.more-info-entry-name', undefined, localize('last updated', "Last Released")),
						$('div', {
							'title': new Date(gallery.lastUpdated).toString()
						}, fromNow(gallery.lastUpdated, true, true, true))
					)
				);
			}
			if (gallery.publishDate) {
				append(moreInfo,
					$('.more-info-entry', undefined,
						$('div.more-info-entry-name', undefined, localize('published', "Published")),
						$('div', {
							'title': new Date(gallery.publishDate).toString()
						}, fromNow(gallery.publishDate, true, true, true))
					)
				);
			}
		}
	}
}
