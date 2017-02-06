/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { readFile } from 'vs/base/node/pfs';
import * as semver from 'semver';
import * as path from 'path';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { index } from 'vs/base/common/arrays';
import { LinkedMap as Map } from 'vs/base/common/map';
import { assign } from 'vs/base/common/objects';
import { isUUID } from 'vs/base/common/uuid';
import { ThrottledDelayer } from 'vs/base/common/async';
import { isPromiseCanceledError, onUnexpectedError, canceled } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IPager, mapPager, singlePagePager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension, IQueryOptions, IExtensionManifest,
	InstallExtensionEvent, DidInstallExtensionEvent, LocalExtensionType, DidUninstallExtensionEvent, IExtensionEnablementService, IExtensionTipsService
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from 'vs/platform/extensionManagement/common/extensionTelemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IChoiceService, IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { IExtension, IExtensionDependencies, ExtensionState, IExtensionsWorkbenchService, IExtensionsConfiguration, ConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IURLService } from 'vs/platform/url/common/url';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import product from 'vs/platform/node/product';

interface IExtensionStateProvider {
	(extension: Extension): ExtensionState;
}

class Extension implements IExtension {

	public disabledGlobally = false;
	public disabledForWorkspace = false;

	constructor(
		private galleryService: IExtensionGalleryService,
		private stateProvider: IExtensionStateProvider,
		public local: ILocalExtension,
		public gallery: IGalleryExtension = null
	) { }

	get type(): LocalExtensionType {
		return this.local ? this.local.type : null;
	}

	get name(): string {
		return this.gallery ? this.gallery.name : this.local.manifest.name;
	}

	get displayName(): string {
		if (this.gallery) {
			return this.gallery.displayName || this.gallery.name;
		}

		return this.local.manifest.displayName || this.local.manifest.name;
	}

	get identifier(): string {
		return `${this.publisher}.${this.name}`;
	}

	get publisher(): string {
		return this.gallery ? this.gallery.publisher : this.local.manifest.publisher;
	}

	get publisherDisplayName(): string {
		if (this.gallery) {
			return this.gallery.publisherDisplayName || this.gallery.publisher;
		}

		if (this.local.metadata && this.local.metadata.publisherDisplayName) {
			return this.local.metadata.publisherDisplayName;
		}

		return this.local.manifest.publisher;
	}

	get version(): string {
		return this.local ? this.local.manifest.version : this.gallery.version;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.version : this.local.manifest.version;
	}

	get description(): string {
		return this.gallery ? this.gallery.description : this.local.manifest.description;
	}

	get url(): string {
		if (!product.extensionsGallery) {
			return null;
		}

		return `${product.extensionsGallery.itemUrl}?itemName=${this.publisher}.${this.name}`;
	}

