/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/tunnelView';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IViewDescriptor, IEditableData, IViewsService } from 'vs/workbench/common/views';
import { WorkbenchAsyncDataTree, TreeResourceNavigator2 } from 'vs/platform/list/browser/listService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey, RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommandService, ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Event, Emitter } from 'vs/base/common/event';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, IAsyncDataSource, ITreeContextMenuEvent, ITreeMouseEvent } from 'vs/base/browser/ui/tree/tree';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Disposable, IDisposable, toDisposable, MutableDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { ActionBar, ActionViewItem, IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { IMenuService, MenuId, IMenu, MenuRegistry, MenuItemAction } from 'vs/platform/actions/common/actions';
import { createAndFillInContextMenuActions, createAndFillInActionBarActions, ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IRemoteExplorerService, TunnelModel, MakeAddress, TunnelType, ITunnelItem } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { once } from 'vs/base/common/functional';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { URI } from 'vs/base/common/uri';
import { RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

export const forwardedPortsViewEnabled = new RawContextKey<boolean>('forwardedPortsViewEnabled', false);

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
	readonly detected: TunnelItem[];
	readonly candidates: Promise<TunnelItem[]>;
	readonly input: TunnelItem;
	groups(): Promise<ITunnelGroup[]>;
}

export class TunnelViewModel extends Disposable implements ITunnelViewModel {
	private _onForwardedPortsChanged: Emitter<void> = new Emitter();
	public onForwardedPortsChanged: Event<void> = this._onForwardedPortsChanged.event;
	private model: TunnelModel;
	private _input: TunnelItem;

	constructor(
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService) {
		super();
		this.model = remoteExplorerService.tunnelModel;
		this._register(this.model.onForwardPort(() => this._onForwardedPortsChanged.fire()));
		this._register(this.model.onClosePort(() => this._onForwardedPortsChanged.fire()));
		this._register(this.model.onPortName(() => this._onForwardedPortsChanged.fire()));
		this._register(this.model.onCandidatesChanged(() => this._onForwardedPortsChanged.fire()));
		this._input = {
			label: nls.localize('remote.tunnelsView.add', "Forward a Port..."),
			tunnelType: TunnelType.Add,
			remoteHost: 'localhost',
			remotePort: 0,
			description: ''
		};
	}

	async groups(): Promise<ITunnelGroup[]> {
		const groups: ITunnelGroup[] = [];
		if (this.model.forwarded.size > 0) {
			groups.push({
				label: nls.localize('remote.tunnelsView.forwarded', "Forwarded"),
				tunnelType: TunnelType.Forwarded,
				items: this.forwarded
			});
		}
		if (this.model.detected.size > 0) {
			groups.push({
				label: nls.localize('remote.tunnelsView.detected', "Existing Tunnels"),
				tunnelType: TunnelType.Detected,
				items: this.detected
			});
		}
		const candidates = await this.candidates;
		if (candidates.length > 0) {
			groups.push({
				label: nls.localize('remote.tunnelsView.candidates', "Not Forwarded"),
				tunnelType: TunnelType.Candidate,
				items: candidates
			});
		}
		if (groups.length === 0) {
			groups.push(this._input);
		}
		return groups;
	}

	get forwarded(): TunnelItem[] {
		const forwarded = Array.from(this.model.forwarded.values()).map(tunnel => {
			return new TunnelItem(TunnelType.Forwarded, tunnel.remoteHost, tunnel.remotePort, tunnel.localAddress, tunnel.closeable, tunnel.name, tunnel.description);
		});
		if (this.remoteExplorerService.getEditableData(undefined)) {
			forwarded.push(this._input);
		}
		return forwarded;
	}

	get detected(): TunnelItem[] {
		return Array.from(this.model.detected.values()).map(tunnel => {
			return new TunnelItem(TunnelType.Detected, tunnel.remoteHost, tunnel.remotePort, tunnel.localAddress, false, tunnel.name, tunnel.description);
		});
	}

	get candidates(): Promise<TunnelItem[]> {
		return this.model.candidates.then(values => {
			const candidates: TunnelItem[] = [];
			values.forEach(value => {
				const key = MakeAddress(value.host, value.port);
				if (!this.model.forwarded.has(key) && !this.model.detected.has(key)) {
					candidates.push(new TunnelItem(TunnelType.Candidate, value.host, value.port, undefined, false, undefined, value.detail));
				}
			});
			return candidates;
		});
	}

