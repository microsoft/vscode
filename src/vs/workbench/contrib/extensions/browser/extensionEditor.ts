/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionEditor';
import { localize } from 'vs/nls';
import * as marked from 'vs/base/common/marked/marked';
import { createCancelablePromise } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import { OS } from 'vs/base/common/platform';
import { Event, Emitter } from 'vs/base/common/event';
import { Cache, CacheResult } from 'vs/base/common/cache';
import { Action } from 'vs/base/common/actions';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { dispose, toDisposable, Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { domEvent } from 'vs/base/browser/event';
import { append, $, addClass, removeClass, finalHandler, join, toggleClass, hide, show, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTipsService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionManifest, IKeyBinding, IView, IViewContainer, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { ResolvedKeybinding, KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ExtensionsInput } from 'vs/workbench/contrib/extensions/common/extensionsInput';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID, IExtension, ExtensionContainers } from 'vs/workbench/contrib/extensions/common/extensions';
import { RatingsWidget, InstallCountWidget, RemoteBadgeWidget } from 'vs/workbench/contrib/extensions/browser/extensionsWidgets';
import { EditorOptions } from 'vs/workbench/common/editor';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { CombinedInstallAction, UpdateAction, ExtensionEditorDropDownAction, ReloadAction, MaliciousStatusLabelAction, IgnoreExtensionRecommendationAction, UndoIgnoreExtensionRecommendationAction, EnableDropDownAction, DisableDropDownAction, StatusLabelAction, SetFileIconThemeAction, SetColorThemeAction, RemoteInstallAction, ExtensionToolTipAction, SystemDisabledWarningAction, LocalInstallAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Command } from 'vs/editor/browser/editorExtensions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Color } from 'vs/base/common/color';
import { assign } from 'vs/base/common/objects';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionsTree, ExtensionData } from 'vs/workbench/contrib/extensions/browser/extensionsViewer';
import { ShowCurrentReleaseNotesActionId } from 'vs/workbench/contrib/update/common/update';
import { KeybindingParser } from 'vs/base/common/keybindingParser';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { getDefaultValue } from 'vs/platform/configuration/common/configurationRegistry';
import { isUndefined } from 'vs/base/common/types';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IWebviewService, Webview } from 'vs/workbench/contrib/webview/common/webview';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { generateUuid } from 'vs/base/common/uuid';
import { platform } from 'vs/base/common/process';

function removeEmbeddedSVGs(documentContent: string): string {
	const newDocument = new DOMParser().parseFromString(documentContent, 'text/html');

	// remove all inline svgs
	const allSVGs = newDocument.documentElement.querySelectorAll('svg');
	if (allSVGs) {
		for (let i = 0; i < allSVGs.length; i++) {
			const svg = allSVGs[i];
			if (svg.parentNode) {
				svg.parentNode.removeChild(allSVGs[i]);
			}
		}
	}

	return newDocument.documentElement.outerHTML;
}

class NavBar extends Disposable {

	private _onChange = this._register(new Emitter<{ id: string | null, focus: boolean }>());
	get onChange(): Event<{ id: string | null, focus: boolean }> { return this._onChange.event; }

	private currentId: string | null = null;
	private actions: Action[];
	private actionbar: ActionBar;

	constructor(container: HTMLElement) {
		super();
		const element = append(container, $('.navbar'));
		this.actions = [];
		this.actionbar = this._register(new ActionBar(element, { animated: false }));
	}

	push(id: string, label: string, tooltip: string): void {
		const action = new Action(id, label, undefined, true, () => this._update(id, true));

		action.tooltip = tooltip;

		this.actions.push(action);
		this.actionbar.push(action);

		if (this.actions.length === 1) {
			this._update(id);
		}
	}

	clear(): void {
		this.actions = dispose(this.actions);
		this.actionbar.clear();
	}

	update(): void {
		this._update(this.currentId);
	}

