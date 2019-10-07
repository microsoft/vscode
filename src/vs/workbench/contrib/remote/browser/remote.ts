/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./remoteViewlet';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
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
import { ViewContainerViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { VIEWLET_ID, VIEW_CONTAINER } from 'vs/workbench/contrib/remote/common/remote.contribution';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IAddedViewDescriptorRef } from 'vs/workbench/browser/parts/views/views';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptor, IViewsRegistry, Extensions } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { ExtensionsRegistry, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { WorkbenchAsyncDataTree, TreeResourceNavigator2 } from 'vs/platform/list/browser/listService';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { Event } from 'vs/base/common/event';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
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
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

interface HelpInformation {
	extensionDescription: IExtensionDescription;
	getStarted?: string;
	documentation?: string;
	feedback?: string;
	issues?: string;
}

const remoteHelpExtPoint = ExtensionsRegistry.registerExtensionPoint<HelpInformation>({
	extensionPoint: 'remoteHelp',
	jsonSchema: {
		description: nls.localize('RemoteHelpInformationExtPoint', 'Contributes help information for Remote'),
		type: 'object',
		properties: {
			'getStarted': {
				description: nls.localize('RemoteHelpInformationExtPoint.getStarted', "The url to your project's Getting Started page"),
				type: 'string'
			},
			'documentation': {
				description: nls.localize('RemoteHelpInformationExtPoint.documentation', "The url to your project's documentation page"),
				type: 'string'
			},
			'feedback': {
				description: nls.localize('RemoteHelpInformationExtPoint.feedback', "The url to your project's feedback reporter"),
				type: 'string'
			},
			'issues': {
				description: nls.localize('RemoteHelpInformationExtPoint.issues', "The url to your project's issues list"),
				type: 'string'
			}
		}
	}
});

interface IViewModel {
	helpInformations: HelpInformation[];
}

class HelpTreeVirtualDelegate implements IListVirtualDelegate<IHelpItem> {
	getHeight(element: IHelpItem): number {
		return 22;
	}

	getTemplateId(element: IHelpItem): string {
		return 'HelpItemTemplate';
	}
}

interface IHelpItemTemplateData {
	parent: HTMLElement;
	icon: HTMLElement;
}

class HelpTreeRenderer implements ITreeRenderer<HelpModel | IHelpItem, IHelpItem, IHelpItemTemplateData> {
	templateId: string = 'HelpItemTemplate';

	renderTemplate(container: HTMLElement): IHelpItemTemplateData {
		dom.addClass(container, 'remote-help-tree-node-item');

		const icon = dom.append(container, dom.$('.remote-help-tree-node-item-icon'));

		const data = <IHelpItemTemplateData>Object.create(null);
		data.parent = container;
		data.icon = icon;

		return data;
	}

	renderElement(element: ITreeNode<IHelpItem, IHelpItem>, index: number, templateData: IHelpItemTemplateData, height: number | undefined): void {
		const container = templateData.parent;
		dom.append(container, templateData.icon);
		dom.addClass(templateData.icon, element.element.key);
		const labelContainer = dom.append(container, dom.$('.help-item-label'));
		labelContainer.innerText = element.element.label;
	}

	disposeTemplate(templateData: IHelpItemTemplateData): void {

	}
}

class HelpDataSource implements IAsyncDataSource<any, any> {
	hasChildren(element: any) {
		return element instanceof HelpModel;
	}

	getChildren(element: any) {
		if (element instanceof HelpModel && element.items) {
			return element.items;
		}

		return [];
	}
}

interface IHelpItem {
	key: string;
	label: string;
	handleClick(): Promise<void>;
}

class HelpItem implements IHelpItem {
	constructor(
		public key: string,
		public label: string,
		public values: { extensionDescription: IExtensionDescription; url: string }[],
		private openerService: IOpenerService,
		private quickInputService: IQuickInputService
	) {
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
				await this.openerService.open(URI.parse(action.label));
			}
		} else {
			await this.openerService.open(URI.parse(this.values[0].url));
		}
	}
}