	get input(): TunnelItem {
		return this._input;
	}

	dispose() {
		super.dispose();
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

	private _actionRunner: ActionRunner | undefined;

	constructor(
		private readonly viewId: string,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService
	) {
		super();
	}

	set actionRunner(actionRunner: ActionRunner) {
		this._actionRunner = actionRunner;
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
			// actionViewItemProvider: undefined // this.actionViewItemProvider
			actionViewItemProvider: (action: IAction) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ContextAwareMenuEntryActionViewItem, action);
				}

				return undefined;
			}
		});

		return { iconLabel, actionBar, container, elementDisposable: Disposable.None };
	}

	private isTunnelItem(item: ITunnelGroup | ITunnelItem): item is ITunnelItem {
		return !!((<ITunnelItem>item).remotePort);
	}

	renderElement(element: ITreeNode<ITunnelGroup | ITunnelItem, ITunnelGroup | ITunnelItem>, index: number, templateData: ITunnelTemplateData): void {
		templateData.elementDisposable.dispose();
		const node = element.element;

		// reset
		templateData.actionBar.clear();
		let editableData: IEditableData | undefined;
		if (this.isTunnelItem(node)) {
			editableData = this.remoteExplorerService.getEditableData(node);
			if (editableData) {
				templateData.iconLabel.element.style.display = 'none';
				this.renderInputBox(templateData.container, editableData);
			} else {
				templateData.iconLabel.element.style.display = 'flex';
				this.renderTunnel(node, templateData);
			}
		} else if ((node.tunnelType === TunnelType.Add) && (editableData = this.remoteExplorerService.getEditableData(undefined))) {
			templateData.iconLabel.element.style.display = 'none';
			this.renderInputBox(templateData.container, editableData);
		} else {
			templateData.iconLabel.element.style.display = 'flex';
			templateData.iconLabel.setLabel(node.label);
		}
	}

	private renderTunnel(node: ITunnelItem, templateData: ITunnelTemplateData) {
		const label = node.label + (node.description ? (' - ' + node.description) : '');
		templateData.iconLabel.setLabel(node.label, node.description, { title: label, extraClasses: ['tunnel-view-label'] });
		templateData.actionBar.context = node;
		const contextKeyService = this._register(this.contextKeyService.createScoped());
		contextKeyService.createKey('view', this.viewId);
		contextKeyService.createKey('tunnelType', node.tunnelType);
		contextKeyService.createKey('tunnelCloseable', node.closeable);
		const disposableStore = new DisposableStore();
		templateData.elementDisposable = disposableStore;
		const menu = disposableStore.add(this.menuService.createMenu(MenuId.TunnelInline, contextKeyService));
		const actions: IAction[] = [];
		disposableStore.add(createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, actions));
		if (actions) {
			templateData.actionBar.push(actions, { icon: true, label: false });
			if (this._actionRunner) {
				templateData.actionBar.actionRunner = this._actionRunner;
			}
		}
	}

	private renderInputBox(container: HTMLElement, editableData: IEditableData): IDisposable {
		const value = editableData.startingValue || '';
		const inputBox = new InputBox(container, this.contextViewService, {
			ariaLabel: nls.localize('remote.tunnelsView.input', "Press Enter to confirm or Escape to cancel."),
			validationOptions: {
				validation: (value) => {
					const content = editableData.validationMessage(value);
					if (!content) {
						return null;
					}

					return {
						content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			placeholder: editableData.placeholder || ''
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		inputBox.value = value;
		inputBox.focus();
		inputBox.select({ start: 0, end: editableData.startingValue ? editableData.startingValue.length : 0 });

		const done = once((success: boolean, finishEditing: boolean) => {
			inputBox.element.style.display = 'none';
			const value = inputBox.value;
			dispose(toDispose);
			if (finishEditing) {
				editableData.onFinish(value, success);
			}
		});

		const toDispose = [
			inputBox,
			dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					if (inputBox.validate()) {
						done(true, true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false, true);
				}
			}),
			dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
				done(inputBox.isInputValid(), true);
			}),
			styler
		];

		return toDisposable(() => {
			done(false, false);
		});
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
			return element.groups();
		} else if (element instanceof TunnelItem) {
			return [];
		} else if ((<ITunnelGroup>element).items) {
			return (<ITunnelGroup>element).items!;
		}
		return [];
	}
}

