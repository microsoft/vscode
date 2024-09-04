/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Action } from '../../../../base/common/actions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IExtensionService, IExtensionHostProfile } from '../../../services/extensions/common/extensions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { Event } from '../../../../base/common/event.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService, RawContextKey, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { SlowExtensionAction } from './extensionsSlowActions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ReportExtensionIssueAction } from '../common/reportExtensionIssueAction.js';
import { AbstractRuntimeExtensionsEditor, IRuntimeExtension } from '../browser/abstractRuntimeExtensionsEditor.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IV8Profile, Utils } from '../../../../platform/profiling/common/profiling.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IExtensionFeaturesManagementService } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export const IExtensionHostProfileService = createDecorator<IExtensionHostProfileService>('extensionHostProfileService');
export const CONTEXT_PROFILE_SESSION_STATE = new RawContextKey<string>('profileSessionState', 'none');
export const CONTEXT_EXTENSION_HOST_PROFILE_RECORDED = new RawContextKey<boolean>('extensionHostProfileRecorded', false);

export enum ProfileSessionState {
	None = 0,
	Starting = 1,
	Running = 2,
	Stopping = 3
}

export interface IExtensionHostProfileService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeState: Event<void>;
	readonly onDidChangeLastProfile: Event<void>;

	readonly state: ProfileSessionState;
	readonly lastProfile: IExtensionHostProfile | null;

	startProfiling(): void;
	stopProfiling(): void;

	getUnresponsiveProfile(extensionId: ExtensionIdentifier): IExtensionHostProfile | undefined;
	setUnresponsiveProfile(extensionId: ExtensionIdentifier, profile: IExtensionHostProfile): void;
}

export class RuntimeExtensionsEditor extends AbstractRuntimeExtensionsEditor {

	private _profileInfo: IExtensionHostProfile | null;
	private _extensionsHostRecorded: IContextKey<boolean>;
	private _profileSessionState: IContextKey<string>;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService extensionService: IExtensionService,
		@INotificationService notificationService: INotificationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ILabelService labelService: ILabelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IClipboardService clipboardService: IClipboardService,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
		@IExtensionFeaturesManagementService extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IHoverService hoverService: IHoverService
	) {
		super(group, telemetryService, themeService, contextKeyService, extensionsWorkbenchService, extensionService, notificationService, contextMenuService, instantiationService, storageService, labelService, environmentService, clipboardService, extensionFeaturesManagementService, hoverService);
		this._profileInfo = this._extensionHostProfileService.lastProfile;
		this._extensionsHostRecorded = CONTEXT_EXTENSION_HOST_PROFILE_RECORDED.bindTo(contextKeyService);
		this._profileSessionState = CONTEXT_PROFILE_SESSION_STATE.bindTo(contextKeyService);

		this._register(this._extensionHostProfileService.onDidChangeLastProfile(() => {
			this._profileInfo = this._extensionHostProfileService.lastProfile;
			this._extensionsHostRecorded.set(!!this._profileInfo);
			this._updateExtensions();
		}));
		this._register(this._extensionHostProfileService.onDidChangeState(() => {
			const state = this._extensionHostProfileService.state;
			this._profileSessionState.set(ProfileSessionState[state].toLowerCase());
		}));
	}

	protected _getProfileInfo(): IExtensionHostProfile | null {
		return this._profileInfo;
	}

	protected _getUnresponsiveProfile(extensionId: ExtensionIdentifier): IExtensionHostProfile | undefined {
		return this._extensionHostProfileService.getUnresponsiveProfile(extensionId);
	}

	protected _createSlowExtensionAction(element: IRuntimeExtension): Action | null {
		if (element.unresponsiveProfile) {
			return this._instantiationService.createInstance(SlowExtensionAction, element.description, element.unresponsiveProfile);
		}
		return null;
	}

	protected _createReportExtensionIssueAction(element: IRuntimeExtension): Action | null {
		if (element.marketplaceInfo) {
			return this._instantiationService.createInstance(ReportExtensionIssueAction, element.description);
		}
		return null;
	}

	protected _createSaveExtensionHostProfileAction(): Action | null {
		return this._instantiationService.createInstance(SaveExtensionHostProfileAction, SaveExtensionHostProfileAction.ID, SaveExtensionHostProfileAction.LABEL);
	}

	protected _createProfileAction(): Action | null {
		const state = this._extensionHostProfileService.state;
		const profileAction = (
			state === ProfileSessionState.Running
				? this._instantiationService.createInstance(StopExtensionHostProfileAction, StopExtensionHostProfileAction.ID, StopExtensionHostProfileAction.LABEL)
				: this._instantiationService.createInstance(StartExtensionHostProfileAction, StartExtensionHostProfileAction.ID, StartExtensionHostProfileAction.LABEL)
		);
		return profileAction;
	}
}

