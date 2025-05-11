/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/tunnelView.css';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { IViewDescriptor, IEditableData, IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, IContextKey, RawContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { ICommandService, ICommandHandler, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Event } from '../../../../base/common/event.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { Disposable, IDisposable, toDisposable, dispose, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { createActionViewItem, getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IRemoteExplorerService, TunnelType, ITunnelItem, TUNNEL_VIEW_ID, TunnelEditId } from '../../../services/remote/common/remoteExplorerService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { URI } from '../../../../base/common/uri.js';
import { isAllInterfaces, isLocalhost, ITunnelService, RemoteTunnel, TunnelPrivacyId, TunnelProtocol } from '../../../../platform/tunnel/common/tunnel.js';
import { TunnelPrivacy } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { copyAddressIcon, forwardedPortWithoutProcessIcon, forwardedPortWithProcessIcon, forwardPortIcon, labelPortIcon, openBrowserIcon, openPreviewIcon, portsViewIcon, privatePortIcon, stopForwardIcon } from './remoteIcons.js';
import { IExternalUriOpenerService } from '../../externalUriOpener/common/externalUriOpenerService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ITableColumn, ITableContextMenuEvent, ITableEvent, ITableMouseEvent, ITableRenderer, ITableVirtualDelegate } from '../../../../base/browser/ui/table/table.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { STATUS_BAR_REMOTE_ITEM_BACKGROUND } from '../../../common/theme.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Attributes, CandidatePort, Tunnel, TunnelCloseReason, TunnelModel, TunnelSource, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, parseAddress } from '../../../services/remote/common/tunnelModel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export const openPreviewEnabledContext = new RawContextKey<boolean>('openPreviewEnabled', false);

class TunnelTreeVirtualDelegate implements ITableVirtualDelegate<ITunnelItem> {

	readonly headerRowHeight: number = 22;

	constructor(private readonly remoteExplorerService: IRemoteExplorerService) { }

	getHeight(row: ITunnelItem): number {
		return (row.tunnelType === TunnelType.Add && !this.remoteExplorerService.getEditableData(undefined)) ? 30 : 22;
	}
}

interface ITunnelViewModel {
	readonly onForwardedPortsChanged: Event<void>;
	readonly all: TunnelItem[];
	readonly input: TunnelItem;
	isEmpty(): boolean;
}

export class TunnelViewModel implements ITunnelViewModel {

	readonly onForwardedPortsChanged: Event<void>;
	private model: TunnelModel;
	private _candidates: Map<string, CandidatePort> = new Map();

	readonly input = {
		label: nls.localize('remote.tunnelsView.addPort', "Add Port"),
		icon: undefined,
		tunnelType: TunnelType.Add,
		hasRunningProcess: false,
		remoteHost: '',
		remotePort: 0,
		processDescription: '',
		tooltipPostfix: '',
		iconTooltip: '',
		portTooltip: '',
		processTooltip: '',
		originTooltip: '',
		privacyTooltip: '',
		source: { source: TunnelSource.User, description: '' },
		protocol: TunnelProtocol.Http,
		privacy: {
			id: TunnelPrivacyId.Private,
			themeIcon: privatePortIcon.id,
			label: nls.localize('tunnelPrivacy.private', "Private")
		},
		strip: () => undefined
	};

	constructor(
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ITunnelService private readonly tunnelService: ITunnelService
	) {
		this.model = remoteExplorerService.tunnelModel;
		this.onForwardedPortsChanged = Event.any(this.model.onForwardPort, this.model.onClosePort, this.model.onPortName, this.model.onCandidatesChanged);
	}

	get all(): TunnelItem[] {
		const result: TunnelItem[] = [];
		this._candidates = new Map();
		this.model.candidates.forEach(candidate => {
			this._candidates.set(makeAddress(candidate.host, candidate.port), candidate);
		});
		if ((this.model.forwarded.size > 0) || this.remoteExplorerService.getEditableData(undefined)) {
			result.push(...this.forwarded);
		}
		if (this.model.detected.size > 0) {
			result.push(...this.detected);
		}

		result.push(this.input);
		return result;
	}

	private addProcessInfoFromCandidate(tunnelItem: ITunnelItem) {
		const key = makeAddress(tunnelItem.remoteHost, tunnelItem.remotePort);
		if (this._candidates.has(key)) {
			tunnelItem.processDescription = this._candidates.get(key)!.detail;
		}
	}

	private get forwarded(): TunnelItem[] {
		const forwarded = Array.from(this.model.forwarded.values()).map(tunnel => {
			const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel);
			this.addProcessInfoFromCandidate(tunnelItem);
			return tunnelItem;
		}).sort((a: TunnelItem, b: TunnelItem) => {
			if (a.remotePort === b.remotePort) {
				return a.remoteHost < b.remoteHost ? -1 : 1;
			} else {
				return a.remotePort < b.remotePort ? -1 : 1;
			}
		});
		return forwarded;
	}

	private get detected(): TunnelItem[] {
		return Array.from(this.model.detected.values()).map(tunnel => {
			const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel, TunnelType.Detected, false);
			this.addProcessInfoFromCandidate(tunnelItem);
			return tunnelItem;
		});
	}

	isEmpty(): boolean {
		return (this.detected.length === 0) &&
			((this.forwarded.length === 0) || (this.forwarded.length === 1 &&
				(this.forwarded[0].tunnelType === TunnelType.Add) && !this.remoteExplorerService.getEditableData(undefined)));
	}
}

function emptyCell(item: ITunnelItem): ActionBarCell {
	return { label: '', tunnel: item, editId: TunnelEditId.None, tooltip: '' };
}

class IconColumn implements ITableColumn<ITunnelItem, ActionBarCell> {
	readonly label: string = '';
	readonly tooltip: string = '';
	readonly weight: number = 1;
	readonly minimumWidth = 40;
	readonly maximumWidth = 40;
	readonly templateId: string = 'actionbar';
	project(row: ITunnelItem): ActionBarCell {
		if (row.tunnelType === TunnelType.Add) {
			return emptyCell(row);
		}

		const icon = row.processDescription ? forwardedPortWithProcessIcon : forwardedPortWithoutProcessIcon;
		let tooltip: string = '';
		if (row instanceof TunnelItem) {
			tooltip = `${row.iconTooltip} ${row.tooltipPostfix}`;
		}
		return {
			label: '', icon, tunnel: row, editId: TunnelEditId.None, tooltip
		};
	}
}

class PortColumn implements ITableColumn<ITunnelItem, ActionBarCell> {
	readonly label: string = nls.localize('tunnel.portColumn.label', "Port");
	readonly tooltip: string = nls.localize('tunnel.portColumn.tooltip', "The label and remote port number of the forwarded port.");
	readonly weight: number = 1;
	readonly templateId: string = 'actionbar';
	project(row: ITunnelItem): ActionBarCell {
		const isAdd = row.tunnelType === TunnelType.Add;
		const label = row.label;
		let tooltip: string = '';
		if (row instanceof TunnelItem && !isAdd) {
			tooltip = `${row.portTooltip} ${row.tooltipPostfix}`;
		} else {
			tooltip = label;
		}
		return {
			label, tunnel: row, menuId: MenuId.TunnelPortInline,
			editId: row.tunnelType === TunnelType.Add ? TunnelEditId.New : TunnelEditId.Label, tooltip
		};
	}
}

class LocalAddressColumn implements ITableColumn<ITunnelItem, ActionBarCell> {
	readonly label: string = nls.localize('tunnel.addressColumn.label', "Forwarded Address");
	readonly tooltip: string = nls.localize('tunnel.addressColumn.tooltip', "The address that the forwarded port is available at.");
	readonly weight: number = 1;
	readonly templateId: string = 'actionbar';
	project(row: ITunnelItem): ActionBarCell {
		if (row.tunnelType === TunnelType.Add) {
			return emptyCell(row);
		}

		const label = row.localAddress ?? '';
		let tooltip: string = label;
		if (row instanceof TunnelItem) {
			tooltip = row.tooltipPostfix;
		}
		return {
			label,
			menuId: MenuId.TunnelLocalAddressInline,
			tunnel: row,
			editId: TunnelEditId.LocalPort,
			tooltip,
			markdownTooltip: label ? LocalAddressColumn.getHoverText(label) : undefined
		};
	}

