/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./workspaceTrustEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustService, WorkspaceTrustState, WorkspaceTrustStateChangeEvent, workspaceTrustStateToString } from 'vs/platform/workspace/common/workspaceTrust';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IActivityService, IconBadge } from 'vs/workbench/services/activity/common/activity';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeColor } from 'vs/workbench/api/common/extHostTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { IEditorRegistry, Extensions as EditorExtensions, EditorDescriptor } from 'vs/workbench/browser/editor';
import { WorkspaceTrustEditor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustEditor';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WorkspaceTrustContext, WORKSPACE_TRUST_ENABLED } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { EditorInput, Extensions as EditorInputExtensions, IEditorInputSerializer, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { isWeb } from 'vs/base/common/platform';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';

const workspaceTrustIcon = registerIcon('workspace-trust-icon', Codicon.shield, localize('workspaceTrustIcon', "Icon for workspace trust badge."));

/*
 * Trust Request UX Handler
 */
export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {
	private readonly requestModel = this.workspaceTrustService.requestModel;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private shouldShowManagementEditor = true;

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IDialogService private readonly dialogService: IDialogService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustService private readonly workspaceTrustService: IWorkspaceTrustService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.registerListeners();
	}

	private toggleRequestBadge(visible: boolean): void {
		this.badgeDisposable.clear();

		if (visible) {
			this.badgeDisposable.value = this.activityService.showGlobalActivity({
				badge: new IconBadge(workspaceTrustIcon, () => localize('requestTrustIconText', "Some features require workspace trust.")),
				priority: 10
			});

			const managementEditorShownKey = 'workspace.trust.management.shown';
			const seen = this.storageService.getBoolean(managementEditorShownKey, StorageScope.WORKSPACE, false);
			if (!seen && this.shouldShowManagementEditor) {
				this.storageService.store(managementEditorShownKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				this.commandService.executeCommand('workbench.trust.manage');
			}
		}
	}

	private registerListeners(): void {
		this._register(this.requestModel.onDidInitiateRequest(async () => {
			if (this.requestModel.trustRequestOptions) {
				this.toggleRequestBadge(true);

				type WorkspaceTrustRequestedEventClassification = {
					modal: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
					workspaceId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
					extensions: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				};

				type WorkspaceTrustRequestedEvent = {
					modal: boolean,
					workspaceId: string,
					extensions: string[]
				};

				this.telemetryService.publicLog2<WorkspaceTrustRequestedEvent, WorkspaceTrustRequestedEventClassification>('workspaceTrustRequested', {
					modal: this.requestModel.trustRequestOptions.modal,
					workspaceId: this.workspaceContextService.getWorkspace().id,
					extensions: (await this.extensionService.getExtensions()).filter(ext => !!ext.workspaceTrust).map(ext => ext.identifier.value)
				});

				if (this.requestModel.trustRequestOptions.modal) {
					// Message
					const defaultMessage = localize('immediateTrustRequestMessage', "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.");
					const message = this.requestModel.trustRequestOptions.message ?? defaultMessage;

					// Buttons
					const buttons = this.requestModel.trustRequestOptions.buttons ?? [
						{ label: localize('grantWorkspaceTrustButton', "Continue"), type: 'ContinueWithTrust' },
						{ label: localize('manageWorkspaceTrustButton', "Learn More"), type: 'Manage' }
					];
					// Add Cancel button if not provided
					if (!buttons.some(b => b.type === 'Cancel')) {
						buttons.push({ label: localize('cancelWorkspaceTrustButton', "Cancel"), type: 'Cancel' });
					}

					// Dialog
					const result = await this.dialogService.show(
						Severity.Warning,
						localize('immediateTrustRequestTitle', "Do you trust the files in this folder?"),
						buttons.map(b => b.label),
						{
							cancelId: buttons.findIndex(b => b.type === 'Cancel'),
							detail: localize('immediateTrustRequestDetail', "{0}\n\nYou should only trust this workspace if you trust its source. Otherwise, features will be enabled that may compromise your device or personal information.", message),
						}
					);

					// Dialog result
					switch (buttons[result.choice].type) {
						case 'ContinueWithTrust':
							this.requestModel.completeRequest(WorkspaceTrustState.Trusted);
							break;
						case 'ContinueWithoutTrust':
							this.requestModel.completeRequest(undefined);
							break;
						case 'Manage':
							this.requestModel.cancelRequest();
							await this.commandService.executeCommand('workbench.trust.manage');
							break;
						case 'Cancel':
							this.requestModel.cancelRequest();
							break;
					}
				}
			}
		}));

		this._register(this.requestModel.onDidCompleteRequest(trustState => {
			if (trustState !== undefined && trustState !== WorkspaceTrustState.Unspecified) {
				this.toggleRequestBadge(false);
			}
		}));

		this._register(this.workspaceTrustService.onDidChangeTrustState(async (trustState) => {
			type WorkspaceTrustStateChangedEvent = {
				workspaceId: string,
				previousState: WorkspaceTrustState,
				newState: WorkspaceTrustState
			};

			type WorkspaceTrustStateChangedEventClassification = {
				workspaceId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				previousState: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
				newState: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			};

			this.telemetryService.publicLog2<WorkspaceTrustStateChangedEvent, WorkspaceTrustStateChangedEventClassification>('workspaceTrustStateChanged', {
				workspaceId: this.workspaceContextService.getWorkspace().id,
				previousState: trustState.previousTrustState,
				newState: trustState.currentTrustState
			});

			// Transition from Trusted -> Untrusted/Unknown
			if (trustState.previousTrustState === WorkspaceTrustState.Trusted && trustState.currentTrustState !== WorkspaceTrustState.Trusted) {
				this.hostService.reload();
			}

			// Hide soft request badge
			if (trustState.currentTrustState !== undefined && trustState.currentTrustState !== WorkspaceTrustState.Unspecified) {
				this.toggleRequestBadge(false);
			}
		}));

		// Don't auto-show the UX editor if the request is 5 seconds after startup
		setTimeout(() => { this.shouldShowManagementEditor = false; }, 5000);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);

/*
 * Status Bar Entry
 */
class WorkspaceTrustStatusbarItem extends Disposable implements IWorkbenchContribution {
	private static readonly ID = 'status.workspaceTrust';
	private readonly statusBarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor>;
	private pendingRequestContextKey = WorkspaceTrustContext.PendingRequest.key;
	private contextKeys = new Set([this.pendingRequestContextKey]);

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkspaceTrustService private readonly workspaceTrustService: IWorkspaceTrustService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.statusBarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

		if (this.workspaceTrustService.isWorkspaceTrustEnabled()) {
			const entry = this.getStatusbarEntry(this.workspaceTrustService.getWorkspaceTrustState());
			this.statusBarEntryAccessor.value = this.statusbarService.addEntry(entry, WorkspaceTrustStatusbarItem.ID, localize('status.WorkspaceTrust', "Workspace Trust"), StatusbarAlignment.LEFT, 0.99 * Number.MAX_VALUE /* Right of remote indicator */);
			this._register(this.workspaceTrustService.onDidChangeTrustState(trustState => this.updateStatusbarEntry(trustState)));
			this._register(this.contextKeyService.onDidChangeContext((contextChange) => {
				if (contextChange.affectsSome(this.contextKeys)) {
					this.updateVisibility(this.workspaceTrustService.getWorkspaceTrustState());
				}
			}));

			this.updateVisibility(this.workspaceTrustService.getWorkspaceTrustState());
		}
	}

	private getStatusbarEntry(state: WorkspaceTrustState): IStatusbarEntry {
		const text = workspaceTrustStateToString(state);
		const backgroundColor = state === WorkspaceTrustState.Trusted ?
			'transparent' : new ThemeColor('statusBarItem.prominentBackground');
		const color = state === WorkspaceTrustState.Trusted ? '#00dd3b' : '#ff5462';

		return {
			text: state === WorkspaceTrustState.Trusted ? `$(shield)` : `$(shield) ${text}`,
			ariaLabel: localize('status.WorkspaceTrust', "Workspace Trust"),
			tooltip: localize('status.WorkspaceTrust', "Workspace Trust"),
			command: 'workbench.trust.manage',
			backgroundColor,
			color
		};
	}

	private updateVisibility(trustState: WorkspaceTrustState): void {
		const pendingRequest = this.contextKeyService.getContextKeyValue(this.pendingRequestContextKey) === true;
		this.statusbarService.updateEntryVisibility(WorkspaceTrustStatusbarItem.ID, trustState === WorkspaceTrustState.Untrusted || pendingRequest);
	}

	private updateStatusbarEntry(trustStateChange: WorkspaceTrustStateChangeEvent): void {
		this.statusBarEntryAccessor.value?.update(this.getStatusbarEntry(trustStateChange.currentTrustState));
		this.updateVisibility(trustStateChange.currentTrustState);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkspaceTrustStatusbarItem,
	LifecyclePhase.Starting
);

/**
 * Trusted Workspace GUI Editor
 */
class WorkspaceTrustEditorInputSerializer implements IEditorInputSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: WorkspaceTrustEditorInput): string {
		return '{}';
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): WorkspaceTrustEditorInput {
		return instantiationService.createInstance(WorkspaceTrustEditorInput);
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories)
	.registerEditorInputSerializer(WorkspaceTrustEditorInput.ID, WorkspaceTrustEditorInputSerializer);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		WorkspaceTrustEditor,
		WorkspaceTrustEditor.ID,
		localize('workspaceTrustEditor', "Workspace Trust Editor")
	),
	[
		new SyncDescriptor(WorkspaceTrustEditorInput)
	]
);

