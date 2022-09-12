/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase, ILifecycleService, StartupKind } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { language } from 'vs/base/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { configurationTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextFileService, ITextFileSaveEvent, ITextFileResolveEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { extname, basename, isEqual, isEqualOrParent } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { getMimeTypes } from 'vs/editor/common/services/languagesAssociations';
import { hash } from 'vs/base/common/hash';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

type TelemetryData = {
	mimeType: string;
	ext: string;
	path: number;
	reason?: number;
	allowlistedjson?: string;
};

type FileTelemetryDataFragment = {
	mimeType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language type of the file (for example XML).' };
	ext: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The file extension of the file (for example xml).' };
	path: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The path of the file as a hash.' };
	reason?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The reason why a file is read or written. Allows to e.g. distinguish auto save from normal save.' };
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
		@IConfigurationService configurationService: IConfigurationService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@ITextFileService textFileService: ITextFileService
	) {
		super();

		const { filesToOpenOrCreate, filesToDiff, filesToMerge } = environmentService;
		const activeViewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);

		type WindowSizeFragment = {
			innerHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The height of the current window.' };
			innerWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The width of the current window.' };
			outerHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The height of the current window with all decoration removed.' };
			outerWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The width of the current window with all decoration removed.' };
			owner: 'bpasero';
			comment: 'The size of the window.';
		};

		type WorkspaceLoadClassification = {
			owner: 'bpasero';
			userAgent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The user agent as reported by `navigator.userAgent` by Electron or the web browser.' };
			emptyWorkbench: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a folder or workspace is opened or not.' };
			windowSize: WindowSizeFragment;
			'workbench.filesToOpenOrCreate': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files that should open or be created.' };
			'workbench.filesToDiff': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files that should be compared.' };
			'workbench.filesToMerge': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files that should be merged.' };
			customKeybindingsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of custom keybindings' };
			theme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current theme of the window.' };
			language: { classification: 'SystemMetaData'; purpose: 'BusinessInsight'; comment: 'The display language of the window.' };
			pinnedViewlets: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifiers of views that are pinned.' };
			restoredViewlet?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the view that is restored.' };
			restoredEditors: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of editors that restored.' };
			startupKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How the window was opened, e.g via reload or not.' };
			comment: 'Metadata around the workspace that is being loaded into a window.';
		};

		type WorkspaceLoadEvent = {
			userAgent: string;
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
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
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

		// Configuration Telemetry
		this._register(configurationTelemetry(telemetryService, configurationService));

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
			mimeType: getMimeTypes(resource).join(', '),
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

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TelemetryContribution, 'TelemetryContribution', LifecyclePhase.Restored);