	private static getHoverText(localAddress: string) {
		return function (configurationService: IConfigurationService) {
			const editorConf = configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');

			let clickLabel = '';
			if (editorConf.multiCursorModifier === 'ctrlCmd') {
				if (isMacintosh) {
					clickLabel = nls.localize('portsLink.followLinkAlt.mac', "option + click");
				} else {
					clickLabel = nls.localize('portsLink.followLinkAlt', "alt + click");
				}
			} else {
				if (isMacintosh) {
					clickLabel = nls.localize('portsLink.followLinkCmd', "cmd + click");
				} else {
					clickLabel = nls.localize('portsLink.followLinkCtrl', "ctrl + click");
				}
			}

			const markdown = new MarkdownString('', true);
			const uri = localAddress.startsWith('http') ? localAddress : `http://${localAddress}`;
			return markdown.appendLink(uri, 'Follow link').appendMarkdown(` (${clickLabel})`);
		};
	}
}

class RunningProcessColumn implements ITableColumn<ITunnelItem, ActionBarCell> {
	readonly label: string = nls.localize('tunnel.processColumn.label', "Running Process");
	readonly tooltip: string = nls.localize('tunnel.processColumn.tooltip', "The command line of the process that is using the port.");
	readonly weight: number = 2;
	readonly templateId: string = 'actionbar';
	project(row: ITunnelItem): ActionBarCell {
		if (row.tunnelType === TunnelType.Add) {
			return emptyCell(row);
		}

		const label = row.processDescription ?? '';
		return { label, tunnel: row, editId: TunnelEditId.None, tooltip: row instanceof TunnelItem ? row.processTooltip : '' };
	}
}

class OriginColumn implements ITableColumn<ITunnelItem, ActionBarCell> {
	readonly label: string = nls.localize('tunnel.originColumn.label', "Origin");
	readonly tooltip: string = nls.localize('tunnel.originColumn.tooltip', "The source that a forwarded port originates from. Can be an extension, user forwarded, statically forwarded, or automatically forwarded.");
	readonly weight: number = 1;
	readonly templateId: string = 'actionbar';
	project(row: ITunnelItem): ActionBarCell {
		if (row.tunnelType === TunnelType.Add) {
			return emptyCell(row);
		}

		const label = row.source.description;
		const tooltip = `${row instanceof TunnelItem ? row.originTooltip : ''}. ${row instanceof TunnelItem ? row.tooltipPostfix : ''}`;
		return { label, menuId: MenuId.TunnelOriginInline, tunnel: row, editId: TunnelEditId.None, tooltip };
	}
}

class PrivacyColumn implements ITableColumn<ITunnelItem, ActionBarCell> {
	readonly label: string = nls.localize('tunnel.privacyColumn.label', "Visibility");
	readonly tooltip: string = nls.localize('tunnel.privacyColumn.tooltip', "The availability of the forwarded port.");
	readonly weight: number = 1;
	readonly templateId: string = 'actionbar';
	project(row: ITunnelItem): ActionBarCell {
		if (row.tunnelType === TunnelType.Add) {
			return emptyCell(row);
		}

		const label = row.privacy?.label;
		let tooltip: string = '';
		if (row instanceof TunnelItem) {
			tooltip = `${row.privacy.label} ${row.tooltipPostfix}`;
		}
		return { label, tunnel: row, icon: { id: row.privacy.themeIcon }, editId: TunnelEditId.None, tooltip };
	}
}

interface IActionBarTemplateData {
	elementDisposable: IDisposable;
	container: HTMLElement;
	label: IconLabel;
	button?: Button;
	icon: HTMLElement;
	actionBar: ActionBar;
}

interface ActionBarCell {
	label: string;
	icon?: ThemeIcon;
	tooltip: string;
	markdownTooltip?: (configurationService: IConfigurationService) => IMarkdownString;
	menuId?: MenuId;
	tunnel: ITunnelItem;
	editId: TunnelEditId;
}

class ActionBarRenderer extends Disposable implements ITableRenderer<ActionBarCell, IActionBarTemplateData> {
	readonly templateId = 'actionbar';
	private inputDone?: (success: boolean, finishEditing: boolean) => void;
	private _actionRunner: ActionRunner | undefined;
	private readonly _hoverDelegate: IHoverDelegate;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._hoverDelegate = getDefaultHoverDelegate('mouse');
	}

	set actionRunner(actionRunner: ActionRunner) {
		this._actionRunner = actionRunner;
	}

	renderTemplate(container: HTMLElement): IActionBarTemplateData {
		const cell = dom.append(container, dom.$('.ports-view-actionbar-cell'));
		const icon = dom.append(cell, dom.$('.ports-view-actionbar-cell-icon'));
		const label = new IconLabel(cell,
			{
				supportHighlights: true,
				hoverDelegate: this._hoverDelegate
			});
		const actionsContainer = dom.append(cell, dom.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService),
			hoverDelegate: this._hoverDelegate
		});
		return { label, icon, actionBar, container: cell, elementDisposable: Disposable.None };
	}

	renderElement(element: ActionBarCell, index: number, templateData: IActionBarTemplateData): void {
		// reset
		templateData.actionBar.clear();
		templateData.icon.className = 'ports-view-actionbar-cell-icon';
		templateData.icon.style.display = 'none';
		templateData.label.setLabel('');
		templateData.label.element.style.display = 'none';
		templateData.container.style.height = '22px';
		if (templateData.button) {
			templateData.button.element.style.display = 'none';
			templateData.button.dispose();
		}
		templateData.container.style.paddingLeft = '0px';
		templateData.elementDisposable.dispose();

		let editableData: IEditableData | undefined;
		if (element.editId === TunnelEditId.New && (editableData = this.remoteExplorerService.getEditableData(undefined))) {
			this.renderInputBox(templateData.container, editableData);
		} else {
			editableData = this.remoteExplorerService.getEditableData(element.tunnel, element.editId);
			if (editableData) {
				this.renderInputBox(templateData.container, editableData);
			} else if ((element.tunnel.tunnelType === TunnelType.Add) && (element.menuId === MenuId.TunnelPortInline)) {
				this.renderButton(element, templateData);
			} else {
				this.renderActionBarItem(element, templateData);
			}
		}
	}

	renderButton(element: ActionBarCell, templateData: IActionBarTemplateData): void {
		templateData.container.style.paddingLeft = '7px';
		templateData.container.style.height = '28px';
		templateData.button = this._register(new Button(templateData.container, defaultButtonStyles));
		templateData.button.label = element.label;
		templateData.button.element.title = element.tooltip;
		this._register(templateData.button.onDidClick(() => {
			this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
		}));
	}

	private tunnelContext(tunnel: ITunnelItem): ITunnelItem {
		let context: ITunnelItem | undefined;
		if (tunnel instanceof TunnelItem) {
			context = tunnel.strip();
		}
		if (!context) {
			context = {
				tunnelType: tunnel.tunnelType,
				remoteHost: tunnel.remoteHost,
				remotePort: tunnel.remotePort,
				localAddress: tunnel.localAddress,
				protocol: tunnel.protocol,
				localUri: tunnel.localUri,
				localPort: tunnel.localPort,
				name: tunnel.name,
				closeable: tunnel.closeable,
				source: tunnel.source,
				privacy: tunnel.privacy,
				processDescription: tunnel.processDescription,
				label: tunnel.label
			};
		}
		return context;
	}

	renderActionBarItem(element: ActionBarCell, templateData: IActionBarTemplateData): void {
		templateData.label.element.style.display = 'flex';
		templateData.label.setLabel(element.label, undefined,
			{
				title: element.markdownTooltip ?
					{ markdown: element.markdownTooltip(this.configurationService), markdownNotSupportedFallback: element.tooltip }
					: element.tooltip,
				extraClasses: element.menuId === MenuId.TunnelLocalAddressInline ? ['ports-view-actionbar-cell-localaddress'] : undefined
			});
		templateData.actionBar.context = this.tunnelContext(element.tunnel);
		templateData.container.style.paddingLeft = '10px';
		const context: [string, any][] =
			[
				['view', TUNNEL_VIEW_ID],
				[TunnelTypeContextKey.key, element.tunnel.tunnelType],
				[TunnelCloseableContextKey.key, element.tunnel.closeable],
				[TunnelPrivacyContextKey.key, element.tunnel.privacy.id],
				[TunnelProtocolContextKey.key, element.tunnel.protocol]
			];
		const contextKeyService = this.contextKeyService.createOverlay(context);
		const disposableStore = new DisposableStore();
		templateData.elementDisposable = disposableStore;
		if (element.menuId) {
			const menu = disposableStore.add(this.menuService.createMenu(element.menuId, contextKeyService));
			let actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
			if (actions) {
				const labelActions = actions.filter(action => action.id.toLowerCase().indexOf('label') >= 0);
				if (labelActions.length > 1) {
					labelActions.sort((a, b) => a.label.length - b.label.length);
					labelActions.pop();
					actions = actions.filter(action => labelActions.indexOf(action) < 0);
				}
				templateData.actionBar.push(actions, { icon: true, label: false });
				if (this._actionRunner) {
					templateData.actionBar.actionRunner = this._actionRunner;
				}
			}
		}
		if (element.icon) {
			templateData.icon.className = `ports-view-actionbar-cell-icon ${ThemeIcon.asClassName(element.icon)}`;
			templateData.icon.title = element.tooltip;
			templateData.icon.style.display = 'inline';
		}
	}

	private renderInputBox(container: HTMLElement, editableData: IEditableData): IDisposable {
		// Required for FireFox. The blur event doesn't fire on FireFox when you just mash the "+" button to forward a port.
		if (this.inputDone) {
			this.inputDone(false, false);
			this.inputDone = undefined;
		}
		container.style.paddingLeft = '5px';
		const value = editableData.startingValue || '';
		const inputBox = new InputBox(container, this.contextViewService, {
			ariaLabel: nls.localize('remote.tunnelsView.input', "Press Enter to confirm or Escape to cancel."),
			validationOptions: {
				validation: (value) => {
					const message = editableData.validationMessage(value);
					if (!message) {
						return null;
					}

					return {
						content: message.content,
						formatContent: true,
						type: message.severity === Severity.Error ? MessageType.ERROR : MessageType.INFO
					};
				}
			},
			placeholder: editableData.placeholder || '',
			inputBoxStyles: defaultInputBoxStyles
		});
		inputBox.value = value;
		inputBox.focus();
		inputBox.select({ start: 0, end: editableData.startingValue ? editableData.startingValue.length : 0 });

		const done = createSingleCallFunction(async (success: boolean, finishEditing: boolean) => {
			dispose(toDispose);
			if (this.inputDone) {
				this.inputDone = undefined;
			}
			inputBox.element.style.display = 'none';
			const inputValue = inputBox.value;
			if (finishEditing) {
				return editableData.onFinish(inputValue, success);
			}
		});
		this.inputDone = done;

		const toDispose = [
			inputBox,
			dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, async (e: IKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					e.stopPropagation();
					if (inputBox.validate() !== MessageType.ERROR) {
						return done(true, true);
					} else {
						return done(false, true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					e.preventDefault();
					e.stopPropagation();
					return done(false, true);
				}
			}),
			dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
				return done(inputBox.validate() !== MessageType.ERROR, true);
			})
		];

		return toDisposable(() => {
			done(false, false);
		});
	}

	disposeElement(element: ActionBarCell, index: number, templateData: IActionBarTemplateData, height: number | undefined) {
		templateData.elementDisposable.dispose();
	}

	disposeTemplate(templateData: IActionBarTemplateData): void {
		templateData.label.dispose();
		templateData.actionBar.dispose();
		templateData.elementDisposable.dispose();
		templateData.button?.dispose();
	}
}