interface ITunnelGroup {
	tunnelType: TunnelType;
	label: string;
	items?: ITunnelItem[] | Promise<ITunnelItem[]>;
}

class TunnelItem implements ITunnelItem {
	constructor(
		public tunnelType: TunnelType,
		public remoteHost: string,
		public remotePort: number,
		public localAddress?: string,
		public closeable?: boolean,
		public name?: string,
		private _description?: string,
	) { }
	get label(): string {
		if (this.name) {
			return nls.localize('remote.tunnelsView.forwardedPortLabel0', "{0}", this.name);
		} else if (this.localAddress && (this.remoteHost !== 'localhost')) {
			return nls.localize('remote.tunnelsView.forwardedPortLabel2', "{0}:{1} \u2192 {2}", this.remoteHost, this.remotePort, this.localAddress);
		} else if (this.localAddress) {
			return nls.localize('remote.tunnelsView.forwardedPortLabel3', "{0} \u2192 {1}", this.remotePort, this.localAddress);
		} else if (this.remoteHost !== 'localhost') {
			return nls.localize('remote.tunnelsView.forwardedPortLabel4', "{0}:{1}", this.remoteHost, this.remotePort);
		} else {
			return nls.localize('remote.tunnelsView.forwardedPortLabel5', "{0} not forwarded", this.remotePort);
		}
	}

	get description(): string | undefined {
		if (this._description) {
			return this._description;
		} else if (this.name) {
			return nls.localize('remote.tunnelsView.forwardedPortDescription0', "{0} to {1}", this.remotePort, this.localAddress);
		}
		return undefined;
	}
}

export const TunnelTypeContextKey = new RawContextKey<TunnelType>('tunnelType', TunnelType.Add);
export const TunnelCloseableContextKey = new RawContextKey<boolean>('tunnelCloseable', false);

export class TunnelPanel extends ViewPane {
	static readonly ID = '~remote.forwardedPorts';
	static readonly TITLE = nls.localize('remote.tunnel', "Forwarded Ports");
	private tree!: WorkbenchAsyncDataTree<any, any, any>;
	private tunnelTypeContext: IContextKey<TunnelType>;
	private tunnelCloseableContext: IContextKey<boolean>;

	private titleActions: IAction[] = [];
	private readonly titleActionsDisposable = this._register(new MutableDisposable());

	constructor(
		protected viewModel: ITunnelViewModel,
		options: IViewPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IOpenerService protected openerService: IOpenerService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ICommandService protected commandService: ICommandService,
		@IMenuService private readonly menuService: IMenuService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, instantiationService);
		this.tunnelTypeContext = TunnelTypeContextKey.bindTo(contextKeyService);
		this.tunnelCloseableContext = TunnelCloseableContextKey.bindTo(contextKeyService);

		const scopedContextKeyService = this._register(this.contextKeyService.createScoped());
		scopedContextKeyService.createKey('view', TunnelPanel.ID);

		const titleMenu = this._register(this.menuService.createMenu(MenuId.TunnelTitle, scopedContextKeyService));
		const updateActions = () => {
			this.titleActions = [];
			this.titleActionsDisposable.value = createAndFillInActionBarActions(titleMenu, undefined, this.titleActions);
			this.updateActions();
		};

		this._register(titleMenu.onDidChange(updateActions));
		updateActions();