	get iconUrl(): string {
		return this.galleryIconUrl || this.localIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string {
		return this.galleryIconUrlFallback || this.localIconUrl || this.defaultIconUrl;
	}

	private get localIconUrl(): string {
		return this.local && this.local.manifest.icon
			&& URI.file(path.join(this.local.path, this.local.manifest.icon)).toString();
	}

	private get galleryIconUrl(): string {
		return this.gallery && this.gallery.assets.icon.uri;
	}

	private get galleryIconUrlFallback(): string {
		return this.gallery && this.gallery.assets.icon.fallbackUri;
	}

	private get defaultIconUrl(): string {
		return require.toUrl('../browser/media/defaultIcon.png');
	}

	get licenseUrl(): string {
		return this.gallery && this.gallery.assets.license && this.gallery.assets.license.uri;
	}

	get state(): ExtensionState {
		return this.stateProvider(this);
	}

	get installCount(): number {
		return this.gallery ? this.gallery.installCount : null;
	}

	get rating(): number {
		return this.gallery ? this.gallery.rating : null;
	}

	get ratingCount(): number {
		return this.gallery ? this.gallery.ratingCount : null;
	}

	get outdated(): boolean {
		return !!this.gallery && this.type === LocalExtensionType.User && semver.gt(this.latestVersion, this.version);
	}

	get telemetryData(): any {
		const { local, gallery } = this;

		if (gallery) {
			return getGalleryExtensionTelemetryData(gallery);
		} else {
			return getLocalExtensionTelemetryData(local);
		}
	}

	getManifest(): TPromise<IExtensionManifest> {
		if (this.gallery) {
			return this.galleryService.getManifest(this.gallery);
		}

		return TPromise.as(this.local.manifest);
	}

	getReadme(): TPromise<string> {
		if (this.gallery) {
			return this.galleryService.getReadme(this.gallery);
		}

		if (this.local && this.local.readmeUrl) {
			const uri = URI.parse(this.local.readmeUrl);
			return readFile(uri.fsPath, 'utf8');
		}

		return TPromise.wrapError('not available');
	}

	getChangelog(): TPromise<string> {
		if (this.gallery && this.gallery.assets.changelog) {
			return this.galleryService.getChangelog(this.gallery);
		}

		const changelogUrl = this.local && this.local.changelogUrl;

		if (!changelogUrl) {
			return TPromise.wrapError('not available');
		}

		const uri = URI.parse(changelogUrl);

		if (uri.scheme === 'file') {
			return readFile(uri.fsPath, 'utf8');
		}

		return TPromise.wrapError('not available');
	}

	get dependencies(): string[] {
		const { local, gallery } = this;
		if (local && local.manifest.extensionDependencies) {
			return local.manifest.extensionDependencies;
		}
		if (gallery) {
			return gallery.properties.dependencies;
		}
		return [];
	}
}

class ExtensionDependencies implements IExtensionDependencies {

	private _hasDependencies: boolean = null;

	constructor(private _extension: IExtension, private _identifier: string, private _map: Map<string, IExtension>, private _dependent: IExtensionDependencies = null) { }

	get hasDependencies(): boolean {
		if (this._hasDependencies === null) {
			this._hasDependencies = this.computeHasDependencies();
		}
		return this._hasDependencies;
	}

	get extension(): IExtension {
		return this._extension;
	}

	get identifier(): string {
		return this._identifier;
	}

	get dependent(): IExtensionDependencies {
		return this._dependent;
	}

	get dependencies(): IExtensionDependencies[] {
		if (!this.hasDependencies) {
			return [];
		}
		return this._extension.dependencies.map(d => new ExtensionDependencies(this._map.get(d), d, this._map, this));
	}

	private computeHasDependencies(): boolean {
		if (this._extension && this._extension.dependencies.length > 0) {
			let dependent = this._dependent;
			while (dependent !== null) {
				if (dependent.identifier === this.identifier) {
					return false;
				}
				dependent = dependent.dependent;
			}
			return true;
		}
		return false;
	}
}

function stripVersion(id: string): string {
	return id.replace(/-\d+\.\d+\.\d+$/, '');
}

enum Operation {
	Installing,
	Updating,
	Uninstalling
}

interface IActiveExtension {
	id: string;
	operation: Operation;
	extension: Extension;
	start: Date;
}

function toTelemetryEventName(operation: Operation) {
	switch (operation) {
		case Operation.Installing: return 'extensionGallery:install';
		case Operation.Updating: return 'extensionGallery:update';
		case Operation.Uninstalling: return 'extensionGallery:uninstall';
	}

	return '';
}

export class ExtensionsWorkbenchService implements IExtensionsWorkbenchService {

	private static SyncPeriod = 1000 * 60 * 60 * 12; // 12 hours

	_serviceBrand: any;
	private stateProvider: IExtensionStateProvider;
	private installing: IActiveExtension[] = [];
	private uninstalling: IActiveExtension[] = [];
	private installed: Extension[] = [];
	private syncDelayer: ThrottledDelayer<void>;
	private autoUpdateDelayer: ThrottledDelayer<void>;
	private disposables: IDisposable[] = [];

