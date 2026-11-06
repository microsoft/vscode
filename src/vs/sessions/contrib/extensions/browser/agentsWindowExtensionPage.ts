/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IPager } from '../../../../base/common/paging.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionInfo, IExtensionQueryOptions, InstallExtensionResult, InstallOptions, IQueryOptions } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ExtensionEditor } from '../../../../workbench/contrib/extensions/browser/extensionEditor.js';
import { AutoUpdateConfigurationValue, ExtensionState, IExtension, IExtensionsNotification, IExtensionsWorkbenchService, InstallExtensionOptions } from '../../../../workbench/contrib/extensions/common/extensions.js';
import { ExtensionsInput, IExtensionEditorOptions } from '../../../../workbench/contrib/extensions/common/extensionsInput.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { EnablementState, IExtensionManagementServer } from '../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionsStatus } from '../../../../workbench/services/extensions/common/extensions.js';

/**
 * What the Extensions section of Agent Customizations does for the extension pages that it shows, in place of the
 * Extensions view and editor of editor windows.
 */
export interface IAgentsWindowExtensionPageHost {
	/** Shows the page of an extension, such as of a dependency of the extension whose page is shown. */
	openExtensionPage(extension: IExtension, options: IExtensionEditorOptions | undefined): void;
	/** Leaves the page and searches extensions, such as the extensions of a publisher. */
	search(text: string): void;
	/** Uninstalls an extension with `uninstall` like the section does, once users confirm it, and returns whether it did. */
	uninstall(extension: IExtension, uninstall: () => Promise<void>): Promise<boolean>;
	/** Called once installing an extension from its page installed it, which enabled it in the Agents window. */
	didInstall(extension: IExtension): void;
}

/**
 * The extensions workbench service of the extension pages that the Extensions section shows. Opening and searching
 * extensions stays in the section, and like in the section, installing an extension also enables it in the Agents
 * window, and uninstalling one asks users to confirm it first, as that also uninstalls it from VS Code.
 */
