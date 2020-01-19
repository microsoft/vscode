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
import { FilterViewPaneContainer } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { VIEWLET_ID } from 'vs/workbench/contrib/remote/common/remote.contribution';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptor, IViewsRegistry, Extensions, ViewContainerLocation, IViewContainersRegistry } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ShowViewletAction } from 'vs/workbench/browser/viewlet';
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
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { startsWith } from 'vs/base/common/strings';
import { TunnelPanelDescriptor, TunnelViewModel, forwardedPortsViewEnabled } from 'vs/workbench/contrib/remote/browser/tunnelView';
import { IAddedViewDescriptorRef } from 'vs/workbench/browser/parts/views/views';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { WorkbenchAsyncDataTree, TreeResourceNavigator2 } from 'vs/platform/list/browser/listService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Event } from 'vs/base/common/event';
import { ExtensionsRegistry, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

export interface HelpInformation {
	extensionDescription: IExtensionDescription;
	getStarted?: string;
	documentation?: string;
	feedback?: string;
	issues?: string;
	remoteName?: string[] | string;
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
	helpInformation: HelpInformation[];
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
		dom.addClasses(templateData.icon, ...element.element.iconClasses);
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
	iconClasses: string[];
	label: string;
	handleClick(): Promise<void>;
}

class HelpModel {
	items: IHelpItem[] | undefined;

	constructor(
		viewModel: IViewModel,
		openerService: IOpenerService,
		quickInputService: IQuickInputService,
		commandService: ICommandService,
		remoteExplorerService: IRemoteExplorerService,
		environmentService: IWorkbenchEnvironmentService
	) {
		let helpItems: IHelpItem[] = [];
		const getStarted = viewModel.helpInformation.filter(info => info.getStarted);

		if (getStarted.length) {
			helpItems.push(new HelpItem(
				'star',
				nls.localize('remote.help.getStarted', "Get Started"),
				getStarted.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.getStarted!,
					remoteAuthority: (typeof info.remoteName === 'string') ? [info.remoteName] : info.remoteName
				})),
				quickInputService,
				environmentService,
				openerService,
				remoteExplorerService
			));
		}

		const documentation = viewModel.helpInformation.filter(info => info.documentation);

		if (documentation.length) {
			helpItems.push(new HelpItem(
				'book',
				nls.localize('remote.help.documentation', "Read Documentation"),
				documentation.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.documentation!,
					remoteAuthority: (typeof info.remoteName === 'string') ? [info.remoteName] : info.remoteName
				})),
				quickInputService,
				environmentService,
				openerService,
				remoteExplorerService
			));
		}

		const feedback = viewModel.helpInformation.filter(info => info.feedback);

		if (feedback.length) {
			helpItems.push(new HelpItem(
				'twitter',
				nls.localize('remote.help.feedback', "Provide Feedback"),
				feedback.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.feedback!,
					remoteAuthority: (typeof info.remoteName === 'string') ? [info.remoteName] : info.remoteName
				})),
				quickInputService,
				environmentService,
				openerService,
				remoteExplorerService
			));
		}

		const issues = viewModel.helpInformation.filter(info => info.issues);

		if (issues.length) {
			helpItems.push(new HelpItem(
				'issues',
				nls.localize('remote.help.issues', "Review Issues"),
				issues.map((info: HelpInformation) => ({
					extensionDescription: info.extensionDescription,
					url: info.issues!,
					remoteAuthority: (typeof info.remoteName === 'string') ? [info.remoteName] : info.remoteName
				})),
				quickInputService,
				environmentService,
				openerService,
				remoteExplorerService
			));
		}

		if (helpItems.length) {
			helpItems.push(new IssueReporterItem(
				'comment',
				nls.localize('remote.help.report', "Report Issue"),
				viewModel.helpInformation.map(info => ({
					extensionDescription: info.extensionDescription,
					remoteAuthority: (typeof info.remoteName === 'string') ? [info.remoteName] : info.remoteName
				})),
				quickInputService,
				environmentService,
				commandService,
				remoteExplorerService
			));
		}

		if (helpItems.length) {
			this.items = helpItems;
		}
	}
}