class IssueReporterItem implements IHelpItem {
	constructor(
		public key: string,
		public label: string,
		public extensionDescriptions: IExtensionDescription[],
		private quickInputService: IQuickInputService,
		private commandService: ICommandService
	) {
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

class HelpModel {
	items: IHelpItem[] | undefined;

	constructor(
		viewModel: IViewModel,
		openerService: IOpenerService,
		quickInputService: IQuickInputService,
		commandService: ICommandService
	) {
		let helpItems: IHelpItem[] = [];
		const getStarted = viewModel.helpInformations.filter(info => info.getStarted);

		if (getStarted.length) {
			helpItems.push(new HelpItem(
				'getStarted',
				nls.localize('remote.help.getStarted', "Get Started"),
				getStarted.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.getStarted!
				})),
				openerService,
				quickInputService
			));
		}

		const documentation = viewModel.helpInformations.filter(info => info.documentation);

		if (documentation.length) {
			helpItems.push(new HelpItem(
				'documentation',
				nls.localize('remote.help.documentation', "Read Documentation"),
				documentation.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.documentation!
				})),
				openerService,
				quickInputService
			));
		}

		const feedback = viewModel.helpInformations.filter(info => info.feedback);

		if (feedback.length) {
			helpItems.push(new HelpItem(
				'feedback',
				nls.localize('remote.help.feedback', "Provide Feedback"),
				feedback.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.feedback!
				})),
				openerService,
				quickInputService
			));
		}

		const issues = viewModel.helpInformations.filter(info => info.issues);

		if (issues.length) {
			helpItems.push(new HelpItem(
				'issues',
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
				'issueReporter',
				nls.localize('remote.help.report', "Report Issue"),
				viewModel.helpInformations.map(info => info.extensionDescription),
				quickInputService,
				commandService
			));
		}

		if (helpItems.length) {
			this.items = helpItems;
		}
	}
}

class HelpPanel extends ViewletPanel {
	static readonly ID = '~remote.helpPanel';
	static readonly TITLE = nls.localize('remote.help', "Help and feedback");
	private tree!: WorkbenchAsyncDataTree<any, any, any>;

	constructor(
		protected viewModel: IViewModel,
		options: IViewletPanelOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IOpenerService protected openerService: IOpenerService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ICommandService protected commandService: ICommandService


	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService);
	}

	protected renderBody(container: HTMLElement): void {
		dom.addClass(container, 'remote-help');
		const treeContainer = document.createElement('div');
		dom.addClass(treeContainer, 'remote-help-content');
		container.appendChild(treeContainer);

		this.tree = this.instantiationService.createInstance(WorkbenchAsyncDataTree,
			'RemoteHelp',
			treeContainer,
			new HelpTreeVirtualDelegate(),
			[new HelpTreeRenderer()],
			new HelpDataSource(),
			{
				keyboardSupport: true,
			}
		);

		const model = new HelpModel(this.viewModel, this.openerService, this.quickInputService, this.commandService);

		this.tree.setInput(model);

		const helpItemNavigator = this._register(new TreeResourceNavigator2(this.tree, { openOnFocus: false, openOnSelection: false }));

		this._register(Event.debounce(helpItemNavigator.onDidOpenResource, (last, event) => event, 75, true)(e => {
			e.element.handleClick();
		}));
	}

	protected layoutBody(height: number, width: number): void {
		this.tree.layout(height, width);
	}
}

class HelpPanelDescriptor implements IViewDescriptor {
	readonly id = HelpPanel.ID;
	readonly name = HelpPanel.TITLE;
	readonly ctorDescriptor: { ctor: any, arguments?: any[] };
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly workspace = true;

	constructor(viewModel: IViewModel) {
		this.ctorDescriptor = { ctor: HelpPanel, arguments: [viewModel] };
	}
}


export class RemoteViewlet extends ViewContainerViewlet implements IViewModel {
	private helpPanelDescriptor = new HelpPanelDescriptor(this);

