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
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';

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
		if (element instanceof HelpModel) {
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
	items: IHelpItem[];

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
		@IExtensionService extensionService: IExtensionService
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
		return super.onDidAddViews(added);
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