		this._register(toDisposable(() => {
			this.titleActions = [];
		}));

	}

	protected renderBody(container: HTMLElement): void {
		const panelContainer = dom.append(container, dom.$('.tree-explorer-viewlet-tree-view'));
		const treeContainer = dom.append(panelContainer, dom.$('.customview-tree'));
		dom.addClass(treeContainer, 'file-icon-themable-tree');
		dom.addClass(treeContainer, 'show-file-icons');

		const renderer = new TunnelTreeRenderer(TunnelPanel.ID, this.menuService, this.contextKeyService, this.instantiationService, this.contextViewService, this.themeService, this.remoteExplorerService);
		this.tree = this.instantiationService.createInstance(WorkbenchAsyncDataTree,
			'RemoteTunnels',
			treeContainer,
			new TunnelTreeVirtualDelegate(),
			[renderer],
			new TunnelDataSource(),
			{
				keyboardSupport: true,
				collapseByDefault: (e: ITunnelItem | ITunnelGroup): boolean => {
					return false;
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (item: ITunnelItem | ITunnelGroup) => {
						return item.label;
					}
				},
				multipleSelectionSupport: false
			}
		);
		const actionRunner: ActionRunner = new ActionRunner();
		renderer.actionRunner = actionRunner;

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e, actionRunner)));
		this._register(this.tree.onMouseDblClick(e => this.onMouseDblClick(e)));

		this.tree.setInput(this.viewModel);
		this._register(this.viewModel.onForwardedPortsChanged(() => {
			this.tree.updateChildren(undefined, true);
		}));

		const navigator = this._register(new TreeResourceNavigator2(this.tree, { openOnFocus: false, openOnSelection: false }));

		this._register(Event.debounce(navigator.onDidOpenResource, (last, event) => event, 75, true)(e => {
			if (e.element && (e.element.tunnelType === TunnelType.Add)) {
				this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
			}
		}));

		this._register(this.remoteExplorerService.onDidChangeEditable(async e => {
			const isEditing = !!this.remoteExplorerService.getEditableData(e);

			if (!isEditing) {
				dom.removeClass(treeContainer, 'highlight');
			}

			await this.tree.updateChildren(undefined, false);

			if (isEditing) {
				dom.addClass(treeContainer, 'highlight');
				this.tree.reveal(e ? e : this.viewModel.input);
			} else {
				this.tree.domFocus();
			}
		}));
	}

	private get contributedContextMenu(): IMenu {
		const contributedContextMenu = this._register(this.menuService.createMenu(MenuId.TunnelContext, this.tree.contextKeyService));
		return contributedContextMenu;
	}

	getActions(): IAction[] {
		return this.titleActions;
	}

	focus(): void {
		super.focus();
		this.tree.domFocus();
	}

	private onContextMenu(treeEvent: ITreeContextMenuEvent<ITunnelItem | ITunnelGroup>, actionRunner: ActionRunner): void {
		if ((treeEvent.element !== null) && !(treeEvent.element instanceof TunnelItem)) {
			return;
		}
		const node: ITunnelItem | null = treeEvent.element;
		const event: UIEvent = treeEvent.browserEvent;

		event.preventDefault();
		event.stopPropagation();

		if (node) {
			this.tree!.setFocus([node]);
			this.tunnelTypeContext.set(node.tunnelType);
			this.tunnelCloseableContext.set(!!node.closeable);
		} else {
			this.tunnelTypeContext.set(TunnelType.Add);
			this.tunnelCloseableContext.set(false);
		}

		const actions: IAction[] = [];
		this._register(createAndFillInContextMenuActions(this.contributedContextMenu, { shouldForwardArgs: true }, actions, this.contextMenuService));

		this.contextMenuService.showContextMenu({
			getAnchor: () => treeEvent.anchor,
			getActions: () => actions,
			getActionViewItem: (action) => {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return undefined;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.tree!.domFocus();
				}
			},
			getActionsContext: () => node,
			actionRunner
		});
	}

	private onMouseDblClick(e: ITreeMouseEvent<ITunnelGroup | ITunnelItem | null>): void {
		if (!e.element) {
			this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
		}
	}

	protected layoutBody(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		return action instanceof MenuItemAction ? new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService) : undefined;
	}
}

export class TunnelPanelDescriptor implements IViewDescriptor {
	readonly id = TunnelPanel.ID;
	readonly name = TunnelPanel.TITLE;
	readonly ctorDescriptor: SyncDescriptor<TunnelPanel>;
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly workspace = true;
	readonly group = 'details@0';
	readonly remoteAuthority?: string | string[];

	constructor(viewModel: ITunnelViewModel, environmentService: IWorkbenchEnvironmentService) {
		this.ctorDescriptor = new SyncDescriptor(TunnelPanel, [viewModel]);
		this.remoteAuthority = environmentService.configuration.remoteAuthority ? environmentService.configuration.remoteAuthority.split('+')[0] : undefined;
	}
}

namespace LabelTunnelAction {
	export const ID = 'remote.tunnel.label';
	export const LABEL = nls.localize('remote.tunnel.label', "Set Label");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			if (arg instanceof TunnelItem) {
				const remoteExplorerService = accessor.get(IRemoteExplorerService);
				remoteExplorerService.setEditable(arg, {
					onFinish: (value, success) => {
						if (success) {
							remoteExplorerService.tunnelModel.name(arg.remoteHost, arg.remotePort, value);
						}
						remoteExplorerService.setEditable(arg, null);
					},
					validationMessage: () => null,
					placeholder: nls.localize('remote.tunnelsView.labelPlaceholder', "Port label"),
					startingValue: arg.name
				});
			}
			return;
		};
	}
}