	helpInformations: HelpInformation[] = [];

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
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
	) {
		super(VIEWLET_ID, `${VIEWLET_ID}.state`, true, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);

		remoteHelpExtPoint.setHandler((extensions) => {
			let helpInformation: HelpInformation[] = [];
			for (let extension of extensions) {
				this._handleRemoteInfoExtensionPoint(extension, helpInformation);
			}

			this.helpInformations = helpInformation;

			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			if (this.helpInformations.length) {
				viewsRegistry.registerViews([this.helpPanelDescriptor], VIEW_CONTAINER);
			} else {
				viewsRegistry.deregisterViews([this.helpPanelDescriptor], VIEW_CONTAINER);
			}
		});
	}

	private _handleRemoteInfoExtensionPoint(extension: IExtensionPointUser<HelpInformation>, helpInformation: HelpInformation[]) {
		if (!extension.description.enableProposedApi) {
			return;
		}

		if (!extension.value.documentation && !extension.value.feedback && !extension.value.getStarted && !extension.value.issues) {
			return;
		}

		helpInformation.push({
			extensionDescription: extension.description,
			getStarted: extension.value.getStarted,
			documentation: extension.value.documentation,
			feedback: extension.value.feedback,
			issues: extension.value.issues
		});
	}

	onDidAddViews(added: IAddedViewDescriptorRef[]): ViewletPanel[] {
		// too late, already added to the view model
		const result = super.onDidAddViews(added);

		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		if (remoteAuthority) {
			const actualRemoteAuthority = remoteAuthority.split('+')[0];
			added.forEach((descriptor) => {
				const panel = this.getView(descriptor.viewDescriptor.id);
				if (!panel) {
					return;
				}

				const descriptorAuthority = descriptor.viewDescriptor.remoteAuthority;
				if (typeof descriptorAuthority === 'undefined') {
					panel.setExpanded(true);
				} else if (descriptor.viewDescriptor.id === HelpPanel.ID) {
					// Do nothing, keep the default behavior for Help
				} else {
					const descriptorAuthorityArr = Array.isArray(descriptorAuthority) ? descriptorAuthority : [descriptorAuthority];
					if (descriptorAuthorityArr.indexOf(actualRemoteAuthority) >= 0) {
						panel.setExpanded(true);
					} else {
						panel.setExpanded(false);
					}
				}
			});
		}

		return result;
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
	'remote',
	4
));

class OpenRemoteViewletAction extends ShowViewletAction {

	static readonly ID = VIEWLET_ID;
	static LABEL = nls.localize('toggleRemoteViewlet', "Show Remote Explorer");

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

			function showProgress(location: ProgressLocation, buttons?: string[]) {
				if (currentProgressPromiseResolve) {
					currentProgressPromiseResolve();
				}

				const promise = new Promise<void>((resolve) => currentProgressPromiseResolve = resolve);
				lastLocation = location;

				if (location === ProgressLocation.Dialog) {
					// Show dialog
					progressService!.withProgress(
						{ location: ProgressLocation.Dialog, buttons },
						(progress) => { if (progressReporter) { progressReporter.currentProgress = progress; } return promise; },
						(choice?) => {
							// Handle choice from dialog
							if (choice === 0 && buttons && reconnectWaitEvent) {
								reconnectWaitEvent.skipWait();
							} else {
								showProgress(ProgressLocation.Notification, buttons);
							}

							progressReporter!.report();
						});
				} else {
					// Show notification
					progressService!.withProgress(
						{ location: ProgressLocation.Notification, buttons },
						(progress) => { if (progressReporter) { progressReporter.currentProgress = progress; } return promise; },
						(choice?) => {
							// Handle choice from notification
							if (choice === 0 && buttons && reconnectWaitEvent) {
								reconnectWaitEvent.skipWait();
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
							showProgress(ProgressLocation.Dialog, [nls.localize('reconnectNow', "Reconnect Now")]);
						}

						progressReporter!.report(nls.localize('connectionLost', "Connection Lost"));
						break;
					case PersistentConnectionEventType.ReconnectionWait:
						hideProgress();
						reconnectWaitEvent = e;
						showProgress(lastLocation || ProgressLocation.Notification, [nls.localize('reconnectNow', "Reconnect Now")]);
						currentTimer = new ReconnectionTimer(progressReporter!, Date.now() + 1000 * e.durationSeconds);
						break;
					case PersistentConnectionEventType.ReconnectionRunning:
						hideProgress();
						showProgress(lastLocation || ProgressLocation.Notification);
						progressReporter!.report(nls.localize('reconnectionRunning', "Attempting to reconnect..."));

						// Register to listen for quick input is opened
						disposableListener = contextKeyService.onDidChangeContext((contextKeyChangeEvent) => {
							const reconnectInteraction = new Set<string>(['inQuickOpen']);
							if (contextKeyChangeEvent.affectsSome(reconnectInteraction)) {
								// Need to move from dialog if being shown and user needs to type in a prompt
								if (lastLocation === ProgressLocation.Dialog && progressReporter !== null) {
									hideProgress();
									showProgress(ProgressLocation.Notification);
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
