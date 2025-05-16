/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, clearNode, setParentFlowTo } from '../../../../base/browser/dom.js';
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
import { language } from '../../../../base/common/platform.js';
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
import { IWorkbenchMcpServer, McpServerContainers, mcpServerIcon } from '../common/mcpTypes.js';
import { InstallCountWidget, McpServerWidget, onClick, PublisherWidget, RatingsWidget } from './mcpServerWidgets.js';
import { DropDownAction, InstallAction, ManageMcpServerAction, UninstallAction } from './mcpServerActions.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ILocalMcpServer } from '../../../../platform/mcp/common/mcpManagement.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

const enum McpServerEditorTab {
	Readme = 'readme',
}

function toDateString(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}, ${date.toLocaleTimeString(language, { hourCycle: 'h23' })}`;
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

	push(id: string, label: string, tooltip: string): void {
		const action = new Action(id, label, undefined, true, () => this.update(id, true));

		action.tooltip = tooltip;

		this.actions.push(action);
		this.actionbar.push(action);

		if (this.actions.length === 1) {
			this.update(id);
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
	iconContainer: HTMLElement;
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
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(McpServerEditor.ID, group, telemetryService, themeService, storageService);
		this.mcpServerReadme = null;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService.value;
	}

	protected createEditor(parent: HTMLElement): void {
		const root = append(parent, $('.extension-editor'));
		this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
		this._scopedContextKeyService.value.createKey('inExtensionEditor', true);

		root.tabIndex = 0; // this is required for the focus tracker on the editor
		root.style.outline = 'none';
		root.setAttribute('role', 'document');
		const header = append(root, $('.header'));

		const iconContainer = append(header, $('.icon-container'));

		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		const name = append(title, $('span.name.clickable', { role: 'heading', tabIndex: 0 }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), name, localize('name', "Extension name")));

		const subtitle = append(details, $('.subtitle'));
		const subTitleEntryContainers: HTMLElement[] = [];

		const publisherContainer = append(subtitle, $('.subtitle-entry'));
		subTitleEntryContainers.push(publisherContainer);
		const publisherWidget = this.instantiationService.createInstance(PublisherWidget, publisherContainer, false);

		const installCountContainer = append(subtitle, $('.subtitle-entry'));
		subTitleEntryContainers.push(installCountContainer);
		const installCountWidget = this.instantiationService.createInstance(InstallCountWidget, installCountContainer, false);

		const ratingsContainer = append(subtitle, $('.subtitle-entry'));
		subTitleEntryContainers.push(ratingsContainer);
		const ratingsWidget = this.instantiationService.createInstance(RatingsWidget, ratingsContainer, false);

		const widgets: McpServerWidget[] = [
			publisherWidget,
			installCountWidget,
			ratingsWidget,
		];

		const description = append(details, $('.description'));

		const actions = [
			this.instantiationService.createInstance(InstallAction),
			this.instantiationService.createInstance(UninstallAction),
			this.instantiationService.createInstance(ManageMcpServerAction, true),
		];

		const actionsAndStatusContainer = append(details, $('.actions-status-container.mcp-server-actions'));
		const actionBar = this._register(new ActionBar(actionsAndStatusContainer, {
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof DropDownAction) {
					return action.createActionViewItem(options);
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

		const mcpServerContainers: McpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets]);
		for (const disposable of [...actions, ...widgets, mcpServerContainers]) {
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
			iconContainer,
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

	override async setInput(input: McpServerEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
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
		template.mcpServer = mcpServer;

		clearNode(template.iconContainer);
		if (mcpServer.iconUrl) {
			const icon = append(template.iconContainer, $<HTMLImageElement>('img.icon', { alt: '' }));
			this.transientDisposables.add(addDisposableListener(icon, 'error', () => {
				clearNode(template.iconContainer);
				append(template.iconContainer, $(ThemeIcon.asCSSSelector(mcpServerIcon)));
			}, { once: true }));
			icon.src = mcpServer.iconUrl;
		} else {
			append(template.iconContainer, $(ThemeIcon.asCSSSelector(mcpServerIcon)));
		}

		template.name.textContent = mcpServer.label;
		template.name.classList.toggle('clickable', !!mcpServer.url);
		template.description.textContent = mcpServer.description;
		if (mcpServer.url) {
			this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(mcpServer.url!))));
		}

		this.renderNavbar(mcpServer, template, preserveFocus);
	}

	private renderNavbar(extension: IWorkbenchMcpServer, template: IExtensionEditorTemplate, preserveFocus: boolean): void {
		template.content.innerText = '';
		template.navbar.clear();

		if (this.currentIdentifier !== extension.id) {
			this.initialScrollProgress.clear();
			this.currentIdentifier = extension.id;
		}

		template.navbar.push(McpServerEditorTab.Readme, localize('details', "Details"), localize('detailstooltip', "Extension details, rendered from the extension's 'README.md' file"));
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
			case McpServerEditorTab.Readme: return this.openDetails(extension, template, token);
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

		const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, { shouldSanitize: true, token });
		if (token?.isCancellationRequested) {
			return '';
		}

		return this.renderBody(content);
	}

	private renderBody(body: string): string {
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

	private onError(err: any): void {
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
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.render(extension);
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
		this.renderExtensionResources(this.container, extension);
	}

	private renderExtensionResources(container: HTMLElement, extension: IWorkbenchMcpServer): void {
		const resources: [string, URI][] = [];
		if (extension.repository) {
			try {
				resources.push([localize('repository', "Repository"), URI.parse(extension.repository)]);
			} catch (error) {/* Ignore */ }
		}
		if (extension.publisherUrl && extension.publisherDisplayName) {
			resources.push([extension.publisherDisplayName, URI.parse(extension.publisherUrl)]);
		}
		if (resources.length) {
			const extensionResourcesContainer = append(container, $('.resources-container.additional-details-element'));
			append(extensionResourcesContainer, $('.additional-details-title', undefined, localize('resources', "Resources")));
			const resourcesElement = append(extensionResourcesContainer, $('.resources'));
			for (const [label, uri] of resources) {
				const resource = append(resourcesElement, $('a.resource', { tabindex: '0' }, label));
				this.disposables.add(onClick(resource, () => this.openerService.open(uri)));
				this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), resource, uri.toString()));
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
		append(installInfo,
			$('.more-info-entry', undefined,
				$('div.more-info-entry-name', undefined, localize('Version', "Version")),
				$('code', undefined, extension.version)
			)
		);
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
				append(moreInfo,
					$('.more-info-entry', undefined,
						$('div.more-info-entry-name', undefined, localize('Version', "Version")),
						$('code', undefined, gallery.version)
					)
				);
			}
			append(moreInfo,
				$('.more-info-entry', undefined,
					$('div.more-info-entry-name', undefined, localize('last released', "Last Released")),
					$('div', undefined, toDateString(new Date(gallery.lastUpdated)))
				)
			);
		}
	}
}