	private _onChange: Emitter<void> = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IExtensionManagementService private extensionService: IExtensionManagementService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMessageService private messageService: IMessageService,
		@IChoiceService private choiceService: IChoiceService,
		@IURLService urlService: IURLService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
	) {
		this.stateProvider = ext => this.getExtensionState(ext);

		extensionService.onInstallExtension(this.onInstallExtension, this, this.disposables);
		extensionService.onDidInstallExtension(this.onDidInstallExtension, this, this.disposables);
		extensionService.onUninstallExtension(this.onUninstallExtension, this, this.disposables);
		extensionService.onDidUninstallExtension(this.onDidUninstallExtension, this, this.disposables);
		extensionEnablementService.onEnablementChanged(this.onEnablementChanged, this, this.disposables);

		this.syncDelayer = new ThrottledDelayer<void>(ExtensionsWorkbenchService.SyncPeriod);
		this.autoUpdateDelayer = new ThrottledDelayer<void>(1000);

		chain(urlService.onOpenURL)
			.filter(uri => /^extension/.test(uri.path))
			.on(this.onOpenExtensionUrl, this, this.disposables);

		this.queryLocal().done(() => this.eventuallySyncWithGallery(true));
	}

	get local(): IExtension[] {
		const installing = this.installing
			.filter(e => !this.installed.some(installed => stripVersion(installed.local.id) === e.id))
			.map(e => e.extension);

		return [...this.installed, ...installing];
	}

	queryLocal(): TPromise<IExtension[]> {
		return this.extensionService.getInstalled().then(result => {
			const installedById = index(this.installed, e => e.local.id);
			const globallyDisabledExtensions = this.extensionEnablementService.getGloballyDisabledExtensions();
			const workspaceDisabledExtensions = this.extensionEnablementService.getWorkspaceDisabledExtensions();
			this.installed = result.map(local => {
				const extension = installedById[local.id] || new Extension(this.galleryService, this.stateProvider, local);
				extension.local = local;
				extension.disabledGlobally = globallyDisabledExtensions.indexOf(extension.identifier) !== -1;
				extension.disabledForWorkspace = workspaceDisabledExtensions.indexOf(extension.identifier) !== -1;
				return extension;
			});

			this._onChange.fire();
			return this.local;
		});
	}

	queryGallery(options: IQueryOptions = {}): TPromise<IPager<IExtension>> {
		return this.galleryService.query(options)
			.then(result => mapPager(result, gallery => this.fromGallery(gallery)))
			.then(null, err => {
				if (/No extension gallery service configured/.test(err.message)) {
					return TPromise.as(singlePagePager([]));
				}

				return TPromise.wrapError(err);
			});
	}

	loadDependencies(extension: IExtension): TPromise<IExtensionDependencies> {
		if (!extension.dependencies.length) {
			return TPromise.wrap(null);
		}

		return this.galleryService.getAllDependencies((<Extension>extension).gallery)
			.then(galleryExtensions => galleryExtensions.map(galleryExtension => this.fromGallery(galleryExtension)))
			.then(extensions => [...this.local, ...extensions])
			.then(extensions => {
				const map = new Map<string, IExtension>();
				for (const extension of extensions) {
					map.set(`${extension.publisher}.${extension.name}`, extension);
				}
				return new ExtensionDependencies(extension, extension.identifier, map);
			});
	}