class TunnelItem implements ITunnelItem {
	static createFromTunnel(remoteExplorerService: IRemoteExplorerService, tunnelService: ITunnelService,
		tunnel: Tunnel, type: TunnelType = TunnelType.Forwarded, closeable?: boolean) {
		return new TunnelItem(type,
			tunnel.remoteHost,
			tunnel.remotePort,
			tunnel.source,
			!!tunnel.hasRunningProcess,
			tunnel.protocol,
			tunnel.localUri,
			tunnel.localAddress,
			tunnel.localPort,
			closeable === undefined ? tunnel.closeable : closeable,
			tunnel.name,
			tunnel.runningProcess,
			tunnel.pid,
			tunnel.privacy,
			remoteExplorerService,
			tunnelService);
	}

	/**
	 * Removes all non-serializable properties from the tunnel
	 * @returns A new TunnelItem without any services
	 */
	public strip(): TunnelItem | undefined {
		return new TunnelItem(
			this.tunnelType,
			this.remoteHost,
			this.remotePort,
			this.source,
			this.hasRunningProcess,
			this.protocol,
			this.localUri,
			this.localAddress,
			this.localPort,
			this.closeable,
			this.name,
			this.runningProcess,
			this.pid,
			this._privacy
		);
	}

	constructor(
		public tunnelType: TunnelType,
		public remoteHost: string,
		public remotePort: number,
		public source: { source: TunnelSource; description: string },
		public hasRunningProcess: boolean,
		public protocol: TunnelProtocol,
		public localUri?: URI,
		public localAddress?: string,
		public localPort?: number,
		public closeable?: boolean,
		public name?: string,
		private runningProcess?: string,
		private pid?: number,
		private _privacy?: TunnelPrivacyId | string,
		private remoteExplorerService?: IRemoteExplorerService,
		private tunnelService?: ITunnelService
	) { }

	get label(): string {
		if (this.tunnelType === TunnelType.Add && this.name) {
			return this.name;
		}
		const portNumberLabel = (isLocalhost(this.remoteHost) || isAllInterfaces(this.remoteHost))
			? `${this.remotePort}`
			: `${this.remoteHost}:${this.remotePort}`;
		if (this.name) {
			return `${this.name} (${portNumberLabel})`;
		} else {
			return portNumberLabel;
		}
	}

	set processDescription(description: string | undefined) {
		this.runningProcess = description;
	}

	get processDescription(): string | undefined {
		let description: string = '';
		if (this.runningProcess) {
			if (this.pid && this.remoteExplorerService?.namedProcesses.has(this.pid)) {
				// This is a known process. Give it a friendly name.
				description = this.remoteExplorerService.namedProcesses.get(this.pid)!;
			} else {
				description = this.runningProcess.replace(/\0/g, ' ').trim();
			}
			if (this.pid) {
				description += ` (${this.pid})`;
			}
		} else if (this.hasRunningProcess) {
			description = nls.localize('tunnelView.runningProcess.inacessable', "Process information unavailable");
		}

		return description;
	}

	get tooltipPostfix(): string {
		let information: string;
		if (this.localAddress) {
			information = nls.localize('remote.tunnel.tooltipForwarded', "Remote port {0}:{1} forwarded to local address {2}. ", this.remoteHost, this.remotePort, this.localAddress);
		} else {
			information = nls.localize('remote.tunnel.tooltipCandidate', "Remote port {0}:{1} not forwarded. ", this.remoteHost, this.remotePort);
		}

		return information;
	}

	get iconTooltip(): string {
		const isAdd = this.tunnelType === TunnelType.Add;
		if (!isAdd) {
			return `${this.processDescription ? nls.localize('tunnel.iconColumn.running', "Port has running process.") :
				nls.localize('tunnel.iconColumn.notRunning', "No running process.")}`;
		} else {
			return this.label;
		}
	}

	get portTooltip(): string {
		const isAdd = this.tunnelType === TunnelType.Add;
		if (!isAdd) {
			return `${this.name ? nls.localize('remote.tunnel.tooltipName', "Port labeled {0}. ", this.name) : ''}`;
		} else {
			return '';
		}
	}

	get processTooltip(): string {
		return this.processDescription ?? '';
	}

	get originTooltip(): string {
		return this.source.description;
	}

	get privacy(): TunnelPrivacy {
		if (this.tunnelService?.privacyOptions) {
			return this.tunnelService?.privacyOptions.find(element => element.id === this._privacy) ??
			{
				id: '',
				themeIcon: Codicon.question.id,
				label: nls.localize('tunnelPrivacy.unknown', "Unknown")
			};
		} else {
			return {
				id: TunnelPrivacyId.Private,
				themeIcon: privatePortIcon.id,
				label: nls.localize('tunnelPrivacy.private', "Private")
			};
		}
	}
}