export class StartExtensionHostProfileAction extends Action {
	static readonly ID = 'workbench.extensions.action.extensionHostProfile';
	static readonly LABEL = nls.localize('extensionHostProfileStart', "Start Extension Host Profile");

	constructor(
		id: string = StartExtensionHostProfileAction.ID, label: string = StartExtensionHostProfileAction.LABEL,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label);
	}

	override run(): Promise<any> {
		this._extensionHostProfileService.startProfiling();
		return Promise.resolve();
	}
}

export class StopExtensionHostProfileAction extends Action {
	static readonly ID = 'workbench.extensions.action.stopExtensionHostProfile';
	static readonly LABEL = nls.localize('stopExtensionHostProfileStart', "Stop Extension Host Profile");

	constructor(
		id: string = StartExtensionHostProfileAction.ID, label: string = StartExtensionHostProfileAction.LABEL,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label);
	}

	override run(): Promise<any> {
		this._extensionHostProfileService.stopProfiling();
		return Promise.resolve();
	}
}

export class SaveExtensionHostProfileAction extends Action {

	static readonly LABEL = nls.localize('saveExtensionHostProfile', "Save Extension Host Profile");
	static readonly ID = 'workbench.extensions.action.saveExtensionHostProfile';

	constructor(
		id: string = SaveExtensionHostProfileAction.ID, label: string = SaveExtensionHostProfileAction.LABEL,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
		@IFileService private readonly _fileService: IFileService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
	) {
		super(id, label, undefined, false);
		this._extensionHostProfileService.onDidChangeLastProfile(() => {
			this.enabled = (this._extensionHostProfileService.lastProfile !== null);
		});
	}

	override run(): Promise<any> {
		return Promise.resolve(this._asyncRun());
	}

	private async _asyncRun(): Promise<any> {
		const picked = await this._fileDialogService.showSaveDialog({
			title: nls.localize('saveprofile.dialogTitle', "Save Extension Host Profile"),
			availableFileSystems: [Schemas.file],
			defaultUri: joinPath(await this._fileDialogService.defaultFilePath(), `CPU-${new Date().toISOString().replace(/[\-:]/g, '')}.cpuprofile`),
			filters: [{
				name: 'CPU Profiles',
				extensions: ['cpuprofile', 'txt']
			}]
		});

		if (!picked) {
			return;
		}

		const profileInfo = this._extensionHostProfileService.lastProfile;
		let dataToWrite: object = profileInfo ? profileInfo.data : {};

		let savePath = picked.fsPath;

		if (this._environmentService.isBuilt) {
			// when running from a not-development-build we remove
			// absolute filenames because we don't want to reveal anything
			// about users. We also append the `.txt` suffix to make it
			// easier to attach these files to GH issues
			dataToWrite = Utils.rewriteAbsolutePaths(dataToWrite as IV8Profile, 'piiRemoved');

			savePath = savePath + '.txt';
		}

		return this._fileService.writeFile(URI.file(savePath), VSBuffer.fromString(JSON.stringify(profileInfo ? profileInfo.data : {}, null, '\t')));
	}
}