	_update(id: string | null = this.currentId, focus?: boolean): Promise<void> {
		this.currentId = id;
		this._onChange.fire({ id, focus: !!focus });
		this.actions.forEach(a => a.checked = a.id === id);
		return Promise.resolve(undefined);
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

interface IActiveElement {
	focus(): void;
}

interface IExtensionEditorTemplate {
	iconContainer: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	identifier: HTMLElement;
	preview: HTMLElement;
	builtin: HTMLElement;
	license: HTMLElement;
	publisher: HTMLElement;
	installCount: HTMLElement;
	rating: HTMLElement;
	repository: HTMLElement;
	description: HTMLElement;
	extensionActionBar: ActionBar;
	navbar: NavBar;
	content: HTMLElement;
	subtextContainer: HTMLElement;
	subtext: HTMLElement;
	ignoreActionbar: ActionBar;
	header: HTMLElement;
}

export class ExtensionEditor extends BaseEditor {

	static readonly ID: string = 'workbench.editor.extension';

	private template: IExtensionEditorTemplate | undefined;

	private extensionReadme: Cache<string> | null;
	private extensionChangelog: Cache<string> | null;
	private extensionManifest: Cache<IExtensionManifest | null> | null;

	private layoutParticipants: ILayoutParticipant[] = [];
	private readonly contentDisposables = this._register(new DisposableStore());
	private readonly transientDisposables = this._register(new DisposableStore());
	private activeElement: IActiveElement | null = null;
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
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@IWebviewService private readonly webviewService: IWebviewService,
	) {
		super(ExtensionEditor.ID, telemetryService, themeService, storageService);
		this.extensionReadme = null;
		this.extensionChangelog = null;
		this.extensionManifest = null;
	}

	createEditor(parent: HTMLElement): void {
		const root = append(parent, $('.extension-editor'));
		root.tabIndex = 0; // this is required for the focus tracker on the editor
		root.style.outline = 'none';
		const header = append(root, $('.header'));

		const iconContainer = append(header, $('.icon-container'));
		const icon = append(iconContainer, $<HTMLImageElement>('img.icon', { draggable: false }));

		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		const name = append(title, $('span.name.clickable', { title: localize('name', "Extension name") }));
		const identifier = append(title, $('span.identifier', { title: localize('extension id', "Extension identifier") }));

		const preview = append(title, $('span.preview', { title: localize('preview', "Preview") }));
		preview.textContent = localize('preview', "Preview");

		const builtin = append(title, $('span.builtin'));
		builtin.textContent = localize('builtin', "Built-in");

		const subtitle = append(details, $('.subtitle'));
		const publisher = append(subtitle, $('span.publisher.clickable', { title: localize('publisher', "Publisher name"), tabIndex: 0 }));

		const installCount = append(subtitle, $('span.install', { title: localize('install count', "Install count"), tabIndex: 0 }));

		const rating = append(subtitle, $('span.rating.clickable', { title: localize('rating', "Rating"), tabIndex: 0 }));

		const repository = append(subtitle, $('span.repository.clickable'));
		repository.textContent = localize('repository', 'Repository');
		repository.style.display = 'none';
		repository.tabIndex = 0;

		const license = append(subtitle, $('span.license.clickable'));
		license.textContent = localize('license', 'License');
		license.style.display = 'none';
		license.tabIndex = 0;

		const description = append(details, $('.description'));

		const extensionActions = append(details, $('.actions'));
		const extensionActionBar = this._register(new ActionBar(extensionActions, {
			animated: false,
			actionViewItemProvider: (action: Action) => {
				if (action instanceof ExtensionEditorDropDownAction) {
					return action.createActionViewItem();
				}
				return undefined;
			}
		}));

		const subtextContainer = append(details, $('.subtext-container'));
		const subtext = append(subtextContainer, $('.subtext'));
		const ignoreActionbar = this._register(new ActionBar(subtextContainer, { animated: false }));

		this._register(Event.chain(extensionActionBar.onDidRun)
			.map(({ error }) => error)
			.filter(error => !!error)
			.on(this.onError, this));

		this._register(Event.chain(ignoreActionbar.onDidRun)
			.map(({ error }) => error)
			.filter(error => !!error)
			.on(this.onError, this));

		const body = append(root, $('.body'));
		const navbar = new NavBar(body);

		const content = append(body, $('.content'));

		this.template = {
			builtin,
			content,
			description,
			extensionActionBar,
			header,
			icon,
			iconContainer,
			identifier,
			ignoreActionbar,
			installCount,
			license,
			name,
			navbar,
			preview,
			publisher,
			rating,
			repository,
			subtext,
			subtextContainer
		};
	}

	private onClick(element: HTMLElement, callback: () => void): IDisposable {
		const disposables: DisposableStore = new DisposableStore();
		disposables.add(addDisposableListener(element, EventType.CLICK, finalHandler(callback)));
		disposables.add(addDisposableListener(element, EventType.KEY_UP, e => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
				e.preventDefault();
				e.stopPropagation();
				callback();
			}
		}));
		return disposables;
	}

	async setInput(input: ExtensionsInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		if (this.template) {
			await this.updateTemplate(input, this.template);
		}
		return super.setInput(input, options, token);
	}

	private async updateTemplate(input: ExtensionsInput, template: IExtensionEditorTemplate): Promise<void> {
		const runningExtensions = await this.extensionService.getExtensions();
		const colorThemes = await this.workbenchThemeService.getColorThemes();
		const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();

		this.activeElement = null;
		this.editorLoadComplete = false;
		const extension = input.extension;

		this.transientDisposables.clear();

		this.extensionReadme = new Cache(() => createCancelablePromise(token => extension.getReadme(token)));
		this.extensionChangelog = new Cache(() => createCancelablePromise(token => extension.getChangelog(token)));
		this.extensionManifest = new Cache(() => createCancelablePromise(token => extension.getManifest(token)));

		const remoteBadge = this.instantiationService.createInstance(RemoteBadgeWidget, template.iconContainer, true);
		const onError = Event.once(domEvent(template.icon, 'error'));
		onError(() => template.icon.src = extension.iconUrlFallback, null, this.transientDisposables);
		template.icon.src = extension.iconUrl;

		template.name.textContent = extension.displayName;
		template.identifier.textContent = extension.identifier.id;
		template.preview.style.display = extension.preview ? 'inherit' : 'none';
		template.builtin.style.display = extension.type === ExtensionType.System ? 'inherit' : 'none';

		template.publisher.textContent = extension.publisherDisplayName;
		template.description.textContent = extension.description;

		const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
		let recommendationsData = {};
		if (extRecommendations[extension.identifier.id.toLowerCase()]) {
			recommendationsData = { recommendationReason: extRecommendations[extension.identifier.id.toLowerCase()].reasonId };
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

		toggleClass(template.name, 'clickable', !!extension.url);
		toggleClass(template.publisher, 'clickable', !!extension.url);
		toggleClass(template.rating, 'clickable', !!extension.url);
		if (extension.url) {
			this.transientDisposables.add(this.onClick(template.name, () => window.open(extension.url)));
			this.transientDisposables.add(this.onClick(template.rating, () => window.open(`${extension.url}#review-details`)));
			this.transientDisposables.add(this.onClick(template.publisher, () => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.then(viewlet => viewlet.search(`publisher:"${extension.publisherDisplayName}"`));
			}));

			if (extension.licenseUrl) {
				this.transientDisposables.add(this.onClick(template.license, () => window.open(extension.licenseUrl)));
				template.license.style.display = 'initial';
			} else {
				template.license.style.display = 'none';
			}
		} else {
			template.license.style.display = 'none';
		}

		if (extension.repository) {
			this.transientDisposables.add(this.onClick(template.repository, () => window.open(extension.repository)));
			template.repository.style.display = 'initial';
		}
		else {
			template.repository.style.display = 'none';
		}

		const widgets = [
			remoteBadge,
			this.instantiationService.createInstance(InstallCountWidget, template.installCount, false),
			this.instantiationService.createInstance(RatingsWidget, template.rating, false)
		];
		const reloadAction = this.instantiationService.createInstance(ReloadAction);
		const combinedInstallAction = this.instantiationService.createInstance(CombinedInstallAction);
		const systemDisabledWarningAction = this.instantiationService.createInstance(SystemDisabledWarningAction);
		const actions = [
			reloadAction,
			this.instantiationService.createInstance(StatusLabelAction),
			this.instantiationService.createInstance(UpdateAction),
			this.instantiationService.createInstance(SetColorThemeAction, colorThemes),
			this.instantiationService.createInstance(SetFileIconThemeAction, fileIconThemes),
			this.instantiationService.createInstance(EnableDropDownAction),
			this.instantiationService.createInstance(DisableDropDownAction, runningExtensions),
			this.instantiationService.createInstance(RemoteInstallAction),
			this.instantiationService.createInstance(LocalInstallAction),
			combinedInstallAction,
			systemDisabledWarningAction,
			this.instantiationService.createInstance(ExtensionToolTipAction, systemDisabledWarningAction, reloadAction),
			this.instantiationService.createInstance(MaliciousStatusLabelAction, true),
		];
		const extensionContainers: ExtensionContainers = this.instantiationService.createInstance(ExtensionContainers, [...actions, ...widgets]);
		extensionContainers.extension = extension;

		template.extensionActionBar.clear();
		template.extensionActionBar.push(actions, { icon: true, label: true });
		for (const disposable of [...actions, ...widgets, extensionContainers]) {
			this.transientDisposables.add(disposable);
		}

		this.setSubText(extension, reloadAction, template);
		template.content.innerHTML = ''; // Clear content before setting navbar actions.

		template.navbar.clear();
		template.navbar.onChange(e => this.onNavbarChange(extension, e, template), this, this.transientDisposables);

		if (extension.hasReadme()) {
			template.navbar.push(NavbarSection.Readme, localize('details', "Details"), localize('detailstooltip', "Extension details, rendered from the extension's 'README.md' file"));
		}
		this.extensionManifest.get()
			.promise
			.then(manifest => {
				if (manifest) {
					combinedInstallAction.manifest = manifest;
				}
				if (extension.extensionPack.length) {
					template.navbar.push(NavbarSection.ExtensionPack, localize('extensionPack', "Extension Pack"), localize('extensionsPack', "Set of extensions that can be installed together"));
				}
				if (manifest && manifest.contributes) {
					template.navbar.push(NavbarSection.Contributions, localize('contributions', "Contributions"), localize('contributionstooltip', "Lists contributions to VS Code by this extension"));
				}
				if (extension.hasChangelog()) {
					template.navbar.push(NavbarSection.Changelog, localize('changelog', "Changelog"), localize('changelogtooltip', "Extension update history, rendered from the extension's 'CHANGELOG.md' file"));
				}
				if (extension.dependencies.length) {
					template.navbar.push(NavbarSection.Dependencies, localize('dependencies', "Dependencies"), localize('dependenciestooltip', "Lists extensions this extension depends on"));
				}
				this.editorLoadComplete = true;
			});
	}

	private setSubText(extension: IExtension, reloadAction: ReloadAction, template: IExtensionEditorTemplate): void {
		hide(template.subtextContainer);

		const ignoreAction = this.instantiationService.createInstance(IgnoreExtensionRecommendationAction);
		const undoIgnoreAction = this.instantiationService.createInstance(UndoIgnoreExtensionRecommendationAction);
		ignoreAction.extension = extension;
		undoIgnoreAction.extension = extension;
		ignoreAction.enabled = false;
		undoIgnoreAction.enabled = false;

		template.ignoreActionbar.clear();
		template.ignoreActionbar.push([ignoreAction, undoIgnoreAction], { icon: true, label: true });
		this.transientDisposables.add(ignoreAction);
		this.transientDisposables.add(undoIgnoreAction);

		const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
		if (extRecommendations[extension.identifier.id.toLowerCase()]) {
			ignoreAction.enabled = true;
			template.subtext.textContent = extRecommendations[extension.identifier.id.toLowerCase()].reasonText;
			show(template.subtextContainer);
		} else if (this.extensionTipsService.getAllIgnoredRecommendations().global.indexOf(extension.identifier.id.toLowerCase()) !== -1) {
			undoIgnoreAction.enabled = true;
			template.subtext.textContent = localize('recommendationHasBeenIgnored', "You have chosen not to receive recommendations for this extension.");
			show(template.subtextContainer);
		}
		else {
			template.subtext.textContent = '';
		}

		this.extensionTipsService.onRecommendationChange(change => {
			if (change.extensionId.toLowerCase() === extension.identifier.id.toLowerCase()) {
				if (change.isRecommended) {
					undoIgnoreAction.enabled = false;
					const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
					if (extRecommendations[extension.identifier.id.toLowerCase()]) {
						ignoreAction.enabled = true;
						template.subtext.textContent = extRecommendations[extension.identifier.id.toLowerCase()].reasonText;
					}
				} else {
					undoIgnoreAction.enabled = true;
					ignoreAction.enabled = false;
					template.subtext.textContent = localize('recommendationHasBeenIgnored', "You have chosen not to receive recommendations for this extension.");
				}
			}
		});

		this.transientDisposables.add(reloadAction.onDidChange(e => {
			if (e.tooltip) {
				template.subtext.textContent = reloadAction.tooltip;
				show(template.subtextContainer);
				ignoreAction.enabled = false;
				undoIgnoreAction.enabled = false;
			}
			if (e.enabled === true) {
				show(template.subtextContainer);
			}
			if (e.enabled === false) {
				hide(template.subtextContainer);
			}
		}));
	}

	clearInput(): void {
		this.contentDisposables.clear();
		this.transientDisposables.clear();

		super.clearInput();
	}

	focus(): void {
		if (this.activeElement) {
			this.activeElement.focus();
		}
	}

	showFind(): void {
		if (this.activeElement && (<Webview>this.activeElement).showFind) {
			(<Webview>this.activeElement).showFind();
		}
	}

	private onNavbarChange(extension: IExtension, { id, focus }: { id: string | null, focus: boolean }, template: IExtensionEditorTemplate): void {
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

		this.contentDisposables.clear();
		template.content.innerHTML = '';
		this.activeElement = null;
		if (id) {
			this.open(id, extension, template)
				.then(activeElement => {
					this.activeElement = activeElement;
					if (focus) {
						this.focus();
					}
				});
		}
	}

	private open(id: string, extension: IExtension, template: IExtensionEditorTemplate): Promise<IActiveElement | null> {
		switch (id) {
			case NavbarSection.Readme: return this.openReadme(template);
			case NavbarSection.Contributions: return this.openContributions(template);
			case NavbarSection.Changelog: return this.openChangelog(template);
			case NavbarSection.Dependencies: return this.openDependencies(extension, template);
			case NavbarSection.ExtensionPack: return this.openExtensionPack(extension, template);
		}
		return Promise.resolve(null);
	}

	private openMarkdown(cacheResult: CacheResult<string>, noContentCopy: string, template: IExtensionEditorTemplate): Promise<IActiveElement> {
		return this.loadContents(() => cacheResult, template)
			.then(marked.parse)
			.then(content => this.renderBody(content))
			.then(removeEmbeddedSVGs)
			.then(body => {
				const webviewElement = this.webviewService.createWebview('extensionEditor',
					{
						enableFindWidget: true,
					},
					{});
				webviewElement.mountTo(template.content);
				this.contentDisposables.add(webviewElement.onDidFocus(() => this.fireOnDidFocus()));
				const removeLayoutParticipant = arrays.insert(this.layoutParticipants, webviewElement);
				this.contentDisposables.add(toDisposable(removeLayoutParticipant));
				webviewElement.html = body;

				this.contentDisposables.add(webviewElement.onDidClickLink(link => {
					if (!link) {
						return;
					}
					// Whitelist supported schemes for links
					if (['http', 'https', 'mailto'].indexOf(link.scheme) >= 0 || (link.scheme === 'command' && link.path === ShowCurrentReleaseNotesActionId)) {
						this.openerService.open(link);
					}
				}, null, this.contentDisposables));
				this.contentDisposables.add(webviewElement);
				return webviewElement;
			})
			.then(undefined, () => {
				const p = append(template.content, $('p.nocontent'));
				p.textContent = noContentCopy;
				return p;
			});
	}

	private async renderBody(body: string): Promise<string> {
		const nonce = generateUuid();
		return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					body {
						padding: 10px 20px;
						line-height: 22px;
					}

					img {
						max-width: 100%;
						max-height: 100%;
					}

					a {
						text-decoration: none;
					}

					a:hover {
						text-decoration: underline;
					}

					a:focus,
					input:focus,
					select:focus,
					textarea:focus {
						outline: 1px solid -webkit-focus-ring-color;
						outline-offset: -1px;
					}

					hr {
						border: 0;
						height: 2px;
						border-bottom: 2px solid;
					}

					h1 {
						padding-bottom: 0.3em;
						line-height: 1.2;
						border-bottom-width: 1px;
						border-bottom-style: solid;
					}

					h1, h2, h3 {
						font-weight: normal;
					}

					table {
						border-collapse: collapse;
					}

					table > thead > tr > th {
						text-align: left;
						border-bottom: 1px solid;
					}

					table > thead > tr > th,
					table > thead > tr > td,
					table > tbody > tr > th,
					table > tbody > tr > td {
						padding: 5px 10px;
					}

					table > tbody > tr + tr > td {
						border-top: 1px solid;
					}

					blockquote {
						margin: 0 7px 0 5px;
						padding: 0 16px 0 10px;
						border-left-width: 5px;
						border-left-style: solid;
					}

					code {
						font-family: Menlo, Monaco, Consolas, "Droid Sans Mono", "Courier New", monospace, "Droid Sans Fallback";
						font-size: 14px;
						line-height: 19px;
					}

					.mac code {
						font-size: 12px;
						line-height: 18px;
					}

					code > div {
						padding: 16px;
						border-radius: 3px;
						overflow: auto;
					}

					#scroll-to-top {
						position: fixed;
						width: 40px;
						height: 40px;
						right: 25px;
						bottom: 25px;
						background-color:#444444;
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color:#007acc;
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-light #scroll-to-top {
						background-color: #949494;
					}

					body.vscode-high-contrast #scroll-to-top:hover {
						background-color: #007acc;
					}

					body.vscode-high-contrast #scroll-to-top {
						background-color: black;
						border: 2px solid #6fc3df;
						box-shadow: none;
					}
					body.vscode-high-contrast #scroll-to-top:hover {
						background-color: #007acc;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						/* Chevron up icon */
						background:url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}

					/** Theming */
					.vscode-light code > div {
						background-color: rgba(220, 220, 220, 0.4);
					}

					.vscode-dark code > div {
						background-color: rgba(10, 10, 10, 0.4);
					}

					.vscode-high-contrast code > div {
						background-color: rgb(0, 0, 0);
					}

					.vscode-high-contrast h1 {
						border-color: rgb(0, 0, 0);
					}

					.vscode-light table > thead > tr > th {
						border-color: rgba(0, 0, 0, 0.69);
					}

					.vscode-dark table > thead > tr > th {
						border-color: rgba(255, 255, 255, 0.69);
					}

					.vscode-light h1,
					.vscode-light hr,
					.vscode-light table > tbody > tr + tr > td {
						border-color: rgba(0, 0, 0, 0.18);
					}

					.vscode-dark h1,
					.vscode-dark hr,
					.vscode-dark table > tbody > tr + tr > td {
						border-color: rgba(255, 255, 255, 0.18);
					}

				</style>
			</head>
			<body>
				<a id="scroll-to-top" role="button" aria-label="scroll to top" href="#"><span class="icon"></span></a>
				${body}
			</body>
		</html>`;
	}

	private openReadme(template: IExtensionEditorTemplate): Promise<IActiveElement> {
		return this.openMarkdown(this.extensionReadme!.get(), localize('noReadme', "No README available."), template);
	}

	private openChangelog(template: IExtensionEditorTemplate): Promise<IActiveElement> {
		return this.openMarkdown(this.extensionChangelog!.get(), localize('noChangelog', "No Changelog available."), template);
	}

	private openContributions(template: IExtensionEditorTemplate): Promise<IActiveElement> {
		const content = $('div', { class: 'subcontent', tabindex: '0' });
		return this.loadContents(() => this.extensionManifest!.get(), template)
			.then(manifest => {
				if (!manifest) {
					return content;
				}

				const scrollableContent = new DomScrollableElement(content, {});

				const layout = () => scrollableContent.scanDomNode();
				const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
				this.contentDisposables.add(toDisposable(removeLayoutParticipant));

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

				scrollableContent.scanDomNode();

				const isEmpty = !renders.some(x => x);
				if (isEmpty) {
					append(content, $('p.nocontent')).textContent = localize('noContributions', "No Contributions");
					append(template.content, content);
				} else {
					append(template.content, scrollableContent.getDomNode());
					this.contentDisposables.add(scrollableContent);
				}
				return content;
			}, () => {
				append(content, $('p.nocontent')).textContent = localize('noContributions', "No Contributions");
				append(template.content, content);
				return content;
			});
	}

	private openDependencies(extension: IExtension, template: IExtensionEditorTemplate): Promise<IActiveElement> {
		if (arrays.isFalsyOrEmpty(extension.dependencies)) {
			append(template.content, $('p.nocontent')).textContent = localize('noDependencies', "No Dependencies");
			return Promise.resolve(template.content);
		}

		const content = $('div', { class: 'subcontent' });
		const scrollableContent = new DomScrollableElement(content, {});
		append(template.content, scrollableContent.getDomNode());
		this.contentDisposables.add(scrollableContent);

		const dependenciesTree = this.instantiationService.createInstance(ExtensionsTree, new ExtensionData(extension, null, extension => extension.dependencies || [], this.extensionsWorkbenchService), content);
		const layout = () => {
			scrollableContent.scanDomNode();
			const scrollDimensions = scrollableContent.getScrollDimensions();
			dependenciesTree.layout(scrollDimensions.height);
		};
		const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
		this.contentDisposables.add(toDisposable(removeLayoutParticipant));

		this.contentDisposables.add(dependenciesTree);
		scrollableContent.scanDomNode();
		return Promise.resolve({ focus() { dependenciesTree.domFocus(); } });
	}

	private openExtensionPack(extension: IExtension, template: IExtensionEditorTemplate): Promise<IActiveElement> {
		const content = $('div', { class: 'subcontent' });
		const scrollableContent = new DomScrollableElement(content, {});
		append(template.content, scrollableContent.getDomNode());
		this.contentDisposables.add(scrollableContent);

		const extensionsPackTree = this.instantiationService.createInstance(ExtensionsTree, new ExtensionData(extension, null, extension => extension.extensionPack || [], this.extensionsWorkbenchService), content);
		const layout = () => {
			scrollableContent.scanDomNode();
			const scrollDimensions = scrollableContent.getScrollDimensions();
			extensionsPackTree.layout(scrollDimensions.height);
		};
		const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
		this.contentDisposables.add(toDisposable(removeLayoutParticipant));

		this.contentDisposables.add(extensionsPackTree);
		scrollableContent.scanDomNode();
		return Promise.resolve({ focus() { extensionsPackTree.domFocus(); } });
	}

	private renderSettings(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const configuration = contributes && contributes.configuration;
		let properties: any = {};
		if (Array.isArray(configuration)) {
			configuration.forEach(config => {
				properties = { ...properties, ...config.properties };
			});
		} else if (configuration) {
			properties = configuration.properties;
		}
		const contrib = properties ? Object.keys(properties) : [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('settings', "Settings ({0})", contrib.length)),
			$('table', undefined,
				$('tr', undefined,
					$('th', undefined, localize('setting name', "Name")),
					$('th', undefined, localize('description', "Description")),
					$('th', undefined, localize('default', "Default"))
				),
				...contrib.map(key => $('tr', undefined,
					$('td', undefined, $('code', undefined, key)),
					$('td', undefined, properties[key].description),
					$('td', undefined, $('code', undefined, `${isUndefined(properties[key].default) ? getDefaultValue(properties[key].type) : properties[key].default}`))
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
			$('summary', { tabindex: '0' }, localize('debuggers', "Debuggers ({0})", contrib.length)),
			$('table', undefined,
				$('tr', undefined,
					$('th', undefined, localize('debugger name', "Name")),
					$('th', undefined, localize('debugger type', "Type")),
				),
				...contrib.map(d => $('tr', undefined,
					$('td', undefined, d.label!),
					$('td', undefined, d.type)))
			)
		);

		append(container, details);
		return true;
	}

	private renderViewContainers(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.viewsContainers || {};

		let viewContainers = Object.keys(contrib).reduce((result, location) => {
			let viewContainersForLocation: IViewContainer[] = contrib[location];
			result.push(...viewContainersForLocation.map(viewContainer => ({ ...viewContainer, location })));
			return result;
		}, [] as Array<{ id: string, title: string, location: string }>);

		if (!viewContainers.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('viewContainers', "View Containers ({0})", viewContainers.length)),
			$('table', undefined,
				$('tr', undefined, $('th', undefined, localize('view container id', "ID")), $('th', undefined, localize('view container title', "Title")), $('th', undefined, localize('view container location', "Where"))),
				...viewContainers.map(viewContainer => $('tr', undefined, $('td', undefined, viewContainer.id), $('td', undefined, viewContainer.title), $('td', undefined, viewContainer.location)))
			)
		);

		append(container, details);
		return true;
	}

	private renderViews(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.views || {};

		let views = Object.keys(contrib).reduce((result, location) => {
			let viewsForLocation: IView[] = contrib[location];
			result.push(...viewsForLocation.map(view => ({ ...view, location })));
			return result;
		}, [] as Array<{ id: string, name: string, location: string }>);

		if (!views.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('views', "Views ({0})", views.length)),
			$('table', undefined,
				$('tr', undefined, $('th', undefined, localize('view id', "ID")), $('th', undefined, localize('view name', "Name")), $('th', undefined, localize('view location', "Where"))),
				...views.map(view => $('tr', undefined, $('td', undefined, view.id), $('td', undefined, view.name), $('td', undefined, view.location)))
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
			$('summary', { tabindex: '0' }, localize('localizations', "Localizations ({0})", localizations.length)),
			$('table', undefined,
				$('tr', undefined, $('th', undefined, localize('localizations language id', "Language Id")), $('th', undefined, localize('localizations language name', "Language Name")), $('th', undefined, localize('localizations localized language name', "Language Name (Localized)"))),
				...localizations.map(localization => $('tr', undefined, $('td', undefined, localization.languageId), $('td', undefined, localization.languageName || ''), $('td', undefined, localization.localizedLanguageName || '')))
			)
		);

		append(container, details);
		return true;
	}

	private renderColorThemes(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.themes || [];

		if (!contrib.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('colorThemes', "Color Themes ({0})", contrib.length)),
			$('ul', undefined, ...contrib.map(theme => $('li', undefined, theme.label)))
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
			$('summary', { tabindex: '0' }, localize('iconThemes', "Icon Themes ({0})", contrib.length)),
			$('ul', undefined, ...contrib.map(theme => $('li', undefined, theme.label)))
		);

		append(container, details);
		return true;
	}

	private renderColors(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): boolean {
		const contributes = manifest.contributes;
		const colors = contributes && contributes.colors;

		if (!(colors && colors.length)) {
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
			result.push($('code', undefined, colorReference));
			return result;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('colors', "Colors ({0})", colors.length)),
			$('table', undefined,
				$('tr', undefined,
					$('th', undefined, localize('colorId', "Id")),
					$('th', undefined, localize('description', "Description")),
					$('th', undefined, localize('defaultDark', "Dark Default")),
					$('th', undefined, localize('defaultLight', "Light Default")),
					$('th', undefined, localize('defaultHC', "High Contrast Default"))
				),
				...colors.map(color => $('tr', undefined,
					$('td', undefined, $('code', undefined, color.id)),
					$('td', undefined, color.description),
					$('td', undefined, ...colorPreview(color.defaults.dark)),
					$('td', undefined, ...colorPreview(color.defaults.light)),
					$('td', undefined, ...colorPreview(color.defaults.highContrast))
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
			$('summary', { tabindex: '0' }, localize('JSON Validation', "JSON Validation ({0})", contrib.length)),
			$('table', undefined,
				$('tr', undefined,
					$('th', undefined, localize('fileMatch', "File Match")),
					$('th', undefined, localize('schema', "Schema"))
				),
				...contrib.map(v => $('tr', undefined,
					$('td', undefined, $('code', undefined, v.fileMatch)),
					$('td', undefined, v.url)
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
			keybindings: [] as ResolvedKeybinding[],
			menus: [] as string[]
		}));

		const byId = arrays.index(commands, c => c.id);

		const menus = contributes && contributes.menus || {};

		Object.keys(menus).forEach(context => {
			menus[context].forEach(menu => {
				let command = byId[menu.command];

				if (command) {
					command.menus.push(context);
				} else {
					command = { id: menu.command, title: '', keybindings: [], menus: [context] };
					byId[command.id] = command;
					commands.push(command);
				}
			});
		});

		const rawKeybindings = contributes && contributes.keybindings ? (Array.isArray(contributes.keybindings) ? contributes.keybindings : [contributes.keybindings]) : [];

		rawKeybindings.forEach(rawKeybinding => {
			const keybinding = this.resolveKeybinding(rawKeybinding);

			if (!keybinding) {
				return;
			}

			let command = byId[rawKeybinding.command];

			if (command) {
				command.keybindings.push(keybinding);
			} else {
				command = { id: rawKeybinding.command, title: '', keybindings: [keybinding], menus: [] };
				byId[command.id] = command;
				commands.push(command);
			}
		});

		if (!commands.length) {
			return false;
		}

		const renderKeybinding = (keybinding: ResolvedKeybinding): HTMLElement => {
			const element = $('');
			new KeybindingLabel(element, OS).set(keybinding);
			return element;
		};

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('commands', "Commands ({0})", commands.length)),
			$('table', undefined,
				$('tr', undefined,
					$('th', undefined, localize('command name', "Name")),
					$('th', undefined, localize('description', "Description")),
					$('th', undefined, localize('keyboard shortcuts', "Keyboard Shortcuts")),
					$('th', undefined, localize('menuContexts', "Menu Contexts"))
				),
				...commands.map(c => $('tr', undefined,
					$('td', undefined, $('code', undefined, c.id)),
					$('td', undefined, c.title),
					$('td', undefined, ...c.keybindings.map(keybinding => renderKeybinding(keybinding))),
					$('td', undefined, ...c.menus.map(context => $('code', undefined, context)))
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

			if (language) {
				language.hasGrammar = true;
			} else {
				language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
				byId[language.id] = language;
				languages.push(language);
			}
		});

		const snippets = contributes && contributes.snippets || [];

		snippets.forEach(snippet => {
			let language = byId[snippet.language];

			if (language) {
				language.hasSnippets = true;
			} else {
				language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
				byId[language.id] = language;
				languages.push(language);
			}
		});

		if (!languages.length) {
			return false;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', { tabindex: '0' }, localize('languages', "Languages ({0})", languages.length)),
			$('table', undefined,
				$('tr', undefined,
					$('th', undefined, localize('language id', "ID")),
					$('th', undefined, localize('language name', "Name")),
					$('th', undefined, localize('file extensions', "File Extensions")),
					$('th', undefined, localize('grammar', "Grammar")),
					$('th', undefined, localize('snippets', "Snippets"))
				),
				...languages.map(l => $('tr', undefined,
					$('td', undefined, l.id),
					$('td', undefined, l.name),
					$('td', undefined, ...join(l.extensions.map(ext => $('code', undefined, ext)), ' ')),
					$('td', undefined, document.createTextNode(l.hasGrammar ? '✔︎' : '—')),
					$('td', undefined, document.createTextNode(l.hasSnippets ? '✔︎' : '—'))
				))
			)
		);

		append(container, details);
		return true;
	}

	private resolveKeybinding(rawKeyBinding: IKeyBinding): ResolvedKeybinding | null {
		let key: string | undefined;

		switch (platform) {
			case 'win32': key = rawKeyBinding.win; break;
			case 'linux': key = rawKeyBinding.linux; break;
			case 'darwin': key = rawKeyBinding.mac; break;
		}

		const keyBinding = KeybindingParser.parseKeybinding(key || rawKeyBinding.key, OS);
		if (keyBinding) {
			return this.keybindingService.resolveKeybinding(keyBinding)[0];

		}
		return null;
	}

	private loadContents<T>(loadingTask: () => CacheResult<T>, template: IExtensionEditorTemplate): Promise<T> {
		addClass(template.content, 'loading');

		const result = loadingTask();
		const onDone = () => removeClass(template.content, 'loading');
		result.promise.then(onDone, onDone);

		this.contentDisposables.add(toDisposable(() => result.dispose()));

		return result.promise;
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
}

class ShowExtensionEditorFindCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const extensionEditor = this.getExtensionEditor(accessor);
		if (extensionEditor) {
			extensionEditor.showFind();
		}
	}

	private getExtensionEditor(accessor: ServicesAccessor): ExtensionEditor | null {
		const activeControl = accessor.get(IEditorService).activeControl as ExtensionEditor;
		if (activeControl instanceof ExtensionEditor) {
			return activeControl;
		}
		return null;
	}
}
const showCommand = new ShowExtensionEditorFindCommand({
	id: 'editor.action.extensioneditor.showfind',
	precondition: ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', ExtensionEditor.ID), ContextKeyExpr.not('editorFocus')),
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
		weight: KeybindingWeight.EditorContrib
	}
});
showCommand.register();
