/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/tunnelView';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IViewDescriptor, } from 'vs/workbench/common/views';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Event, Emitter } from 'vs/base/common/event';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ViewletPane, IViewletPaneOptions } from 'vs/workbench/browser/parts/views/paneViewlet';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Action, ActionRunner } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';

class TunnelTreeVirtualDelegate implements IListVirtualDelegate<ITunnelItem> {
	getHeight(element: ITunnelItem): number {
		return 22;
	}

	getTemplateId(element: ITunnelItem): string {
		return 'tunnelItemTemplate';
	}
}

export interface ITunnelViewModel {
	onForwardedPortsChanged: Event<void>;
	readonly forwarded: TunnelItem[];
	readonly published: TunnelItem[];
	readonly candidates: TunnelItem[];
	readonly groups: ITunnelGroup[];
}

export class TunnelViewModel extends Disposable implements ITunnelViewModel {
	private _onForwardedPortsChanged: Emitter<void> = new Emitter();
	public onForwardedPortsChanged: Event<void> = this._onForwardedPortsChanged.event;

	constructor(private model: TunnelModel,
		@IOpenerService private readonly openerService: IOpenerService) {
		super();
		this._register(this.model.onForwardPort(() => this._onForwardedPortsChanged.fire()));
		this._register(this.model.onClosePort(() => this._onForwardedPortsChanged.fire()));
	}

	get groups(): ITunnelGroup[] {
		const groups: ITunnelGroup[] = [];
		if (this.model.forwarded.size > 0) {
			groups.push({
				label: nls.localize('remote.tunnelsView.forwarded', "Forwarded"),
				tunnelType: TunnelType.Forwarded,
				items: this.forwarded
			});
		}
		if (this.model.published.size > 0) {
			groups.push({
				label: nls.localize('remote.tunnelsView.published', "Published"),
				tunnelType: TunnelType.Published,
				items: this.published
			});
		}
		const candidates = this.candidates;
		if (this.candidates.length > 0) {
			groups.push({
				label: nls.localize('remote.tunnelsView.candidates', "Candidates"),
				tunnelType: TunnelType.Candidate,
				items: candidates
			});
		}
		groups.push({
			label: nls.localize('remote.tunnelsView.add', "Add a Port..."),
			tunnelType: TunnelType.Add,
		});
		return groups;
	}

	get forwarded(): TunnelItem[] {
		return Array.from(this.model.forwarded.values()).map(tunnel => {
			return new TunnelItem(TunnelType.Forwarded, tunnel.remote, this.getActions(TunnelType.Forwarded, tunnel), tunnel.name, tunnel.description, tunnel.local);
		});
	}

	get published(): TunnelItem[] {
		return Array.from(this.model.published.values()).map(tunnel => {
			return new TunnelItem(TunnelType.Published, tunnel.remote, this.getActions(TunnelType.Published, tunnel), tunnel.name, tunnel.description, tunnel.local);
		});
	}

	get candidates(): TunnelItem[] {
		const candidates: TunnelItem[] = [];
		const values = this.model.candidates.values();
		let iterator = values.next();
		while (!iterator.done) {
			if (!this.model.forwarded.has(iterator.value.remote) && !this.model.published.has(iterator.value.remote)) {
				candidates.push(new TunnelItem(TunnelType.Candidate, iterator.value.remote, this.getActions(TunnelType.Candidate, iterator.value), undefined, iterator.value.description));
			}
			iterator = values.next();
		}
		return candidates;
	}

	forward(tunnelItem: ITunnelItem) {
		// TODO: Show some UI to get the name and local
		this.model.forward(tunnelItem.remote);
	}
	stopForwarding(tunnelItem: ITunnelItem) {
		this.model.close(tunnelItem.remote);
	}
	copy(tunnelItem: ITunnelItem) {
		// TODO: implement
	}

	dispose() {
		super.dispose();
	}

	private getActions(type: TunnelType, tunnel: Tunnel): Action[] {
		const actions: Action[] = [];
		switch (type) {
			case TunnelType.Forwarded: {
				actions.push(this.createOpenAction());
				break;
			}
			case TunnelType.Published: {
				actions.push(this.createForwardAction());
				actions.push(this.createOpenAction());
				break;
			}
			case TunnelType.Candidate: {
				actions.push(this.createForwardAction());
				break;
			}
		}
		if (tunnel.closeable) {
			actions.push(this.createCloseAction());
		}
		return actions;
	}

	private createOpenAction(): Action {
		const action = new Action('remote.tunnelView.open');
		action.enabled = true;
		action.tooltip = nls.localize('remote.tunnelView.open', 'Open in Browser');
		action.class = 'icon codicon codicon-globe';
		action.run = (context: ITunnelItem) => {
			const tunnel = this.model.forwarded.has(context.remote) ? this.model.forwarded.get(context.remote) : this.model.published.get(context.remote);
			if (tunnel && tunnel.uri) {
				return this.openerService.open(tunnel.uri);
			}
			return Promise.resolve();
		};
		return action;
	}

