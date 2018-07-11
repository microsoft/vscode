/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionEditor';
import { localize } from 'vs/nls';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { always } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import { OS } from 'vs/base/common/platform';
import { Event, Emitter, once, chain } from 'vs/base/common/event';
import Cache from 'vs/base/common/cache';
import { Action } from 'vs/base/common/actions';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { domEvent } from 'vs/base/browser/event';
import { append, $, addClass, removeClass, finalHandler, join, toggleClass } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionManifest, IKeyBinding, IView, IExtensionTipsService, LocalExtensionType, IViewContainer } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ResolvedKeybinding, KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID, IExtension, IExtensionDependencies } from 'vs/workbench/parts/extensions/common/extensions';
import { RatingsWidget, InstallCountWidget } from 'vs/workbench/parts/extensions/browser/extensionsWidgets';
import { EditorOptions } from 'vs/workbench/common/editor';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { CombinedInstallAction, UpdateAction, EnableAction, DisableAction, ReloadAction, MaliciousStatusLabelAction, DisabledStatusLabelAction, MultiServerInstallAction, MultiServerUpdateAction, IgnoreExtensionRecommendationAction, UndoIgnoreExtensionRecommendationAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { WebviewElement } from 'vs/workbench/parts/webview/electron-browser/webviewElement';
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Command } from 'vs/editor/browser/editorExtensions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Color } from 'vs/base/common/color';
import { assign } from 'vs/base/common/objects';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionsTree, IExtensionData } from 'vs/workbench/parts/extensions/browser/extensionsViewer';

/**  A context key that is set when an extension editor webview has focus. */
export const KEYBINDING_CONTEXT_EXTENSIONEDITOR_WEBVIEW_FOCUS = new RawContextKey<boolean>('extensionEditorWebviewFocus', undefined);
/**  A context key that is set when the find widget find input in extension editor webview is focused. */
export const KEYBINDING_CONTEXT_EXTENSIONEDITOR_FIND_WIDGET_INPUT_FOCUSED = new RawContextKey<boolean>('extensionEditorFindWidgetInputFocused', false);

