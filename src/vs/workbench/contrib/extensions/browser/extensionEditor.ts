/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, setParentFlowTo } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { CheckboxActionViewItem } from '../../../../base/browser/ui/toggle/toggle.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import * as arrays from '../../../../base/common/arrays.js';
import { Cache, CacheResult } from '../../../../base/common/cache.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas, matchesScheme } from '../../../../base/common/network.js';
import { language } from '../../../../base/common/platform.js';
import * as semver from '../../../../base/common/semver/semver.js';
import { isUndefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import './media/extensionEditor.css';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IExtensionGalleryService, IGalleryExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionType, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { buttonForeground, buttonHoverBackground, editorBackground, textLinkActiveForeground, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, ICssStyleCollector, IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { ExtensionFeaturesTab } from './extensionFeaturesTab.js';
import {
	ButtonWithDropDownExtensionAction,
	ClearLanguageAction,
	DisableDropDownAction,
	EnableDropDownAction,
	ButtonWithDropdownExtensionActionViewItem, DropDownExtensionAction,
	ExtensionEditorManageExtensionAction,
	ExtensionStatusAction,
	ExtensionStatusLabelAction,
	InstallAnotherVersionAction,
	InstallDropdownAction, InstallingLabelAction,
	LocalInstallAction,
	MigrateDeprecatedExtensionAction,
	ExtensionRuntimeStateAction,
	RemoteInstallAction,
	SetColorThemeAction,
	SetFileIconThemeAction,
	SetLanguageAction,
	SetProductIconThemeAction,
	ToggleAutoUpdateForExtensionAction,
	UninstallAction,
	UpdateAction,
	WebInstallAction,
	TogglePreReleaseExtensionAction,
} from './extensionsActions.js';
import { Delegate } from './extensionsList.js';
import { ExtensionData, ExtensionsGridView, ExtensionsTree, getExtensions } from './extensionsViewer.js';
import { ExtensionRecommendationWidget, ExtensionStatusWidget, ExtensionWidget, InstallCountWidget, RatingsWidget, RemoteBadgeWidget, SponsorWidget, VerifiedPublisherWidget, onClick } from './extensionsWidgets.js';
import { ExtensionContainers, ExtensionEditorTab, ExtensionState, IExtension, IExtensionContainer, IExtensionsWorkbenchService } from '../common/extensions.js';
import { ExtensionsInput, IExtensionEditorOptions } from '../common/extensionsInput.js';
import { IExplorerService } from '../../files/browser/files.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../markdown/browser/markdownDocumentRenderer.js';
import { IWebview, IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from '../../webview/browser/webview.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VIEW_ID as EXPLORER_VIEW_ID } from '../../files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

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
	icon: HTMLImageElement;
	name: HTMLElement;
	preview: HTMLElement;
	builtin: HTMLElement;
	publisher: HTMLElement;
	publisherDisplayName: HTMLElement;
	resource: HTMLElement;
	installCount: HTMLElement;
	rating: HTMLElement;
	description: HTMLElement;
	actionsAndStatusContainer: HTMLElement;
	extensionActionBar: ActionBar;
	navbar: NavBar;
	content: HTMLElement;
	header: HTMLElement;
	extension: IExtension;
	gallery: IGalleryExtension | null;
	manifest: IExtensionManifest | null;
}

const enum WebviewIndex {
	Readme,
	Changelog
}

const CONTEXT_SHOW_PRE_RELEASE_VERSION = new RawContextKey<boolean>('showPreReleaseVersion', false);

abstract class ExtensionWithDifferentGalleryVersionWidget extends ExtensionWidget {
	private _gallery: IGalleryExtension | null = null;
	get gallery(): IGalleryExtension | null { return this._gallery; }
	set gallery(gallery: IGalleryExtension | null) {
		if (this.extension && gallery && !areSameExtensions(this.extension.identifier, gallery.identifier)) {
			return;
		}
		this._gallery = gallery;
		this.update();
	}
}

class VersionWidget extends ExtensionWithDifferentGalleryVersionWidget {
	private readonly element: HTMLElement;
	constructor(
		container: HTMLElement,
		hoverService: IHoverService
	) {
		super();
		this.element = append(container, $('code.version'));
		this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, localize('extension version', "Extension Version")));
		this.render();
	}
	render(): void {
		if (!this.extension || !semver.valid(this.extension.version)) {
			return;
		}
		this.element.textContent = `v${this.gallery?.version ?? this.extension.version}${this.extension.isPreReleaseVersion ? ' (pre-release)' : ''}`;
	}
}