	private createForwardAction(): Action {
		const action = new Action('remote.tunnelView.forward');
		action.enabled = true;
		action.tooltip = nls.localize('remote.tunnelView.forward', 'Forward to localhost');
		action.class = 'icon codicon codicon-plus';
		action.run = async (context: ITunnelItem) => {
			this.model.forward(context.remote, context.local, context.name);
		};
		return action;
	}

	private createCloseAction(): Action {
		const action = new Action('remote.tunnelView.forward');
		action.enabled = true;
		action.tooltip = nls.localize('remote.tunnelView.forward', 'Forward to localhost');
		action.class = 'icon codicon codicon-x';
		action.run = async (context: ITunnelItem) => {
			this.model.close(context.remote);
		};
		return action;
	}
}

interface Tunnel {
	remote: string;
	local?: string;
	name?: string;
	description?: string;
	closeable?: boolean;
	uri?: URI;
}

export class TunnelModel {
	forwarded: Map<string, Tunnel>;
	published: Map<string, Tunnel>;
	candidates: Map<string, Tunnel>;
	private _onForwardPort: Emitter<Tunnel> = new Emitter();
	public onForwardPort: Event<Tunnel> = this._onForwardPort.event;
	private _onClosePort: Emitter<string> = new Emitter();
	public onClosePort: Event<string> = this._onClosePort.event;
	constructor() {
		this.forwarded = new Map();
		this.forwarded.set('3000',
			{
				description: 'one description',
				local: '3000',
				remote: '3000',
				closeable: true
			});
		this.forwarded.set('4000',
			{
				local: '4001',
				remote: '4000',
				name: 'Process Port',
				closeable: true
			});

		this.published = new Map();
		this.published.set('3500',
			{
				description: 'one description',
				local: '3500',
				remote: '3500',
				name: 'My App',
			});
		this.published.set('4500',
			{
				description: 'two description',
				local: '4501',
				remote: '4500'
			});
		this.candidates = new Map();
		this.candidates.set('5000',
			{
				description: 'node.js /anArg',
				remote: '5000',
			});
		this.candidates.set('5500',
			{
				remote: '5500',
			});
	}

	forward(remote: string, local?: string, name?: string) {
		if (!this.forwarded.has(remote)) {
			const newForward: Tunnel = {
				remote: remote,
				local: local ?? remote,
				name: name,
				closeable: true
			};
			this.forwarded.set(remote, newForward);
			this._onForwardPort.fire(newForward);
		}
	}

	close(remote: string) {
		if (this.forwarded.has(remote)) {
			this.forwarded.delete(remote);
			this._onClosePort.fire(remote);
		}
	}
}

interface ITunnelTemplateData {
	elementDisposable: IDisposable;
	container: HTMLElement;
	iconLabel: IconLabel;
	actionBar: ActionBar;
}

class TunnelTreeRenderer extends Disposable implements ITreeRenderer<ITunnelGroup | ITunnelItem, ITunnelItem, ITunnelTemplateData> {
	static readonly ITEM_HEIGHT = 22;
	static readonly TREE_TEMPLATE_ID = 'tunnelItemTemplate';

	private actionRunner: ActionRunner;

	constructor() {
		super();
		this.actionRunner = new ActionRunner();
	}

	get templateId(): string {
		return TunnelTreeRenderer.TREE_TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ITunnelTemplateData {
		dom.addClass(container, 'custom-view-tree-node-item');
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		// dom.addClass(iconLabel.element, 'tunnel-view-label');
		const actionsContainer = dom.append(iconLabel.element, dom.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: undefined // this.actionViewItemProvider
		});

		return { iconLabel, actionBar, container, elementDisposable: Disposable.None };
	}

	private isTunnelItem(item: ITunnelGroup | ITunnelItem): item is ITunnelItem {
		return !!((<ITunnelItem>item).remote);
	}

	renderElement(element: ITreeNode<ITunnelGroup | ITunnelItem, ITunnelGroup | ITunnelItem>, index: number, templateData: ITunnelTemplateData): void {
		templateData.elementDisposable.dispose();
		const node = element.element;
		// reset
		templateData.actionBar.clear();
		if (this.isTunnelItem(node)) {
			templateData.iconLabel.setLabel(node.label, node.description, { title: node.label + ' - ' + node.description, extraClasses: ['tunnel-view-label'] });
			if (node.actions) {
				templateData.actionBar.context = node;
				templateData.actionBar.push(node.actions, { icon: true, label: false });
				templateData.actionBar.actionRunner = this.actionRunner;
			}
		} else {
			templateData.iconLabel.setLabel(node.label);
		}
	}

	disposeElement(resource: ITreeNode<ITunnelGroup | ITunnelItem, ITunnelGroup | ITunnelItem>, index: number, templateData: ITunnelTemplateData): void {
		templateData.elementDisposable.dispose();
	}

	disposeTemplate(templateData: ITunnelTemplateData): void {
		templateData.actionBar.dispose();
		templateData.elementDisposable.dispose();
	}
}