abstract class HelpItemBase implements IHelpItem {
	public iconClasses: string[] = [];
	constructor(
		public key: string,
		public label: string,
		public values: { extensionDescription: IExtensionDescription, url?: string, remoteAuthority: string[] | undefined }[],
		private quickInputService: IQuickInputService,
		private environmentService: IWorkbenchEnvironmentService,
		private remoteExplorerService: IRemoteExplorerService
	) {
		this.iconClasses.push(`codicon-${key}`);
		this.iconClasses.push('remote-help-tree-node-item-icon');
		this.iconClasses.push('codicon');
	}

	async handleClick() {
		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		if (!remoteAuthority) {
			return;
		}
		for (let i = 0; i < this.remoteExplorerService.targetType.length; i++) {
			if (startsWith(remoteAuthority, this.remoteExplorerService.targetType[i])) {
				for (let value of this.values) {
					if (value.remoteAuthority) {
						for (let authority of value.remoteAuthority) {
							if (startsWith(remoteAuthority, authority)) {
								await this.takeAction(value.extensionDescription, value.url);
								return;
							}
						}
					}
				}
			}
		}

		if (this.values.length > 1) {
			let actions = this.values.map(value => {
				return {
					label: value.extensionDescription.displayName || value.extensionDescription.identifier.value,
					description: value.url,
					extensionDescription: value.extensionDescription
				};
			});

			const action = await this.quickInputService.pick(actions, { placeHolder: nls.localize('pickRemoteExtension', "Select url to open") });

			if (action) {
				await this.takeAction(action.extensionDescription, action.description);
			}
		} else {
			await this.takeAction(this.values[0].extensionDescription, this.values[0].url);
		}
	}

	protected abstract takeAction(extensionDescription: IExtensionDescription, url?: string): Promise<void>;
}

class HelpItem extends HelpItemBase {
	constructor(
		key: string,
		label: string,
		values: { extensionDescription: IExtensionDescription; url: string, remoteAuthority: string[] | undefined }[],
		quickInputService: IQuickInputService,
		environmentService: IWorkbenchEnvironmentService,
		private openerService: IOpenerService,
		remoteExplorerService: IRemoteExplorerService
	) {
		super(key, label, values, quickInputService, environmentService, remoteExplorerService);
	}

	protected async takeAction(extensionDescription: IExtensionDescription, url: string): Promise<void> {
		await this.openerService.open(URI.parse(url));
	}
}

class IssueReporterItem extends HelpItemBase {
	constructor(
		key: string,
		label: string,
		values: { extensionDescription: IExtensionDescription; remoteAuthority: string[] | undefined }[],
		quickInputService: IQuickInputService,
		environmentService: IWorkbenchEnvironmentService,
		private commandService: ICommandService,
		remoteExplorerService: IRemoteExplorerService
	) {
		super(key, label, values, quickInputService, environmentService, remoteExplorerService);
	}

	protected async takeAction(extensionDescription: IExtensionDescription): Promise<void> {
		await this.commandService.executeCommand('workbench.action.openIssueReporter', [extensionDescription.identifier.value]);
	}
}

class HelpPanel extends ViewPane {
	static readonly ID = '~remote.helpPanel';
	static readonly TITLE = nls.localize('remote.help', "Help and feedback");
	private tree!: WorkbenchAsyncDataTree<any, any, any>;

	constructor(
		protected viewModel: IViewModel,
		options: IViewPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IOpenerService protected openerService: IOpenerService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ICommandService protected commandService: ICommandService,
		@IRemoteExplorerService protected readonly remoteExplorerService: IRemoteExplorerService,
		@IWorkbenchEnvironmentService protected readonly workbenchEnvironmentService: IWorkbenchEnvironmentService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, instantiationService);
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

		const model = new HelpModel(this.viewModel, this.openerService, this.quickInputService, this.commandService, this.remoteExplorerService, this.workbenchEnvironmentService);

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
	readonly ctorDescriptor: SyncDescriptor<HelpPanel>;
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly workspace = true;
	readonly group = 'help@50';

