/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./remoteViewlet';
import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { FilterViewContainerViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { VIEWLET_ID, VIEW_CONTAINER } from 'vs/workbench/contrib/remote/common/remote.contribution';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptor, IViewsRegistry, Extensions } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ShowViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IProgress, IProgressStep, IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ReconnectionWaitEvent, PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import Severity from 'vs/base/common/severity';
import { ReloadWindowAction } from 'vs/workbench/browser/actions/windowActions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { SwitchRemoteViewItem, SwitchRemoteAction } from 'vs/workbench/contrib/remote/browser/explorerViewItems';
import { Action, IActionViewItem, IAction } from 'vs/base/common/actions';
import { isStringArray } from 'vs/base/common/types';
import { IRemoteExplorerService, HelpInformation } from 'vs/workbench/services/remote/common/remoteExplorerService';

class HelpModel {
	items: IHelpItem[] | undefined;

	constructor(
		openerService: IOpenerService,
		quickInputService: IQuickInputService,
		commandService: ICommandService,
		remoteExplorerService: IRemoteExplorerService,
	) {
		let helpItems: IHelpItem[] = [];
		const getStarted = remoteExplorerService.helpInformation.filter(info => info.getStarted);

		if (getStarted.length) {
			helpItems.push(new HelpItem(
				['getStarted'],
				nls.localize('remote.help.getStarted', "Get Started"),
				getStarted.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.getStarted!
				})),
				openerService,
				quickInputService
			));
		}

		const documentation = remoteExplorerService.helpInformation.filter(info => info.documentation);

		if (documentation.length) {
			helpItems.push(new HelpItem(
				['documentation'],
				nls.localize('remote.help.documentation', "Read Documentation"),
				documentation.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.documentation!
				})),
				openerService,
				quickInputService
			));
		}

		const feedback = remoteExplorerService.helpInformation.filter(info => info.feedback);

		if (feedback.length) {
			helpItems.push(new HelpItem(
				['feedback'],
				nls.localize('remote.help.feedback', "Provide Feedback"),
				feedback.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.feedback!
				})),
				openerService,
				quickInputService
			));
		}

		const issues = remoteExplorerService.helpInformation.filter(info => info.issues);

		if (issues.length) {
			helpItems.push(new HelpItem(
				['issues'],
				nls.localize('remote.help.issues', "Review Issues"),
				issues.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.issues!
				})),
				openerService,
				quickInputService
			));
		}

		if (helpItems.length) {
			helpItems.push(new IssueReporterItem(
				['issueReporter'],
				nls.localize('remote.help.report', "Report Issue"),
				remoteExplorerService.helpInformation.map(info => info.extensionDescription),
				quickInputService,
				commandService
			));
		}

		if (helpItems.length) {
			this.items = helpItems;
		}
	}
}

interface IHelpItem extends IQuickPickItem {
	label: string;
	handleClick(): Promise<void>;
}

class HelpItem implements IHelpItem {
	constructor(
		public iconClasses: string[],
		public label: string,
		public values: { extensionDescription: IExtensionDescription; url: string }[],
		private openerService: IOpenerService,
		private quickInputService: IQuickInputService
	) {
		iconClasses.push('remote-help-tree-node-item-icon');
	}

	async handleClick() {
		if (this.values.length > 1) {
			let actions = this.values.map(value => {
				return {
					label: value.extensionDescription.displayName || value.extensionDescription.identifier.value,
					description: value.url
				};
			});

			const action = await this.quickInputService.pick(actions, { placeHolder: nls.localize('pickRemoteExtension', "Select url to open") });

			if (action) {
				await this.openerService.open(URI.parse(action.description));
			}
		} else {
			await this.openerService.open(URI.parse(this.values[0].url));
		}
	}
}

class IssueReporterItem implements IHelpItem {
	constructor(
		public iconClasses: string[],
		public label: string,
		public extensionDescriptions: IExtensionDescription[],
		private quickInputService: IQuickInputService,
		private commandService: ICommandService
	) {
		iconClasses.push('remote-help-tree-node-item-icon');
	}

	async handleClick() {
		if (this.extensionDescriptions.length > 1) {
			let actions = this.extensionDescriptions.map(extension => {
				return {
					label: extension.displayName || extension.identifier.value,
					identifier: extension.identifier
				};
			});

			const action = await this.quickInputService.pick(actions, { placeHolder: nls.localize('pickRemoteExtensionToReportIssue', "Select an extension to report issue") });

			if (action) {
				await this.commandService.executeCommand('workbench.action.openIssueReporter', [action.identifier.value]);
			}
		} else {
			await this.commandService.executeCommand('workbench.action.openIssueReporter', [this.extensionDescriptions[0].identifier.value]);
		}
	}
}