export class AgentsWindowExtensionPageWorkbenchService implements IExtensionsWorkbenchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly delegate: IExtensionsWorkbenchService,
		private readonly host: IAgentsWindowExtensionPageHost,
	) { }

	get onChange(): Event<IExtension | undefined> { return this.delegate.onChange; }
	get onReset(): Event<void> { return this.delegate.onReset; }
	get onDidChangeExtensionsNotification(): Event<IExtensionsNotification | undefined> { return this.delegate.onDidChangeExtensionsNotification; }
	get local(): IExtension[] { return this.delegate.local; }
	get installed(): IExtension[] { return this.delegate.installed; }
	get outdated(): IExtension[] { return this.delegate.outdated; }
	get whenInitialized(): Promise<void> { return this.delegate.whenInitialized; }

	async open(extension: IExtension | string, options?: IExtensionEditorOptions): Promise<void> {
		const resolved = typeof extension === 'string'
			? this.delegate.installed.find(installed => areSameExtensions(installed.identifier, { id: extension })) ?? (await this.delegate.getExtensions([{ id: extension }], CancellationToken.None))[0]
			: extension;
		if (!resolved) {
			throw new Error(`Extension not found. ${extension}`);
		}
		this.host.openExtensionPage(resolved, options);
	}

	async openSearch(searchValue: string): Promise<void> {
		// The page searches the categories of extensions like the Extensions view does, which the Marketplace filters without
		// the `@`, while it filters their publishers in the same way.
		this.host.search(searchValue.replace(/@category:/g, 'category:'));
	}

	install(id: string, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation | string): Promise<IExtension>;
	install(vsix: URI, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation | string): Promise<IExtension>;
	install(extension: IExtension, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation | string): Promise<IExtension>;
	async install(arg: string | URI | IExtension, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation | string): Promise<IExtension> {
		if (typeof arg === 'string') {
			return this.delegate.install(arg, installOptions, progressLocation);
		}
		if (URI.isUri(arg)) {
			return this.delegate.install(arg, installOptions, progressLocation);
		}
		// Updating an extension, or installing another version of it, keeps it enabled or disabled.
		if (arg.state !== ExtensionState.Uninstalled) {
			return this.delegate.install(arg, installOptions, progressLocation);
		}
		// Users install extensions here to use them here, and extensions that don't support the Agents window are disabled
		// there by default. The extensions service enables them as it installs them, even if the section closes meanwhile.
		const installed = await this.delegate.install(arg, { ...installOptions, enable: true }, progressLocation);
		this.host.didInstall(installed);
		return installed;
	}

	async uninstall(extension: IExtension): Promise<void> {
		if (!await this.host.uninstall(extension, () => this.delegate.uninstall(extension))) {
			// Like when users cancel uninstalling an extension from all profiles, which the Uninstall action ignores.
			throw new CancellationError();
		}
	}

	queryLocal(server?: IExtensionManagementServer): Promise<IExtension[]> {
		return this.delegate.queryLocal(server);
	}

	queryGallery(token: CancellationToken): Promise<IPager<IExtension>>;
	queryGallery(options: IQueryOptions, token: CancellationToken): Promise<IPager<IExtension>>;
	queryGallery(optionsOrToken: IQueryOptions | CancellationToken, token?: CancellationToken): Promise<IPager<IExtension>> {
		return CancellationToken.isCancellationToken(optionsOrToken)
			? this.delegate.queryGallery(optionsOrToken)
			: this.delegate.queryGallery(optionsOrToken, token ?? CancellationToken.None);
	}

	getExtensions(extensionInfos: IExtensionInfo[], token: CancellationToken): Promise<IExtension[]>;
	getExtensions(extensionInfos: IExtensionInfo[], options: IExtensionQueryOptions, token: CancellationToken): Promise<IExtension[]>;
	getExtensions(extensionInfos: IExtensionInfo[], optionsOrToken: IExtensionQueryOptions | CancellationToken, token?: CancellationToken): Promise<IExtension[]> {
		return CancellationToken.isCancellationToken(optionsOrToken)
			? this.delegate.getExtensions(extensionInfos, optionsOrToken)
			: this.delegate.getExtensions(extensionInfos, optionsOrToken, token ?? CancellationToken.None);
	}

	getResourceExtensions(locations: URI[], isWorkspaceScoped: boolean): Promise<IExtension[]> {
		return this.delegate.getResourceExtensions(locations, isWorkspaceScoped);
	}

	canInstall(extension: IExtension): Promise<true | IMarkdownString> {
		return this.delegate.canInstall(extension);
	}

	installInServer(extension: IExtension, server: IExtensionManagementServer, installOptions?: InstallOptions): Promise<void> {
		return this.delegate.installInServer(extension, server, installOptions);
	}

	downloadVSIX(extension: string, versionKind: 'prerelease' | 'release' | 'any'): Promise<void> {
		return this.delegate.downloadVSIX(extension, versionKind);
	}

	togglePreRelease(extension: IExtension): Promise<void> {
		return this.delegate.togglePreRelease(extension);
	}

	canSetLanguage(extension: IExtension): boolean {
		return this.delegate.canSetLanguage(extension);
	}

	setLanguage(extension: IExtension): Promise<void> {
		return this.delegate.setLanguage(extension);
	}

	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void> {
		// Like the section, changes only apply to the Agents window, which has a dedicated workspace, while the page's Enable
		// and Disable actions would also enable or disable extensions in editor windows.
		switch (enablementState) {
			case EnablementState.EnabledGlobally: enablementState = EnablementState.EnabledWorkspace; break;
			case EnablementState.DisabledGlobally: enablementState = EnablementState.DisabledWorkspace; break;
		}
		return this.delegate.setEnablement(extensions, enablementState);
	}

	isAutoUpdateEnabledFor(extensionOrPublisher: IExtension | string): boolean {
		return this.delegate.isAutoUpdateEnabledFor(extensionOrPublisher);
	}

	updateAutoUpdateEnablementFor(extensionOrPublisher: IExtension | string, enable: boolean): Promise<void> {
		return this.delegate.updateAutoUpdateEnablementFor(extensionOrPublisher, enable);
	}

	shouldRequireConsentToUpdate(extension: IExtension): Promise<string | undefined> {
		return this.delegate.shouldRequireConsentToUpdate(extension);
	}

	updateAutoUpdateForAllExtensions(value: boolean): Promise<void> {
		return this.delegate.updateAutoUpdateForAllExtensions(value);
	}

	getAutoUpdateValue(): AutoUpdateConfigurationValue {
		return this.delegate.getAutoUpdateValue();
	}

	isAutoUpdateDelayed(extension: IExtension): boolean {
		return this.delegate.isAutoUpdateDelayed(extension);
	}

	getAutoUpdateDelayRemaining(extension: IExtension): number {
		return this.delegate.getAutoUpdateDelayRemaining(extension);
	}

	getAutoUpdateDelay(): number {
		return this.delegate.getAutoUpdateDelay();
	}

	checkForUpdates(): Promise<void> {
		return this.delegate.checkForUpdates();
	}

	getExtensionRuntimeStatus(extension: IExtension): IExtensionsStatus | undefined {
		return this.delegate.getExtensionRuntimeStatus(extension);
	}

	updateAll(): Promise<InstallExtensionResult[]> {
		return this.delegate.updateAll();
	}

	updateRunningExtensions(message?: string): Promise<void> {
		return this.delegate.updateRunningExtensions(message);
	}

	getExtensionsNotification(): IExtensionsNotification | undefined {
		return this.delegate.getExtensionsNotification();
	}

	isExtensionIgnoredToSync(extension: IExtension): boolean {
		return this.delegate.isExtensionIgnoredToSync(extension);
	}

	toggleExtensionIgnoredToSync(extension: IExtension): Promise<void> {
		return this.delegate.toggleExtensionIgnoredToSync(extension);
	}

	toggleApplyExtensionToAllProfiles(extension: IExtension): Promise<void> {
		return this.delegate.toggleApplyExtensionToAllProfiles(extension);
	}
}