export class ExtensionEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.extension';

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IScopedContextKeyService>());
	private template: IExtensionEditorTemplate | undefined;

	private extensionReadme: Cache<string> | null;
	private extensionChangelog: Cache<string> | null;
	private extensionManifest: Cache<IExtensionManifest | null> | null;

	// Some action bar items use a webview whose vertical scroll position we track in this map
	private initialScrollProgress: Map<WebviewIndex, number> = new Map();

	// Spot when an ExtensionEditor instance gets reused for a different extension, in which case the vertical scroll positions must be zeroed
	private currentIdentifier: string = '';

	private layoutParticipants: ILayoutParticipant[] = [];
	private readonly contentDisposables = this._register(new DisposableStore());
	private readonly transientDisposables = this._register(new DisposableStore());
	private activeElement: IActiveElement | null = null;
	private dimension: Dimension | undefined;

	private showPreReleaseVersionContextKey: IContextKey<boolean> | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IThemeService themeService: IThemeService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IExtensionRecommendationsService private readonly extensionRecommendationsService: IExtensionRecommendationsService,
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IViewsService private readonly viewsService: IViewsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(ExtensionEditor.ID, group, telemetryService, themeService, storageService);
		this.extensionReadme = null;
		this.extensionChangelog = null;
		this.extensionManifest = null;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService.value;
	}

	protected createEditor(parent: HTMLElement): void {
		const root = append(parent, $('.extension-editor'));
		this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
		this._scopedContextKeyService.value.createKey('inExtensionEditor', true);
		this.showPreReleaseVersionContextKey = CONTEXT_SHOW_PRE_RELEASE_VERSION.bindTo(this._scopedContextKeyService.value);

		root.tabIndex = 0; // this is required for the focus tracker on the editor
		root.style.outline = 'none';
		root.setAttribute('role', 'document');
		const header = append(root, $('.header'));

		const iconContainer = append(header, $('.icon-container'));
		const icon = append(iconContainer, $<HTMLImageElement>('img.icon', { draggable: false, alt: '' }));
		const remoteBadge = this.instantiationService.createInstance(RemoteBadgeWidget, iconContainer, true);

		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		const name = append(title, $('span.name.clickable', { role: 'heading', tabIndex: 0 }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), name, localize('name', "Extension name")));
		const versionWidget = new VersionWidget(title, this.hoverService);

		const preview = append(title, $('span.preview'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), preview, localize('preview', "Preview")));
		preview.textContent = localize('preview', "Preview");

		const builtin = append(title, $('span.builtin'));
		builtin.textContent = localize('builtin', "Built-in");

		const subtitle = append(details, $('.subtitle'));
		const publisher = append(append(subtitle, $('.subtitle-entry')), $('.publisher.clickable', { tabIndex: 0 }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), publisher, localize('publisher', "Publisher")));
		publisher.setAttribute('role', 'button');
		const publisherDisplayName = append(publisher, $('.publisher-name'));
		const verifiedPublisherWidget = this.instantiationService.createInstance(VerifiedPublisherWidget, append(publisher, $('.verified-publisher')), false);

		const resource = append(append(subtitle, $('.subtitle-entry.resource')), $('', { tabIndex: 0 }));
		resource.setAttribute('role', 'button');

		const installCount = append(append(subtitle, $('.subtitle-entry')), $('span.install', { tabIndex: 0 }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), installCount, localize('install count', "Install count")));
		const installCountWidget = this.instantiationService.createInstance(InstallCountWidget, installCount, false);

		const rating = append(append(subtitle, $('.subtitle-entry')), $('span.rating.clickable', { tabIndex: 0 }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), rating, localize('rating', "Rating")));
		rating.setAttribute('role', 'link'); // #132645
		const ratingsWidget = this.instantiationService.createInstance(RatingsWidget, rating, false);

		const sponsorWidget = this.instantiationService.createInstance(SponsorWidget, append(subtitle, $('.subtitle-entry')));

		const widgets: ExtensionWidget[] = [
			remoteBadge,
			versionWidget,
			verifiedPublisherWidget,
			installCountWidget,
			ratingsWidget,
			sponsorWidget,
		];

		const description = append(details, $('.description'));

		const installAction = this.instantiationService.createInstance(InstallDropdownAction);
		const actions = [
			this.instantiationService.createInstance(ExtensionRuntimeStateAction),
			this.instantiationService.createInstance(ExtensionStatusLabelAction),
			this.instantiationService.createInstance(UpdateAction, true),
			this.instantiationService.createInstance(SetColorThemeAction),
			this.instantiationService.createInstance(SetFileIconThemeAction),
			this.instantiationService.createInstance(SetProductIconThemeAction),
			this.instantiationService.createInstance(SetLanguageAction),
			this.instantiationService.createInstance(ClearLanguageAction),

			this.instantiationService.createInstance(EnableDropDownAction),
			this.instantiationService.createInstance(DisableDropDownAction),
			this.instantiationService.createInstance(RemoteInstallAction, false),
			this.instantiationService.createInstance(LocalInstallAction),
			this.instantiationService.createInstance(WebInstallAction),
			installAction,
			this.instantiationService.createInstance(InstallingLabelAction),
			this.instantiationService.createInstance(ButtonWithDropDownExtensionAction, 'extensions.uninstall', UninstallAction.UninstallClass, [
				[
					this.instantiationService.createInstance(MigrateDeprecatedExtensionAction, false),
					this.instantiationService.createInstance(UninstallAction),
					this.instantiationService.createInstance(InstallAnotherVersionAction, null, true),
				]
			]),
			this.instantiationService.createInstance(TogglePreReleaseExtensionAction),
			this.instantiationService.createInstance(ToggleAutoUpdateForExtensionAction),
			new ExtensionEditorManageExtensionAction(this.scopedContextKeyService || this.contextKeyService, this.instantiationService),
		];

		const actionsAndStatusContainer = append(details, $('.actions-status-container'));
		const extensionActionBar = this._register(new ActionBar(actionsAndStatusContainer, {
			actionViewItemProvider: (action: IAction, options) => {
				if (action instanceof DropDownExtensionAction) {
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
				if (action instanceof ToggleAutoUpdateForExtensionAction) {
					return new CheckboxActionViewItem(undefined, action, { ...options, icon: true, label: true, checkboxStyles: defaultCheckboxStyles });
				}
				return undefined;
			},
			focusOnlyEnabledItems: true
		}));

		extensionActionBar.push(actions, { icon: true, label: true });
		extensionActionBar.setFocusable(true);
		// update focusable elements when the enablement of an action changes
		this._register(Event.any(...actions.map(a => Event.filter(a.onDidChange, e => e.enabled !== undefined)))(() => {
			extensionActionBar.setFocusable(false);
			extensionActionBar.setFocusable(true);
		}));

		const otherExtensionContainers: IExtensionContainer[] = [];
		const extensionStatusAction = this.instantiationService.createInstance(ExtensionStatusAction);
		const extensionStatusWidget = this._register(this.instantiationService.createInstance(ExtensionStatusWidget, append(actionsAndStatusContainer, $('.status')), extensionStatusAction));

		otherExtensionContainers.push(extensionStatusAction, new class extends ExtensionWidget {
			render() {
				actionsAndStatusContainer.classList.toggle('list-layout', this.extension?.state === ExtensionState.Installed);
			}
		}());

		const recommendationWidget = this.instantiationService.createInstance(ExtensionRecommendationWidget, append(details, $('.recommendation')));
		widgets.push(recommendationWidget);

		this._register(Event.any(extensionStatusWidget.onDidRender, recommendationWidget.onDidRender)(() => {
			if (this.dimension) {
				this.layout(this.dimension);
			}
		}));

		const extensionContainers: ExtensionContainers = this.instantiationService.createInstance(ExtensionContainers, [...actions, ...widgets, ...otherExtensionContainers]);
		for (const disposable of [...actions, ...widgets, ...otherExtensionContainers, extensionContainers]) {
			this._register(disposable);
		}

		const onError = Event.chain(extensionActionBar.onDidRun, $ =>
			$.map(({ error }) => error)
				.filter(error => !!error)
		);

		this._register(onError(this.onError, this));

		const body = append(root, $('.body'));
		const navbar = new NavBar(body);

		const content = append(body, $('.content'));
		content.id = generateUuid(); // An id is needed for the webview parent flow to

		this.template = {
			builtin,
			content,
			description,
			header,
			icon,
			iconContainer,
			installCount,
			name,
			navbar,
			preview,
			publisher,
			publisherDisplayName,
			resource,
			rating,
			actionsAndStatusContainer,
			extensionActionBar,
			set extension(extension: IExtension) {
				extensionContainers.extension = extension;
			},
			set gallery(gallery: IGalleryExtension | null) {
				versionWidget.gallery = gallery;
			},
			set manifest(manifest: IExtensionManifest | null) {
				installAction.manifest = manifest;
			}
		};
	}

	override async setInput(input: ExtensionsInput, options: IExtensionEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.updatePreReleaseVersionContext();
		if (this.template) {
			await this.render(input.extension, this.template, !!options?.preserveFocus);
		}
	}

	override setOptions(options: IExtensionEditorOptions | undefined): void {
		const currentOptions: IExtensionEditorOptions | undefined = this.options;
		super.setOptions(options);
		this.updatePreReleaseVersionContext();

		if (this.input && this.template && currentOptions?.showPreReleaseVersion !== options?.showPreReleaseVersion) {
			this.render((this.input as ExtensionsInput).extension, this.template, !!options?.preserveFocus);
			return;
		}

		if (options?.tab) {
			this.template?.navbar.switch(options.tab);
		}

	}

	private updatePreReleaseVersionContext(): void {
		let showPreReleaseVersion = (<IExtensionEditorOptions | undefined>this.options)?.showPreReleaseVersion;
		if (isUndefined(showPreReleaseVersion)) {
			showPreReleaseVersion = !!(<ExtensionsInput>this.input).extension.gallery?.properties.isPreReleaseVersion;
		}
		this.showPreReleaseVersionContextKey?.set(showPreReleaseVersion);
	}

	async openTab(tab: ExtensionEditorTab): Promise<void> {
		if (!this.input || !this.template) {
			return;
		}
		if (this.template.navbar.switch(tab)) {
			return;
		}
		// Fallback to Readme tab if ExtensionPack tab does not exist
		if (tab === ExtensionEditorTab.ExtensionPack) {
			this.template.navbar.switch(ExtensionEditorTab.Readme);
		}
	}

	private async getGalleryVersionToShow(extension: IExtension, preRelease?: boolean): Promise<IGalleryExtension | null> {
		if (extension.resourceExtension) {
			return null;
		}
		if (extension.local?.source === 'resource') {
			return null;
		}
		if (isUndefined(preRelease)) {
			return null;
		}
		if (preRelease === extension.gallery?.properties.isPreReleaseVersion) {
			return null;
		}
		if (preRelease && !extension.hasPreReleaseVersion) {
			return null;
		}
		if (!preRelease && !extension.hasReleaseVersion) {
			return null;
		}
		return (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease, hasPreRelease: extension.hasPreReleaseVersion }], CancellationToken.None))[0] || null;
	}

	private async render(extension: IExtension, template: IExtensionEditorTemplate, preserveFocus: boolean): Promise<void> {
		this.activeElement = null;
		this.transientDisposables.clear();

		const token = this.transientDisposables.add(new CancellationTokenSource()).token;

		const gallery = await this.getGalleryVersionToShow(extension, (this.options as IExtensionEditorOptions)?.showPreReleaseVersion);
		if (token.isCancellationRequested) {
			return;
		}

		this.extensionReadme = new Cache(() => gallery ? this.extensionGalleryService.getReadme(gallery, token) : extension.getReadme(token));
		this.extensionChangelog = new Cache(() => gallery ? this.extensionGalleryService.getChangelog(gallery, token) : extension.getChangelog(token));
		this.extensionManifest = new Cache(() => gallery ? this.extensionGalleryService.getManifest(gallery, token) : extension.getManifest(token));

		template.extension = extension;
		template.gallery = gallery;
		template.manifest = null;

		this.transientDisposables.add(addDisposableListener(template.icon, 'error', () => template.icon.src = extension.iconUrlFallback, { once: true }));
		template.icon.src = extension.iconUrl;

		template.name.textContent = extension.displayName;
		template.name.classList.toggle('clickable', !!extension.url);
		template.name.classList.toggle('deprecated', !!extension.deprecationInfo);
		template.preview.style.display = extension.preview ? 'inherit' : 'none';
		template.builtin.style.display = extension.isBuiltin ? 'inherit' : 'none';

		template.description.textContent = extension.description;

		// subtitle
		template.publisher.classList.toggle('clickable', !!extension.url);
		template.publisherDisplayName.textContent = extension.publisherDisplayName;
		template.publisher.parentElement?.classList.toggle('hide', !!extension.resourceExtension || extension.local?.source === 'resource');

		const location = extension.resourceExtension?.location ?? (extension.local?.source === 'resource' ? extension.local?.location : undefined);
		template.resource.parentElement?.classList.toggle('hide', !location);
		if (location) {
			const workspaceFolder = this.contextService.getWorkspaceFolder(location);
			if (workspaceFolder && extension.isWorkspaceScoped) {
				template.resource.parentElement?.classList.add('clickable');
				this.transientDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), template.resource, this.uriIdentityService.extUri.relativePath(workspaceFolder.uri, location)));
				template.resource.textContent = localize('workspace extension', "Workspace Extension");
				this.transientDisposables.add(onClick(template.resource, () => {
					this.viewsService.openView(EXPLORER_VIEW_ID, true).then(() => this.explorerService.select(location, true));
				}));
			} else {
				template.resource.parentElement?.classList.remove('clickable');
				this.transientDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), template.resource, location.path));
				template.resource.textContent = localize('local extension', "Local Extension");
			}
		}

		template.installCount.parentElement?.classList.toggle('hide', !extension.url);
		template.rating.parentElement?.classList.toggle('hide', !extension.url);
		template.rating.classList.toggle('clickable', !!extension.url);

		if (extension.url) {
			this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(extension.url!))));
			this.transientDisposables.add(onClick(template.rating, () => this.openerService.open(URI.parse(`${extension.url}&ssr=false#review-details`))));
			this.transientDisposables.add(onClick(template.publisher, () => this.extensionsWorkbenchService.openSearch(`publisher:"${extension.publisherDisplayName}"`)));
		}

		const manifest = await this.extensionManifest.get().promise;
		if (token.isCancellationRequested) {
			return;
		}

		if (manifest) {
			template.manifest = manifest;
		}

		this.renderNavbar(extension, manifest, template, preserveFocus);

		// report telemetry
		const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
		let recommendationsData = {};
		if (extRecommendations[extension.identifier.id.toLowerCase()]) {
			recommendationsData = { recommendationReason: extRecommendations[extension.identifier.id.toLowerCase()].reasonId };
		}
		/* __GDPR__
		"extensionGallery:openExtension" : {
			"owner": "sandy081",
			"recommendationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
		*/
		this.telemetryService.publicLog('extensionGallery:openExtension', { ...extension.telemetryData, ...recommendationsData });

	}

	private renderNavbar(extension: IExtension, manifest: IExtensionManifest | null, template: IExtensionEditorTemplate, preserveFocus: boolean): void {
		template.content.innerText = '';
		template.navbar.clear();

		if (this.currentIdentifier !== extension.identifier.id) {
			this.initialScrollProgress.clear();
			this.currentIdentifier = extension.identifier.id;
		}

		template.navbar.push(ExtensionEditorTab.Readme, localize('details', "Details"), localize('detailstooltip', "Extension details, rendered from the extension's 'README.md' file"));
		if (manifest) {
			template.navbar.push(ExtensionEditorTab.Features, localize('features', "Features"), localize('featurestooltip', "Lists features contributed by this extension"));
		}
		if (extension.hasChangelog()) {
			template.navbar.push(ExtensionEditorTab.Changelog, localize('changelog', "Changelog"), localize('changelogtooltip', "Extension update history, rendered from the extension's 'CHANGELOG.md' file"));
		}
		if (extension.dependencies.length) {
			template.navbar.push(ExtensionEditorTab.Dependencies, localize('dependencies', "Dependencies"), localize('dependenciestooltip', "Lists extensions this extension depends on"));
		}
		if (manifest && manifest.extensionPack?.length && !this.shallRenderAsExtensionPack(manifest)) {
			template.navbar.push(ExtensionEditorTab.ExtensionPack, localize('extensionpack', "Extension Pack"), localize('extensionpacktooltip', "Lists extensions those will be installed together with this extension"));
		}

		if ((<IExtensionEditorOptions | undefined>this.options)?.tab) {
			template.navbar.switch((<IExtensionEditorOptions>this.options).tab!);
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

	private onNavbarChange(extension: IExtension, { id, focus }: { id: string | null; focus: boolean }, template: IExtensionEditorTemplate): void {
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

	private open(id: string, extension: IExtension, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		switch (id) {
			case ExtensionEditorTab.Readme: return this.openDetails(extension, template, token);
			case ExtensionEditorTab.Features: return this.openFeatures(template, token);
			case ExtensionEditorTab.Changelog: return this.openChangelog(extension, template, token);
			case ExtensionEditorTab.Dependencies: return this.openExtensionDependencies(extension, template, token);
			case ExtensionEditorTab.ExtensionPack: return this.openExtensionPack(extension, template, token);
		}
		return Promise.resolve(null);
	}

	private async openMarkdown(extension: IExtension, cacheResult: CacheResult<string>, noContentCopy: string, container: HTMLElement, webviewIndex: WebviewIndex, title: string, token: CancellationToken): Promise<IActiveElement | null> {
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
				if (matchesScheme(link, Schemas.command) && extension.type === ExtensionType.System) {
					this.openerService.open(link, { allowCommands: true });
				}
			}));

			return webview;
		} catch (e) {
			const p = append(container, $('p.nocontent'));
			p.textContent = noContentCopy;
			return p;
		}
	}

	private async renderMarkdown(extension: IExtension, cacheResult: CacheResult<string>, container: HTMLElement, token?: CancellationToken): Promise<string> {
		const contents = await this.loadContents(() => cacheResult, container);
		if (token?.isCancellationRequested) {
			return '';
		}

		const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, { shouldSanitize: extension.type !== ExtensionType.System, token });
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

	private async openDetails(extension: IExtension, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		const details = append(template.content, $('.details'));
		const readmeContainer = append(details, $('.readme-container'));
		const additionalDetailsContainer = append(details, $('.additional-details-container'));

		const layout = () => details.classList.toggle('narrow', this.dimension && this.dimension.width < 500);
		layout();
		this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));

		let activeElement: IActiveElement | null = null;
		const manifest = await this.extensionManifest!.get().promise;
		if (manifest && manifest.extensionPack?.length && this.shallRenderAsExtensionPack(manifest)) {
			activeElement = await this.openExtensionPackReadme(extension, manifest, readmeContainer, token);
		} else {
			activeElement = await this.openMarkdown(extension, this.extensionReadme!.get(), localize('noReadme', "No README available."), readmeContainer, WebviewIndex.Readme, localize('Readme title', "Readme"), token);
		}

		this.renderAdditionalDetails(additionalDetailsContainer, extension);
		return activeElement;
	}

	private shallRenderAsExtensionPack(manifest: IExtensionManifest): boolean {
		return !!(manifest.categories?.some(category => category.toLowerCase() === 'extension packs'));
	}

	private async openExtensionPackReadme(extension: IExtension, manifest: IExtensionManifest, container: HTMLElement, token: CancellationToken): Promise<IActiveElement | null> {
		if (token.isCancellationRequested) {
			return Promise.resolve(null);
		}

		const extensionPackReadme = append(container, $('div', { class: 'extension-pack-readme' }));
		extensionPackReadme.style.margin = '0 auto';
		extensionPackReadme.style.maxWidth = '882px';

		const extensionPack = append(extensionPackReadme, $('div', { class: 'extension-pack' }));
		if (manifest.extensionPack!.length <= 3) {
			extensionPackReadme.classList.add('one-row');
		} else if (manifest.extensionPack!.length <= 6) {
			extensionPackReadme.classList.add('two-rows');
		} else if (manifest.extensionPack!.length <= 9) {
			extensionPackReadme.classList.add('three-rows');
		} else {
			extensionPackReadme.classList.add('more-rows');
		}

		const extensionPackHeader = append(extensionPack, $('div.header'));
		extensionPackHeader.textContent = localize('extension pack', "Extension Pack ({0})", manifest.extensionPack!.length);
		const extensionPackContent = append(extensionPack, $('div', { class: 'extension-pack-content' }));
		extensionPackContent.setAttribute('tabindex', '0');
		append(extensionPack, $('div.footer'));
		const readmeContent = append(extensionPackReadme, $('div.readme-content'));

		await Promise.all([
			this.renderExtensionPack(manifest, extensionPackContent, token),
			this.openMarkdown(extension, this.extensionReadme!.get(), localize('noReadme', "No README available."), readmeContent, WebviewIndex.Readme, localize('Readme title', "Readme"), token),
		]);

		return { focus: () => extensionPackContent.focus() };
	}

	private renderAdditionalDetails(container: HTMLElement, extension: IExtension): void {
		const content = $('div', { class: 'additional-details-content', tabindex: '0' });
		const scrollableContent = new DomScrollableElement(content, {});
		const layout = () => scrollableContent.scanDomNode();
		const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
		this.contentDisposables.add(toDisposable(removeLayoutParticipant));
		this.contentDisposables.add(scrollableContent);

		this.renderCategories(content, extension);
		this.renderExtensionResources(content, extension);
		this.renderMoreInfo(content, extension);

		append(container, scrollableContent.getDomNode());
		scrollableContent.scanDomNode();
	}

	private renderCategories(container: HTMLElement, extension: IExtension): void {
		if (extension.categories.length) {
			const categoriesContainer = append(container, $('.categories-container.additional-details-element'));
			append(categoriesContainer, $('.additional-details-title', undefined, localize('categories', "Categories")));
			const categoriesElement = append(categoriesContainer, $('.categories'));
			for (const category of extension.categories) {
				this.transientDisposables.add(onClick(append(categoriesElement, $('span.category', { tabindex: '0' }, category)),
					() => this.extensionsWorkbenchService.openSearch(`@category:"${category}"`)));
			}
		}
	}

	private renderExtensionResources(container: HTMLElement, extension: IExtension): void {
		const resources: [string, URI][] = [];
		if (extension.url) {
			resources.push([localize('Marketplace', "Marketplace"), URI.parse(extension.url)]);
		}
		if (extension.url && extension.supportUrl) {
			try {
				resources.push([localize('issues', "Issues"), URI.parse(extension.supportUrl)]);
			} catch (error) {/* Ignore */ }
		}
		if (extension.repository) {
			try {
				resources.push([localize('repository', "Repository"), URI.parse(extension.repository)]);
			} catch (error) {/* Ignore */ }
		}
		if (extension.url && extension.licenseUrl) {
			try {
				resources.push([localize('license', "License"), URI.parse(extension.licenseUrl)]);
			} catch (error) {/* Ignore */ }
		}
		if (extension.publisherUrl) {
			resources.push([extension.publisherDisplayName, extension.publisherUrl]);
		}
		if (resources.length || extension.publisherSponsorLink) {
			const extensionResourcesContainer = append(container, $('.resources-container.additional-details-element'));
			append(extensionResourcesContainer, $('.additional-details-title', undefined, localize('resources', "Resources")));
			const resourcesElement = append(extensionResourcesContainer, $('.resources'));
			for (const [label, uri] of resources) {
				const resource = append(resourcesElement, $('a.resource', { tabindex: '0' }, label));
				this.transientDisposables.add(onClick(resource, () => this.openerService.open(uri)));
				this.transientDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), resource, uri.toString()));
			}
		}
	}

	private renderMoreInfo(container: HTMLElement, extension: IExtension): void {
		const gallery = extension.gallery;
		const moreInfoContainer = append(container, $('.more-info-container.additional-details-element'));
		append(moreInfoContainer, $('.additional-details-title', undefined, localize('Marketplace Info', "More Info")));
		const moreInfo = append(moreInfoContainer, $('.more-info'));
		const toDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}, ${date.toLocaleTimeString(language, { hourCycle: 'h23' })}`;
		if (gallery) {
			append(moreInfo,
				$('.more-info-entry', undefined,
					$('div', undefined, localize('published', "Published")),
					$('div', undefined, toDateString(new Date(gallery.releaseDate)))
				),
				$('.more-info-entry', undefined,
					$('div', undefined, localize('last released', "Last released")),
					$('div', undefined, toDateString(new Date(gallery.lastUpdated)))
				)
			);
		}
		if (extension.local && extension.local.installedTimestamp) {
			append(moreInfo,
				$('.more-info-entry', undefined,
					$('div', undefined, localize('last updated', "Last updated")),
					$('div', undefined, toDateString(new Date(extension.local.installedTimestamp)))
				)
			);
		}
		append(moreInfo,
			$('.more-info-entry', undefined,
				$('div', undefined, localize('id', "Identifier")),
				$('code', undefined, extension.identifier.id)
			));
	}

	private openChangelog(extension: IExtension, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		return this.openMarkdown(extension, this.extensionChangelog!.get(), localize('noChangelog', "No Changelog available."), template.content, WebviewIndex.Changelog, localize('Changelog title', "Changelog"), token);
	}

	private async openFeatures(template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		const manifest = await this.loadContents(() => this.extensionManifest!.get(), template.content);
		if (token.isCancellationRequested) {
			return null;
		}
		if (!manifest) {
			return null;
		}

		const extensionFeaturesTab = this.contentDisposables.add(this.instantiationService.createInstance(ExtensionFeaturesTab, manifest, (<IExtensionEditorOptions | undefined>this.options)?.feature));
		const layout = () => extensionFeaturesTab.layout(template.content.clientHeight, template.content.clientWidth);
		const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
		this.contentDisposables.add(toDisposable(removeLayoutParticipant));
		append(template.content, extensionFeaturesTab.domNode);
		layout();
		return extensionFeaturesTab.domNode;
	}

	private openExtensionDependencies(extension: IExtension, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		if (token.isCancellationRequested) {
			return Promise.resolve(null);
		}

		if (arrays.isFalsyOrEmpty(extension.dependencies)) {
			append(template.content, $('p.nocontent')).textContent = localize('noDependencies', "No Dependencies");
			return Promise.resolve(template.content);
		}

		const content = $('div', { class: 'subcontent' });
		const scrollableContent = new DomScrollableElement(content, {});
		append(template.content, scrollableContent.getDomNode());
		this.contentDisposables.add(scrollableContent);

		const dependenciesTree = this.instantiationService.createInstance(ExtensionsTree,
			new ExtensionData(extension, null, extension => extension.dependencies || [], this.extensionsWorkbenchService), content,
			{
				listBackground: editorBackground
			});
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

	private async openExtensionPack(extension: IExtension, template: IExtensionEditorTemplate, token: CancellationToken): Promise<IActiveElement | null> {
		if (token.isCancellationRequested) {
			return Promise.resolve(null);
		}
		const manifest = await this.loadContents(() => this.extensionManifest!.get(), template.content);
		if (token.isCancellationRequested) {
			return null;
		}
		if (!manifest) {
			return null;
		}
		return this.renderExtensionPack(manifest, template.content, token);
	}

	private async renderExtensionPack(manifest: IExtensionManifest, parent: HTMLElement, token: CancellationToken): Promise<IActiveElement | null> {
		if (token.isCancellationRequested) {
			return null;
		}

		const content = $('div', { class: 'subcontent' });
		const scrollableContent = new DomScrollableElement(content, { useShadows: false });
		append(parent, scrollableContent.getDomNode());

		const extensionsGridView = this.instantiationService.createInstance(ExtensionsGridView, content, new Delegate());
		const extensions: IExtension[] = await getExtensions(manifest.extensionPack!, this.extensionsWorkbenchService);
		extensionsGridView.setExtensions(extensions);
		scrollableContent.scanDomNode();

		this.contentDisposables.add(scrollableContent);
		this.contentDisposables.add(extensionsGridView);
		this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout: () => scrollableContent.scanDomNode() })));

		return content;
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

const contextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', ExtensionEditor.ID), EditorContextKeys.focus.toNegated());
registerAction2(class ShowExtensionEditorFindAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.extensioneditor.showfind',
			title: localize('find', "Find"),
			keybinding: {
				when: contextKeyExpr,
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF,
			}
		});
	}
	run(accessor: ServicesAccessor): any {
		const extensionEditor = getExtensionEditor(accessor);
		extensionEditor?.showFind();
	}
});

registerAction2(class StartExtensionEditorFindNextAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.extensioneditor.findNext',
			title: localize('find next', "Find Next"),
			keybinding: {
				when: ContextKeyExpr.and(
					contextKeyExpr,
					KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
	run(accessor: ServicesAccessor): any {
		const extensionEditor = getExtensionEditor(accessor);
		extensionEditor?.runFindAction(false);
	}
});

registerAction2(class StartExtensionEditorFindPreviousAction extends Action2 {
	constructor() {
		super({
			id: 'editor.action.extensioneditor.findPrevious',
			title: localize('find previous', "Find Previous"),
			keybinding: {
				when: ContextKeyExpr.and(
					contextKeyExpr,
					KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
	run(accessor: ServicesAccessor): any {
		const extensionEditor = getExtensionEditor(accessor);
		extensionEditor?.runFindAction(true);
	}
});

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .extension-editor .content .feature-contributions a { color: ${link}; }`);
	}

	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource:hover,
			.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource:active { color: ${activeLink}; }`);
		collector.addRule(`.monaco-workbench .extension-editor .content .feature-contributions a:hover,
			.monaco-workbench .extension-editor .content .feature-contributions a:active { color: ${activeLink}; }`);
	}

	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .categories-container > .categories > .category:hover { background-color: ${buttonHoverBackgroundColor}; border-color: ${buttonHoverBackgroundColor}; }`);
		collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .tags-container > .tags > .tag:hover { background-color: ${buttonHoverBackgroundColor}; border-color: ${buttonHoverBackgroundColor}; }`);
	}

	const buttonForegroundColor = theme.getColor(buttonForeground);
	if (buttonForegroundColor) {
		collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .categories-container > .categories > .category:hover { color: ${buttonForegroundColor}; }`);
		collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .tags-container > .tags > .tag:hover { color: ${buttonForegroundColor}; }`);
	}

});

function getExtensionEditor(accessor: ServicesAccessor): ExtensionEditor | null {
	const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
	if (activeEditorPane instanceof ExtensionEditor) {
		return activeEditorPane;
	}
	return null;
}