namespace ForwardPortAction {
	export const INLINE_ID = 'remote.tunnel.forwardInline';
	export const COMMANDPALETTE_ID = 'remote.tunnel.forwardCommandPalette';
	export const LABEL = nls.localize('remote.tunnel.forward', "Forward a Port");
	const forwardPrompt = nls.localize('remote.tunnel.forwardPrompt', "Port number or address (eg. 3000 or 10.10.10.10:2000).");

	function parseInput(value: string): { host: string, port: number } | undefined {
		const matches = value.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\:|localhost:)?([0-9]+)$/);
		if (!matches) {
			return undefined;
		}
		return { host: matches[1]?.substring(0, matches[1].length - 1) || 'localhost', port: Number(matches[2]) };
	}

	function validateInput(value: string): string | null {
		if (!parseInput(value)) {
			return nls.localize('remote.tunnelsView.portNumberValid', "Port number is invalid");
		}
		return null;
	}

	function error(notificationService: INotificationService, tunnel: RemoteTunnel | void, host: string, port: number) {
		if (!tunnel) {
			notificationService.error(nls.localize('remote.tunnel.forwardError', "Unable to forward {0}:{1}. The host may not be available.", host, port));
		}
	}

	export function inlineHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const notificationService = accessor.get(INotificationService);
			if (arg instanceof TunnelItem) {
				remoteExplorerService.forward({ host: arg.remoteHost, port: arg.remotePort }).then(tunnel => error(notificationService, tunnel, arg.remoteHost, arg.remotePort));
			} else {
				remoteExplorerService.setEditable(undefined, {
					onFinish: (value, success) => {
						let parsed: { host: string, port: number } | undefined;
						if (success && (parsed = parseInput(value))) {
							remoteExplorerService.forward({ host: parsed.host, port: parsed.port }).then(tunnel => error(notificationService, tunnel, parsed!.host, parsed!.port));
						}
						remoteExplorerService.setEditable(undefined, null);
					},
					validationMessage: validateInput,
					placeholder: forwardPrompt
				});
			}
		};
	}

	export function commandPaletteHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const notificationService = accessor.get(INotificationService);
			const viewsService = accessor.get(IViewsService);
			const quickInputService = accessor.get(IQuickInputService);
			await viewsService.openView(TunnelPanel.ID, true);
			const value = await quickInputService.input({
				prompt: forwardPrompt,
				validateInput: (value) => Promise.resolve(validateInput(value))
			});
			let parsed: { host: string, port: number } | undefined;
			if (value && (parsed = parseInput(value))) {
				remoteExplorerService.forward({ host: parsed.host, port: parsed.port }).then(tunnel => error(notificationService, tunnel, parsed!.host, parsed!.port));
			}
		};
	}
}

namespace ClosePortAction {
	export const ID = 'remote.tunnel.close';
	export const LABEL = nls.localize('remote.tunnel.close', "Stop Forwarding Port");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			if (arg instanceof TunnelItem) {
				const remoteExplorerService = accessor.get(IRemoteExplorerService);
				await remoteExplorerService.close({ host: arg.remoteHost, port: arg.remotePort });
			}
		};
	}
}

namespace OpenPortInBrowserAction {
	export const ID = 'remote.tunnel.open';
	export const LABEL = nls.localize('remote.tunnel.open', "Open in Browser");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			if (arg instanceof TunnelItem) {
				const model = accessor.get(IRemoteExplorerService).tunnelModel;
				const openerService = accessor.get(IOpenerService);
				const key = MakeAddress(arg.remoteHost, arg.remotePort);
				const tunnel = model.forwarded.get(key) || model.detected.get(key);
				let address: string | undefined;
				if (tunnel && tunnel.localAddress && (address = model.address(tunnel.remoteHost, tunnel.remotePort))) {
					return openerService.open(URI.parse('http://' + address));
				}
				return Promise.resolve();
			}
		};
	}
}