const TunnelTypeContextKey = new RawContextKey<TunnelType>('tunnelType', TunnelType.Add, true);
const TunnelCloseableContextKey = new RawContextKey<boolean>('tunnelCloseable', false, true);
const TunnelPrivacyContextKey = new RawContextKey<TunnelPrivacyId | string | undefined>('tunnelPrivacy', undefined, true);
const TunnelPrivacyEnabledContextKey = new RawContextKey<boolean>('tunnelPrivacyEnabled', false, true);
const TunnelProtocolContextKey = new RawContextKey<TunnelProtocol | undefined>('tunnelProtocol', TunnelProtocol.Http, true);
const TunnelViewFocusContextKey = new RawContextKey<boolean>('tunnelViewFocus', false, nls.localize('tunnel.focusContext', "Whether the Ports view has focus."));
const TunnelViewSelectionKeyName = 'tunnelViewSelection';
// host:port
const TunnelViewSelectionContextKey = new RawContextKey<string | undefined>(TunnelViewSelectionKeyName, undefined, true);
const TunnelViewMultiSelectionKeyName = 'tunnelViewMultiSelection';
// host:port[]
const TunnelViewMultiSelectionContextKey = new RawContextKey<string[] | undefined>(TunnelViewMultiSelectionKeyName, undefined, true);
const PortChangableContextKey = new RawContextKey<boolean>('portChangable', false, true);
const ProtocolChangeableContextKey = new RawContextKey<boolean>('protocolChangable', true, true);

export class TunnelPanel extends ViewPane {

	static readonly ID = TUNNEL_VIEW_ID;
	static readonly TITLE: ILocalizedString = nls.localize2('remote.tunnel', "Ports");

	private panelContainer: HTMLElement | undefined;
	private table: WorkbenchTable<ITunnelItem> | undefined;
	private readonly tableDisposables: DisposableStore = this._register(new DisposableStore());
	private tunnelTypeContext: IContextKey<TunnelType>;
	private tunnelCloseableContext: IContextKey<boolean>;
	private tunnelPrivacyContext: IContextKey<TunnelPrivacyId | string | undefined>;
	private tunnelPrivacyEnabledContext: IContextKey<boolean>;
	private tunnelProtocolContext: IContextKey<TunnelProtocol | undefined>;
	private tunnelViewFocusContext: IContextKey<boolean>;
	private tunnelViewSelectionContext: IContextKey<string | undefined>;
	private tunnelViewMultiSelectionContext: IContextKey<string[] | undefined>;
	private portChangableContextKey: IContextKey<boolean>;
	private protocolChangableContextKey: IContextKey<boolean>;
	private isEditing: boolean = false;
	// TODO: Should this be removed?
	//@ts-expect-error
	private titleActions: IAction[] = [];
	private lastFocus: number[] = [];

	constructor(
		protected viewModel: ITunnelViewModel,
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ICommandService protected commandService: ICommandService,
		@IMenuService private readonly menuService: IMenuService,
		@IThemeService themeService: IThemeService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@IHoverService hoverService: IHoverService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IContextViewService private readonly contextViewService: IContextViewService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.tunnelTypeContext = TunnelTypeContextKey.bindTo(contextKeyService);
		this.tunnelCloseableContext = TunnelCloseableContextKey.bindTo(contextKeyService);
		this.tunnelPrivacyContext = TunnelPrivacyContextKey.bindTo(contextKeyService);
		this.tunnelPrivacyEnabledContext = TunnelPrivacyEnabledContextKey.bindTo(contextKeyService);
		this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
		this.protocolChangableContextKey = ProtocolChangeableContextKey.bindTo(contextKeyService);
		this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
		this.tunnelProtocolContext = TunnelProtocolContextKey.bindTo(contextKeyService);
		this.tunnelViewFocusContext = TunnelViewFocusContextKey.bindTo(contextKeyService);
		this.tunnelViewSelectionContext = TunnelViewSelectionContextKey.bindTo(contextKeyService);
		this.tunnelViewMultiSelectionContext = TunnelViewMultiSelectionContextKey.bindTo(contextKeyService);
		this.portChangableContextKey = PortChangableContextKey.bindTo(contextKeyService);

		const overlayContextKeyService = this.contextKeyService.createOverlay([['view', TunnelPanel.ID]]);
		const titleMenu = this._register(this.menuService.createMenu(MenuId.TunnelTitle, overlayContextKeyService));
		const updateActions = () => {
			this.titleActions = getFlatActionBarActions(titleMenu.getActions());
			this.updateActions();
		};

		this._register(titleMenu.onDidChange(updateActions));
		updateActions();

		this._register(toDisposable(() => {
			this.titleActions = [];
		}));

		this.registerPrivacyActions();
		this._register(Event.once(this.tunnelService.onAddedTunnelProvider)(() => {
			let updated = false;
			if (this.tunnelPrivacyEnabledContext.get() === false) {
				this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
				updated = true;
			}
			if (this.protocolChangableContextKey.get() === true) {
				this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
				updated = true;
			}
			if (updated) {
				updateActions();
				this.registerPrivacyActions();
				this.createTable();
				this.table?.layout(this.height, this.width);
			}
		}));
	}

	private registerPrivacyActions() {
		for (const privacyOption of this.tunnelService.privacyOptions) {
			const optionId = `remote.tunnel.privacy${privacyOption.id}`;
			CommandsRegistry.registerCommand(optionId, ChangeTunnelPrivacyAction.handler(privacyOption.id));
			MenuRegistry.appendMenuItem(MenuId.TunnelPrivacy, ({
				order: 0,
				command: {
					id: optionId,
					title: privacyOption.label,
					toggled: TunnelPrivacyContextKey.isEqualTo(privacyOption.id)
				}
			}));
		}
	}

	get portCount(): number {
		return this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
	}

	private createTable(): void {
		if (!this.panelContainer) {
			return;
		}
		this.tableDisposables.clear();

		dom.clearNode(this.panelContainer);

		const widgetContainer = dom.append(this.panelContainer, dom.$('.customview-tree'));
		widgetContainer.classList.add('ports-view');
		widgetContainer.classList.add('file-icon-themable-tree', 'show-file-icons');

		const actionBarRenderer = new ActionBarRenderer(this.instantiationService, this.contextKeyService,
			this.menuService, this.contextViewService, this.remoteExplorerService, this.commandService,
			this.configurationService);
		const columns = [new IconColumn(), new PortColumn(), new LocalAddressColumn(), new RunningProcessColumn()];
		if (this.tunnelService.canChangePrivacy) {
			columns.push(new PrivacyColumn());
		}
		columns.push(new OriginColumn());

		this.table = this.instantiationService.createInstance(WorkbenchTable,
			'RemoteTunnels',
			widgetContainer,
			new TunnelTreeVirtualDelegate(this.remoteExplorerService),
			columns,
			[actionBarRenderer],
			{
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (item: ITunnelItem) => {
						return item.label;
					}
				},
				multipleSelectionSupport: true,
				accessibilityProvider: {
					getAriaLabel: (item: ITunnelItem) => {
						if (item instanceof TunnelItem) {
							return `${item.tooltipPostfix} ${item.portTooltip} ${item.iconTooltip} ${item.processTooltip} ${item.originTooltip} ${this.tunnelService.canChangePrivacy ? item.privacy.label : ''}`;
						} else {
							return item.label;
						}
					},
					getWidgetAriaLabel: () => nls.localize('tunnelView', "Tunnel View")
				},
				openOnSingleClick: true
			}
		) as WorkbenchTable<ITunnelItem>;

		const actionRunner: ActionRunner = this.tableDisposables.add(new ActionRunner());
		actionBarRenderer.actionRunner = actionRunner;

		this.tableDisposables.add(this.table);
		this.tableDisposables.add(this.table.onContextMenu(e => this.onContextMenu(e, actionRunner)));
		this.tableDisposables.add(this.table.onMouseDblClick(e => this.onMouseDblClick(e)));
		this.tableDisposables.add(this.table.onDidChangeFocus(e => this.onFocusChanged(e)));
		this.tableDisposables.add(this.table.onDidChangeSelection(e => this.onSelectionChanged(e)));
		this.tableDisposables.add(this.table.onDidFocus(() => this.tunnelViewFocusContext.set(true)));
		this.tableDisposables.add(this.table.onDidBlur(() => this.tunnelViewFocusContext.set(false)));

		const rerender = () => this.table?.splice(0, Number.POSITIVE_INFINITY, this.viewModel.all);