/**
 * Shows the pages of extensions in the Extensions section of Agent Customizations, with the editor that shows them in
 * editor windows.
 */
export class AgentsWindowExtensionPage extends Disposable {

	readonly element: HTMLElement;
	private readonly editor: ExtensionEditor;
	private readonly input = this._register(new MutableDisposable<ExtensionsInput>());
	private cancellation: CancellationTokenSource | undefined;

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		host: IAgentsWindowExtensionPageHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super();

		this.element = DOM.append(container, DOM.$('.agents-window-extension-page'));
		const pageInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IExtensionsWorkbenchService, new AgentsWindowExtensionPageWorkbenchService(extensionsWorkbenchService, host)],
		)));
		this.editor = this._register(pageInstantiationService.createInstance(ExtensionEditor, group));
		this.editor.create(this.element);
		this._register(toDisposable(() => this.cancellation?.dispose(true)));

		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AgentsWindowExtensionPage', () => this.layout(), DOM.getWindow(container)));
		this._register(resizeObserver.observe(this.element));
	}

	/**
	 * Shows the page of an extension. Focus stays where it is, rather than moving to the page's content once it loads.
	 */
	async show(extension: IExtension, options: IExtensionEditorOptions | undefined): Promise<void> {
		this.cancellation?.dispose(true);
		const cancellation = this.cancellation = new CancellationTokenSource();
		const input = this.input.value = new ExtensionsInput(extension);
		this.editor.setVisible(true);
		await this.editor.setInput(input, { ...options, preserveFocus: true }, {}, cancellation.token);
		this.layout();
	}

	/**
	 * Clears the page, which also releases the webviews that show its content.
	 */
	clear(): void {
		this.cancellation?.dispose(true);
		this.cancellation = undefined;
		this.editor.clearInput();
		this.editor.setVisible(false);
		this.input.clear();
	}

	layout(): void {
		const { clientWidth, clientHeight } = this.element;
		if (clientWidth > 0 && clientHeight > 0) {
			this.editor.layout(new DOM.Dimension(clientWidth, clientHeight));
		}
	}
}
