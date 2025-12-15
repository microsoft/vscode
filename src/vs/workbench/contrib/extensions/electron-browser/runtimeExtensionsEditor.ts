/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Action2, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IV8Profile, Utils } from '../../../../platform/profiling/common/profiling.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionFeaturesManagementService } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionHostProfile, IExtensionService } from '../../../services/extensions/common/extensions.js';
import { AbstractRuntimeExtensionsEditor, IRuntimeExtension } from '../browser/abstractRuntimeExtensionsEditor.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { ReportExtensionIssueAction } from '../common/reportExtensionIssueAction.js';
import { SlowExtensionAction } from './extensionsSlowActions.js';

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
	lastProfileSavedTo: URI | undefined;

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
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
	) {
		super(group, telemetryService, themeService, contextKeyService, extensionsWorkbenchService, extensionService, notificationService, contextMenuService, instantiationService, storageService, labelService, environmentService, clipboardService, extensionFeaturesManagementService, hoverService, menuService);
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
}

export class StartExtensionHostProfileAction extends Action2 {
	static readonly ID = 'workbench.extensions.action.extensionHostProfile';
	static readonly LABEL = nls.localize('extensionHostProfileStart', "Start Extension Host Profile");

	constructor() {
		super({
			id: StartExtensionHostProfileAction.ID,
			title: { value: StartExtensionHostProfileAction.LABEL, original: 'Start Extension Host Profile' },
			precondition: CONTEXT_PROFILE_SESSION_STATE.isEqualTo('none'),
			icon: Codicon.circleFilled,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running')),
				group: 'navigation',
			}, {
				id: MenuId.ExtensionEditorContextMenu,
				when: CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running'),
				group: 'profiling',
			}]
		});
	}

	run(accessor: ServicesAccessor): Promise<any> {
		const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
		extensionHostProfileService.startProfiling();
		return Promise.resolve();
	}
}

export class StopExtensionHostProfileAction extends Action2 {
	static readonly ID = 'workbench.extensions.action.stopExtensionHostProfile';
	static readonly LABEL = nls.localize('stopExtensionHostProfileStart', "Stop Extension Host Profile");

	constructor() {
		super({
			id: StopExtensionHostProfileAction.ID,
			title: { value: StopExtensionHostProfileAction.LABEL, original: 'Stop Extension Host Profile' },
			icon: Codicon.debugStop,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running')),
				group: 'navigation',
			}, {
				id: MenuId.ExtensionEditorContextMenu,
				when: CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running'),
				group: 'profiling',
			}]
		});
	}

	run(accessor: ServicesAccessor): Promise<any> {
		const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
		extensionHostProfileService.stopProfiling();
		return Promise.resolve();
	}
}

export class OpenExtensionHostProfileACtion extends Action2 {
	static readonly LABEL = nls.localize('openExtensionHostProfile', "Open Extension Host Profile");
	static readonly ID = 'workbench.extensions.action.openExtensionHostProfile';

	constructor() {
		super({
			id: OpenExtensionHostProfileACtion.ID,
			title: { value: OpenExtensionHostProfileACtion.LABEL, original: 'Open Extension Host Profile' },
			precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
			icon: Codicon.graph,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)),
				group: 'navigation',
			}, {
				id: MenuId.ExtensionEditorContextMenu,
				when: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
				group: 'profiling',
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
		const commandService = accessor.get(ICommandService);
		const editorService = accessor.get(IEditorService);
		if (!extensionHostProfileService.lastProfileSavedTo) {
			await commandService.executeCommand(SaveExtensionHostProfileAction.ID);
		}
		if (!extensionHostProfileService.lastProfileSavedTo) {
			return;
		}

		await editorService.openEditor({
			resource: extensionHostProfileService.lastProfileSavedTo,
			options: {
				revealIfOpened: true,
				override: 'jsProfileVisualizer.cpuprofile.table',
			},
		}, SIDE_GROUP);
	}

}

export class SaveExtensionHostProfileAction extends Action2 {

	static readonly LABEL = nls.localize('saveExtensionHostProfile', "Save Extension Host Profile");
	static readonly ID = 'workbench.extensions.action.saveExtensionHostProfile';

	constructor() {
		super({
			id: SaveExtensionHostProfileAction.ID,
			title: { value: SaveExtensionHostProfileAction.LABEL, original: 'Save Extension Host Profile' },
			precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
			icon: Codicon.saveAll,
			menu: [{
				id: MenuId.EditorTitle,
				when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)),
				group: 'navigation',
			}, {
				id: MenuId.ExtensionEditorContextMenu,
				when: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
				group: 'profiling',
			}]
		});
	}

	run(accessor: ServicesAccessor): Promise<any> {
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
		const fileService = accessor.get(IFileService);
		const fileDialogService = accessor.get(IFileDialogService);
		return this._asyncRun(environmentService, extensionHostProfileService, fileService, fileDialogService);
	}

	private async _asyncRun(
		environmentService: IWorkbenchEnvironmentService,
		extensionHostProfileService: IExtensionHostProfileService,
		fileService: IFileService,
		fileDialogService: IFileDialogService
	): Promise<any> {
		const picked = await fileDialogService.showSaveDialog({
			title: nls.localize('saveprofile.dialogTitle', "Save Extension Host Profile"),
			availableFileSystems: [Schemas.file],
			defaultUri: joinPath(await fileDialogService.defaultFilePath(), `CPU-${new Date().toISOString().replace(/[\-:]/g, '')}.cpuprofile`),
			filters: [{
				name: 'CPU Profiles',
				extensions: ['cpuprofile', 'txt']
			}]
		});

		if (!picked) {
			return;
		}

		const profileInfo = extensionHostProfileService.lastProfile;
		let dataToWrite: object = profileInfo ? profileInfo.data : {};

		let savePath = picked.fsPath;

		if (environmentService.isBuilt) {
			// when running from a not-development-build we remove
			// absolute filenames because we don't want to reveal anything
			// about users. We also append the `.txt` suffix to make it
			// easier to attach these files to GH issues
			dataToWrite = Utils.rewriteAbsolutePaths(dataToWrite as IV8Profile, 'piiRemoved');

			savePath = savePath + '.txt';
		}

		const saveURI = URI.file(savePath);
		extensionHostProfileService.lastProfileSavedTo = saveURI;
		return fileService.writeFile(saveURI, VSBuffer.fromString(JSON.stringify(profileInfo ? profileInfo.data : {}, null, '\t')));
	}
}