		rerender();
		let lastPortCount = this.portCount;
		this.tableDisposables.add(Event.debounce(this.viewModel.onForwardedPortsChanged, (_last, e) => e, 50)(() => {
			const newPortCount = this.portCount;
			if (((lastPortCount === 0) || (newPortCount === 0)) && (lastPortCount !== newPortCount)) {
				this._onDidChangeViewWelcomeState.fire();
			}
			lastPortCount = newPortCount;
			rerender();
		}));

		this.tableDisposables.add(this.table.onMouseClick(e => {
			if (this.hasOpenLinkModifier(e.browserEvent) && this.table) {
				const selection = this.table.getSelectedElements();
				if ((selection.length === 0) ||
					((selection.length === 1) && (selection[0] === e.element))) {
					this.commandService.executeCommand(OpenPortInBrowserAction.ID, e.element);
				}
			}
		}));

		this.tableDisposables.add(this.table.onDidOpen(e => {
			if (!e.element || (e.element.tunnelType !== TunnelType.Forwarded)) {
				return;
			}
			if (e.browserEvent?.type === 'dblclick') {
				this.commandService.executeCommand(LabelTunnelAction.ID);
			}
		}));

		this.tableDisposables.add(this.remoteExplorerService.onDidChangeEditable(e => {
			this.isEditing = !!this.remoteExplorerService.getEditableData(e?.tunnel, e?.editId);
			this._onDidChangeViewWelcomeState.fire();

			if (!this.isEditing) {
				widgetContainer.classList.remove('highlight');
			}

			rerender();

			if (this.isEditing) {
				widgetContainer.classList.add('highlight');
				if (!e) {
					// When we are in editing mode for a new forward, rather than updating an existing one we need to reveal the input box since it might be out of view.
					this.table?.reveal(this.table.indexOf(this.viewModel.input));
				}
			} else {
				if (e && (e.tunnel.tunnelType !== TunnelType.Add)) {
					this.table?.setFocus(this.lastFocus);
				}
				this.focus();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.panelContainer = dom.append(container, dom.$('.tree-explorer-viewlet-tree-view'));
		this.createTable();
	}

	override shouldShowWelcome(): boolean {
		return this.viewModel.isEmpty() && !this.isEditing;
	}

	override focus(): void {
		super.focus();
		this.table?.domFocus();
	}

	private onFocusChanged(event: ITableEvent<ITunnelItem>) {
		if (event.indexes.length > 0 && event.elements.length > 0) {
			this.lastFocus = [...event.indexes];
		}
		const elements = event.elements;
		const item = elements && elements.length ? elements[0] : undefined;
		if (item) {
			this.tunnelViewSelectionContext.set(makeAddress(item.remoteHost, item.remotePort));
			this.tunnelTypeContext.set(item.tunnelType);
			this.tunnelCloseableContext.set(!!item.closeable);
			this.tunnelPrivacyContext.set(item.privacy.id);
			this.tunnelProtocolContext.set(item.protocol === TunnelProtocol.Https ? TunnelProtocol.Https : TunnelProtocol.Https);
			this.portChangableContextKey.set(!!item.localPort);
		} else {
			this.tunnelTypeContext.reset();
			this.tunnelViewSelectionContext.reset();
			this.tunnelCloseableContext.reset();
			this.tunnelPrivacyContext.reset();
			this.tunnelProtocolContext.reset();
			this.portChangableContextKey.reset();
		}
	}

	private hasOpenLinkModifier(e: MouseEvent): boolean {
		const editorConf = this.configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');

		let modifierKey = false;
		if (editorConf.multiCursorModifier === 'ctrlCmd') {
			modifierKey = e.altKey;
		} else {
			if (isMacintosh) {
				modifierKey = e.metaKey;
			} else {
				modifierKey = e.ctrlKey;
			}
		}
		return modifierKey;
	}

	private onSelectionChanged(event: ITableEvent<ITunnelItem>) {
		const elements = event.elements;
		if (elements.length > 1) {
			this.tunnelViewMultiSelectionContext.set(elements.map(element => makeAddress(element.remoteHost, element.remotePort)));
		} else {
			this.tunnelViewMultiSelectionContext.set(undefined);
		}
	}

	private onContextMenu(event: ITableContextMenuEvent<ITunnelItem>, actionRunner: ActionRunner): void {
		if ((event.element !== undefined) && !(event.element instanceof TunnelItem)) {
			return;
		}

		event.browserEvent.preventDefault();
		event.browserEvent.stopPropagation();

		const node: TunnelItem | undefined = event.element;

		if (node) {
			this.table?.setFocus([this.table.indexOf(node)]);
			this.tunnelTypeContext.set(node.tunnelType);
			this.tunnelCloseableContext.set(!!node.closeable);
			this.tunnelPrivacyContext.set(node.privacy.id);
			this.tunnelProtocolContext.set(node.protocol);
			this.portChangableContextKey.set(!!node.localPort);
		} else {
			this.tunnelTypeContext.set(TunnelType.Add);
			this.tunnelCloseableContext.set(false);
			this.tunnelPrivacyContext.set(undefined);
			this.tunnelProtocolContext.set(undefined);
			this.portChangableContextKey.set(false);
		}

		this.contextMenuService.showContextMenu({
			menuId: MenuId.TunnelContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: this.table?.contextKeyService,
			getAnchor: () => event.anchor,
			getActionViewItem: (action) => {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return undefined;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.table?.domFocus();
				}
			},
			getActionsContext: () => node?.strip(),
			actionRunner
		});
	}

	private onMouseDblClick(e: ITableMouseEvent<ITunnelItem>): void {
		if (!e.element) {
			this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
		}
	}

	private height = 0;
	private width = 0;
	protected override layoutBody(height: number, width: number): void {
		this.height = height;
		this.width = width;
		super.layoutBody(height, width);
		this.table?.layout(height, width);
	}
}

export class TunnelPanelDescriptor implements IViewDescriptor {
	readonly id = TunnelPanel.ID;
	readonly name: ILocalizedString = TunnelPanel.TITLE;
	readonly ctorDescriptor: SyncDescriptor<TunnelPanel>;
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	// group is not actually used for views that are not extension contributed. Use order instead.
	readonly group = 'details@0';
	// -500 comes from the remote explorer viewOrderDelegate
	readonly order = -500;
	readonly remoteAuthority?: string | string[];
	readonly canMoveView = true;
	readonly containerIcon = portsViewIcon;

	constructor(viewModel: ITunnelViewModel, environmentService: IWorkbenchEnvironmentService) {
		this.ctorDescriptor = new SyncDescriptor(TunnelPanel, [viewModel]);
		this.remoteAuthority = environmentService.remoteAuthority ? environmentService.remoteAuthority.split('+')[0] : undefined;
	}
}

function isITunnelItem(item: any): item is ITunnelItem {
	return item && item.tunnelType && item.remoteHost && item.source;
}

namespace LabelTunnelAction {
	export const ID = 'remote.tunnel.label';
	export const LABEL = nls.localize('remote.tunnel.label', "Set Port Label");
	export const COMMAND_ID_KEYWORD = 'label';

	export function handler(): ICommandHandler {
		return async (accessor, arg): Promise<{ port: number; label: string } | undefined> => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			let tunnelContext: ITunnelItem | undefined;
			if (isITunnelItem(arg)) {
				tunnelContext = arg;
			} else {
				const context = accessor.get(IContextKeyService).getContextKeyValue<string | undefined>(TunnelViewSelectionKeyName);
				const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
				if (tunnel) {
					const tunnelService = accessor.get(ITunnelService);
					tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, tunnel);
				}
			}
			if (tunnelContext) {
				const tunnelItem: ITunnelItem = tunnelContext;
				return new Promise(resolve => {
					const startingValue = tunnelItem.name ? tunnelItem.name : `${tunnelItem.remotePort}`;
					remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, {
						onFinish: async (value, success) => {
							value = value.trim();
							remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, null);
							const changed = success && (value !== startingValue);
							if (changed) {
								await remoteExplorerService.tunnelModel.name(tunnelItem.remoteHost, tunnelItem.remotePort, value);
							}
							resolve(changed ? { port: tunnelItem.remotePort, label: value } : undefined);
						},
						validationMessage: () => null,
						placeholder: nls.localize('remote.tunnelsView.labelPlaceholder', "Port label"),
						startingValue
					});
				});
			}
			return undefined;
		};
	}
}