namespace CopyAddressAction {
	export const ID = 'remote.tunnel.copyAddress';
	export const LABEL = nls.localize('remote.tunnel.copyAddress', "Copy Address");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			if (arg instanceof TunnelItem) {
				const model = accessor.get(IRemoteExplorerService).tunnelModel;
				const clipboard = accessor.get(IClipboardService);
				const address = model.address(arg.remoteHost, arg.remotePort);
				if (address) {
					await clipboard.writeText(address.toString());
				}
			}
		};
	}
}

namespace RefreshTunnelViewAction {
	export const ID = 'remote.tunnel.refresh';
	export const LABEL = nls.localize('remote.tunnel.refreshView', "Refresh");

	export function handler(): ICommandHandler {
		return (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			return remoteExplorerService.refresh();
		};
	}
}

CommandsRegistry.registerCommand(LabelTunnelAction.ID, LabelTunnelAction.handler());
CommandsRegistry.registerCommand(ForwardPortAction.INLINE_ID, ForwardPortAction.inlineHandler());
CommandsRegistry.registerCommand(ForwardPortAction.COMMANDPALETTE_ID, ForwardPortAction.commandPaletteHandler());
CommandsRegistry.registerCommand(ClosePortAction.ID, ClosePortAction.handler());
CommandsRegistry.registerCommand(OpenPortInBrowserAction.ID, OpenPortInBrowserAction.handler());
CommandsRegistry.registerCommand(CopyAddressAction.ID, CopyAddressAction.handler());
CommandsRegistry.registerCommand(RefreshTunnelViewAction.ID, RefreshTunnelViewAction.handler());

MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
	command: {
		id: ForwardPortAction.COMMANDPALETTE_ID,
		title: ForwardPortAction.LABEL
	},
	when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.TunnelTitle, ({
	group: 'navigation',
	order: 0,
	command: {
		id: ForwardPortAction.INLINE_ID,
		title: ForwardPortAction.LABEL,
		icon: { id: 'codicon/plus' }
	}
}));
MenuRegistry.appendMenuItem(MenuId.TunnelTitle, ({
	group: 'navigation',
	order: 1,
	command: {
		id: RefreshTunnelViewAction.ID,
		title: RefreshTunnelViewAction.LABEL,
		icon: { id: 'codicon/refresh' }
	}
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '0_manage',
	order: 0,
	command: {
		id: CopyAddressAction.ID,
		title: CopyAddressAction.LABEL,
	},
	when: ContextKeyExpr.or(TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded), TunnelTypeContextKey.isEqualTo(TunnelType.Detected))
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '0_manage',
	order: 1,
	command: {
		id: OpenPortInBrowserAction.ID,
		title: OpenPortInBrowserAction.LABEL,
	},
	when: ContextKeyExpr.or(TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded), TunnelTypeContextKey.isEqualTo(TunnelType.Detected))
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '0_manage',
	order: 2,
	command: {
		id: LabelTunnelAction.ID,
		title: LabelTunnelAction.LABEL,
	},
	when: TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '0_manage',
	order: 1,
	command: {
		id: ForwardPortAction.INLINE_ID,
		title: ForwardPortAction.LABEL,
	},
	when: ContextKeyExpr.or(TunnelTypeContextKey.isEqualTo(TunnelType.Candidate), TunnelTypeContextKey.isEqualTo(TunnelType.Add))
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '0_manage',
	order: 3,
	command: {
		id: ClosePortAction.ID,
		title: ClosePortAction.LABEL,
	},
	when: TunnelCloseableContextKey
}));

MenuRegistry.appendMenuItem(MenuId.TunnelInline, ({
	order: 0,
	command: {
		id: OpenPortInBrowserAction.ID,
		title: OpenPortInBrowserAction.LABEL,
		icon: { id: 'codicon/globe' }
	},
	when: ContextKeyExpr.or(TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded), TunnelTypeContextKey.isEqualTo(TunnelType.Detected))
}));
MenuRegistry.appendMenuItem(MenuId.TunnelInline, ({
	order: 0,
	command: {
		id: ForwardPortAction.INLINE_ID,
		title: ForwardPortAction.LABEL,
		icon: { id: 'codicon/plus' }
	},
	when: TunnelTypeContextKey.isEqualTo(TunnelType.Candidate)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelInline, ({
	order: 2,
	command: {
		id: ClosePortAction.ID,
		title: ClosePortAction.LABEL,
		icon: { id: 'codicon/x' }
	},
	when: TunnelCloseableContextKey
}));