class HelpAction extends Action {
	static readonly ID = 'remote.explorer.help';
	static readonly LABEL = nls.localize('remote.explorer.help', "Help and Feedback");
	private helpModel: HelpModel;

	constructor(id: string,
		label: string,
		@IOpenerService private readonly openerService: IOpenerService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService
	) {
		super(id, label, 'codicon codicon-question');
		this.helpModel = new HelpModel(openerService, quickInputService, commandService, remoteExplorerService);
	}

	async run(event?: any): Promise<any> {
		if (!this.helpModel.items) {
			this.helpModel = new HelpModel(this.openerService, this.quickInputService, this.commandService, this.remoteExplorerService);
		}
		if (this.helpModel.items) {
			const selection = await this.quickInputService.pick(this.helpModel.items, { placeHolder: nls.localize('remote.explorer.helpPlaceholder', "Help and Feedback") });
			if (selection) {
				return selection.handleClick();
			}
		}
	}
}

export class RemoteViewlet extends FilterViewContainerViewlet {
	private actions: IAction[] | undefined;

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IRemoteExplorerService remoteExplorerService: IRemoteExplorerService
	) {
		super(VIEWLET_ID, remoteExplorerService.onDidChangeTargetType, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
	}

	protected getFilterOn(viewDescriptor: IViewDescriptor): string | undefined {
		return isStringArray(viewDescriptor.remoteAuthority) ? viewDescriptor.remoteAuthority[0] : viewDescriptor.remoteAuthority;
	}

	public getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === SwitchRemoteAction.ID) {
			return this.instantiationService.createInstance(SwitchRemoteViewItem, action, SwitchRemoteViewItem.createOptionItems(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).getViews(VIEW_CONTAINER)));
		}

		return super.getActionViewItem(action);
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(SwitchRemoteAction, SwitchRemoteAction.ID, SwitchRemoteAction.LABEL),
				this.instantiationService.createInstance(HelpAction, HelpAction.ID, HelpAction.LABEL)
			];
			this.actions.forEach(a => {
				this._register(a);
			});
		}
		return this.actions;
	}

	getTitle(): string {
		const title = nls.localize('remote.explorer', "Remote Explorer");
		return title;
	}
}

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	RemoteViewlet,
	VIEWLET_ID,
	nls.localize('remote.explorer', "Remote Explorer"),
	'codicon-remote-explorer',
	4
));

class OpenRemoteViewletAction extends ShowViewletAction {

	static readonly ID = VIEWLET_ID;
	static readonly LABEL = nls.localize('toggleRemoteViewlet', "Show Remote Explorer");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IEditorGroupsService editorGroupService: IEditorGroupsService, @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService, layoutService);
	}
}

// Register Action to Open Viewlet
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenRemoteViewletAction, VIEWLET_ID, nls.localize('toggleRemoteViewlet', "Show Remote Explorer"), {
		primary: 0
	}),
	'View: Show Remote Explorer',
	nls.localize('view', "View")
);


class ProgressReporter {
	private _currentProgress: IProgress<IProgressStep> | null = null;
	private lastReport: string | null = null;

	constructor(currentProgress: IProgress<IProgressStep> | null) {
		this._currentProgress = currentProgress;
	}

	set currentProgress(progress: IProgress<IProgressStep>) {
		this._currentProgress = progress;
	}

	report(message?: string) {
		if (message) {
			this.lastReport = message;
		}

		if (this.lastReport && this._currentProgress) {
			this._currentProgress.report({ message: this.lastReport });
		}
	}
}

class RemoteAgentConnectionStatusListener implements IWorkbenchContribution {
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IProgressService progressService: IProgressService,
		@IDialogService dialogService: IDialogService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			let currentProgressPromiseResolve: (() => void) | null = null;
			let progressReporter: ProgressReporter | null = null;
			let lastLocation: ProgressLocation | null = null;
			let currentTimer: ReconnectionTimer | null = null;
			let reconnectWaitEvent: ReconnectionWaitEvent | null = null;
			let disposableListener: IDisposable | null = null;