function renderBody(body: string): string {
	const styleSheetPath = require.toUrl('./media/markdown.css').replace('file://', 'vscode-core-resource://');
	return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src vscode-core-resource:; child-src 'none'; frame-src 'none';">
				<link rel="stylesheet" type="text/css" href="${styleSheetPath}">
			</head>
			<body>
				<a id="scroll-to-top" role="button" aria-label="scroll to top" href="#"><span class="icon"></span></a>
				${body}
			</body>
		</html>`;
}

function removeEmbeddedSVGs(documentContent: string): string {
	const newDocument = new DOMParser().parseFromString(documentContent, 'text/html');

	// remove all inline svgs
	const allSVGs = newDocument.documentElement.querySelectorAll('svg');
	for (let i = 0; i < allSVGs.length; i++) {
		allSVGs[i].parentNode.removeChild(allSVGs[i]);
	}

	return newDocument.documentElement.outerHTML;
}

class NavBar {

	private _onChange = new Emitter<string>();
	get onChange(): Event<string> { return this._onChange.event; }

	private currentId: string = null;
	private actions: Action[];
	private actionbar: ActionBar;

	constructor(container: HTMLElement) {
		const element = append(container, $('.navbar'));
		this.actions = [];
		this.actionbar = new ActionBar(element, { animated: false });
	}

	push(id: string, label: string, tooltip: string): void {
		const run = () => this._update(id);
		const action = new Action(id, label, null, true, run);

		action.tooltip = tooltip;

		this.actions.push(action);
		this.actionbar.push(action);

		if (this.actions.length === 1) {
			run();
		}
	}

	clear(): void {
		this.actions = dispose(this.actions);
		this.actionbar.clear();
	}

	update(): void {
		this._update(this.currentId);
	}

	_update(id: string = this.currentId): TPromise<void> {
		this.currentId = id;
		this._onChange.fire(id);
		this.actions.forEach(a => a.enabled = a.id !== id);
		return TPromise.as(null);
	}

	dispose(): void {
		this.actionbar = dispose(this.actionbar);
	}
}

const NavbarSection = {
	Readme: 'readme',
	Contributions: 'contributions',
	Changelog: 'changelog',
	Dependencies: 'dependencies',
	ExtensionPack: 'extensionPack'
};

interface ILayoutParticipant {
	layout(): void;
}

export class ExtensionEditor extends BaseEditor {

	static readonly ID: string = 'workbench.editor.extension';

	private icon: HTMLImageElement;
	private name: HTMLElement;
	private identifier: HTMLElement;
	private preview: HTMLElement;
	private builtin: HTMLElement;
	private license: HTMLElement;
	private publisher: HTMLElement;
	private installCount: HTMLElement;
	private rating: HTMLElement;
	private repository: HTMLElement;
	private description: HTMLElement;
	private extensionActionBar: ActionBar;
	private navbar: NavBar;
	private content: HTMLElement;
	private recommendation: HTMLElement;
	private recommendationText: HTMLElement;
	private ignoreActionbar: ActionBar;
	private header: HTMLElement;

	private extensionReadme: Cache<string>;
	private extensionChangelog: Cache<string>;
	private extensionManifest: Cache<IExtensionManifest>;
	private extensionDependencies: Cache<IExtensionDependencies>;

	private contextKey: IContextKey<boolean>;
	private findInputFocusContextKey: IContextKey<boolean>;
	private layoutParticipants: ILayoutParticipant[] = [];
	private contentDisposables: IDisposable[] = [];
	private transientDisposables: IDisposable[] = [];
	private disposables: IDisposable[];
	private activeWebview: WebviewElement;
	private editorLoadComplete: boolean = false;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewletService private readonly viewletService: IViewletService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IThemeService protected themeService: IThemeService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IPartService private readonly partService: IPartService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
	) {
		super(ExtensionEditor.ID, telemetryService, themeService);
		this.disposables = [];
		this.extensionReadme = null;
		this.extensionChangelog = null;
		this.extensionManifest = null;
		this.extensionDependencies = null;
		this.contextKey = KEYBINDING_CONTEXT_EXTENSIONEDITOR_WEBVIEW_FOCUS.bindTo(this.contextKeyService);
		this.findInputFocusContextKey = KEYBINDING_CONTEXT_EXTENSIONEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(this.contextKeyService);
	}

	createEditor(parent: HTMLElement): void {
		const root = append(parent, $('.extension-editor'));
		this.header = append(root, $('.header'));

		this.icon = append(this.header, $<HTMLImageElement>('img.icon', { draggable: false }));

		const details = append(this.header, $('.details'));
		const title = append(details, $('.title'));
		this.name = append(title, $('span.name.clickable', { title: localize('name', "Extension name") }));
		this.identifier = append(title, $('span.identifier', { title: localize('extension id', "Extension identifier") }));

		this.preview = append(title, $('span.preview', { title: localize('preview', "Preview") }));
		this.preview.textContent = localize('preview', "Preview");

		this.builtin = append(title, $('span.builtin'));
		this.builtin.textContent = localize('builtin', "Built-in");

		const subtitle = append(details, $('.subtitle'));
		this.publisher = append(subtitle, $('span.publisher.clickable', { title: localize('publisher', "Publisher name") }));

		this.installCount = append(subtitle, $('span.install', { title: localize('install count', "Install count") }));

		this.rating = append(subtitle, $('span.rating.clickable', { title: localize('rating', "Rating") }));

		this.repository = append(subtitle, $('span.repository.clickable'));
		this.repository.textContent = localize('repository', 'Repository');
		this.repository.style.display = 'none';

		this.license = append(subtitle, $('span.license.clickable'));
		this.license.textContent = localize('license', 'License');
		this.license.style.display = 'none';

		this.description = append(details, $('.description'));

		const extensionActions = append(details, $('.actions'));
		this.extensionActionBar = new ActionBar(extensionActions, {
			animated: false,
			actionItemProvider: (action: Action) => {
				if (action.id === EnableAction.ID) {
					return (<EnableAction>action).actionItem;
				}
				if (action.id === DisableAction.ID) {
					return (<DisableAction>action).actionItem;
				}
				if (action.id === MultiServerInstallAction.ID) {
					return (<MultiServerInstallAction>action).actionItem;
				}
				if (action.id === MultiServerUpdateAction.ID) {
					return (<MultiServerUpdateAction>action).actionItem;
				}
				return null;
			}
		});

		this.recommendation = append(details, $('.recommendation'));
		this.recommendationText = append(this.recommendation, $('.recommendation-text'));
		this.ignoreActionbar = new ActionBar(this.recommendation, { animated: false });

		this.disposables.push(this.extensionActionBar);
		this.disposables.push(this.ignoreActionbar);

		chain(this.extensionActionBar.onDidRun)
			.map(({ error }) => error)
			.filter(error => !!error)
			.on(this.onError, this, this.disposables);

		chain(this.ignoreActionbar.onDidRun)
			.map(({ error }) => error)
			.filter(error => !!error)
			.on(this.onError, this, this.disposables);

		const body = append(root, $('.body'));
		this.navbar = new NavBar(body);

		this.content = append(body, $('.content'));
	}

	setInput(input: ExtensionsInput, options: EditorOptions, token: CancellationToken): Thenable<void> {
		this.editorLoadComplete = false;
		const extension = input.extension;
		const servers = input.servers;

		this.transientDisposables = dispose(this.transientDisposables);

		this.extensionReadme = new Cache(() => extension.getReadme());
		this.extensionChangelog = new Cache(() => extension.getChangelog());
		this.extensionManifest = new Cache(() => extension.getManifest());
		this.extensionDependencies = new Cache(() => this.extensionsWorkbenchService.loadDependencies(extension));

		const onError = once(domEvent(this.icon, 'error'));
		onError(() => this.icon.src = extension.iconUrlFallback, null, this.transientDisposables);
		this.icon.src = extension.iconUrl;

		this.name.textContent = extension.displayName;
		this.identifier.textContent = extension.id;
		this.preview.style.display = extension.preview ? 'inherit' : 'none';
		this.builtin.style.display = extension.type === LocalExtensionType.System ? 'inherit' : 'none';

		this.publisher.textContent = extension.publisherDisplayName;
		this.description.textContent = extension.description;

		removeClass(this.header, 'recommendation-ignored');
		removeClass(this.header, 'recommended');

		const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
		let recommendationsData = {};
		if (extRecommendations[extension.id.toLowerCase()]) {
			addClass(this.header, 'recommended');
			this.recommendationText.textContent = extRecommendations[extension.id.toLowerCase()].reasonText;
			recommendationsData = { recommendationReason: extRecommendations[extension.id.toLowerCase()].reasonId };
		} else if (this.extensionTipsService.getAllIgnoredRecommendations().global.indexOf(extension.id.toLowerCase()) !== -1) {
			addClass(this.header, 'recommendation-ignored');
			this.recommendationText.textContent = localize('recommendationHasBeenIgnored', "You have chosen not to receive recommendations for this extension.");
		}
		else {
			this.recommendationText.textContent = '';
		}

		/* __GDPR__
		"extensionGallery:openExtension" : {
			"recommendationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
		*/
		this.telemetryService.publicLog('extensionGallery:openExtension', assign(extension.telemetryData, recommendationsData));

		toggleClass(this.name, 'clickable', !!extension.url);
		toggleClass(this.publisher, 'clickable', !!extension.url);
		toggleClass(this.rating, 'clickable', !!extension.url);
		if (extension.url) {
			this.name.onclick = finalHandler(() => window.open(extension.url));
			this.rating.onclick = finalHandler(() => window.open(`${extension.url}#review-details`));
			this.publisher.onclick = finalHandler(() => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.done(viewlet => viewlet.search(`publisher:"${extension.publisherDisplayName}"`));
			});

			if (extension.licenseUrl) {
				this.license.onclick = finalHandler(() => window.open(extension.licenseUrl));
				this.license.style.display = 'initial';
			} else {
				this.license.onclick = null;
				this.license.style.display = 'none';
			}
		} else {
			this.name.onclick = null;
			this.rating.onclick = null;
			this.publisher.onclick = null;
		}

		if (extension.repository) {
			this.repository.onclick = finalHandler(() => window.open(extension.repository));
			this.repository.style.display = 'initial';
		}
		else {
			this.repository.onclick = null;
			this.repository.style.display = 'none';
		}

		const install = this.instantiationService.createInstance(InstallCountWidget, this.installCount, { extension });
		this.transientDisposables.push(install);

		const ratings = this.instantiationService.createInstance(RatingsWidget, this.rating, { extension });
		this.transientDisposables.push(ratings);

		const maliciousStatusAction = this.instantiationService.createInstance(MaliciousStatusLabelAction, true);
		const disabledStatusAction = this.instantiationService.createInstance(DisabledStatusLabelAction);
		const installAction = this.instantiationService.createInstance(CombinedInstallAction);
		const updateAction = servers.length === 1 ? this.instantiationService.createInstance(UpdateAction) : this.instantiationService.createInstance(MultiServerUpdateAction);
		const enableAction = this.instantiationService.createInstance(EnableAction);
		const disableAction = this.instantiationService.createInstance(DisableAction);
		const reloadAction = this.instantiationService.createInstance(ReloadAction);

		installAction.extension = extension;
		maliciousStatusAction.extension = extension;
		disabledStatusAction.extension = extension;
		updateAction.extension = extension;
		enableAction.extension = extension;
		disableAction.extension = extension;
		reloadAction.extension = extension;

		this.extensionActionBar.clear();
		this.extensionActionBar.push([disabledStatusAction, reloadAction, updateAction, enableAction, disableAction, installAction, maliciousStatusAction], { icon: true, label: true });
		this.transientDisposables.push(enableAction, updateAction, reloadAction, disableAction, installAction, maliciousStatusAction, disabledStatusAction);

		const ignoreAction = this.instantiationService.createInstance(IgnoreExtensionRecommendationAction);
		const undoIgnoreAction = this.instantiationService.createInstance(UndoIgnoreExtensionRecommendationAction);
		ignoreAction.extension = extension;
		undoIgnoreAction.extension = extension;

		this.extensionTipsService.onRecommendationChange(change => {
			if (change.extensionId.toLowerCase() === extension.id.toLowerCase()) {
				if (change.isRecommended) {
					removeClass(this.header, 'recommendation-ignored');
					const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
					if (extRecommendations[extension.id.toLowerCase()]) {
						addClass(this.header, 'recommended');
						this.recommendationText.textContent = extRecommendations[extension.id.toLowerCase()].reasonText;
					}
				} else {
					addClass(this.header, 'recommendation-ignored');
					removeClass(this.header, 'recommended');
					this.recommendationText.textContent = localize('recommendationHasBeenIgnored', "You have chosen not to receive recommendations for this extension.");
				}
			}
		});

		this.ignoreActionbar.clear();
		this.ignoreActionbar.push([ignoreAction, undoIgnoreAction], { icon: true, label: true });
		this.transientDisposables.push(ignoreAction, undoIgnoreAction);

		this.content.innerHTML = ''; // Clear content before setting navbar actions.

		this.navbar.clear();
		this.navbar.onChange(this.onNavbarChange.bind(this, extension), this, this.transientDisposables);
		this.navbar.push(NavbarSection.Readme, localize('details', "Details"), localize('detailstooltip', "Extension details, rendered from the extension's 'README.md' file"));
		if (extension.extensionPack.length) {
			this.navbar.push(NavbarSection.ExtensionPack, localize('extensionPack', "Extension Pack"), localize('extensionsPack', "Set of extensions that can be installed together"));
		}
		this.navbar.push(NavbarSection.Contributions, localize('contributions', "Contributions"), localize('contributionstooltip', "Lists contributions to VS Code by this extension"));
		this.navbar.push(NavbarSection.Changelog, localize('changelog', "Changelog"), localize('changelogtooltip', "Extension update history, rendered from the extension's 'CHANGELOG.md' file"));
		if (extension.dependencies.length) {
			this.navbar.push(NavbarSection.Dependencies, localize('dependencies', "Dependencies"), localize('dependenciestooltip', "Lists extensions this extension depends on"));
		}

		this.editorLoadComplete = true;
		return super.setInput(input, options, token);
	}

	showFind(): void {
		if (this.activeWebview) {
			this.activeWebview.showFind();
		}
	}

	private onNavbarChange(extension: IExtension, id: string): void {
		if (this.editorLoadComplete) {
			/* __GDPR__
				"extensionEditor:navbarChange" : {
					"navItem": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"${include}": [
						"${GalleryExtensionTelemetryData}"
					]
				}
			*/
			this.telemetryService.publicLog('extensionEditor:navbarChange', assign(extension.telemetryData, { navItem: id }));
		}

		this.contentDisposables = dispose(this.contentDisposables);
		this.content.innerHTML = '';
		this.activeWebview = null;
		switch (id) {
			case NavbarSection.Readme: return this.openReadme();
			case NavbarSection.Contributions: return this.openContributions();
			case NavbarSection.Changelog: return this.openChangelog();
			case NavbarSection.Dependencies: return this.openDependencies(extension);
			case NavbarSection.ExtensionPack: return this.openExtensionPack(extension);
		}
	}

	private openMarkdown(content: TPromise<string>, noContentCopy: string) {
		return this.loadContents(() => content
			.then(marked.parse)
			.then(renderBody)
			.then(removeEmbeddedSVGs)
			.then<void>(body => {
				const allowedBadgeProviders = this.extensionsWorkbenchService.allowedBadgeProviders;
				const webViewOptions = allowedBadgeProviders.length > 0 ? { allowScripts: false, allowSvgs: false, svgWhiteList: allowedBadgeProviders } : {};
				this.activeWebview = this.instantiationService.createInstance(WebviewElement, this.partService.getContainer(Parts.EDITOR_PART), this.contextKey, this.findInputFocusContextKey, webViewOptions);
				this.activeWebview.mountTo(this.content);
				const removeLayoutParticipant = arrays.insert(this.layoutParticipants, this.activeWebview);
				this.contentDisposables.push(toDisposable(removeLayoutParticipant));
				this.activeWebview.contents = body;

				this.activeWebview.onDidClickLink(link => {
					// Whitelist supported schemes for links
					if (link && ['http', 'https', 'mailto'].indexOf(link.scheme) >= 0) {
						this.openerService.open(link);
					}
				}, null, this.contentDisposables);
				this.contentDisposables.push(this.activeWebview);
			})
			.then(null, () => {
				const p = append(this.content, $('p.nocontent'));
				p.textContent = noContentCopy;
			}));
	}

	private openReadme() {
		return this.openMarkdown(this.extensionReadme.get(), localize('noReadme', "No README available."));
	}

	private openChangelog() {
		return this.openMarkdown(this.extensionChangelog.get(), localize('noChangelog', "No Changelog available."));
	}

	private openContributions() {
		return this.loadContents(() => this.extensionManifest.get()
			.then(manifest => {
				const content = $('div', { class: 'subcontent' });
				const scrollableContent = new DomScrollableElement(content, {});

				const layout = () => scrollableContent.scanDomNode();
				const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
				this.contentDisposables.push(toDisposable(removeLayoutParticipant));

				const renders = [
					this.renderSettings(content, manifest, layout),
					this.renderCommands(content, manifest, layout),
					this.renderLanguages(content, manifest, layout),
					this.renderColorThemes(content, manifest, layout),
					this.renderIconThemes(content, manifest, layout),
					this.renderColors(content, manifest, layout),
					this.renderJSONValidation(content, manifest, layout),
					this.renderDebuggers(content, manifest, layout),
					this.renderViewContainers(content, manifest, layout),
					this.renderViews(content, manifest, layout),
					this.renderLocalizations(content, manifest, layout)
				];

				const isEmpty = !renders.reduce((v, r) => r || v, false);
				scrollableContent.scanDomNode();

				if (isEmpty) {
					append(this.content, $('p.nocontent')).textContent = localize('noContributions', "No Contributions");
					return;
				} else {
					append(this.content, scrollableContent.getDomNode());
					this.contentDisposables.push(scrollableContent);
				}
			}, () => {
				append(this.content, $('p.nocontent')).textContent = localize('noContributions', "No Contributions");
			}));
	}

	private openDependencies(extension: IExtension) {
		if (extension.dependencies.length === 0) {
			append(this.content, $('p.nocontent')).textContent = localize('noDependencies', "No Dependencies");
			return;
		}

		return this.loadContents(() => {
			return this.extensionDependencies.get().then(extensionDependencies => {
				const content = $('div', { class: 'subcontent' });
				const scrollableContent = new DomScrollableElement(content, {});
				append(this.content, scrollableContent.getDomNode());
				this.contentDisposables.push(scrollableContent);

				const dependenciesTree = this.renderDependencies(content, extensionDependencies);
				const layout = () => {
					scrollableContent.scanDomNode();
					const scrollDimensions = scrollableContent.getScrollDimensions();
					dependenciesTree.layout(scrollDimensions.height);
				};
				const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
				this.contentDisposables.push(toDisposable(removeLayoutParticipant));

				this.contentDisposables.push(dependenciesTree);
				scrollableContent.scanDomNode();
			}, error => {
				append(this.content, $('p.nocontent')).textContent = error;
				this.notificationService.error(error);
			});
		});
	}

	private renderDependencies(container: HTMLElement, extensionDependencies: IExtensionDependencies): Tree {
		class ExtensionData implements IExtensionData {

			private readonly extensionDependencies: IExtensionDependencies;

			constructor(extensionDependencies: IExtensionDependencies) {
				this.extensionDependencies = extensionDependencies;
			}

			get extension(): IExtension {
				return this.extensionDependencies.extension;
			}

			get parent(): IExtensionData {
				return this.extensionDependencies.dependent ? new ExtensionData(this.extensionDependencies.dependent) : null;
			}

			get hasChildren(): boolean {
				return this.extensionDependencies.hasDependencies;
			}

			getChildren(): Promise<IExtensionData[]> {
				return this.extensionDependencies.dependencies ? TPromise.as(this.extensionDependencies.dependencies.map(d => new ExtensionData(d))) : null;
			}
		}

		return this.instantiationService.createInstance(ExtensionsTree, new ExtensionData(extensionDependencies), container);
	}

	private openExtensionPack(extension: IExtension) {
		return this.loadContents(() => {
			const content = $('div', { class: 'subcontent' });
			const scrollableContent = new DomScrollableElement(content, {});
			append(this.content, scrollableContent.getDomNode());
			this.contentDisposables.push(scrollableContent);

			const dependenciesTree = this.renderExtensionPack(content, extension);
			const layout = () => {
				scrollableContent.scanDomNode();
				const scrollDimensions = scrollableContent.getScrollDimensions();
				dependenciesTree.layout(scrollDimensions.height);
			};
			const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
			this.contentDisposables.push(toDisposable(removeLayoutParticipant));

			this.contentDisposables.push(dependenciesTree);
			scrollableContent.scanDomNode();
			return TPromise.as(null);
		});
	}

	private renderExtensionPack(container: HTMLElement, extension: IExtension): Tree {
		const extensionsWorkbenchService = this.extensionsWorkbenchService;
		class ExtensionData implements IExtensionData {

			readonly extension: IExtension;
			readonly parent: IExtensionData;

			constructor(extension: IExtension, parent?: IExtensionData) {
				this.extension = extension;
				this.parent = parent;
			}

			get hasChildren(): boolean {
				return this.extension.extensionPack.length > 0;
			}

			getChildren(): Promise<IExtensionData[]> {
				if (this.hasChildren) {
					const names = arrays.distinct(this.extension.extensionPack, e => e.toLowerCase());
					return extensionsWorkbenchService.queryGallery({ names, pageSize: names.length })
						.then(result => result.firstPage.map(extension => new ExtensionData(extension, this)));
				}
				return TPromise.as(null);
			}
		}

		return this.instantiationService.createInstance(ExtensionsTree, new ExtensionData(extension), container);
	}

	private renderSettings(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const configuration = contributes && contributes.configuration;
		const properties = configuration && configuration.properties;
		const contrib = properties ? Object.keys(properties) : [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('settings', "Settings ({0})", contrib.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('setting name', "Name")),
					$('th', null, localize('description', "Description")),
					$('th', null, localize('default', "Default"))
				),
				...contrib.map(key => $('tr', null,
					$('td', null, $('code', null, key)),
					$('td', null, properties[key].description),
					$('td', null, $('code', null, properties[key].default))
				))
			)
		);

		append(container, details);
		return true;
	}



	private renderDebuggers(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.debuggers || [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('debuggers', "Debuggers ({0})", contrib.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('debugger name', "Name")),
					$('th', null, localize('debugger type', "Type")),
				),
				...contrib.map(d => $('tr', null,
					$('td', null, d.label),
					$('td', null, d.type)))
			)
		);

		append(container, details);
		return true;
	}

	private renderViewContainers(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.viewsContainers || {};

		let viewContainers = <{ id: string, title: string, location: string }[]>Object.keys(contrib).reduce((result, location) => {
			let viewContainersForLocation: IViewContainer[] = contrib[location];
			result.push(...viewContainersForLocation.map(viewContainer => ({ ...viewContainer, location })));
			return result;
		}, []);

		if (!viewContainers.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('viewContainers', "View Containers ({0})", viewContainers.length)),
			$('table', null,
				$('tr', null, $('th', null, localize('view container id', "ID")), $('th', null, localize('view container title', "Title")), $('th', null, localize('view container location', "Where"))),
				...viewContainers.map(viewContainer => $('tr', null, $('td', null, viewContainer.id), $('td', null, viewContainer.title), $('td', null, viewContainer.location)))
			)
		);

		append(container, details);
		return true;
	}

	private renderViews(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.views || {};

		let views = <{ id: string, name: string, location: string }[]>Object.keys(contrib).reduce((result, location) => {
			let viewsForLocation: IView[] = contrib[location];
			result.push(...viewsForLocation.map(view => ({ ...view, location })));
			return result;
		}, []);

		if (!views.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('views', "Views ({0})", views.length)),
			$('table', null,
				$('tr', null, $('th', null, localize('view id', "ID")), $('th', null, localize('view name', "Name")), $('th', null, localize('view location', "Where"))),
				...views.map(view => $('tr', null, $('td', null, view.id), $('td', null, view.name), $('td', null, view.location)))
			)
		);

		append(container, details);
		return true;
	}

	private renderLocalizations(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const localizations = contributes && contributes.localizations || [];

		if (!localizations.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('localizations', "Localizations ({0})", localizations.length)),
			$('table', null,
				$('tr', null, $('th', null, localize('localizations language id', "Language Id")), $('th', null, localize('localizations language name', "Language Name")), $('th', null, localize('localizations localized language name', "Language Name (Localized)"))),
				...localizations.map(localization => $('tr', null, $('td', null, localization.languageId), $('td', null, localization.languageName), $('td', null, localization.localizedLanguageName)))
			)
		);

		append(container, details);
		return true;
	}

	/* private renderExtensionPack(container: HTMLElement, extension: IExtension, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		if (!manifest.contributes || !manifest.contributes.extensionPack) {
			return false;
		}

		const extensionsWorkbenchService = this.extensionsWorkbenchService;
		class ExtensionData implements IExtensionData {

			readonly extension: IExtension;
			readonly parent: IExtensionData;
			private readonly manifest: IExtensionManifest;

			constructor(extension: IExtension, manifest: IExtensionManifest, parent?: IExtensionData) {
				this.extension = extension;
				this.manifest = manifest;
				this.parent = parent;
			}

			get hasChildren(): boolean {
				return !!(this.manifest.contributes && this.manifest.contributes.extensionPack);
			}

			getChildren(): Promise<IExtensionData[]> {
				if (this.manifest.contributes && this.manifest.contributes.extensionPack) {
					const names = arrays.distinct(this.manifest.contributes.extensionPack, e => e.id.toLowerCase()).map(({ id }) => id);
					return extensionsWorkbenchService.queryGallery({ names, pageSize: names.length })
						.then(result => TPromise.join(result.firstPage.map(e => e.getManifest()))
							.then(manifests => result.firstPage.map((extension, index) => new ExtensionData(extension, manifests[index], this))));
				}
				return TPromise.as(null);
			}
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('extension pack', "Extension Pack")));

		const tree = this.instantiationService.createInstance(ExtensionsTree, new ExtensionData(extension, manifest), details);
		append(container, details);

		details.style.height = '1000px';
		tree.layout(1000);
		return true;
	} */

	private renderColorThemes(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.themes || [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('colorThemes', "Color Themes ({0})", contrib.length)),
			$('ul', null, ...contrib.map(theme => $('li', null, theme.label)))
		);

		append(container, details);
		return true;
	}

	private renderIconThemes(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.iconThemes || [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('iconThemes', "Icon Themes ({0})", contrib.length)),
			$('ul', null, ...contrib.map(theme => $('li', null, theme.label)))
		);

		append(container, details);
		return true;
	}

	private renderColors(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const colors = contributes && contributes.colors;

		if (!colors || !colors.length) {
			return false;
		}

		function colorPreview(colorReference: string): Node[] {
			let result: Node[] = [];
			if (colorReference && colorReference[0] === '#') {
				let color = Color.fromHex(colorReference);
				if (color) {
					result.push($('span', { class: 'colorBox', style: 'background-color: ' + Color.Format.CSS.format(color) }, ''));
				}
			}
			result.push($('code', null, colorReference));
			return result;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('colors', "Colors ({0})", colors.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('colorId', "Id")),
					$('th', null, localize('description', "Description")),
					$('th', null, localize('defaultDark', "Dark Default")),
					$('th', null, localize('defaultLight', "Light Default")),
					$('th', null, localize('defaultHC', "High Contrast Default"))
				),
				...colors.map(color => $('tr', null,
					$('td', null, $('code', null, color.id)),
					$('td', null, color.description),
					$('td', null, ...colorPreview(color.defaults.dark)),
					$('td', null, ...colorPreview(color.defaults.light)),
					$('td', null, ...colorPreview(color.defaults.highContrast))
				))
			)
		);

		append(container, details);
		return true;
	}


	private renderJSONValidation(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.jsonValidation || [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('JSON Validation', "JSON Validation ({0})", contrib.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('fileMatch', "File Match")),
					$('th', null, localize('schema', "Schema"))
				),
				...contrib.map(v => $('tr', null,
					$('td', null, $('code', null, v.fileMatch)),
					$('td', null, v.url)
				))));

		append(container, details);
		return true;
	}

	private renderCommands(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const rawCommands = contributes && contributes.commands || [];
		const commands = rawCommands.map(c => ({
			id: c.command,
			title: c.title,
			keybindings: [],
			menus: []
		}));

		const byId = arrays.index(commands, c => c.id);

		const menus = contributes && contributes.menus || {};

		Object.keys(menus).forEach(context => {
			menus[context].forEach(menu => {
				let command = byId[menu.command];

				if (!command) {
					command = { id: menu.command, title: '', keybindings: [], menus: [context] };
					byId[command.id] = command;
					commands.push(command);
				} else {
					command.menus.push(context);
				}
			});
		});

		const rawKeybindings = contributes && contributes.keybindings || [];

		rawKeybindings.forEach(rawKeybinding => {
			const keybinding = this.resolveKeybinding(rawKeybinding);

			if (!keybinding) {
				return;
			}

			let command = byId[rawKeybinding.command];

			if (!command) {
				command = { id: rawKeybinding.command, title: '', keybindings: [keybinding], menus: [] };
				byId[command.id] = command;
				commands.push(command);
			} else {
				command.keybindings.push(keybinding);
			}
		});

		if (!commands.length) {
			return false;
		}

		const renderKeybinding = (keybinding: ResolvedKeybinding): HTMLElement => {
			const element = $('');
			new KeybindingLabel(element, OS).set(keybinding, null);
			return element;
		};

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('commands', "Commands ({0})", commands.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('command name', "Name")),
					$('th', null, localize('description', "Description")),
					$('th', null, localize('keyboard shortcuts', "Keyboard Shortcuts")),
					$('th', null, localize('menuContexts', "Menu Contexts"))
				),
				...commands.map(c => $('tr', null,
					$('td', null, $('code', null, c.id)),
					$('td', null, c.title),
					$('td', null, ...c.keybindings.map(keybinding => renderKeybinding(keybinding))),
					$('td', null, ...c.menus.map(context => $('code', null, context)))
				))
			)
		);

		append(container, details);
		return true;
	}

	private renderLanguages(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const rawLanguages = contributes && contributes.languages || [];
		const languages = rawLanguages.map(l => ({
			id: l.id,
			name: (l.aliases || [])[0] || l.id,
			extensions: l.extensions || [],
			hasGrammar: false,
			hasSnippets: false
		}));

		const byId = arrays.index(languages, l => l.id);

		const grammars = contributes && contributes.grammars || [];

		grammars.forEach(grammar => {
			let language = byId[grammar.language];

			if (!language) {
				language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
				byId[language.id] = language;
				languages.push(language);
			} else {
				language.hasGrammar = true;
			}
		});

		const snippets = contributes && contributes.snippets || [];

		snippets.forEach(snippet => {
			let language = byId[snippet.language];

			if (!language) {
				language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
				byId[language.id] = language;
				languages.push(language);
			} else {
				language.hasSnippets = true;
			}
		});

		if (!languages.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('languages', "Languages ({0})", languages.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('language id', "ID")),
					$('th', null, localize('language name', "Name")),
					$('th', null, localize('file extensions', "File Extensions")),
					$('th', null, localize('grammar', "Grammar")),
					$('th', null, localize('snippets', "Snippets"))
				),
				...languages.map(l => $('tr', null,
					$('td', null, l.id),
					$('td', null, l.name),
					$('td', null, ...join(l.extensions.map(ext => $('code', null, ext)), ' ')),
					$('td', null, document.createTextNode(l.hasGrammar ? '✔︎' : '—')),
					$('td', null, document.createTextNode(l.hasSnippets ? '✔︎' : '—'))
				))
			)
		);

		append(container, details);
		return true;
	}

	private resolveKeybinding(rawKeyBinding: IKeyBinding): ResolvedKeybinding {
		let key: string;

		switch (process.platform) {
			case 'win32': key = rawKeyBinding.win; break;
			case 'linux': key = rawKeyBinding.linux; break;
			case 'darwin': key = rawKeyBinding.mac; break;
		}

		const keyBinding = KeybindingIO.readKeybinding(key || rawKeyBinding.key, OS);
		if (!keyBinding) {
			return null;
		}

		return this.keybindingService.resolveKeybinding(keyBinding)[0];
	}

	private loadContents(loadingTask: () => TPromise<any>): void {
		addClass(this.content, 'loading');

		let promise = loadingTask();
		promise = always(promise, () => removeClass(this.content, 'loading'));

		this.contentDisposables.push(toDisposable(() => promise.cancel()));
	}

	layout(): void {
		this.layoutParticipants.forEach(p => p.layout());
	}

	private onError(err: any): void {
		if (isPromiseCanceledError(err)) {
			return;
		}

		this.notificationService.error(err);
	}

	dispose(): void {
		this.transientDisposables = dispose(this.transientDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

class ShowExtensionEditorFindCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const extensionEditor = this.getExtensionEditor(accessor);
		if (extensionEditor) {
			extensionEditor.showFind();
		}
	}

	private getExtensionEditor(accessor: ServicesAccessor): ExtensionEditor {
		const activeControl = accessor.get(IEditorService).activeControl as ExtensionEditor;
		if (activeControl instanceof ExtensionEditor) {
			return activeControl;
		}
		return null;
	}
}
const showCommand = new ShowExtensionEditorFindCommand({
	id: 'editor.action.extensioneditor.showfind',
	precondition: KEYBINDING_CONTEXT_EXTENSIONEDITOR_WEBVIEW_FOCUS,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