/*
 * Actions
 */

// Grant Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.grant',
			title: {
				original: 'Grant Workspace Trust',
				value: localize('grantWorkspaceTrust', "Grant Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: WorkspaceTrustContext.TrustState.isEqualTo(WorkspaceTrustState.Trusted).negate(),
			menu: {
				id: MenuId.GlobalActivity,
				when: WorkspaceTrustContext.PendingRequest,
				group: '6_workspace_trust',
				order: 10
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(IWorkspaceTrustService);

		const result = await dialogService.confirm({
			message: localize('grantWorkspaceTrust', "Grant Workspace Trust"),
			detail: localize('confirmGrantWorkspaceTrust', "Granting trust to the workspace will enable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to trust this workspace?"),
			primaryButton: localize('yes', 'Yes'),
			secondaryButton: localize('no', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.requestModel.completeRequest(WorkspaceTrustState.Trusted);
		}

		return;
	}
});

// Deny Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.deny',
			title: {
				original: 'Deny Workspace Trust',
				value: localize('denyWorkspaceTrust', "Deny Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: WorkspaceTrustContext.TrustState.isEqualTo(WorkspaceTrustState.Untrusted).negate(),
			menu: {
				id: MenuId.GlobalActivity,
				when: WorkspaceTrustContext.PendingRequest,
				group: '6_workspace_trust',
				order: 20
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(IWorkspaceTrustService);

		const result = await dialogService.confirm({
			message: localize('denyWorkspaceTrust', "Deny Workspace Trust"),
			detail: localize('confirmDenyWorkspaceTrust', "Denying trust to the workspace will disable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to deny trust to this workspace?"),
			primaryButton: localize('yes', 'Yes'),
			secondaryButton: localize('no', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.requestModel.completeRequest(WorkspaceTrustState.Untrusted);
		}
		return;
	}
});

// Manage Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.manage',
			title: {
				original: 'Manage Workspace Trust',
				value: localize('manageWorkspaceTrust', "Manage Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			menu: {
				id: MenuId.GlobalActivity,
				group: '6_workspace_trust',
				order: 40,
				when: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true), WorkspaceTrustContext.PendingRequest.negate())
			},
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const input = instantiationService.createInstance(WorkspaceTrustEditorInput);

		editorService.openEditor(input, { pinned: true, revealIfOpened: true });
		return;
	}
});

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	command: {
		id: 'workbench.trust.manage',
		title: localize('manageWorkspaceTrustPending', "Manage Workspace Trust (1)"),
	},
	group: '6_workspace_trust',
	order: 40,
	when: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true), WorkspaceTrustContext.PendingRequest)
});

// Configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'security',
		order: 7,
		title: localize('securityConfigurationTitle', "Security"),
		type: 'object',
		properties: {
			[WORKSPACE_TRUST_ENABLED]: {
				type: 'boolean',
				default: false,
				included: !isWeb,
				description: localize('workspace.trust.description', "Controls whether or not workspace trust is enabled within VS Code."),
			}
		}
	});
