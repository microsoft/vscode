/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, AutoSaveConfiguration, HotExitConfiguration, FILES_READONLY_INCLUDE_CONFIG, FILES_READONLY_EXCLUDE_CONFIG, IFileStatWithMetadata, IFileService, IBaseFileStat, hasReadonlyCapability, IFilesConfigurationNode } from 'vs/platform/files/common/files';
import { equals } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { isWeb } from 'vs/base/common/platform';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { GlobalIdleValue } from 'vs/base/common/async';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { LRUCache, ResourceMap } from 'vs/base/common/map';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IStringDictionary } from 'vs/base/common/collections';

export const AutoSaveAfterShortDelayContext = new RawContextKey<boolean>('autoSaveAfterShortDelayContext', false, true);

export interface IAutoSaveConfiguration {
	autoSaveDelay?: number;
	autoSaveFocusChange?: boolean;
	autoSaveApplicationChange?: boolean;
	autoSaveWhenNoErrors?: boolean;
}

export const enum AutoSaveMode {
	OFF,
	AFTER_SHORT_DELAY,
	AFTER_LONG_DELAY,
	ON_FOCUS_CHANGE,
	ON_WINDOW_CHANGE
}

export const IFilesConfigurationService = createDecorator<IFilesConfigurationService>('filesConfigurationService');

export interface IFilesConfigurationService {

	readonly _serviceBrand: undefined;

	//#region Auto Save

	readonly onDidChangeAutoSaveConfiguration: Event<void>;

	getAutoSaveConfiguration(resourceoOrEditor: EditorInput | URI | undefined): IAutoSaveConfiguration;

	getAutoSaveMode(resourceoOrEditor: EditorInput | URI | undefined): AutoSaveMode;

	toggleAutoSave(): Promise<void>;

	//#endregion

	//#region Configured Readonly

	readonly onDidChangeReadonly: Event<void>;

	isReadonly(resource: URI, stat?: IBaseFileStat): boolean | IMarkdownString;

	updateReadonly(resource: URI, readonly: true | false | 'toggle' | 'reset'): Promise<void>;

	//#endregion

	readonly onDidChangeFilesAssociation: Event<void>;

	readonly isHotExitEnabled: boolean;

	readonly hotExitConfiguration: string | undefined;

	preventSaveConflicts(resource: URI, language?: string): boolean;
}

export class FilesConfigurationService extends Disposable implements IFilesConfigurationService {

	declare readonly _serviceBrand: undefined;

	private static readonly DEFAULT_AUTO_SAVE_MODE = isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF;
	private static readonly DEFAULT_AUTO_SAVE_DELAY = 1000;