	constructor(viewModel: IViewModel) {
		this.ctorDescriptor = new SyncDescriptor(HelpPanel, [viewModel]);
	}
}

export class RemoteViewPaneContainer extends FilterViewPaneContainer implements IViewModel {
	private helpPanelDescriptor = new HelpPanelDescriptor(this);
	helpInformation: HelpInformation[] = [];
	private actions: IAction[] | undefined;
	private tunnelPanelDescriptor: TunnelPanelDescriptor | undefined;

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
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(VIEWLET_ID, remoteExplorerService.onDidChangeTargetType, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
		this.addConstantViewDescriptors([this.helpPanelDescriptor]);
		remoteHelpExtPoint.setHandler((extensions) => {
			let helpInformation: HelpInformation[] = [];
			for (let extension of extensions) {
				this._handleRemoteInfoExtensionPoint(extension, helpInformation);
			}

			this.helpInformation = helpInformation;

			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			if (this.helpInformation.length) {
				viewsRegistry.registerViews([this.helpPanelDescriptor], this.viewContainer);
			} else {
				viewsRegistry.deregisterViews([this.helpPanelDescriptor], this.viewContainer);
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
			issues: extension.value.issues,
			remoteName: extension.value.remoteName
		});
	}

	protected getFilterOn(viewDescriptor: IViewDescriptor): string | undefined {
		return isStringArray(viewDescriptor.remoteAuthority) ? viewDescriptor.remoteAuthority[0] : viewDescriptor.remoteAuthority;
	}

	public getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === SwitchRemoteAction.ID) {
			return this.instantiationService.createInstance(SwitchRemoteViewItem, action, SwitchRemoteViewItem.createOptionItems(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).getViews(this.viewContainer), this.contextKeyService));
		}

		return super.getActionViewItem(action);
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(SwitchRemoteAction, SwitchRemoteAction.ID, SwitchRemoteAction.LABEL)
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

	onDidAddViews(added: IAddedViewDescriptorRef[]): ViewPane[] {
		// Call to super MUST be first, since registering the additional view will cause this to be called again.
		const panels: ViewPane[] = super.onDidAddViews(added);
		// This context key is set to false in the constructor, but is expected to be changed by resolver extensions to enable the forwarded ports view.
		const viewEnabled: boolean = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);
		if (this.environmentService.configuration.remoteAuthority && !this.tunnelPanelDescriptor && viewEnabled) {
			this.tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService), this.environmentService);
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			viewsRegistry.registerViews([this.tunnelPanelDescriptor!], this.viewContainer);
		}
		return panels;
	}
}

Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
	{
		id: VIEWLET_ID,
		name: nls.localize('remote.explorer', "Remote Explorer"),
		ctorDescriptor: new SyncDescriptor(RemoteViewPaneContainer),
		hideIfEmpty: true,
		viewOrderDelegate: {
			getOrder: (group?: string) => {
				if (!group) {
					return;
				}

				let matches = /^targets@(\d+)$/.exec(group);
				if (matches) {
					return -1000;
				}

				matches = /^details(@(\d+))?$/.exec(group);

				if (matches) {
					return -500;
				}

				matches = /^help(@(\d+))?$/.exec(group);
				if (matches) {
					return -10;
				}

				return;
			}
		},
		icon: 'codicon-remote-explorer',
		order: 4
	}, ViewContainerLocation.Sidebar);

class OpenRemoteViewletAction extends ShowViewletAction {

	static readonly ID = VIEWLET_ID;
	static readonly LABEL = nls.localize('toggleRemoteViewlet', "Show Remote Explorer");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IEditorGroupsService editorGroupService: IEditorGroupsService, @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService, layoutService);
	}
}

// Register Action to Open Viewlet
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
	SyncActionDescriptor.create(OpenRemoteViewletAction, VIEWLET_ID, nls.localize('toggleRemoteViewlet', "Show Remote Explorer"), {
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