const invalidPortString: string = nls.localize('remote.tunnelsView.portNumberValid', "Forwarded port should be a number or a host:port.");
const maxPortNumber: number = 65536;
const invalidPortNumberString: string = nls.localize('remote.tunnelsView.portNumberToHigh', "Port number must be \u2265 0 and < {0}.", maxPortNumber);
const requiresSudoString: string = nls.localize('remote.tunnelView.inlineElevationMessage', "May Require Sudo");
const alreadyForwarded: string = nls.localize('remote.tunnelView.alreadyForwarded', "Port is already forwarded");

export namespace ForwardPortAction {
	export const INLINE_ID = 'remote.tunnel.forwardInline';
	export const COMMANDPALETTE_ID = 'remote.tunnel.forwardCommandPalette';
	export const LABEL: ILocalizedString = nls.localize2('remote.tunnel.forward', "Forward a Port");
	export const TREEITEM_LABEL = nls.localize('remote.tunnel.forwardItem', "Forward Port");
	const forwardPrompt = nls.localize('remote.tunnel.forwardPrompt', "Port number or address (eg. 3000 or 10.10.10.10:2000).");

	function validateInput(remoteExplorerService: IRemoteExplorerService, tunnelService: ITunnelService, value: string, canElevate: boolean): { content: string; severity: Severity } | null {
		const parsed = parseAddress(value);
		if (!parsed) {
			return { content: invalidPortString, severity: Severity.Error };
		} else if (parsed.port >= maxPortNumber) {
			return { content: invalidPortNumberString, severity: Severity.Error };
		} else if (canElevate && tunnelService.isPortPrivileged(parsed.port)) {
			return { content: requiresSudoString, severity: Severity.Info };
		} else if (mapHasAddressLocalhostOrAllInterfaces(remoteExplorerService.tunnelModel.forwarded, parsed.host, parsed.port)) {
			return { content: alreadyForwarded, severity: Severity.Error };
		}
		return null;
	}

	function error(notificationService: INotificationService, tunnelOrError: RemoteTunnel | string | void, host: string, port: number) {
		if (!tunnelOrError) {
			notificationService.warn(nls.localize('remote.tunnel.forwardError', "Unable to forward {0}:{1}. The host may not be available or that remote port may already be forwarded", host, port));
		} else if (typeof tunnelOrError === 'string') {
			notificationService.warn(nls.localize('remote.tunnel.forwardErrorProvided', "Unable to forward {0}:{1}. {2}", host, port, tunnelOrError));
		}
	}

	export function inlineHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const notificationService = accessor.get(INotificationService);
			const tunnelService = accessor.get(ITunnelService);
			remoteExplorerService.setEditable(undefined, TunnelEditId.New, {
				onFinish: async (value, success) => {
					remoteExplorerService.setEditable(undefined, TunnelEditId.New, null);
					let parsed: { host: string; port: number } | undefined;
					if (success && (parsed = parseAddress(value))) {
						remoteExplorerService.forward({
							remote: { host: parsed.host, port: parsed.port },
							elevateIfNeeded: true
						}).then(tunnelOrError => error(notificationService, tunnelOrError, parsed!.host, parsed!.port));
					}
				},
				validationMessage: (value) => validateInput(remoteExplorerService, tunnelService, value, tunnelService.canElevate),
				placeholder: forwardPrompt
			});
		};
	}

	export function commandPaletteHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const notificationService = accessor.get(INotificationService);
			const viewsService = accessor.get(IViewsService);
			const quickInputService = accessor.get(IQuickInputService);
			const tunnelService = accessor.get(ITunnelService);
			await viewsService.openView(TunnelPanel.ID, true);
			const value = await quickInputService.input({
				prompt: forwardPrompt,
				validateInput: (value) => Promise.resolve(validateInput(remoteExplorerService, tunnelService, value, tunnelService.canElevate))
			});
			let parsed: { host: string; port: number } | undefined;
			if (value && (parsed = parseAddress(value))) {
				remoteExplorerService.forward({
					remote: { host: parsed.host, port: parsed.port },
					elevateIfNeeded: true
				}).then(tunnel => error(notificationService, tunnel, parsed!.host, parsed!.port));
			}
		};
	}
}

interface QuickPickTunnel extends IQuickPickItem {
	tunnel?: ITunnelItem;
}

function makeTunnelPicks(tunnels: Tunnel[], remoteExplorerService: IRemoteExplorerService, tunnelService: ITunnelService): QuickPickInput<QuickPickTunnel>[] {
	const picks: QuickPickInput<QuickPickTunnel>[] = tunnels.map(forwarded => {
		const item = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, forwarded);
		return {
			label: item.label,
			description: item.processDescription,
			tunnel: item
		};
	});
	if (picks.length === 0) {
		picks.push({
			label: nls.localize('remote.tunnel.closeNoPorts', "No ports currently forwarded. Try running the {0} command", ForwardPortAction.LABEL.value)
		});
	}
	return picks;
}

namespace ClosePortAction {
	export const INLINE_ID = 'remote.tunnel.closeInline';
	export const COMMANDPALETTE_ID = 'remote.tunnel.closeCommandPalette';
	export const LABEL: ILocalizedString = nls.localize2('remote.tunnel.close', "Stop Forwarding Port");

	export function inlineHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const contextKeyService = accessor.get(IContextKeyService);
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			let ports: (ITunnelItem | Tunnel)[] = [];
			const multiSelectContext = contextKeyService.getContextKeyValue<string[] | undefined>(TunnelViewMultiSelectionKeyName);
			if (multiSelectContext) {
				multiSelectContext.forEach(context => {
					const tunnel = remoteExplorerService.tunnelModel.forwarded.get(context);
					if (tunnel) {
						ports?.push(tunnel);
					}
				});
			} else if (isITunnelItem(arg)) {
				ports = [arg];
			} else {
				const context = contextKeyService.getContextKeyValue<string | undefined>(TunnelViewSelectionKeyName);
				const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
				if (tunnel) {
					ports = [tunnel];
				}
			}

			if (!ports || ports.length === 0) {
				return;
			}
			return Promise.all(ports.map(port => remoteExplorerService.close({ host: port.remoteHost, port: port.remotePort }, TunnelCloseReason.User)));
		};
	}

	export function commandPaletteHandler(): ICommandHandler {
		return async (accessor) => {
			const quickInputService = accessor.get(IQuickInputService);
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const tunnelService = accessor.get(ITunnelService);
			const commandService = accessor.get(ICommandService);

			const picks: QuickPickInput<QuickPickTunnel>[] = makeTunnelPicks(Array.from(remoteExplorerService.tunnelModel.forwarded.values()).filter(tunnel => tunnel.closeable), remoteExplorerService, tunnelService);
			const result = await quickInputService.pick(picks, { placeHolder: nls.localize('remote.tunnel.closePlaceholder', "Choose a port to stop forwarding") });
			if (result && result.tunnel) {
				await remoteExplorerService.close({ host: result.tunnel.remoteHost, port: result.tunnel.remotePort }, TunnelCloseReason.User);
			} else if (result) {
				await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
			}
		};
	}
}

export namespace OpenPortInBrowserAction {
	export const ID = 'remote.tunnel.open';
	export const LABEL = nls.localize('remote.tunnel.open', "Open in Browser");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			let key: string | undefined;
			if (isITunnelItem(arg)) {
				key = makeAddress(arg.remoteHost, arg.remotePort);
			} else if (arg.tunnelRemoteHost && arg.tunnelRemotePort) {
				key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
			}
			if (key) {
				const model = accessor.get(IRemoteExplorerService).tunnelModel;
				const openerService = accessor.get(IOpenerService);
				return run(model, openerService, key);
			}
		};
	}

	export function run(model: TunnelModel, openerService: IOpenerService, key: string) {
		const tunnel = model.forwarded.get(key) || model.detected.get(key);
		if (tunnel) {
			return openerService.open(tunnel.localUri, { allowContributedOpeners: false });
		}
		return Promise.resolve();
	}
}

