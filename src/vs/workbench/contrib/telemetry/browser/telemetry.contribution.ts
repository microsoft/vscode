/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase, ILifecycleService, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { language } from '../../../../base/common/platform.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import ErrorTelemetry from '../../../../platform/telemetry/browser/errorTelemetry.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { ConfigurationTarget, ConfigurationTargetToString, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITextFileService, ITextFileSaveEvent, ITextFileResolveEvent } from '../../../services/textfile/common/textfiles.js';
import { extname, basename, isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { getMimeTypes } from '../../../../editor/common/services/languagesAssociations.js';
import { hash } from '../../../../base/common/hash.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { isBoolean, isNumber, isString } from '../../../../base/common/types.js';
import { LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { AutoRestartConfigurationKey, AutoUpdateConfigurationKey } from '../../extensions/common/extensions.js';
import { KEYWORD_ACTIVIATION_SETTING_ID } from '../../chat/common/chatService.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';

type TelemetryData = {
	mimeType: TelemetryTrustedValue<string>;
	ext: string;
	path: number;
	reason?: number;
	allowlistedjson?: string;
};

type FileTelemetryDataFragment = {
	mimeType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language type of the file (for example XML).' };
	ext: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The file extension of the file (for example xml).' };
	path: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The path of the file as a hash.' };
	reason?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason why a file is read or written. Allows to e.g. distinguish auto save from normal save.' };
	allowlistedjson?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the file but only if it matches some well known file names such as package.json or tsconfig.json.' };
};

export class TelemetryContribution extends Disposable implements IWorkbenchContribution {

	private static ALLOWLIST_JSON = ['package.json', 'package-lock.json', 'tsconfig.json', 'jsconfig.json', 'bower.json', '.eslintrc.json', 'tslint.json', 'composer.json'];
	private static ALLOWLIST_WORKSPACE_JSON = ['settings.json', 'extensions.json', 'tasks.json', 'launch.json'];

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEditorService editorService: IEditorService,
		@IKeybindingService keybindingsService: IKeybindingService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@ITextFileService textFileService: ITextFileService
	) {
		super();

		const { filesToOpenOrCreate, filesToDiff, filesToMerge } = environmentService;
		const activeViewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);

		type WindowSizeFragment = {
			innerHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The height of the current window.' };
			innerWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The width of the current window.' };
			outerHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The height of the current window with all decoration removed.' };
			outerWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The width of the current window with all decoration removed.' };
			owner: 'bpasero';
			comment: 'The size of the window.';
		};

		type WorkspaceLoadClassification = {
			owner: 'bpasero';
			emptyWorkbench: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a folder or workspace is opened or not.' };
			windowSize: WindowSizeFragment;
			'workbench.filesToOpenOrCreate': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of files that should open or be created.' };
			'workbench.filesToDiff': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of files that should be compared.' };
			'workbench.filesToMerge': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of files that should be merged.' };
			customKeybindingsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of custom keybindings' };
			theme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current theme of the window.' };
			language: { classification: 'SystemMetaData'; purpose: 'BusinessInsight'; comment: 'The display language of the window.' };
			pinnedViewlets: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifiers of views that are pinned.' };
			restoredViewlet?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the view that is restored.' };
			restoredEditors: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of editors that restored.' };
			startupKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the window was opened, e.g via reload or not.' };
			comment: 'Metadata around the workspace that is being loaded into a window.';
		};

		type WorkspaceLoadEvent = {
			windowSize: { innerHeight: number; innerWidth: number; outerHeight: number; outerWidth: number };
			emptyWorkbench: boolean;
			'workbench.filesToOpenOrCreate': number;
			'workbench.filesToDiff': number;
			'workbench.filesToMerge': number;
			customKeybindingsCount: number;
			theme: string;
			language: string;
			pinnedViewlets: string[];
			restoredViewlet?: string;
			restoredEditors: number;
			startupKind: StartupKind;
		};

		telemetryService.publicLog2<WorkspaceLoadEvent, WorkspaceLoadClassification>('workspaceLoad', {
			windowSize: { innerHeight: mainWindow.innerHeight, innerWidth: mainWindow.innerWidth, outerHeight: mainWindow.outerHeight, outerWidth: mainWindow.outerWidth },
			emptyWorkbench: contextService.getWorkbenchState() === WorkbenchState.EMPTY,
			'workbench.filesToOpenOrCreate': filesToOpenOrCreate && filesToOpenOrCreate.length || 0,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || 0,
			'workbench.filesToMerge': filesToMerge && filesToMerge.length || 0,
			customKeybindingsCount: keybindingsService.customKeybindingsCount(),
			theme: themeService.getColorTheme().id,
			language,
			pinnedViewlets: paneCompositeService.getPinnedPaneCompositeIds(ViewContainerLocation.Sidebar),
			restoredViewlet: activeViewlet ? activeViewlet.getId() : undefined,
			restoredEditors: editorService.visibleEditors.length,
			startupKind: lifecycleService.startupKind
		});

		// Error Telemetry
		this._register(new ErrorTelemetry(telemetryService));

		//  Files Telemetry
		this._register(textFileService.files.onDidResolve(e => this.onTextFileModelResolved(e)));
		this._register(textFileService.files.onDidSave(e => this.onTextFileModelSaved(e)));

		// Lifecycle
		this._register(lifecycleService.onDidShutdown(() => this.dispose()));
	}

	private onTextFileModelResolved(e: ITextFileResolveEvent): void {
		const settingsType = this.getTypeIfSettings(e.model.resource);
		if (settingsType) {
			type SettingsReadClassification = {
				owner: 'bpasero';
				settingsType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of the settings file that was read.' };
				comment: 'Track when a settings file was read, for example from an editor.';
			};

			this.telemetryService.publicLog2<{ settingsType: string }, SettingsReadClassification>('settingsRead', { settingsType }); // Do not log read to user settings.json and .vscode folder as a fileGet event as it ruins our JSON usage data
		} else {
			type FileGetClassification = {
				owner: 'bpasero';
				comment: 'Track when a file was read, for example from an editor.';
			} & FileTelemetryDataFragment;

			this.telemetryService.publicLog2<TelemetryData, FileGetClassification>('fileGet', this.getTelemetryData(e.model.resource, e.reason));
		}
	}

	private onTextFileModelSaved(e: ITextFileSaveEvent): void {
		const settingsType = this.getTypeIfSettings(e.model.resource);
		if (settingsType) {
			type SettingsWrittenClassification = {
				owner: 'bpasero';
				settingsType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of the settings file that was written to.' };
				comment: 'Track when a settings file was written to, for example from an editor.';
			};
			this.telemetryService.publicLog2<{ settingsType: string }, SettingsWrittenClassification>('settingsWritten', { settingsType }); // Do not log write to user settings.json and .vscode folder as a filePUT event as it ruins our JSON usage data
		} else {
			type FilePutClassfication = {
				owner: 'bpasero';
				comment: 'Track when a file was written to, for example from an editor.';
			} & FileTelemetryDataFragment;
			this.telemetryService.publicLog2<TelemetryData, FilePutClassfication>('filePUT', this.getTelemetryData(e.model.resource, e.reason));
		}
	}

	private getTypeIfSettings(resource: URI): string {
		if (extname(resource) !== '.json') {
			return '';
		}

		// Check for global settings file
		if (isEqual(resource, this.userDataProfileService.currentProfile.settingsResource)) {
			return 'global-settings';
		}

		// Check for keybindings file
		if (isEqual(resource, this.userDataProfileService.currentProfile.keybindingsResource)) {
			return 'keybindings';
		}

		// Check for snippets
		if (isEqualOrParent(resource, this.userDataProfileService.currentProfile.snippetsHome)) {
			return 'snippets';
		}

		// Check for workspace settings file
		const folders = this.contextService.getWorkspace().folders;
		for (const folder of folders) {
			if (isEqualOrParent(resource, folder.toResource('.vscode'))) {
				const filename = basename(resource);
				if (TelemetryContribution.ALLOWLIST_WORKSPACE_JSON.indexOf(filename) > -1) {
					return `.vscode/${filename}`;
				}
			}
		}

		return '';
	}

	private getTelemetryData(resource: URI, reason?: number): TelemetryData {
		let ext = extname(resource);
		// Remove query parameters from the resource extension
		const queryStringLocation = ext.indexOf('?');
		ext = queryStringLocation !== -1 ? ext.substr(0, queryStringLocation) : ext;
		const fileName = basename(resource);
		const path = resource.scheme === Schemas.file ? resource.fsPath : resource.path;
		const telemetryData = {
			mimeType: new TelemetryTrustedValue(getMimeTypes(resource).join(', ')),
			ext,
			path: hash(path),
			reason,
			allowlistedjson: undefined as string | undefined
		};

		if (ext === '.json' && TelemetryContribution.ALLOWLIST_JSON.indexOf(fileName) > -1) {
			telemetryData['allowlistedjson'] = fileName;
		}

		return telemetryData;
	}
}