class TunnelDataSource implements IAsyncDataSource<ITunnelViewModel, ITunnelItem | ITunnelGroup> {
	hasChildren(element: ITunnelViewModel | ITunnelItem | ITunnelGroup) {
		if (element instanceof TunnelViewModel) {
			return true;
		} else if (element instanceof TunnelItem) {
			return false;
		} else if ((<ITunnelGroup>element).items) {
			return true;
		}
		return false;
	}

	getChildren(element: ITunnelViewModel | ITunnelItem | ITunnelGroup) {
		if (element instanceof TunnelViewModel) {
			return element.groups;
		} else if (element instanceof TunnelItem) {
			return [];
		} else if ((<ITunnelGroup>element).items) {
			return (<ITunnelGroup>element).items!;
		}
		return [];
	}
}

enum TunnelType {
	Candidate = 'Candidate',
	Published = 'Published',
	Forwarded = 'Forwarded',
	Add = 'Add'
}

interface ITunnelGroup {
	tunnelType: TunnelType;
	label: string;
	items?: ITunnelItem[];
}

interface ITunnelItem {
	tunnelType: TunnelType;
	remote: string;
	local?: string;
	name?: string;
	actions?: Action[];
	readonly description?: string;
	readonly label: string;
}

class TunnelItem implements ITunnelItem {
	constructor(
		public tunnelType: TunnelType,
		public remote: string,
		public actions: Action[],
		public name?: string,
		private _description?: string,
		public local?: string,
	) { }
	get label(): string {
		if (this.name) {
			return nls.localize('remote.tunnelsView.forwardedPortLabel0', "{0} to localhost", this.name);
		} else if (this.local === this.remote) {
			return nls.localize('remote.tunnelsView.forwardedPortLabel1', "{0} to localhost", this.remote);
		} else if (this.local) {
			return nls.localize('remote.tunnelsView.forwardedPortLabel2', "{0} to localhost:{1}", this.remote, this.local);
		} else {
			return nls.localize('remote.tunnelsView.forwardedPortLabel3', "{0} not forwarded", this.remote);
		}
	}

	get description(): string | undefined {
		if (this.name) {
			return nls.localize('remote.tunnelsView.forwardedPortDescription0', "remote {0} available at {0}", this.remote, this.local);
		} else if (this.local === this.remote) {
			return nls.localize('remote.tunnelsView.forwardedPortDescription1', "available at {0}", this.local);
		} else if (this.local) {
			return this._description;
		} else {
			return this._description;
		}
	}
}

export class TunnelPanel extends ViewletPane {
	static readonly ID = '~remote.tunnelPanel';
	static readonly TITLE = nls.localize('remote.tunnel', "Tunnels");
	private tree!: WorkbenchAsyncDataTree<any, any, any>;

	constructor(
		protected viewModel: ITunnelViewModel,
		options: IViewletPaneOptions,
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
		dom.addClass(container, '.tree-explorer-viewlet-tree-view');
		const treeContainer = document.createElement('div');
		dom.addClass(treeContainer, 'customview-tree');
		dom.addClass(treeContainer, 'file-icon-themable-tree');
		dom.addClass(treeContainer, 'show-file-icons');
		container.appendChild(treeContainer);

		this.tree = this.instantiationService.createInstance(WorkbenchAsyncDataTree,
			'RemoteTunnels',
			treeContainer,
			new TunnelTreeVirtualDelegate(),
			[new TunnelTreeRenderer()],
			new TunnelDataSource(),
			{
				keyboardSupport: true,
				collapseByDefault: (e: ITunnelItem | ITunnelGroup): boolean => {
					return false;
				}
			}
		);

		this.tree.setInput(this.viewModel);
		this._register(this.viewModel.onForwardedPortsChanged(() => {
			this.tree.updateChildren(undefined, true);
		}));

		// TODO: add navigator
		// const helpItemNavigator = this._register(new TreeResourceNavigator2(this.tree, { openOnFocus: false, openOnSelection: false }));

		// this._register(Event.debounce(helpItemNavigator.onDidOpenResource, (last, event) => event, 75, true)(e => {
		// 	e.element.handleClick();
		// }));
	}

	protected layoutBody(height: number, width: number): void {
		this.tree.layout(height, width);
	}
}

export class TunnelPanelDescriptor implements IViewDescriptor {
	readonly id = TunnelPanel.ID;
	readonly name = TunnelPanel.TITLE;
	readonly ctorDescriptor: { ctor: any, arguments?: any[] };
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly workspace = true;
	readonly group = 'details@0';
	readonly remoteAuthority?: string | string[];

	constructor(viewModel: ITunnelViewModel, environmentService: IWorkbenchEnvironmentService) {
		this.ctorDescriptor = { ctor: TunnelPanel, arguments: [viewModel] };
		this.remoteAuthority = environmentService.configuration.remoteAuthority ? environmentService.configuration.remoteAuthority.split('+')[0] : undefined;
	}
}