	private static readonly READONLY_MESSAGES = {
		providerReadonly: { value: localize('providerReadonly', "Editor is read-only because the file system of the file is read-only."), isTrusted: true },
		sessionReadonly: { value: localize({ key: 'sessionReadonly', comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because the file was set read-only in this session. [Click here](command:{0}) to set writeable.", 'workbench.action.files.setActiveEditorWriteableInSession'), isTrusted: true },
		configuredReadonly: { value: localize({ key: 'configuredReadonly', comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because the file was set read-only via settings. [Click here](command:{0}) to configure.", `workbench.action.openSettings?${encodeURIComponent('["files.readonly"]')}`), isTrusted: true },
		fileLocked: { value: localize({ key: 'fileLocked', comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because of file permissions. [Click here](command:{0}) to set writeable anyway.", 'workbench.action.files.setActiveEditorWriteableInSession'), isTrusted: true },
		fileReadonly: { value: localize('fileReadonly', "Editor is read-only because the file is read-only."), isTrusted: true }
	};

	private readonly _onDidChangeAutoSaveConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeAutoSaveConfiguration = this._onDidChangeAutoSaveConfiguration.event;

	private readonly _onDidChangeFilesAssociation = this._register(new Emitter<void>());
	readonly onDidChangeFilesAssociation = this._onDidChangeFilesAssociation.event;

	private readonly _onDidChangeReadonly = this._register(new Emitter<void>());
	readonly onDidChangeReadonly = this._onDidChangeReadonly.event;

	private currentGlobalAutoSaveConfiguration: IAutoSaveConfiguration;
	private currentFilesAssociationConfiguration: IStringDictionary<string>;
	private currentHotExitConfiguration: string;

	private readonly autoSaveConfigurationCache = new LRUCache<URI, IAutoSaveConfiguration>(1000);

	private readonly autoSaveAfterShortDelayContext = AutoSaveAfterShortDelayContext.bindTo(this.contextKeyService);

	private readonly readonlyIncludeMatcher = this._register(new GlobalIdleValue(() => this.createReadonlyMatcher(FILES_READONLY_INCLUDE_CONFIG)));
	private readonly readonlyExcludeMatcher = this._register(new GlobalIdleValue(() => this.createReadonlyMatcher(FILES_READONLY_EXCLUDE_CONFIG)));
	private configuredReadonlyFromPermissions: boolean | undefined;

	private readonly sessionReadonlyOverrides = new ResourceMap<boolean>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IMarkerService private readonly markerService: IMarkerService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService
	) {
		super();

		const configuration = configurationService.getValue<IFilesConfiguration>();

		this.currentGlobalAutoSaveConfiguration = this.computeAutoSaveConfiguration(undefined, configuration.files);
		this.currentFilesAssociationConfiguration = configuration?.files?.associations;
		this.currentHotExitConfiguration = configuration?.files?.hotExit || HotExitConfiguration.ON_EXIT;

		this.onFilesConfigurationChange(configuration, false);

		this.registerListeners();
	}

	private createReadonlyMatcher(config: string) {
		const matcher = this._register(new ResourceGlobMatcher(
			resource => this.configurationService.getValue(config, { resource }),
			event => event.affectsConfiguration(config),
			this.contextService,
			this.configurationService
		));

		this._register(matcher.onExpressionChange(() => this._onDidChangeReadonly.fire()));

		return matcher;
	}

	isReadonly(resource: URI, stat?: IBaseFileStat): boolean | IMarkdownString {

		// if the entire file system provider is readonly, we respect that
		// and do not allow to change readonly. we take this as a hint that
		// the provider has no capabilities of writing.
		const provider = this.fileService.getProvider(resource.scheme);
		if (provider && hasReadonlyCapability(provider)) {
			return provider.readOnlyMessage ?? FilesConfigurationService.READONLY_MESSAGES.providerReadonly;
		}

		// session override always wins over the others
		const sessionReadonlyOverride = this.sessionReadonlyOverrides.get(resource);
		if (typeof sessionReadonlyOverride === 'boolean') {
			return sessionReadonlyOverride === true ? FilesConfigurationService.READONLY_MESSAGES.sessionReadonly : false;
		}

		if (
			this.uriIdentityService.extUri.isEqualOrParent(resource, this.environmentService.userRoamingDataHome) ||
			this.uriIdentityService.extUri.isEqual(resource, this.contextService.getWorkspace().configuration ?? undefined)
		) {
			return false; // explicitly exclude some paths from readonly that we need for configuration
		}

		// configured glob patterns win over stat information
		if (this.readonlyIncludeMatcher.value.matches(resource)) {
			return !this.readonlyExcludeMatcher.value.matches(resource) ? FilesConfigurationService.READONLY_MESSAGES.configuredReadonly : false;
		}

		// check if file is locked and configured to treat as readonly
		if (this.configuredReadonlyFromPermissions && stat?.locked) {
			return FilesConfigurationService.READONLY_MESSAGES.fileLocked;
		}

		// check if file is marked readonly from the file system provider
		if (stat?.readonly) {
			return FilesConfigurationService.READONLY_MESSAGES.fileReadonly;
		}

		return false;
	}

	async updateReadonly(resource: URI, readonly: true | false | 'toggle' | 'reset'): Promise<void> {
		if (readonly === 'toggle') {
			let stat: IFileStatWithMetadata | undefined = undefined;
			try {
				stat = await this.fileService.resolve(resource, { resolveMetadata: true });
			} catch (error) {
				// ignore
			}

			readonly = !this.isReadonly(resource, stat);
		}

		if (readonly === 'reset') {
			this.sessionReadonlyOverrides.delete(resource);
		} else {
			this.sessionReadonlyOverrides.set(resource, readonly);
		}

		this._onDidChangeReadonly.fire();
	}

	private registerListeners(): void {

		// Files configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files')) {
				this.onFilesConfigurationChange(this.configurationService.getValue<IFilesConfiguration>(), true);
			}
		}));

		// Marker changes (only relevant when `files.autoSaveWhenNoErrors` is enabled)
		this._register(this.markerService.onMarkerChanged(e => {
			for (const uri of e) {
				const autoSaveConfiguration = this.autoSaveConfigurationCache.get(uri);
				if (autoSaveConfiguration?.autoSaveWhenNoErrors) {
					this.autoSaveConfigurationCache.delete(uri);
				}
			}
		}));
	}

	protected onFilesConfigurationChange(configuration: IFilesConfiguration, fromEvent: boolean): void {

		// Auto Save
		this.currentGlobalAutoSaveConfiguration = this.computeAutoSaveConfiguration(undefined, configuration.files);
		this.autoSaveConfigurationCache.clear();
		this.autoSaveAfterShortDelayContext.set(this.getAutoSaveMode(undefined) === AutoSaveMode.AFTER_SHORT_DELAY);
		if (fromEvent) {
			this._onDidChangeAutoSaveConfiguration.fire();
		}

		// Check for change in files associations
		const filesAssociation = configuration?.files?.associations;
		if (!equals(this.currentFilesAssociationConfiguration, filesAssociation)) {
			this.currentFilesAssociationConfiguration = filesAssociation;
			if (fromEvent) {
				this._onDidChangeFilesAssociation.fire();
			}
		}

		// Hot exit
		const hotExitMode = configuration?.files?.hotExit;
		if (hotExitMode === HotExitConfiguration.OFF || hotExitMode === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
			this.currentHotExitConfiguration = hotExitMode;
		} else {
			this.currentHotExitConfiguration = HotExitConfiguration.ON_EXIT;
		}

		// Readonly
		const readonlyFromPermissions = Boolean(configuration?.files?.readonlyFromPermissions);
		if (readonlyFromPermissions !== Boolean(this.configuredReadonlyFromPermissions)) {
			this.configuredReadonlyFromPermissions = readonlyFromPermissions;
			if (fromEvent) {
				this._onDidChangeReadonly.fire();
			}
		}
	}

	private computeAutoSaveConfiguration(
		resource: URI | undefined = undefined,
		filesConfiguration: IFilesConfigurationNode
	): IAutoSaveConfiguration {
		let autoSaveDelay: number | undefined;
		let autoSaveFocusChange: boolean | undefined;
		let autoSaveApplicationChange: boolean | undefined;

		switch (filesConfiguration.autoSave ?? FilesConfigurationService.DEFAULT_AUTO_SAVE_MODE) {
			case AutoSaveConfiguration.AFTER_DELAY:
				autoSaveDelay = typeof filesConfiguration.autoSaveDelay === 'number' ? filesConfiguration.autoSaveDelay : FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY;
				autoSaveFocusChange = undefined;
				autoSaveApplicationChange = undefined;
				break;

			case AutoSaveConfiguration.ON_FOCUS_CHANGE:
				autoSaveDelay = undefined;
				autoSaveFocusChange = true;
				autoSaveApplicationChange = undefined;
				break;

			case AutoSaveConfiguration.ON_WINDOW_CHANGE:
				autoSaveDelay = undefined;
				autoSaveFocusChange = undefined;
				autoSaveApplicationChange = true;
				break;

			default:
				autoSaveDelay = undefined;
				autoSaveFocusChange = undefined;
				autoSaveApplicationChange = undefined;
				break;
		}

		if (typeof autoSaveDelay === 'number' || autoSaveFocusChange || autoSaveApplicationChange) {
			if (
				(filesConfiguration.autoSaveWorkspaceFilesOnly && resource && !this.contextService.isInsideWorkspace(resource)) ||
				(filesConfiguration.autoSaveWhenNoErrors && resource && this.markerService.read({ resource, take: 1, severities: MarkerSeverity.Error }).length > 0)
			) {
				autoSaveDelay = undefined;
				autoSaveFocusChange = undefined;
				autoSaveApplicationChange = undefined;
			}
		}

		const autoSaveConfiguration: IAutoSaveConfiguration = Object.create(null);
		if (typeof autoSaveDelay === 'number') {
			autoSaveConfiguration.autoSaveDelay = autoSaveDelay;
		}
		if (typeof autoSaveFocusChange === 'boolean') {
			autoSaveConfiguration.autoSaveFocusChange = autoSaveFocusChange;
		}
		if (typeof autoSaveApplicationChange === 'boolean') {
			autoSaveConfiguration.autoSaveApplicationChange = autoSaveApplicationChange;
		}
		if (filesConfiguration.autoSaveWhenNoErrors) {
			autoSaveConfiguration.autoSaveWhenNoErrors = true;
		}

		return autoSaveConfiguration;
	}

	getAutoSaveMode(resourceOrEditor: EditorInput | URI | undefined): AutoSaveMode {
		const autoSaveConfiguration = this.getAutoSaveConfiguration(resourceOrEditor);
		if (autoSaveConfiguration?.autoSaveFocusChange) {
			return AutoSaveMode.ON_FOCUS_CHANGE;
		}

		if (autoSaveConfiguration?.autoSaveApplicationChange) {
			return AutoSaveMode.ON_WINDOW_CHANGE;
		}

		if (typeof autoSaveConfiguration?.autoSaveDelay === 'number' && autoSaveConfiguration?.autoSaveDelay >= 0) {
			return autoSaveConfiguration?.autoSaveDelay <= FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY ? AutoSaveMode.AFTER_SHORT_DELAY : AutoSaveMode.AFTER_LONG_DELAY;
		}

		return AutoSaveMode.OFF;
	}

	getAutoSaveConfiguration(resourceOrEditor: EditorInput | URI | undefined): IAutoSaveConfiguration {
		const resource = this.toResource(resourceOrEditor);
		if (resource) {
			let resourceAutoSaveConfiguration = this.autoSaveConfigurationCache.get(resource);
			if (!resourceAutoSaveConfiguration) {
				const resourcesFilesConfiguration = this.textResourceConfigurationService.getValue<IFilesConfigurationNode>(resource, 'files');
				resourceAutoSaveConfiguration = this.computeAutoSaveConfiguration(resource, resourcesFilesConfiguration);

				this.autoSaveConfigurationCache.set(resource, resourceAutoSaveConfiguration);
			}

			return resourceAutoSaveConfiguration;
		}

		return this.currentGlobalAutoSaveConfiguration;
	}

	private toResource(resourceOrEditor: EditorInput | URI | undefined): URI | undefined {
		if (resourceOrEditor instanceof EditorInput) {
			return EditorResourceAccessor.getOriginalUri(resourceOrEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		}

		return resourceOrEditor;
	}

	async toggleAutoSave(): Promise<void> {
		const currentSetting = this.configurationService.getValue('files.autoSave');

		let newAutoSaveValue: string;
		if ([AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some(setting => setting === currentSetting)) {
			newAutoSaveValue = AutoSaveConfiguration.OFF;
		} else {
			newAutoSaveValue = AutoSaveConfiguration.AFTER_DELAY;
		}

		return this.configurationService.updateValue('files.autoSave', newAutoSaveValue);
	}

	get isHotExitEnabled(): boolean {
		if (this.contextService.getWorkspace().transient) {
			// Transient workspace: hot exit is disabled because
			// transient workspaces are not restored upon restart
			return false;
		}

		return this.currentHotExitConfiguration !== HotExitConfiguration.OFF;
	}

	get hotExitConfiguration(): string {
		return this.currentHotExitConfiguration;
	}

	preventSaveConflicts(resource: URI, language?: string): boolean {
		return this.configurationService.getValue('files.saveConflictResolution', { resource, overrideIdentifier: language }) !== 'overwriteFileOnDisk';
	}
}

registerSingleton(IFilesConfigurationService, FilesConfigurationService, InstantiationType.Eager);