class ConfigurationTelemetryContribution extends Disposable implements IWorkbenchContribution {

	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		// Debounce the event by 1000 ms and merge all affected keys into one event
		const debouncedConfigService = Event.debounce(configurationService.onDidChangeConfiguration, (last, cur) => {
			const newAffectedKeys: ReadonlySet<string> = last ? new Set([...last.affectedKeys, ...cur.affectedKeys]) : cur.affectedKeys;
			return { ...cur, affectedKeys: newAffectedKeys };
		}, 1000, true);

		this._register(debouncedConfigService(event => {
			if (event.source !== ConfigurationTarget.DEFAULT) {
				type UpdateConfigurationClassification = {
					owner: 'sandy081';
					comment: 'Event which fires when user updates settings';
					configurationSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What configuration file was updated i.e user or workspace' };
					configurationKeys: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What configuration keys were updated' };
				};
				type UpdateConfigurationEvent = {
					configurationSource: string;
					configurationKeys: string[];
				};
				telemetryService.publicLog2<UpdateConfigurationEvent, UpdateConfigurationClassification>('updateConfiguration', {
					configurationSource: ConfigurationTargetToString(event.source),
					configurationKeys: Array.from(event.affectedKeys)
				});
			}
		}));

		const { user, workspace } = configurationService.keys();
		for (const setting of user) {
			this.reportTelemetry(setting, ConfigurationTarget.USER_LOCAL);
		}
		for (const setting of workspace) {
			this.reportTelemetry(setting, ConfigurationTarget.WORKSPACE);
		}
	}

	/**
	 * Report value of a setting only if it is an enum, boolean, or number or an array of those.
	 */
	private getValueToReport(key: string, target: ConfigurationTarget.USER_LOCAL | ConfigurationTarget.WORKSPACE): string | undefined {
		const inpsectData = this.configurationService.inspect(key);
		const value = target === ConfigurationTarget.USER_LOCAL ? inpsectData.user?.value : inpsectData.workspace?.value;
		if (isNumber(value) || isBoolean(value)) {
			return value.toString();
		}

		const schema = this.configurationRegistry.getConfigurationProperties()[key];
		if (isString(value)) {
			if (schema?.enum?.includes(value)) {
				return value;
			}
			return undefined;
		}
		if (Array.isArray(value)) {
			if (value.every(v => isNumber(v) || isBoolean(v) || (isString(v) && schema?.enum?.includes(v)))) {
				return JSON.stringify(value);
			}
		}
		return undefined;
	}

	private reportTelemetry(key: string, target: ConfigurationTarget.USER_LOCAL | ConfigurationTarget.WORKSPACE): void {
		type UpdatedSettingEvent = {
			settingValue: string | undefined;
			source: string;
		};
		const source = ConfigurationTargetToString(target);

		switch (key) {

			case LayoutSettings.ACTIVITY_BAR_LOCATION:
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'sandy081';
					comment: 'This is used to know where activity bar is shown in the workbench.';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('workbench.activityBar.location', { settingValue: this.getValueToReport(key, target), source });
				return;

			case AutoUpdateConfigurationKey:
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'sandy081';
					comment: 'This is used to know if extensions are getting auto updated or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('extensions.autoUpdate', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'files.autoSave':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'isidorn';
					comment: 'This is used to know if auto save is enabled or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('files.autoSave', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'editor.stickyScroll.enabled':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'aiday-mar';
					comment: 'This is used to know if editor sticky scroll is enabled or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('editor.stickyScroll.enabled', { settingValue: this.getValueToReport(key, target), source });
				return;

			case KEYWORD_ACTIVIATION_SETTING_ID:
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'bpasero';
					comment: 'This is used to know if voice keyword activation is enabled or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('accessibility.voice.keywordActivation', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.zoomLevel':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'bpasero';
					comment: 'This is used to know if window zoom level is configured or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('window.zoomLevel', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.zoomPerWindow':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'bpasero';
					comment: 'This is used to know if window zoom per window is configured or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('window.zoomPerWindow', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.titleBarStyle':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'benibenj';
					comment: 'This is used to know if window title bar style is set to custom or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('window.titleBarStyle', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.customTitleBarVisibility':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'benibenj';
					comment: 'This is used to know if window custom title bar visibility is configured or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('window.customTitleBarVisibility', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.nativeTabs':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'benibenj';
					comment: 'This is used to know if window native tabs are enabled or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('window.nativeTabs', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'extensions.verifySignature':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'sandy081';
					comment: 'This is used to know if extensions signature verification is enabled or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('extensions.verifySignature', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.systemColorTheme':
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'bpasero';
					comment: 'This is used to know how system color theme is enforced';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('window.systemColorTheme', { settingValue: this.getValueToReport(key, target), source });
				return;

			case 'window.newWindowProfile':
				{
					const valueToReport = this.getValueToReport(key, target);
					const settingValue =
						valueToReport === null ? 'null'
							: valueToReport === this.userDataProfilesService.defaultProfile.name
								? 'default'
								: 'custom';
					this.telemetryService.publicLog2<UpdatedSettingEvent, {
						owner: 'sandy081';
						comment: 'This is used to know the new window profile that is being used';
						settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'if the profile is default or not' };
						source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
					}>('window.newWindowProfile', { settingValue, source });
					return;
				}

			case AutoRestartConfigurationKey:
				this.telemetryService.publicLog2<UpdatedSettingEvent, {
					owner: 'sandy081';
					comment: 'This is used to know if extensions are getting auto restarted or not';
					settingValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'value of the setting' };
					source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'source of the setting' };
				}>('extensions.autoRestart', { settingValue: this.getValueToReport(key, target), source });
				return;
		}
	}

}

const workbenchContributionRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionRegistry.registerWorkbenchContribution(TelemetryContribution, LifecyclePhase.Restored);
workbenchContributionRegistry.registerWorkbenchContribution(ConfigurationTelemetryContribution, LifecyclePhase.Eventually);