	open(extension: IExtension, sideByside: boolean = false): TPromise<any> {
		return this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension), null, sideByside);
	}

	private fromGallery(gallery: IGalleryExtension): Extension {
		const installedByGalleryId = index(this.installed, e => e.identifier);
		const installed = installedByGalleryId[`${gallery.publisher}.${gallery.name}`];

		if (installed) {
			// Loading the compatible version only there is an engine property
			// Otherwise falling back to old way so that we will not make many roundtrips
			if (gallery.properties.engine) {
				this.galleryService.loadCompatibleVersion(gallery).then(compatible => this.syncLocalWithGalleryExtension(installed, compatible));
			} else {
				this.syncLocalWithGalleryExtension(installed, gallery);
			}
			return installed;
		}

		return new Extension(this.galleryService, this.stateProvider, null, gallery);
	}

	private syncLocalWithGalleryExtension(local: Extension, gallery: IGalleryExtension) {
		local.gallery = gallery;
		this._onChange.fire();
		this.eventuallyAutoUpdateExtensions();
	}

	checkForUpdates(): TPromise<void> {
		return this.syncDelayer.trigger(() => this.syncWithGallery(), 0);
	}

	private eventuallySyncWithGallery(immediate = false): void {
		const loop = () => this.syncWithGallery().then(() => this.eventuallySyncWithGallery());
		const delay = immediate ? 0 : ExtensionsWorkbenchService.SyncPeriod;

		this.syncDelayer.trigger(loop, delay)
			.done(null, err => null);
	}

	private syncWithGallery(): TPromise<void> {
		const ids = this.installed
			.filter(e => !!(e.local && e.local.metadata))
			.map(e => e.local.metadata.id)
			.filter(id => isUUID(id));

		if (ids.length === 0) {
			return TPromise.as(null);
		}

		return this.queryGallery({ ids, pageSize: ids.length }) as TPromise<any>;
	}

	private eventuallyAutoUpdateExtensions(): void {
		this.autoUpdateDelayer.trigger(() => this.autoUpdateExtensions())
			.done(null, err => null);
	}

	private autoUpdateExtensions(): TPromise<any> {
		const config = this.configurationService.getConfiguration<IExtensionsConfiguration>(ConfigurationKey);

		if (!config.autoUpdate) {
			return TPromise.as(null);
		}

		const toUpdate = this.local.filter(e => e.outdated && (e.state !== ExtensionState.Installing));
		return TPromise.join(toUpdate.map(e => this.install(e, false)));
	}

	canInstall(extension: IExtension): boolean {
		if (!(extension instanceof Extension)) {
			return false;
		}

		return !!(extension as Extension).gallery;
	}

	install(extension: string | IExtension, promptToInstallDependencies: boolean = true): TPromise<void> {
		if (typeof extension === 'string') {
			return this.extensionService.install(extension);
		}

		if (!(extension instanceof Extension)) {
			return undefined;
		}

		const ext = extension as Extension;
		const gallery = ext.gallery;

		if (!gallery) {
			return TPromise.wrapError<void>(new Error('Missing gallery'));
		}

		return this.extensionService.installFromGallery(gallery, promptToInstallDependencies);
	}

	setEnablement(extension: IExtension, enable: boolean, workspace: boolean = false): TPromise<any> {
		if (extension.type === LocalExtensionType.System) {
			return TPromise.wrap(null);
		}

		return this.promptAndSetEnablement(extension, enable, workspace).then(reload => {
			this.telemetryService.publicLog(enable ? 'extension:enable' : 'extension:disable', extension.telemetryData);
		});
	}

	uninstall(extension: IExtension): TPromise<void> {
		if (!(extension instanceof Extension)) {
			return undefined;
		}

		const ext = extension as Extension;
		const local = ext.local || this.installed.filter(e => e.local.metadata && ext.gallery && e.local.metadata.id === ext.gallery.id)[0].local;

		if (!local) {
			return TPromise.wrapError<void>(new Error('Missing local'));
		}

		return this.extensionService.uninstall(local);

	}

	private promptAndSetEnablement(extension: IExtension, enable: boolean, workspace: boolean): TPromise<any> {
		const allDependencies = this.getDependenciesRecursively(extension, this.local, enable, workspace, []);
		if (allDependencies.length > 0) {
			if (enable) {
				return this.promptForDependenciesAndEnable(extension, allDependencies, workspace);
			} else {
				return this.promptForDependenciesAndDisable(extension, allDependencies, workspace);
			}
		}
		return this.checkAndSetEnablement(extension, [], enable, workspace);
	}

	private promptForDependenciesAndEnable(extension: IExtension, dependencies: IExtension[], workspace: boolean): TPromise<any> {
		const message = nls.localize('enableDependeciesConfirmation', "Enabling '{0}' also enable its dependencies. Would you like to continue?", extension.displayName);
		const options = [
			nls.localize('enable', "Yes"),
			nls.localize('doNotEnable', "No")
		];
		return this.choiceService.choose(Severity.Info, message, options, true)
			.then<void>(value => {
				if (value === 0) {
					return this.checkAndSetEnablement(extension, dependencies, true, workspace);
				}
				return TPromise.as(null);
			});
	}

	private promptForDependenciesAndDisable(extension: IExtension, dependencies: IExtension[], workspace: boolean): TPromise<void> {
		const message = nls.localize('disableDependeciesConfirmation', "Would you like to disable '{0}' only or its dependencies also?", extension.displayName);
		const options = [
			nls.localize('disableOnly', "Only"),
			nls.localize('disableAll', "All"),
			nls.localize('cancel', "Cancel")
		];
		return this.choiceService.choose(Severity.Info, message, options, true)
			.then<void>(value => {
				if (value === 0) {
					return this.checkAndSetEnablement(extension, [], false, workspace);
				}
				if (value === 1) {
					return this.checkAndSetEnablement(extension, dependencies, false, workspace);
				}
				return TPromise.as(null);
			});
	}

	private checkAndSetEnablement(extension: IExtension, dependencies: IExtension[], enable: boolean, workspace: boolean): TPromise<any> {
		if (!enable) {
			let dependents = this.getDependentsAfterDisablement(extension, dependencies, this.local, workspace);
			if (dependents.length) {
				return TPromise.wrapError<void>(this.getDependentsErrorMessage(extension, dependents));
			}
		}
		return TPromise.join([extension, ...dependencies].map(e => this.doSetEnablement(e, enable, workspace)));
	}

	private getDependenciesRecursively(extension: IExtension, installed: IExtension[], enable: boolean, workspace: boolean, checked: IExtension[]): IExtension[] {
		if (checked.indexOf(extension) !== -1) {
			return [];
		}
		checked.push(extension);
		if (!extension.dependencies || extension.dependencies.length === 0) {
			return [];
		}
		const dependenciesToDisable = installed.filter(i => {
			// Do not include extensions which are already disabled and request is to disable
			if (!enable && (workspace ? i.disabledForWorkspace : i.disabledGlobally)) {
				return false;
			}
			return i.type === LocalExtensionType.User && extension.dependencies.indexOf(i.identifier) !== -1;
		});
		const depsOfDeps = [];
		for (const dep of dependenciesToDisable) {
			depsOfDeps.push(...this.getDependenciesRecursively(dep, installed, enable, workspace, checked));
		}
		return [...dependenciesToDisable, ...depsOfDeps];
	}

	private getDependentsAfterDisablement(extension: IExtension, dependencies: IExtension[], installed: IExtension[], workspace: boolean): IExtension[] {
		return installed.filter(i => {
			if (i.dependencies.length === 0) {
				return false;
			}
			if (i === extension) {
				return false;
			}
			const disabled = workspace ? i.disabledForWorkspace : i.disabledGlobally;
			if (disabled) {
				return false;
			}
			if (dependencies.indexOf(i) !== -1) {
				return false;
			}
			return i.dependencies.some(dep => {
				if (extension.identifier === dep) {
					return true;
				}
				return dependencies.some(d => d.identifier === dep);
			});
		});
	}

	private getDependentsErrorMessage(extension: IExtension, dependents: IExtension[]): string {
		if (dependents.length === 1) {
			return nls.localize('singleDependentError', "Cannot disable extension '{0}'. Extension '{1}' depends on this.", extension.displayName, dependents[0].displayName);
		}
		if (dependents.length === 2) {
			return nls.localize('twoDependentsError', "Cannot disable extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
				extension.displayName, dependents[0].displayName, dependents[1].displayName);
		}
		return nls.localize('multipleDependentsError', "Cannot disable extension '{0}'. Extensions '{1}', '{2}' and others depend on this.",
			extension.displayName, dependents[0].displayName, dependents[1].displayName);
	}

	private doSetEnablement(extension: IExtension, enable: boolean, workspace: boolean): TPromise<boolean> {
		if (workspace) {
			return this.extensionEnablementService.setEnablement(extension.identifier, enable, workspace);
		}

		const globalElablement = this.extensionEnablementService.setEnablement(extension.identifier, enable, false);
		if (enable && this.workspaceContextService.hasWorkspace()) {
			const workspaceEnablement = this.extensionEnablementService.setEnablement(extension.identifier, enable, true);
			return TPromise.join([globalElablement, workspaceEnablement]).then(values => values[0] || values[1]);
		}
		return globalElablement;
	}

	private onInstallExtension(event: InstallExtensionEvent): void {
		const { id, gallery } = event;

		if (!gallery) {
			return;
		}

		let extension = this.installed.filter(e => (e.local && e.local.metadata && e.local.metadata.id) === gallery.id)[0];

		if (!extension) {
			extension = new Extension(this.galleryService, this.stateProvider, null, gallery);
		}

		extension.gallery = gallery;

		const start = new Date();
		const operation = Operation.Installing;
		this.installing.push({ id: stripVersion(id), operation, extension, start });

		this._onChange.fire();
	}

	private onDidInstallExtension(event: DidInstallExtensionEvent): void {
		const { local, zipPath, error } = event;
		const id = stripVersion(event.id);
		const installing = this.installing.filter(e => e.id === id)[0];

		const extension: Extension = installing ? installing.extension : zipPath ? new Extension(this.galleryService, this.stateProvider, null) : null;
		if (extension) {
			this.installing = this.installing.filter(e => e.id !== id);

			if (!error) {
				extension.local = local;

				const galleryId = local.metadata && local.metadata.id;
				const installed = this.installed.filter(e => (e.local && e.local.metadata && e.local.metadata.id) === galleryId)[0];

				if (galleryId && installed) {
					installing.operation = Operation.Updating;
					installed.local = local;
				} else {
					this.installed.push(extension);
					this.checkForOtherKeymaps(extension)
						.then(null, onUnexpectedError);
				}
			}
			if (extension.gallery) {
				// Report telemetry only for gallery extensions
				this.reportTelemetry(installing, !error);
			}
		}
		this._onChange.fire();
	}

	private checkForOtherKeymaps(extension: Extension): TPromise<void> {
		if (!extension.disabledGlobally && this.isKeymapExtension(extension)) {
			const otherKeymaps = this.installed.filter(ext => ext.identifier !== extension.identifier &&
				!ext.disabledGlobally &&
				this.isKeymapExtension(ext));
			if (otherKeymaps.length) {
				return this.promptForDisablingOtherKeymaps(extension, otherKeymaps);
			}
		}
		return TPromise.as(undefined);
	}

	private isKeymapExtension(extension: Extension): boolean {
		const cats = extension.local.manifest.categories;
		return cats && cats.indexOf('Keymaps') !== -1 || this.tipsService.getKeymapRecommendations().indexOf(extension.identifier) !== -1;
	}

	private promptForDisablingOtherKeymaps(newKeymap: Extension, oldKeymaps: Extension[]): TPromise<void> {
		const telemetryData: { [key: string]: any; } = {
			newKeymap: newKeymap.identifier,
			oldKeymaps: oldKeymaps.map(k => k.identifier)
		};
		this.telemetryService.publicLog('disableOtherKeymapsConfirmation', telemetryData);
		const message = nls.localize('disableOtherKeymapsConfirmation', "Disable other keymaps to avoid conflicts between keybindings?");
		const options = [
			nls.localize('yes', "Yes"),
			nls.localize('no', "No")
		];
		return this.choiceService.choose(Severity.Info, message, options, false)
			.then<void>(value => {
				const confirmed = value === 0;
				telemetryData['confirmed'] = confirmed;
				this.telemetryService.publicLog('disableOtherKeymaps', telemetryData);
				if (confirmed) {
					return TPromise.join(oldKeymaps.map(keymap => {
						return this.setEnablement(keymap, false);
					}));
				}
				return undefined;
			}, error => TPromise.wrapError(canceled()));
	}

	private onUninstallExtension(id: string): void {
		const extension = this.installed.filter(e => e.local.id === id)[0];
		const newLength = this.installed.filter(e => e.local.id !== id).length;
		// TODO: Ask @Joao why is this?
		if (newLength === this.installed.length) {
			return;
		}

		const start = new Date();
		const operation = Operation.Uninstalling;
		const uninstalling = this.uninstalling.filter(e => e.id === id)[0] || { id, operation, extension, start };
		this.uninstalling = [uninstalling, ...this.uninstalling.filter(e => e.id !== id)];

		this._onChange.fire();
	}

	private onDidUninstallExtension({id, error}: DidUninstallExtensionEvent): void {
		if (!error) {
			this.installed = this.installed.filter(e => e.local.id !== id);
		}

		const uninstalling = this.uninstalling.filter(e => e.id === id)[0];
		this.uninstalling = this.uninstalling.filter(e => e.id !== id);
		if (!uninstalling) {
			return;
		}

		if (!error) {
			this.reportTelemetry(uninstalling, true);
		}

		this._onChange.fire();
	}

	private onEnablementChanged(extensionIdentifier: string) {
		const [extension] = this.local.filter(e => e.identifier === extensionIdentifier);
		if (extension) {
			const globallyDisabledExtensions = this.extensionEnablementService.getGloballyDisabledExtensions();
			const workspaceDisabledExtensions = this.extensionEnablementService.getWorkspaceDisabledExtensions();
			extension.disabledGlobally = globallyDisabledExtensions.indexOf(extension.identifier) !== -1;
			extension.disabledForWorkspace = workspaceDisabledExtensions.indexOf(extension.identifier) !== -1;
			this._onChange.fire();
			this.checkForOtherKeymaps(<Extension>extension)
				.then(null, onUnexpectedError);
		}
	}

	private getExtensionState(extension: Extension): ExtensionState {
		if (extension.gallery && this.installing.some(e => e.extension.gallery && e.extension.gallery.id === extension.gallery.id)) {
			return ExtensionState.Installing;
		}

		if (this.uninstalling.some(e => e.extension.identifier === extension.identifier)) {
			return ExtensionState.Uninstalling;
		}

		const local = this.installed.filter(e => e === extension || (e.gallery && extension.gallery && e.gallery.id === extension.gallery.id))[0];
		return local ? ExtensionState.Installed : ExtensionState.Uninstalled;
	}

	private reportTelemetry(active: IActiveExtension, success: boolean): void {
		const data = active.extension.telemetryData;
		const duration = new Date().getTime() - active.start.getTime();
		const eventName = toTelemetryEventName(active.operation);

		this.telemetryService.publicLog(eventName, assign(data, { success, duration }));
	}

	private onError(err: any): void {
		if (isPromiseCanceledError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/getaddrinfo ENOTFOUND|getaddrinfo ENOENT|connect EACCES|connect ECONNREFUSED/.test(message)) {
			return;
		}

		this.messageService.show(Severity.Error, err);
	}

	private onOpenExtensionUrl(uri: URI): void {
		const match = /^extension\/([^/]+)$/.exec(uri.path);

		if (!match) {
			return;
		}

		const extensionId = match[1];

		this.queryGallery({ names: [extensionId] })
			.done(result => {
				if (result.total < 1) {
					return;
				}

				const extension = result.firstPage[0];
				const promises = [this.open(extension)];

				if (this.local.every(local => local.identifier !== extension.identifier)) {
					promises.push(this.install(extension));
				}

				TPromise.join(promises)
					.done(null, error => this.onError(error));
			});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}