			function showProgress(location: ProgressLocation, buttons: { label: string, callback: () => void }[]) {
				if (currentProgressPromiseResolve) {
					currentProgressPromiseResolve();
				}

				const promise = new Promise<void>((resolve) => currentProgressPromiseResolve = resolve);
				lastLocation = location;

				if (location === ProgressLocation.Dialog) {
					// Show dialog
					progressService!.withProgress(
						{ location: ProgressLocation.Dialog, buttons: buttons.map(button => button.label) },
						(progress) => { if (progressReporter) { progressReporter.currentProgress = progress; } return promise; },
						(choice?) => {
							// Handle choice from dialog
							if (buttons[choice]) {
								buttons[choice].callback();
							} else {
								showProgress(ProgressLocation.Notification, buttons);
							}

							progressReporter!.report();
						});
				} else {
					// Show notification
					progressService!.withProgress(
						{ location: ProgressLocation.Notification, buttons: buttons.map(button => button.label) },
						(progress) => { if (progressReporter) { progressReporter.currentProgress = progress; } return promise; },
						(choice?) => {
							// Handle choice from dialog
							if (buttons[choice]) {
								buttons[choice].callback();
							} else {
								hideProgress();
							}
						});
				}
			}

			function hideProgress() {
				if (currentProgressPromiseResolve) {
					currentProgressPromiseResolve();
				}

				currentProgressPromiseResolve = null;
			}

			const reconnectButton = {
				label: nls.localize('reconnectNow', "Reconnect Now"),
				callback: () => {
					if (reconnectWaitEvent) {
						reconnectWaitEvent.skipWait();
					}
				}
			};

			const reloadButton = {
				label: nls.localize('reloadWindow', "Reload Window"),
				callback: () => {
					commandService.executeCommand(ReloadWindowAction.ID);
				}
			};

			connection.onDidStateChange((e) => {
				if (currentTimer) {
					currentTimer.dispose();
					currentTimer = null;
				}

				if (disposableListener) {
					disposableListener.dispose();
					disposableListener = null;
				}
				switch (e.type) {
					case PersistentConnectionEventType.ConnectionLost:
						if (!currentProgressPromiseResolve) {
							progressReporter = new ProgressReporter(null);
							showProgress(ProgressLocation.Dialog, [reconnectButton, reloadButton]);
						}

						progressReporter!.report(nls.localize('connectionLost', "Connection Lost"));
						break;
					case PersistentConnectionEventType.ReconnectionWait:
						hideProgress();
						reconnectWaitEvent = e;
						showProgress(lastLocation || ProgressLocation.Notification, [reconnectButton, reloadButton]);
						currentTimer = new ReconnectionTimer(progressReporter!, Date.now() + 1000 * e.durationSeconds);
						break;
					case PersistentConnectionEventType.ReconnectionRunning:
						hideProgress();
						showProgress(lastLocation || ProgressLocation.Notification, [reloadButton]);
						progressReporter!.report(nls.localize('reconnectionRunning', "Attempting to reconnect..."));

						// Register to listen for quick input is opened
						disposableListener = contextKeyService.onDidChangeContext((contextKeyChangeEvent) => {
							const reconnectInteraction = new Set<string>(['inQuickOpen']);
							if (contextKeyChangeEvent.affectsSome(reconnectInteraction)) {
								// Need to move from dialog if being shown and user needs to type in a prompt
								if (lastLocation === ProgressLocation.Dialog && progressReporter !== null) {
									hideProgress();
									showProgress(ProgressLocation.Notification, [reloadButton]);
									progressReporter.report();
								}
							}
						});

						break;
					case PersistentConnectionEventType.ReconnectionPermanentFailure:
						hideProgress();
						progressReporter = null;

						dialogService.show(Severity.Error, nls.localize('reconnectionPermanentFailure', "Cannot reconnect. Please reload the window."), [nls.localize('reloadWindow', "Reload Window"), nls.localize('cancel', "Cancel")], { cancelId: 1 }).then(result => {
							// Reload the window
							if (result.choice === 0) {
								commandService.executeCommand(ReloadWindowAction.ID);
							}
						});
						break;
					case PersistentConnectionEventType.ConnectionGain:
						hideProgress();
						progressReporter = null;
						break;
				}
			});
		}
	}
}

class ReconnectionTimer implements IDisposable {
	private readonly _progressReporter: ProgressReporter;
	private readonly _completionTime: number;
	private readonly _token: any;

	constructor(progressReporter: ProgressReporter, completionTime: number) {
		this._progressReporter = progressReporter;
		this._completionTime = completionTime;
		this._token = setInterval(() => this._render(), 1000);
		this._render();
	}

	public dispose(): void {
		clearInterval(this._token);
	}

	private _render() {
		const remainingTimeMs = this._completionTime - Date.now();
		if (remainingTimeMs < 0) {
			return;
		}
		const remainingTime = Math.ceil(remainingTimeMs / 1000);
		if (remainingTime === 1) {
			this._progressReporter.report(nls.localize('reconnectionWaitOne', "Attempting to reconnect in {0} second...", remainingTime));
		} else {
			this._progressReporter.report(nls.localize('reconnectionWaitMany', "Attempting to reconnect in {0} seconds...", remainingTime));
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentConnectionStatusListener, LifecyclePhase.Eventually);