export namespace OpenPortInPreviewAction {
	export const ID = 'remote.tunnel.openPreview';
	export const LABEL = nls.localize('remote.tunnel.openPreview', "Preview in Editor");

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			let key: string | undefined;
			if (isITunnelItem(arg)) {
				key = makeAddress(arg.remoteHost, arg.remotePort);
			} else if (arg.tunnelRemoteHost && arg.tunnelRemotePort) {
				key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
			}
			if (key) {
				const model = accessor.get(IRemoteExplorerService).tunnelModel;
				const openerService = accessor.get(IOpenerService);
				const externalOpenerService = accessor.get(IExternalUriOpenerService);
				return run(model, openerService, externalOpenerService, key);
			}
		};
	}

	export async function run(model: TunnelModel, openerService: IOpenerService, externalOpenerService: IExternalUriOpenerService, key: string) {
		const tunnel = model.forwarded.get(key) || model.detected.get(key);
		if (tunnel) {
			const remoteHost = tunnel.remoteHost.includes(':') ? `[${tunnel.remoteHost}]` : tunnel.remoteHost;
			const sourceUri = URI.parse(`http://${remoteHost}:${tunnel.remotePort}`);
			const opener = await externalOpenerService.getOpener(tunnel.localUri, { sourceUri }, CancellationToken.None);
			if (opener) {
				return opener.openExternalUri(tunnel.localUri, { sourceUri }, CancellationToken.None);
			}
			return openerService.open(tunnel.localUri);
		}
		return Promise.resolve();
	}
}

namespace OpenPortInBrowserCommandPaletteAction {
	export const ID = 'remote.tunnel.openCommandPalette';
	export const LABEL = nls.localize('remote.tunnel.openCommandPalette', "Open Port in Browser");

	interface QuickPickTunnel extends IQuickPickItem {
		tunnel?: TunnelItem;
	}

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const tunnelService = accessor.get(ITunnelService);
			const model = remoteExplorerService.tunnelModel;
			const quickPickService = accessor.get(IQuickInputService);
			const openerService = accessor.get(IOpenerService);
			const commandService = accessor.get(ICommandService);
			const options: QuickPickTunnel[] = [...model.forwarded, ...model.detected].map(value => {
				const tunnelItem = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, value[1]);
				return {
					label: tunnelItem.label,
					description: tunnelItem.processDescription,
					tunnel: tunnelItem
				};
			});
			if (options.length === 0) {
				options.push({
					label: nls.localize('remote.tunnel.openCommandPaletteNone', "No ports currently forwarded. Open the Ports view to get started.")
				});
			} else {
				options.push({
					label: nls.localize('remote.tunnel.openCommandPaletteView', "Open the Ports view...")
				});
			}
			const picked = await quickPickService.pick<QuickPickTunnel>(options, { placeHolder: nls.localize('remote.tunnel.openCommandPalettePick', "Choose the port to open") });
			if (picked && picked.tunnel) {
				return OpenPortInBrowserAction.run(model, openerService, makeAddress(picked.tunnel.remoteHost, picked.tunnel.remotePort));
			} else if (picked) {
				return commandService.executeCommand(`${TUNNEL_VIEW_ID}.focus`);
			}
		};
	}
}

namespace CopyAddressAction {
	export const INLINE_ID = 'remote.tunnel.copyAddressInline';
	export const COMMANDPALETTE_ID = 'remote.tunnel.copyAddressCommandPalette';
	export const INLINE_LABEL = nls.localize('remote.tunnel.copyAddressInline', "Copy Local Address");
	export const COMMANDPALETTE_LABEL = nls.localize('remote.tunnel.copyAddressCommandPalette', "Copy Forwarded Port Address");

	async function copyAddress(remoteExplorerService: IRemoteExplorerService, clipboardService: IClipboardService, tunnelItem: { remoteHost: string; remotePort: number }) {
		const address = remoteExplorerService.tunnelModel.address(tunnelItem.remoteHost, tunnelItem.remotePort);
		if (address) {
			await clipboardService.writeText(address.toString());
		}
	}

	export function inlineHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			let tunnelItem: ITunnelItem | Tunnel | undefined;
			if (isITunnelItem(arg)) {
				tunnelItem = arg;
			} else {
				const context = accessor.get(IContextKeyService).getContextKeyValue<string | undefined>(TunnelViewSelectionKeyName);
				tunnelItem = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
			}
			if (tunnelItem) {
				return copyAddress(remoteExplorerService, accessor.get(IClipboardService), tunnelItem);
			}
		};
	}

	export function commandPaletteHandler(): ICommandHandler {
		return async (accessor, arg) => {
			const quickInputService = accessor.get(IQuickInputService);
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const tunnelService = accessor.get(ITunnelService);
			const commandService = accessor.get(ICommandService);
			const clipboardService = accessor.get(IClipboardService);

			const tunnels = Array.from(remoteExplorerService.tunnelModel.forwarded.values()).concat(Array.from(remoteExplorerService.tunnelModel.detected.values()));
			const result = await quickInputService.pick(makeTunnelPicks(tunnels, remoteExplorerService, tunnelService), { placeHolder: nls.localize('remote.tunnel.copyAddressPlaceholdter', "Choose a forwarded port") });
			if (result && result.tunnel) {
				await copyAddress(remoteExplorerService, clipboardService, result.tunnel);
			} else if (result) {
				await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
			}
		};
	}
}

namespace ChangeLocalPortAction {
	export const ID = 'remote.tunnel.changeLocalPort';
	export const LABEL = nls.localize('remote.tunnel.changeLocalPort', "Change Local Address Port");

	function validateInput(tunnelService: ITunnelService, value: string, canElevate: boolean): { content: string; severity: Severity } | null {
		if (!value.match(/^[0-9]+$/)) {
			return { content: nls.localize('remote.tunnelsView.portShouldBeNumber', "Local port should be a number."), severity: Severity.Error };
		} else if (Number(value) >= maxPortNumber) {
			return { content: invalidPortNumberString, severity: Severity.Error };
		} else if (canElevate && tunnelService.isPortPrivileged(Number(value))) {
			return { content: requiresSudoString, severity: Severity.Info };
		}
		return null;
	}

	export function handler(): ICommandHandler {
		return async (accessor, arg) => {
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const notificationService = accessor.get(INotificationService);
			const tunnelService = accessor.get(ITunnelService);
			let tunnelContext: ITunnelItem | undefined;
			if (isITunnelItem(arg)) {
				tunnelContext = arg;
			} else {
				const context = accessor.get(IContextKeyService).getContextKeyValue<string | undefined>(TunnelViewSelectionKeyName);
				const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
				if (tunnel) {
					const tunnelService = accessor.get(ITunnelService);
					tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, tunnel);
				}
			}

			if (tunnelContext) {
				const tunnelItem: ITunnelItem = tunnelContext;
				remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, {
					onFinish: async (value, success) => {
						remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, null);
						if (success) {
							await remoteExplorerService.close({ host: tunnelItem.remoteHost, port: tunnelItem.remotePort }, TunnelCloseReason.Other);
							const numberValue = Number(value);
							const newForward = await remoteExplorerService.forward({
								remote: { host: tunnelItem.remoteHost, port: tunnelItem.remotePort },
								local: numberValue,
								name: tunnelItem.name,
								elevateIfNeeded: true,
								source: tunnelItem.source
							});
							if (newForward && (typeof newForward !== 'string') && newForward.tunnelLocalPort !== numberValue) {
								notificationService.warn(nls.localize('remote.tunnel.changeLocalPortNumber', "The local port {0} is not available. Port number {1} has been used instead", value, newForward.tunnelLocalPort ?? newForward.localAddress));
							}
						}
					},
					validationMessage: (value) => validateInput(tunnelService, value, tunnelService.canElevate),
					placeholder: nls.localize('remote.tunnelsView.changePort', "New local port")
				});
			}
		};
	}
}

namespace ChangeTunnelPrivacyAction {
	export function handler(privacyId: string): ICommandHandler {
		return async (accessor, arg) => {
			if (isITunnelItem(arg)) {
				const remoteExplorerService = accessor.get(IRemoteExplorerService);
				await remoteExplorerService.close({ host: arg.remoteHost, port: arg.remotePort }, TunnelCloseReason.Other);
				return remoteExplorerService.forward({
					remote: { host: arg.remoteHost, port: arg.remotePort },
					local: arg.localPort,
					name: arg.name,
					elevateIfNeeded: true,
					privacy: privacyId,
					source: arg.source
				});
			}

			return undefined;
		};
	}
}

namespace SetTunnelProtocolAction {
	export const ID_HTTP = 'remote.tunnel.setProtocolHttp';
	export const ID_HTTPS = 'remote.tunnel.setProtocolHttps';
	export const LABEL_HTTP = nls.localize('remote.tunnel.protocolHttp', "HTTP");
	export const LABEL_HTTPS = nls.localize('remote.tunnel.protocolHttps', "HTTPS");

	async function handler(arg: any, protocol: TunnelProtocol, remoteExplorerService: IRemoteExplorerService, environmentService: IWorkbenchEnvironmentService) {
		if (isITunnelItem(arg)) {
			const attributes: Partial<Attributes> = {
				protocol
			};
			const target = environmentService.remoteAuthority ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER_LOCAL;
			return remoteExplorerService.tunnelModel.configPortsAttributes.addAttributes(arg.remotePort, attributes, target);
		}
	}

	export function handlerHttp(): ICommandHandler {
		return async (accessor, arg) => {
			return handler(arg, TunnelProtocol.Http, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
		};
	}

	export function handlerHttps(): ICommandHandler {
		return async (accessor, arg) => {
			return handler(arg, TunnelProtocol.Https, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
		};
	}
}

const tunnelViewCommandsWeightBonus = 10; // give our commands a little bit more weight over other default list/tree commands

const isForwardedExpr = TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded);
const isForwardedOrDetectedExpr = ContextKeyExpr.or(isForwardedExpr, TunnelTypeContextKey.isEqualTo(TunnelType.Detected));
const isNotMultiSelectionExpr = TunnelViewMultiSelectionContextKey.isEqualTo(undefined);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: LabelTunnelAction.ID,
	weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
	when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedExpr, isNotMultiSelectionExpr),
	primary: KeyCode.F2,
	mac: {
		primary: KeyCode.Enter
	},
	handler: LabelTunnelAction.handler()
});
CommandsRegistry.registerCommand(ForwardPortAction.INLINE_ID, ForwardPortAction.inlineHandler());
CommandsRegistry.registerCommand(ForwardPortAction.COMMANDPALETTE_ID, ForwardPortAction.commandPaletteHandler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ClosePortAction.INLINE_ID,
	weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
	when: ContextKeyExpr.and(TunnelCloseableContextKey, TunnelViewFocusContextKey),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
		secondary: [KeyCode.Delete]
	},
	handler: ClosePortAction.inlineHandler()
});

CommandsRegistry.registerCommand(ClosePortAction.COMMANDPALETTE_ID, ClosePortAction.commandPaletteHandler());
CommandsRegistry.registerCommand(OpenPortInBrowserAction.ID, OpenPortInBrowserAction.handler());
CommandsRegistry.registerCommand(OpenPortInPreviewAction.ID, OpenPortInPreviewAction.handler());
CommandsRegistry.registerCommand(OpenPortInBrowserCommandPaletteAction.ID, OpenPortInBrowserCommandPaletteAction.handler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CopyAddressAction.INLINE_ID,
	weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
	when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedOrDetectedExpr, isNotMultiSelectionExpr),
	primary: KeyMod.CtrlCmd | KeyCode.KeyC,
	handler: CopyAddressAction.inlineHandler()
});
CommandsRegistry.registerCommand(CopyAddressAction.COMMANDPALETTE_ID, CopyAddressAction.commandPaletteHandler());
CommandsRegistry.registerCommand(ChangeLocalPortAction.ID, ChangeLocalPortAction.handler());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTP, SetTunnelProtocolAction.handlerHttp());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTPS, SetTunnelProtocolAction.handlerHttps());

MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
	command: {
		id: ClosePortAction.COMMANDPALETTE_ID,
		title: ClosePortAction.LABEL
	},
	when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
	command: {
		id: ForwardPortAction.COMMANDPALETTE_ID,
		title: ForwardPortAction.LABEL
	},
	when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
	command: {
		id: CopyAddressAction.COMMANDPALETTE_ID,
		title: CopyAddressAction.COMMANDPALETTE_LABEL
	},
	when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
	command: {
		id: OpenPortInBrowserCommandPaletteAction.ID,
		title: OpenPortInBrowserCommandPaletteAction.LABEL
	},
	when: forwardedPortsViewEnabled
}));

MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '._open',
	order: 0,
	command: {
		id: OpenPortInBrowserAction.ID,
		title: OpenPortInBrowserAction.LABEL,
	},
	when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '._open',
	order: 1,
	command: {
		id: OpenPortInPreviewAction.ID,
		title: OpenPortInPreviewAction.LABEL,
	},
	when: ContextKeyExpr.and(
		isForwardedOrDetectedExpr,
		isNotMultiSelectionExpr)
}));
// The group 0_manage is used by extensions, so try not to change it
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '0_manage',
	order: 1,
	command: {
		id: LabelTunnelAction.ID,
		title: LabelTunnelAction.LABEL,
		icon: labelPortIcon
	},
	when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '2_localaddress',
	order: 0,
	command: {
		id: CopyAddressAction.INLINE_ID,
		title: CopyAddressAction.INLINE_LABEL,
	},
	when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '2_localaddress',
	order: 1,
	command: {
		id: ChangeLocalPortAction.ID,
		title: ChangeLocalPortAction.LABEL,
	},
	when: ContextKeyExpr.and(isForwardedExpr, PortChangableContextKey, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '2_localaddress',
	order: 2,
	submenu: MenuId.TunnelPrivacy,
	title: nls.localize('tunnelContext.privacyMenu', "Port Visibility"),
	when: ContextKeyExpr.and(isForwardedExpr, TunnelPrivacyEnabledContextKey)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '2_localaddress',
	order: 3,
	submenu: MenuId.TunnelProtocol,
	title: nls.localize('tunnelContext.protocolMenu', "Change Port Protocol"),
	when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr, ProtocolChangeableContextKey)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '3_forward',
	order: 0,
	command: {
		id: ClosePortAction.INLINE_ID,
		title: ClosePortAction.LABEL,
	},
	when: TunnelCloseableContextKey
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
	group: '3_forward',
	order: 1,
	command: {
		id: ForwardPortAction.INLINE_ID,
		title: ForwardPortAction.LABEL,
	},
}));

MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, ({
	order: 0,
	command: {
		id: SetTunnelProtocolAction.ID_HTTP,
		title: SetTunnelProtocolAction.LABEL_HTTP,
		toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Http)
	}
}));
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, ({
	order: 1,
	command: {
		id: SetTunnelProtocolAction.ID_HTTPS,
		title: SetTunnelProtocolAction.LABEL_HTTPS,
		toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Https)
	}
}));


MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, ({
	group: '0_manage',
	order: 0,
	command: {
		id: ForwardPortAction.INLINE_ID,
		title: ForwardPortAction.TREEITEM_LABEL,
		icon: forwardPortIcon
	},
	when: TunnelTypeContextKey.isEqualTo(TunnelType.Candidate)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, ({
	group: '0_manage',
	order: 4,
	command: {
		id: LabelTunnelAction.ID,
		title: LabelTunnelAction.LABEL,
		icon: labelPortIcon
	},
	when: isForwardedExpr
}));
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, ({
	group: '0_manage',
	order: 5,
	command: {
		id: ClosePortAction.INLINE_ID,
		title: ClosePortAction.LABEL,
		icon: stopForwardIcon
	},
	when: TunnelCloseableContextKey
}));

MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, ({
	order: -1,
	command: {
		id: CopyAddressAction.INLINE_ID,
		title: CopyAddressAction.INLINE_LABEL,
		icon: copyAddressIcon
	},
	when: isForwardedOrDetectedExpr
}));
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, ({
	order: 0,
	command: {
		id: OpenPortInBrowserAction.ID,
		title: OpenPortInBrowserAction.LABEL,
		icon: openBrowserIcon
	},
	when: isForwardedOrDetectedExpr
}));
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, ({
	order: 1,
	command: {
		id: OpenPortInPreviewAction.ID,
		title: OpenPortInPreviewAction.LABEL,
		icon: openPreviewIcon
	},
	when: isForwardedOrDetectedExpr
}));

registerColor('ports.iconRunningProcessForeground', STATUS_BAR_REMOTE_ITEM_BACKGROUND, nls.localize('portWithRunningProcess.foreground', "The color of the icon for a port that has an associated running process."));

