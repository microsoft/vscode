/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListContextMenuEvent, IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { Action } from '../../../../../base/common/actions.js';
import { Delayer } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { IMatch, matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CustomizationType, McpServerStatus, type PluginCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IExtensionManifestPropertiesService } from '../../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { GalleryItemInstallState, GalleryItemRenderer, IGalleryItemProvider } from './galleryItemRenderer.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { countEnabledCustomizationTools, getToolSetTriState, IAgentHostToolSetEnablementService, isToolEnabledInSet, IToolEnablementState } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { authenticateMcpServer, createAgentHostMcpServerDetailInput, createInstalledPluginItem, getActiveSessionServerPresentation, getAgentHostMcpServerSource, getMcpErrorMessage, getMcpStatusPresentation, isPrimaryMcpServerEnabled, renderMcpServerStatusActions, setPrimaryMcpServerEnablement } from './mcpListWidget.js';
import { IMcpServerDetailInput } from './embeddedMcpServerDetail.js';
import { type AgentHostMcpServer } from './mcpServerCount.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeContentHeight, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';
import './media/aiCustomizationManagement.css';

const $ = DOM.$;

export function isToolsTreeKeyboardTarget(target: HTMLElement, row: HTMLElement): boolean {
	return target === row;
}

interface IToolViewModel {
	readonly tool: IToolData;
	readonly nameMatches?: IMatch[];
}

interface IToolSetViewModel {
	readonly toolSet: IToolSet;
	readonly allToolIds: string[];
	readonly visibleTools: IToolViewModel[];
	readonly nameMatches?: IMatch[];
	/** When searching, sets are force-expanded to reveal matching tools regardless of user state. */
	readonly forceExpanded: boolean;
	readonly readOnly: boolean;
	/** Precomputed subtitle (own `detail`, or an extension description) shown under the set's name. */
	readonly detail?: string;
}

//#region Virtualized tool rows

/** A flattened tool-set header in a section's virtualized list. */
interface IToolsSetRowEntry {
	readonly type: 'set';
	readonly vm: IToolSetViewModel;
}

interface IToolsToolRowEntry {
	readonly type: 'tool';
	readonly setVm: IToolSetViewModel;
	readonly toolVm: IToolViewModel;
}

interface IToolsConnectedRowEntry {
	readonly type: 'connected';
	readonly id: string;
	readonly depth: number;
	readonly label: string;
	readonly description?: string;
	readonly source?: ReturnType<typeof getAgentHostMcpServerSource>;
	readonly server?: AgentHostMcpServer;
	readonly expandable: boolean;
	readonly message?: boolean;
	readonly nameMatches?: IMatch[];
}

type IToolsRowEntry = IToolsSetRowEntry | IToolsToolRowEntry | IToolsConnectedRowEntry;

type AgentHostMcpTool = Awaited<ReturnType<NonNullable<AgentHostMcpServer['listTools']>>>[number];

type ConnectedToolsState = { state: 'loading' } | { state: 'loaded'; tools: readonly AgentHostMcpTool[] } | { state: 'error' };

interface IToolsGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly groupKey: string;
}

interface IToolsEmptyRowEntry {
	readonly type: 'empty';
	readonly id: string;
	readonly label: string;
}

type IToolsTreeEntry = IToolsGroupEntry | IToolsRowEntry | IToolsEmptyRowEntry;

const TOOLS_SET_ROW_TEMPLATE_ID = 'toolsSetRow';
const TOOLS_TOOL_ROW_TEMPLATE_ID = 'toolsToolRow';
const TOOLS_CONNECTED_ROW_TEMPLATE_ID = 'toolsConnectedRow';
// Row heights derived from the fixed single-line label/subtext CSS plus each row kind's vertical padding.
const TOOLS_SET_ROW_PADDING = 16; // --vscode-spacing-size80 (8px) top + bottom
const TOOLS_TOOL_ROW_PADDING = 12; // --vscode-spacing-size60 (6px) top + bottom
const TOOLS_ROW_LABEL_HEIGHT = 18;
const TOOLS_ROW_SUBTEXT_HEIGHT = 14;
function computeToolsRowHeight(entry: IToolsRowEntry): number {
	if (entry.type === 'set') {
		return TOOLS_SET_ROW_PADDING + TOOLS_ROW_LABEL_HEIGHT + (entry.vm.detail ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
	}
	if (entry.type === 'connected') {
		return (entry.server || entry.expandable ? TOOLS_SET_ROW_PADDING : TOOLS_TOOL_ROW_PADDING) + TOOLS_ROW_LABEL_HEIGHT + (entry.description ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
	}
	const description = entry.toolVm.tool.userDescription ?? entry.toolVm.tool.modelDescription;
	return TOOLS_TOOL_ROW_PADDING + TOOLS_ROW_LABEL_HEIGHT + (description ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
}

class ToolsTreeDelegate implements IListVirtualDelegate<IToolsTreeEntry> {
	getHeight(entry: IToolsTreeEntry): number {
		if (entry.type === 'group-header') {
			return CUSTOMIZATION_GROUP_HEADER_HEIGHT;
		}
		if (entry.type === 'empty') {
			return 54;
		}
		return computeToolsRowHeight(entry);
	}

	getTemplateId(entry: IToolsTreeEntry): string {
		if (entry.type === 'group-header') {
			return 'toolsGroupHeader';
		}
		if (entry.type === 'empty') {
			return 'toolsEmptyRow';
		}
		if (entry.type === 'connected') {
			return TOOLS_CONNECTED_ROW_TEMPLATE_ID;
		}
		return entry.type === 'set' ? TOOLS_SET_ROW_TEMPLATE_ID : TOOLS_TOOL_ROW_TEMPLATE_ID;
	}
}

class ToolsEmptyRowRenderer implements IListRenderer<IToolsEmptyRowEntry, HTMLElement> {
	readonly templateId = 'toolsEmptyRow';

	renderTemplate(container: HTMLElement): HTMLElement {
		return DOM.append(container, $('.plugin-inventory-empty.tools-tree-empty-row'));
	}

	renderElement(entry: IToolsEmptyRowEntry, _index: number, templateData: HTMLElement): void {
		templateData.textContent = entry.label;
	}

	disposeTemplate(): void { }
}

interface IToolsSetRowTemplateData {
	readonly container: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly label: HighlightedLabel;
	readonly subtext: HTMLElement;
	readonly count: HTMLElement;
	readonly alwaysAvailable: HTMLElement;
	readonly moreButton: HTMLButtonElement;
	readonly chevron: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentSetId: string | undefined;
}

/** Renders a tool-set header row: toggle, name + detail, enabled count, more actions, chevron. */
class ToolsSetRowRenderer implements IListRenderer<IToolsSetRowEntry, IToolsSetRowTemplateData> {
	readonly templateId = TOOLS_SET_ROW_TEMPLATE_ID;
	private readonly _templates = new Set<IToolsSetRowTemplateData>();
	private _focusedSetId: string | undefined;

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _sessionType: string,
		private readonly _enablementService: IAgentHostToolSetEnablementService,
		private readonly _isExpanded: (vm: IToolSetViewModel, reader: IReader) => boolean,
		private readonly _toggleExpand: (setId: string) => void,
		private readonly _resolveExtension: (ts: IToolSet) => IExtension | undefined,
		private readonly _showExtensionMenu: (anchor: HTMLElement, extension: IExtension) => void,
	) { }

	renderTemplate(container: HTMLElement): IToolsSetRowTemplateData {
		container.classList.add('tools-list-setrow');
		const templateDisposables = new DisposableStore();

		const toggle = templateDisposables.add(this._instantiationService.createInstance(CustomizationToggle, { ariaLabel: '', checked: false }));
		toggle.setTabIndex(-1);
		container.appendChild(toggle.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));

		const main = DOM.append(container, $('.tools-list-row-main'));
		const text = DOM.append(main, $('.tools-list-row-text'));
		const labelEl = DOM.append(text, $('span.tools-list-row-label'));
		const label = templateDisposables.add(new HighlightedLabel(labelEl));
		const subtext = DOM.append(text, $('span.tools-list-row-subtext'));

		const alwaysAvailable = DOM.append(container, $('span.tools-list-always-available'));
		alwaysAvailable.textContent = localize('toolsAlwaysAvailable', "Always Available");
		const count = DOM.append(container, $('span.tools-list-row-count'));

		const moreButton = DOM.append(container, $('button.tools-list-more-action')) as HTMLButtonElement;
		moreButton.type = 'button';
		moreButton.tabIndex = -1;
		moreButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.ellipsis));
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(moreButton, event => DOM.EventHelper.stop(event, true)));

		const chevron = DOM.append(container, $('a.tools-list-chevron.codicon')) as HTMLAnchorElement;
		chevron.setAttribute('aria-hidden', 'true');

		const template = { container, toggle, label, subtext, count, alwaysAvailable, moreButton, chevron, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()), currentSetId: undefined };
		this._templates.add(template);
		return template;
	}

	renderElement(entry: IToolsSetRowEntry, _index: number, data: IToolsSetRowTemplateData): void {
		data.elementDisposables.clear();
		data.currentSetId = entry.vm.toolSet.id;
		data.container.removeAttribute('aria-selected');
		const vm = entry.vm;
		const ts = vm.toolSet;
		const setName = ts.description ?? ts.referenceName;

		data.label.set(setName, vm.nameMatches);
		data.subtext.style.display = vm.detail ? '' : 'none';
		data.subtext.textContent = vm.detail ?? '';
		data.alwaysAvailable.style.display = 'none';
		data.toggle.domNode.style.display = '';
		data.toggle.domNode.style.visibility = vm.readOnly ? 'hidden' : '';

		if (!vm.readOnly) {
			data.toggle.setAriaLabel(localize('toolsSetToggle', "Enable {0}", setName));
			data.elementDisposables.add(data.toggle.onChange(() => {
				this._enablementService.setToolSetEnabled(this._sessionType, ts.id, vm.allToolIds, data.toggle.checked === true);
			}));
		}

		// Tri-state, enabled count and aria-checked all follow the same enablement observable.
		data.elementDisposables.add(autorun(reader => {
			const state = this._enablementService.observe(this._sessionType).read(reader);
			const triState = getToolSetTriState(state, ts.id, vm.allToolIds);
			if (!vm.readOnly) {
				data.toggle.checked = triState;
				data.container.setAttribute('aria-checked', triState === 'mixed' ? 'mixed' : String(triState));
			} else {
				data.container.removeAttribute('aria-checked');
			}
			const enabledCount = vm.allToolIds.reduce((n, id) => n + (isToolEnabledInSet(state, ts.id, id) ? 1 : 0), 0);
			data.count.textContent = `${enabledCount}/${vm.allToolIds.length}`;
			data.count.setAttribute('aria-label', localize('toolsRowEnabledOfTotal', "{0} of {1} tools enabled", enabledCount, vm.allToolIds.length));
		}));

		data.elementDisposables.add(autorun(reader => {
			const expanded = this._isExpanded(vm, reader);
			data.chevron.classList.toggle('codicon-chevron-down-compact', expanded);
			data.chevron.classList.toggle('codicon-chevron-right-compact', !expanded);
			data.container.setAttribute('aria-expanded', String(expanded));
		}));

		const extension = this._resolveExtension(ts);
		data.moreButton.style.display = extension ? '' : 'none';
		data.moreButton.tabIndex = extension && entry.vm.toolSet.id === this._focusedSetId ? 0 : -1;
		if (extension) {
			const moreLabel = localize('toolsSetMoreActions', "More actions for {0}", setName);
			data.moreButton.setAttribute('aria-label', moreLabel);
			data.moreButton.title = moreLabel;
			data.elementDisposables.add(DOM.addDisposableListener(data.moreButton, 'click', e => {
				DOM.EventHelper.stop(e, true);
				this._showExtensionMenu(data.moreButton, extension);
			}));
		}

		// Clicking the row body (not the toggle/more-actions button) toggles expand/collapse.
		data.elementDisposables.add(DOM.addDisposableListener(data.container, 'click', e => {
			if (data.toggle.domNode.contains(e.target as Node) || data.moreButton.contains(e.target as Node)) {
				return;
			}
			this._toggleExpand(ts.id);
		}));
	}

	setFocusedSetId(setId: string | undefined): void {
		this._focusedSetId = setId;
		for (const template of this._templates) {
			template.moreButton.tabIndex = template.moreButton.style.display !== 'none' && template.currentSetId === setId ? 0 : -1;
		}
	}

	disposeTemplate(data: IToolsSetRowTemplateData): void {
		this._templates.delete(data);
		data.templateDisposables.dispose();
	}
}

interface IToolsToolRowTemplateData {
	readonly container: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly label: HighlightedLabel;
	readonly subtext: HTMLElement;
	readonly alwaysAvailable: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/** Renders a member-tool row nested (visually, via padding) under its tool-set header. */
class ToolsToolRowRenderer implements IListRenderer<IToolsToolRowEntry, IToolsToolRowTemplateData> {
	readonly templateId = TOOLS_TOOL_ROW_TEMPLATE_ID;

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _sessionType: string,
		private readonly _enablementService: IAgentHostToolSetEnablementService,
	) { }

	renderTemplate(container: HTMLElement): IToolsToolRowTemplateData {
		container.classList.add('tools-list-toolrow');
		const templateDisposables = new DisposableStore();

		const toggle = templateDisposables.add(this._instantiationService.createInstance(CustomizationToggle, { ariaLabel: '', checked: false }));
		toggle.setTabIndex(-1);
		container.appendChild(toggle.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));

		const text = DOM.append(container, $('.tools-list-row-text'));
		const labelEl = DOM.append(text, $('span.tools-list-row-label'));
		const label = templateDisposables.add(new HighlightedLabel(labelEl));
		const subtext = DOM.append(text, $('span.tools-list-row-subtext'));

		const alwaysAvailable = DOM.append(container, $('span.tools-list-always-available'));
		alwaysAvailable.textContent = localize('toolsAlwaysAvailable', "Always Available");

		return { container, toggle, label, subtext, alwaysAvailable, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()) };
	}

	renderElement(entry: IToolsToolRowEntry, _index: number, data: IToolsToolRowTemplateData): void {
		data.elementDisposables.clear();
		data.container.removeAttribute('aria-selected');
		const { setVm, toolVm } = entry;
		const tool = toolVm.tool;
		const toolName = tool.displayName ?? tool.id;

		data.container.classList.toggle('readonly', setVm.readOnly);
		data.label.set(toolName, toolVm.nameMatches);
		const description = tool.userDescription ?? tool.modelDescription;
		data.subtext.style.display = description ? '' : 'none';
		data.subtext.textContent = description ?? '';
		data.alwaysAvailable.style.display = setVm.readOnly ? '' : 'none';
		data.toggle.domNode.style.display = setVm.readOnly ? 'none' : '';

		if (!setVm.readOnly) {
			data.toggle.setAriaLabel(localize('toolsToolToggle', "Enable {0}", toolName));
			data.elementDisposables.add(data.toggle.onChange(() => {
				this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, tool.id, data.toggle.checked === true);
			}));
			data.elementDisposables.add(autorun(reader => {
				const enabled = isToolEnabledInSet(this._enablementService.observe(this._sessionType).read(reader), setVm.toolSet.id, tool.id);
				data.toggle.checked = enabled;
				data.container.setAttribute('aria-checked', String(enabled));
			}));
			data.elementDisposables.add(DOM.addDisposableListener(data.container, 'click', e => {
				if (data.toggle.domNode.contains(e.target as Node)) {
					return;
				}
				this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, tool.id, !data.toggle.checked);
			}));
		} else {
			data.container.removeAttribute('aria-checked');
		}
	}

	disposeTemplate(data: IToolsToolRowTemplateData): void {
		data.templateDisposables.dispose();
	}
}

interface IToolsConnectedRowTemplateData {
	readonly container: HTMLElement;
	readonly actions: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly label: HighlightedLabel;
	readonly subtext: HTMLElement;
	readonly chevron: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class ToolsConnectedRowRenderer implements IListRenderer<IToolsConnectedRowEntry, IToolsConnectedRowTemplateData> {
	readonly templateId = TOOLS_CONNECTED_ROW_TEMPLATE_ID;

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _hoverService: IHoverService,
		private readonly _isEnabled: (server: AgentHostMcpServer) => boolean,
		private readonly _setEnabled: (server: AgentHostMcpServer, enabled: boolean) => void,
		private readonly _isExpanded: (entry: IToolsConnectedRowEntry, reader: IReader) => boolean,
		private readonly _toggleExpand: (id: string) => void,
		private readonly _renderActions: (server: AgentHostMcpServer, container: HTMLElement, disposables: DisposableStore) => void,
	) { }

	renderTemplate(container: HTMLElement): IToolsConnectedRowTemplateData {
		container.classList.add('tools-list-connected-row');
		const templateDisposables = new DisposableStore();
		const toggle = templateDisposables.add(this._instantiationService.createInstance(CustomizationToggle, { ariaLabel: '', checked: false }));
		toggle.setTabIndex(-1);
		container.appendChild(toggle.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));

		const text = DOM.append(container, $('.tools-list-row-text'));
		const label = templateDisposables.add(new HighlightedLabel(DOM.append(text, $('span.tools-list-row-label'))));
		const subtext = DOM.append(text, $('span.tools-list-row-subtext'));
		// Sits after the flexible text column so actions stay right-aligned next to the toggle, as on the MCP Servers page.
		const actions = DOM.append(container, $('.tools-list-connected-actions'));
		const chevron = DOM.append(container, $('a.tools-list-chevron.codicon'));
		chevron.setAttribute('aria-hidden', 'true');
		return { container, actions, toggle, label, subtext, chevron, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()) };
	}

	renderElement(entry: IToolsConnectedRowEntry, _index: number, data: IToolsConnectedRowTemplateData): void {
		data.elementDisposables.clear();
		DOM.clearNode(data.actions);
		data.container.removeAttribute('aria-selected');
		data.container.classList.toggle('tools-list-setrow', !!entry.server || entry.expandable);
		data.container.classList.toggle('tools-list-toolrow', !entry.server && !entry.expandable);
		data.container.classList.toggle('readonly', !entry.expandable);
		data.container.classList.toggle('message', entry.message === true);
		data.container.style.setProperty('--tools-connected-depth', String(entry.depth));
		data.label.set(entry.label, entry.nameMatches);
		data.subtext.textContent = entry.description ?? '';
		data.subtext.style.display = entry.description ? '' : 'none';
		if (entry.source) {
			const source = entry.source;
			if (source.open) {
				const link = $('a.source-link', { href: '#', tabIndex: -1, 'aria-label': source.ariaLabel ?? source.label }, source.label);
				// Split the localized sentence around its placeholder so the source can be a link.
				const [before, after = ''] = localize('toolsConnectedServerSource', "MCP server from {0}", '\u0000').split('\u0000');
				DOM.reset(data.subtext, before, link, after);
				data.elementDisposables.add(DOM.addDisposableGenericMouseDownListener(link, event => DOM.EventHelper.stop(event, true)));
				data.elementDisposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, event => {
					DOM.EventHelper.stop(event, true);
					source.open?.();
				}));
				data.elementDisposables.add(this._hoverService.setupDelayedHover(link, { content: source.hover }));
			} else {
				data.elementDisposables.add(this._hoverService.setupDelayedHover(data.subtext, { content: source.hover }));
			}
		}
		data.toggle.domNode.style.display = entry.server ? '' : 'none';
		// Server rows keep the chevron's space so they align whether or not they can expand.
		data.chevron.style.display = entry.expandable || entry.server ? '' : 'none';
		data.chevron.style.visibility = entry.expandable ? '' : 'hidden';

		if (entry.server) {
			const server = entry.server;
			const enabled = this._isEnabled(server);
			data.toggle.checked = enabled;
			data.toggle.setAriaLabel(localize('toolsConnectedServerToggle', "Enable {0}", entry.label));
			data.container.setAttribute('aria-checked', String(enabled));
			data.elementDisposables.add(data.toggle.onChange(enabled => this._setEnabled(server, enabled)));
			if (server.enabled && enabled) {
				this._renderActions(server, data.actions, data.elementDisposables);
			}
		} else {
			data.container.removeAttribute('aria-checked');
		}
		data.actions.style.display = data.actions.childElementCount > 0 ? '' : 'none';
		if (entry.expandable) {
			data.elementDisposables.add(autorun(reader => {
				const expanded = this._isExpanded(entry, reader);
				data.chevron.classList.toggle('codicon-chevron-down-compact', expanded);
				data.chevron.classList.toggle('codicon-chevron-right-compact', !expanded);
				data.container.setAttribute('aria-expanded', String(expanded));
			}));
			data.elementDisposables.add(DOM.addDisposableListener(data.container, 'click', event => {
				if (!data.toggle.domNode.contains(event.target as Node)) {
					this._toggleExpand(entry.id);
				}
			}));
		} else {
			data.container.removeAttribute('aria-expanded');
		}
	}

	disposeTemplate(data: IToolsConnectedRowTemplateData): void {
		data.templateDisposables.dispose();
	}
}

//#endregion

/**
 * Marketplace search used when browsing for tool-contributing extensions. The marketplace cannot
 * be filtered server-side by contributed feature, so this is a text query.
 */
const TOOLS_MARKETPLACE_QUERY = 'language model tools';

const TOOLS_GALLERY_ITEM_HEIGHT = 62;

const TOOLS_GALLERY_ITEM_TEMPLATE_ID = 'toolsGalleryItem';

class ToolsGalleryItemDelegate implements IListVirtualDelegate<IExtension> {
	getHeight(): number { return TOOLS_GALLERY_ITEM_HEIGHT; }
	getTemplateId(): string { return TOOLS_GALLERY_ITEM_TEMPLATE_ID; }
}

/** Adapts an extension from the gallery to the shared gallery row renderer. */
class ToolsGalleryItemProvider implements IGalleryItemProvider<IExtension> {

	constructor(private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService) { }

	getLabel(extension: IExtension): string {
		return extension.displayName;
	}

	getPublisherDisplayName(extension: IExtension): string | undefined {
		return extension.publisherDisplayName;
	}

	getDescription(extension: IExtension): string | undefined {
		return extension.description;
	}

	getInstallState(extension: IExtension): GalleryItemInstallState {
		switch (extension.state) {
			case ExtensionState.Installed: return GalleryItemInstallState.Installed;
			case ExtensionState.Installing: return GalleryItemInstallState.Installing;
			default: return GalleryItemInstallState.Uninstalled;
		}
	}

	async install(extension: IExtension): Promise<void> {
		await this._extensionsWorkbenchService.install(extension);
	}

	onDidChangeInstallState(extension: IExtension, listener: () => void) {
		return this._extensionsWorkbenchService.onChange(changed => {
			if (!changed || changed.identifier.id === extension.identifier.id) {
				listener();
			}
		});
	}
}

/** A searchable tree of agent tool sets and session-published plugins and MCP servers. */
export class ToolsListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly _onDidSelectExtension = this._register(new Emitter<IExtension>());
	readonly onDidSelectExtension = this._onDidSelectExtension.event;

	private readonly _onDidSelectServer = this._register(new Emitter<IMcpServerDetailInput>());
	readonly onDidSelectServer = this._onDidSelectServer.event;

	private readonly _onDidRequestShowPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;

	private readonly _searchQuery = observableValue<string>('toolsSearchQuery', '');
	private readonly _expanded = observableValue<ReadonlySet<string>>('toolsExpanded', new Set());
	private readonly _delayedSearch = this._register(new Delayer<void>(200));
	private _searchInput!: InputBox;
	private _header!: HTMLElement;
	private _searchRow!: HTMLElement;
	private _treeContainer!: HTMLElement;
	private _tree!: WorkbenchObjectTree<IToolsTreeEntry>;
	private _emptyState!: HTMLElement;
	private _backButtonContainer!: HTMLElement;
	private _galleryContainer!: HTMLElement;
	private _galleryEmpty!: HTMLElement;
	private _galleryListContainer!: HTMLElement;
	private _galleryList!: WorkbenchList<IExtension>;

	private _lastCount = -1;
	private _browseMode = false;
	private _galleryCts: CancellationTokenSource | undefined;
	private _lastHeight = 0;
	private _lastWidth = 0;

	private readonly _collapsedGroups = new Set<string>();
	private _currentModel: readonly IToolSetViewModel[] = [];
	private _setRenderer!: ToolsSetRowRenderer;
	private _connectedSessionResource: URI | undefined;
	private _connectedServers: readonly AgentHostMcpServer[] = [];
	private _connectedPlugins: readonly PluginCustomization[] = [];
	private readonly _connectedTools = new Map<string, ConnectedToolsState>();
	private readonly _connectedToolsChanged = observableSignal(this);
	private readonly _pendingAutoExpand = new Set<string>();
	private readonly _agentHostCustomizationsChanged: IObservable<void>;

	/** Read-only tool sets injected for the current session type (e.g. the Copilot CLI built-ins). */
	private readonly _staticReadOnlySets: readonly IToolSet[];

	constructor(
		private readonly _sessionType: string,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly _enablementService: IAgentHostToolSetEnablementService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManifestPropertiesService private readonly _extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IAgentHostCustomizationService private readonly _agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService private readonly _harnessService: ICustomizationHarnessService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		this._agentHostCustomizationsChanged = observableSignalFromEvent(this, this._agentHostCustomizationService.onDidChangeCustomizations);
		this._staticReadOnlySets = this._createStaticReadOnlySets();

		this.element = $('.tools-list-widget');
		this._createHeader();
		this._createSearchRow();

		this._treeContainer = DOM.append(this.element, $('.tools-list-tree.customization-tree-container'));
		this._createTree();
		this._emptyState = DOM.append(this.element, $('.list-empty-state'));
		this._emptyState.style.display = 'none';

		this._createGallery();
		this._register(toDisposable(() => this._galleryCts?.dispose(true)));

		const viewModel = this._createViewModel();
		const connectedModel = derived(this, reader => {
			this._agentHostCustomizationsChanged.read(reader);
			const sessionResource = this._harnessService.activeSessionResource.read(reader);
			return {
				sessionResource,
				servers: this._agentHostCustomizationService.getMcpServers(sessionResource),
				plugins: this._agentHostCustomizationService.getCustomizations(sessionResource).filter(customization => customization.type === CustomizationType.Plugin),
			};
		});
		this._register(autorun(reader => {
			const { sessionResource, servers, plugins } = connectedModel.read(reader);
			const expanded = this._expanded.read(reader);
			this._connectedToolsChanged.read(reader);
			const sessionChanged = !isEqual(this._connectedSessionResource, sessionResource);
			if (sessionChanged) {
				this._connectedTools.clear();
				this._pendingAutoExpand.clear();
				this._connectedSessionResource = sessionResource;
			}
			const nextExpanded = new Set(expanded);
			for (const id of expanded) {
				if (id.startsWith('connected-server:')) {
					const server = servers.find(server => id === `connected-server:${server.id}`);
					if (sessionChanged || !server || !this._isConnectedServerReady(server)) {
						nextExpanded.delete(id);
					}
				} else if (sessionChanged && id.startsWith('connected-plugin:')) {
					nextExpanded.delete(id);
				}
			}
			for (const id of this._pendingAutoExpand) {
				const server = servers.find(server => server.id === id);
				const state = server && getActiveSessionServerPresentation(server).status;
				const previousServer = this._connectedServers.find(server => server.id === id);
				const previousState = previousServer && getActiveSessionServerPresentation(previousServer).status;
				if (!server || state === McpServerStatus.Error || (state === McpServerStatus.AuthRequired && previousState !== McpServerStatus.AuthRequired)) {
					this._pendingAutoExpand.delete(id);
				} else if (this._isConnectedServerReady(server)) {
					this._pendingAutoExpand.delete(id);
					if (this.element.isConnected && this.element.offsetParent !== null) {
						nextExpanded.add(`connected-server:${id}`);
					}
				}
			}
			this._connectedServers = servers;
			this._connectedPlugins = plugins;
			for (const id of this._connectedTools.keys()) {
				const server = this._connectedServers.find(server => server.id === id);
				if (!server?.listTools || !this._isConnectedServerReady(server)) {
					this._connectedTools.delete(id);
				}
			}
			if (nextExpanded.size !== expanded.size || [...nextExpanded].some(id => !expanded.has(id))) {
				this._expanded.set(nextExpanded, undefined);
			}
			for (const server of servers) {
				if (nextExpanded.has(`connected-server:${server.id}`) && this._isConnectedServerReady(server) && server.listTools && !this._connectedTools.has(server.id)) {
					void this._loadConnectedTools(server);
				}
			}
		}));
		this._register(autorun(reader => {
			this._currentModel = viewModel.read(reader);
			connectedModel.read(reader);
			this._agentPluginService.plugins.read(reader);
			this._expanded.read(reader);
			this._connectedToolsChanged.read(reader);
			this._renderTreeGroups();
		}));
		this._register(autorun(reader => {
			// Badge counts enabled individual tools across all visible sets, ignoring the search filter.
			const count = countEnabledCustomizationTools(this._toolsService.toolSets.read(reader), this._readState(reader), reader);
			if (count !== this._lastCount) {
				this._lastCount = count;
				this._onDidChangeItemCount.fire(count);
			}
		}));
	}

	private _createHeader(): void {
		this._header = DOM.append(this.element, $('.section-title-header'));
		DOM.append(DOM.append(this._header, $('.section-title-row')), $('h2.section-title')).textContent = localize('toolsListTitle', "Tools");

		const description = DOM.append(this._header, $('p.section-title-description'));
		DOM.append(description, $('span.section-title-description-text')).textContent = localize('toolsListSubtitle', "Enable or disable the tools available to chat. Disabled tools are not advertised to the agent. Tools other than Copilot's built-in tools run on the client and require it to be connected.");
		// Whitespace node so the gap collapses when the link wraps.
		description.appendChild(document.createTextNode(' '));

		const learnMore = DOM.append(description, $('a.section-title-link')) as HTMLAnchorElement;
		learnMore.textContent = localize('learnMoreTools', "Learn more about tools");
		learnMore.href = 'https://code.visualstudio.com/docs/agent-customization/tools?referrer=in-product';
		this._register(DOM.addDisposableListener(learnMore, 'click', e => {
			e.preventDefault();
			void this._openerService.open(URI.parse(learnMore.href));
		}));
	}

	private _createSearchRow(): void {
		this._searchRow = DOM.append(this.element, $('.tools-list-search-and-button-container'));
		const searchContainer = DOM.append(this._searchRow, $('.tools-list-search-container'));
		this._searchInput = this._register(new InputBox(searchContainer, this._contextViewService, {
			placeholder: localize('searchPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('toolsSearchAria', "Search tools"),
		}));
		this._register(this._searchInput.onDidChange(() => {
			this._delayedSearch.trigger(() => {
				if (this._browseMode) {
					void this._queryGallery();
				} else {
					this._searchQuery.set(this._searchInput.value, undefined);
				}
			}).catch(() => { /* delayer disposed */ });
		}));

		const backLabel = localize('toolsBrowseBack', "Back");
		this._backButtonContainer = DOM.append(this._searchRow, $('.tools-list-browse-button-container'));
		this._backButtonContainer.style.display = 'none';
		const backButton = this._register(new Button(this._backButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: backLabel, ariaLabel: backLabel }));
		backButton.label = `$(${Codicon.arrowLeft.id}) ${backLabel}`;
		this._register(backButton.onDidClick(() => this._setBrowseMode(false)));
	}

	private _createTree(): void {
		this._setRenderer = new ToolsSetRowRenderer(
			this._instantiationService,
			this._sessionType,
			this._enablementService,
			(vm, reader) => vm.forceExpanded || this._expanded.read(reader).has(vm.toolSet.id),
			setId => this._toggleCollapsed(setId),
			ts => this._resolveExtensionForToolSet(ts),
			(anchor, extension) => this._showExtensionContextMenu(anchor, extension),
		);
		const groupRenderer = new CustomizationGroupHeaderRenderer<IToolsGroupEntry>(
			'toolsGroupHeader',
			this._hoverService,
			(entry, container, disposables) => this._renderTreeGroupActions(entry, container, disposables),
		);
		this._tree = this._register(this._instantiationService.createInstance(
			WorkbenchObjectTree<IToolsTreeEntry>,
			'ToolsManagementTree',
			this._treeContainer,
			new ToolsTreeDelegate(),
			[
				asTreeRenderer(groupRenderer),
				asTreeRenderer(this._setRenderer),
				asTreeRenderer(new ToolsToolRowRenderer(this._instantiationService, this._sessionType, this._enablementService)),
				asTreeRenderer(new ToolsConnectedRowRenderer(
					this._instantiationService,
					this._hoverService,
					server => isPrimaryMcpServerEnabled(this._mcpService, undefined, server),
					(server, enabled) => this._setConnectedServerEnabled(server, enabled),
					(entry, reader) => this._expanded.read(reader).has(entry.id) || (!entry.server && !!this._searchQuery.read(reader).trim()),
					id => this._toggleCollapsed(id),
					(server, container, disposables) => this._renderConnectedServerActions(server, container, disposables),
				)),
				asTreeRenderer(new ToolsEmptyRowRenderer()),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				hideTwistiesOfChildlessElements: false,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				openOnSingleClick: true,
				identityProvider: { getId: entry => this._treeEntryId(entry) },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('toolsTreeAriaLabel', "Tools"),
					getAriaLabel: entry => this._getTreeEntryLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => this._getTreeEntryLabel(entry),
				},
			},
		));
		this._register(this._tree.onDidChangeSelection(() => this._tree.setSelection([])));
		this._register(this._tree.onDidChangeFocus(event => {
			const entry = event.elements[0];
			this._setRenderer.setFocusedSetId(entry?.type === 'set' ? entry.vm.toolSet.id : undefined);
		}));
		this._register(this._tree.onDidChangeCollapseState(event => {
			const entry = event.node.element;
			if (!entry || entry.type !== 'group-header') {
				return;
			}
			if (event.node.collapsed) {
				this._collapsedGroups.add(entry.groupKey);
			} else {
				this._collapsedGroups.delete(entry.groupKey);
			}
		}));
		this._register(DOM.addStandardDisposableListener(this._tree.getHTMLElement(), DOM.EventType.KEY_DOWN, event => {
			const entry = this._tree.getFocus()[0];
			if (entry?.type === 'connected' && entry.expandable && (event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.RightArrow)) {
				if (this._expanded.get().has(entry.id) !== (event.keyCode === KeyCode.RightArrow)) {
					this._toggleCollapsed(entry.id);
				}
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (event.keyCode !== KeyCode.Space && event.keyCode !== KeyCode.Enter) {
				return;
			}
			if (entry && entry.type !== 'group-header' && entry.type !== 'empty') {
				this._activateToolEntry(entry, event.keyCode === KeyCode.Enter);
				event.preventDefault();
				event.stopPropagation();
			}
		}));
	}

	private _createGallery(): void {
		this._galleryContainer = DOM.append(this.element, $('.tools-gallery-container'));
		this._galleryContainer.style.display = 'none';
		const header = DOM.append(this._galleryContainer, $('.tools-marketplace-header'));
		DOM.append(header, $('h3.tools-marketplace-title')).textContent = localize('toolsMarketplaceTitle', "Marketplace Tools");
		DOM.append(header, $('p.tools-marketplace-description')).textContent = localize('toolsMarketplaceDescription', "Install extensions that contribute additional tools.");
		this._galleryEmpty = DOM.append(this._galleryContainer, $('.list-empty-state'));
		this._galleryEmpty.style.display = 'none';
		this._galleryListContainer = DOM.append(this._galleryContainer, $('.tools-gallery-list'));
		this._galleryList = this._register(this._instantiationService.createInstance(
			WorkbenchList<IExtension>,
			'ToolsMarketplaceList',
			this._galleryListContainer,
			new ToolsGalleryItemDelegate(),
			[new GalleryItemRenderer<IExtension>(TOOLS_GALLERY_ITEM_TEMPLATE_ID, new ToolsGalleryItemProvider(this._extensionsWorkbenchService))],
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (extension: IExtension) => extension.displayName,
					getWidgetAriaLabel: () => localize('toolsMarketplaceAria', "Tool extensions"),
				},
				identityProvider: { getId: (extension: IExtension) => extension.identifier.id },
			},
		)) as WorkbenchList<IExtension>;

		this._register(this._galleryList.onDidOpen(e => {
			if (e.element) {
				this._onDidSelectExtension.fire(e.element);
			}
		}));

		this._register(this._galleryList.onContextMenu(e => this._onGalleryContextMenu(e)));
	}

	private _readState(reader: IReader): IToolEnablementState {
		return this._enablementService.observe(this._sessionType).read(reader);
	}

	private _createStaticReadOnlySets(): readonly IToolSet[] {
		const tools: IToolData[] = COPILOT_CLI_TOOLS.map(t => ({
			id: `copilot-cli:${t.name}`,
			displayName: t.name,
			modelDescription: t.description,
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: false,
		}));
		const copilotCliSet: IToolSet = {
			id: 'copilot-cli',
			referenceName: 'copilotCli',
			icon: Codicon.copilot,
			source: ToolDataSource.Internal,
			description: localize('clientToolSet.copilotCli.description', "Copilot"),
			detail: localize('clientToolSet.copilotCli.detail', "Built-in tools the Copilot agent runs inside its own runtime."),
			getTools: () => tools,
		};
		return [copilotCliSet];
	}

	private _createViewModel(): IObservable<readonly IToolSetViewModel[]> {
		// Refresh when extensions change so tool sets from an uninstalled extension drop out immediately (their tools linger in the extension host until reload).
		const extensionsChanged = observableSignalFromEvent(this, this._extensionsWorkbenchService.onChange);
		return derived(reader => {
			extensionsChanged.read(reader);
			const query = this._searchQuery.read(reader).trim();

			const result: IToolSetViewModel[] = [];
			for (const ts of [...this._toolsService.toolSets.read(reader), ...this._staticReadOnlySets]) {
				const vm = this._toViewModel(reader, ts, query);
				if (vm) {
					result.push(vm);
				}
			}
			result.sort((a, b) => sortKey(a.toolSet).localeCompare(sortKey(b.toolSet)));
			return result;
		});
	}

	private _toViewModel(reader: IReader, ts: IToolSet, query: string): IToolSetViewModel | undefined {
		if (ts.deprecated) {
			return undefined;
		}
		// Hide extension-provided sets whose extension is gone or being removed.
		if (ts.source.type === 'extension') {
			const extensionId = ts.source.extensionId;
			const installed = this._extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, extensionId));
			if (!installed || installed.state === ExtensionState.Uninstalling || installed.state === ExtensionState.Uninstalled) {
				return undefined;
			}
		}
		const memberTools = Array.from(ts.getTools(reader));
		if (memberTools.length === 0) {
			return undefined;
		}
		const allToolIds = memberTools.map(t => t.id);

		let visibleTools: IToolViewModel[] = memberTools.map(tool => ({ tool }));
		let nameMatches: IMatch[] | undefined;
		if (query) {
			nameMatches = matchesContiguousSubString(query, ts.description ?? ts.referenceName) ?? undefined;
			if (nameMatches) {
				visibleTools = memberTools.map(tool => ({ tool, nameMatches: matchesContiguousSubString(query, tool.displayName ?? tool.id) ?? undefined }));
			} else {
				visibleTools = [];
				for (const tool of memberTools) {
					const toolMatches = matchesContiguousSubString(query, tool.displayName ?? tool.id);
					if (toolMatches) {
						visibleTools.push({ tool, nameMatches: toolMatches });
					}
				}
				if (visibleTools.length === 0) {
					return undefined;
				}
			}
		}

		return {
			toolSet: ts,
			allToolIds,
			visibleTools,
			nameMatches,
			forceExpanded: query !== '',
			readOnly: ts.id === 'copilot-cli',
			detail: this._resolveSetDetail(ts)
		};
	}

	layout(height: number, width: number): void {
		this._lastHeight = height;
		this._lastWidth = width;
		if (this.element.parentElement?.style.display === 'none') {
			return;
		}
		this.element.classList.toggle('narrow-layout', width < 500);
		this._searchInput.layout();
		const treeHeight = getCustomizationTreeContentHeight(this.element, this._treeContainer, height);
		this._treeContainer.style.height = `${treeHeight}px`;
		this._tree.layout(treeHeight, width);

		const galleryOffset = this._galleryContainer.getBoundingClientRect().top - this.element.getBoundingClientRect().top;
		this._galleryList.layout(Math.max(0, height - galleryOffset), width);
	}

	/** Enters/leaves marketplace browse mode, swapping the tree for the gallery list. */
	private _setBrowseMode(browse: boolean): void {
		if (browse && this._environmentService.isSessionsWindow) {
			return;
		}
		if (this._browseMode === browse) {
			return;
		}
		this._browseMode = browse;

		this._treeContainer.style.display = browse ? 'none' : '';
		this._emptyState.style.display = 'none';
		this._galleryContainer.style.display = browse ? '' : 'none';
		this._backButtonContainer.style.display = browse ? '' : 'none';

		this._searchInput.setPlaceHolder(browse
			? localize('toolsBrowsePlaceholder', "Search the Marketplace...")
			: localize('searchPlaceholder', "Type to search..."));
		this._searchInput.value = '';

		if (browse) {
			void this._queryGallery();
		} else {
			this._galleryCts?.dispose(true);
			this._galleryCts = undefined;
			this._galleryList.splice(0, this._galleryList.length, []);
			this._searchQuery.set('', undefined);
			this._renderTreeGroups();
		}

		this._searchInput.focus();
		if (this._lastHeight > 0) {
			this.layout(this._lastHeight, this._lastWidth);
		}
	}

	/** Queries the Extensions gallery for tool-contributing extensions. */
	private async _queryGallery(): Promise<void> {
		this._galleryCts?.dispose(true);
		const cts = this._galleryCts = new CancellationTokenSource();

		const userText = this._searchInput.value.trim();
		const text = userText ? `${TOOLS_MARKETPLACE_QUERY} ${userText}` : TOOLS_MARKETPLACE_QUERY;

		this._setGalleryMessage(localize('toolsBrowseLoading', "Loading marketplace..."));
		try {
			const pager = await this._extensionsWorkbenchService.queryGallery({ text }, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			const items = pager.firstPage;
			const filteredItems = await this._filterGalleryResults(items, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			if (filteredItems.length === 0) {
				this._setGalleryMessage(
					localize('toolsBrowseNoResults', "No tool extensions match '{0}'", userText || TOOLS_MARKETPLACE_QUERY),
					localize('tryDifferentSearch', "Try a different search term"));
				return;
			}
			this._galleryEmpty.style.display = 'none';
			this._galleryListContainer.style.display = '';
			this._galleryList.splice(0, this._galleryList.length, filteredItems);
		} catch {
			if (!cts.token.isCancellationRequested) {
				this._setGalleryMessage(
					localize('toolsBrowseError', "Unable to load marketplace"),
					localize('toolsBrowseTryAgain', "Check your connection and try again"));
			}
		}
	}

	/**
	 * Keeps only extensions that contribute language model tools and, in the Agents window, can run there
	 * ({@link IExtensionManifestPropertiesService.canExecuteOnSessionsWindow}); the `executesCode` hint skips
	 * manifest fetches for extensions that can never run.
	 */
	private async _filterGalleryResults(extensions: readonly IExtension[], token: CancellationToken): Promise<IExtension[]> {
		const requireAgentsWindowSupport = this._environmentService.isSessionsWindow;
		const results = await Promise.all(extensions.map(async extension => {
			// In the Agents window, code-executing extensions can never run: reject before fetching the manifest.
			if (requireAgentsWindowSupport && extension.gallery?.properties.executesCode) {
				return undefined;
			}
			try {
				const manifest = await extension.getManifest(token);
				if (!manifest?.contributes?.languageModelTools?.length) {
					return undefined;
				}
				if (requireAgentsWindowSupport && !this._extensionManifestPropertiesService.canExecuteOnSessionsWindow(manifest)) {
					return undefined;
				}
				return extension;
			} catch {
				// Ignore extensions whose manifest cannot be resolved.
				return undefined;
			}
		}));
		return results.filter((extension): extension is IExtension => !!extension);
	}

	private _setGalleryMessage(text: string, subtext?: string): void {
		// Drop any stale rows so only the message shows.
		this._galleryList.splice(0, this._galleryList.length, []);
		this._galleryListContainer.style.display = 'none';
		DOM.clearNode(this._galleryEmpty);
		this._galleryEmpty.style.display = 'flex';
		const header = DOM.append(this._galleryEmpty, $('.empty-state-header'));
		DOM.append(header, $('.empty-state-text')).textContent = text;
		if (subtext) {
			DOM.append(this._galleryEmpty, $('.empty-state-subtext')).textContent = subtext;
		}
	}

	/** Move keyboard focus to the search box. */
	focusSearch(): void {
		this._searchInput.focus();
		this._searchInput.select();
	}

	/** Re-emit the current item count. Called once at startup to seed the section badge. */
	fireItemCount(): void {
		this._onDidChangeItemCount.fire(this._lastCount === -1 ? 0 : this._lastCount);
	}

	private _renderTreeGroups(): void {
		if (!this._tree || this._browseMode) {
			return;
		}
		const query = this._searchQuery.get().trim();
		const groups = [
			this._createTreeGroup(
				'builtin',
				localize('builtInToolsSection', "Built-in Tools"),
				localize('builtInToolsSectionDescription', "Tools provided by the active agent and VS Code."),
				localize('builtInToolsSectionEmpty', "No built-in tool sets are available."),
				this._currentModel.filter(vm => vm.toolSet.source.type === 'internal' || vm.toolSet.source.type === 'external'),
			),
			this._createConnectedTreeGroup(query),
			this._createTreeGroup(
				'extensions',
				localize('installedToolExtensionsSection', "Extension Tools"),
				localize('installedToolExtensionsSectionDescription', "Tool sets contributed by installed extensions."),
				localize('extensionToolsSectionEmpty', "No extension tools are installed."),
				this._currentModel.filter(vm => vm.toolSet.source.type === 'extension'),
			),
		].filter(group => !query || group.count > 0);

		if (groups.length === 0 && query) {
			this._tree.setChildren(null);
			this._treeContainer.style.display = 'none';
			this._showTreeEmptyState(
				localize('noMatchingTools', "No tools match '{0}'", query),
				localize('tryDifferentSearch', "Try a different search term"),
			);
			return;
		}

		this._emptyState.style.display = 'none';
		this._treeContainer.style.display = '';
		const children: IObjectTreeElement<IToolsTreeEntry>[] = groups.map(group => ({
			element: group.element,
			collapsible: true,
			collapsed: this._collapsedGroups.has(group.id)
				? ObjectTreeElementCollapseState.PreserveOrCollapsed
				: ObjectTreeElementCollapseState.PreserveOrExpanded,
			children: group.children.map(element => ({ element })),
		}));
		this._tree.setChildren(null);
		this._tree.setChildren(null, children);
		if (this._lastHeight > 0) {
			this.layout(this._lastHeight, this._lastWidth);
		}
	}

	private _createTreeGroup(id: string, label: string, description: string, emptyMessage: string, setVms: readonly IToolSetViewModel[]): ICustomizationTreeGroup<IToolsTreeEntry> {
		return this._createTreeGroupFromEntries(id, label, description, emptyMessage, this._computeSectionEntries(setVms), setVms.length);
	}

	private _createTreeGroupFromEntries(id: string, label: string, description: string, emptyMessage: string, rows: readonly IToolsRowEntry[], count: number): ICustomizationTreeGroup<IToolsTreeEntry> {
		const entries = rows.length > 0
			? rows
			: [{ type: 'empty' as const, id: `empty:${id}`, label: emptyMessage }];
		const element: IToolsGroupEntry = {
			type: 'group-header',
			id: `tools-group-${id}`,
			groupKey: id,
			label,
			icon: Codicon.tools,
			count,
			isFirst: false,
			description,
			collapsed: this._collapsedGroups.has(id),
		};
		return { id, label, description, count, element, children: entries };
	}

	private _createConnectedTreeGroup(query: string): ICustomizationTreeGroup<IToolsTreeEntry> {
		const entries: IToolsConnectedRowEntry[] = [];
		for (const plugin of this._connectedPlugins) {
			const servers = this._connectedServers.filter(server => server.pluginId === plugin.id);
			if (servers.length === 0) {
				continue;
			}
			if (servers.length === 1) {
				entries.push(...this._computeConnectedServerEntries(servers[0], 0, query, !query || !!matchesContiguousSubString(query, plugin.name)));
				continue;
			}
			const id = `connected-plugin:${plugin.id}`;
			const nameMatches = matchesContiguousSubString(query, plugin.name) ?? undefined;
			const expanded = this._expanded.get().has(id) || !!query;
			const serverEntries = expanded ? servers.flatMap(server => this._computeConnectedServerEntries(server, 1, query, !query || !!nameMatches)) : [];
			if (query && !nameMatches && serverEntries.length === 0) {
				continue;
			}
			entries.push({ type: 'connected', id, depth: 0, label: plugin.name, expandable: true, nameMatches }, ...serverEntries);
		}
		for (const server of this._connectedServers) {
			if (server.pluginId === undefined || !this._connectedPlugins.some(plugin => plugin.id === server.pluginId)) {
				entries.push(...this._computeConnectedServerEntries(server, 0, query, !query));
			}
		}
		return this._createTreeGroupFromEntries(
			'connected',
			localize('connectedToolsSection', "Connected Sources"),
			localize('connectedToolsSectionDescription', "Plugins and MCP servers available to the agent."),
			localize('connectedToolsSectionEmpty', "No plugins or MCP servers are available."),
			entries,
			entries.filter(entry => entry.depth === 0).length,
		);
	}

	private _computeConnectedServerEntries(server: AgentHostMcpServer, depth: number, query: string, includeAll: boolean): IToolsConnectedRowEntry[] {
		const id = `connected-server:${server.id}`;
		const expandable = this._isConnectedServerReady(server);
		const expanded = expandable && this._expanded.get().has(id);
		const nameMatches = matchesContiguousSubString(query, server.name) ?? undefined;
		const state = this._connectedTools.get(server.id);
		const tools = expanded && state?.state === 'loaded' ? state.tools : [];
		const toolEntries: IToolsConnectedRowEntry[] = [];
		for (const tool of tools) {
			const label = tool.title ?? tool.name;
			const toolMatches = matchesContiguousSubString(query, label) ?? undefined;
			if (!query || includeAll || nameMatches || toolMatches || matchesContiguousSubString(query, tool.name)) {
				toolEntries.push({ type: 'connected', id: `${id}:tool:${tool.name}`, depth: depth + 1, label, description: tool.description, expandable: false, nameMatches: toolMatches });
			}
		}
		if (query && !includeAll && !nameMatches && toolEntries.length === 0) {
			return [];
		}
		const source = getAgentHostMcpServerSource(
			server,
			this._connectedPlugins.find(plugin => plugin.id === server.pluginId),
			this._labelService,
			this._agentPluginService,
			plugin => this._onDidRequestShowPlugin.fire(createInstalledPluginItem(plugin)),
			file => void this._editorService.openEditor({ resource: file.uri, options: { selection: file.range, pinned: true } }),
		);
		const description = source ? localize('toolsConnectedServerSource', "MCP server from {0}", source.label) : undefined;
		const entries: IToolsConnectedRowEntry[] = [{ type: 'connected', id, depth, label: server.name, description, source, server, expandable, nameMatches }];
		if (expanded) {
			if (toolEntries.length > 0) {
				entries.push(...toolEntries);
			} else if (state?.state !== 'loaded' || tools.length === 0) {
				const label = state?.state === 'error'
					? localize('connectedToolsError', "Unable to list tools")
					: state?.state === 'loaded' || !server.listTools
						? localize('connectedToolsEmpty', "No tools")
						: localize('connectedToolsLoading', "Loading tools...");
				entries.push({ type: 'connected', id: `${id}:message`, depth: depth + 1, label, expandable: false, message: true });
			}
		}
		return entries;
	}

	private async _loadConnectedTools(server: AgentHostMcpServer): Promise<void> {
		if (!server.listTools) {
			return;
		}
		const pending: ConnectedToolsState = { state: 'loading' };
		this._connectedTools.set(server.id, pending);
		let result: ConnectedToolsState;
		try {
			result = { state: 'loaded', tools: await server.listTools() };
		} catch {
			result = { state: 'error' };
		}
		if (!this._store.isDisposed && this._connectedTools.get(server.id) === pending) {
			this._connectedTools.set(server.id, result);
			this._connectedToolsChanged.trigger(undefined);
		}
	}

	private _setConnectedServerEnabled(server: AgentHostMcpServer, enabled: boolean): void {
		setPrimaryMcpServerEnablement(this._mcpService, this._agentHostCustomizationService, this._harnessService.activeSessionResource.get(), undefined, server, enabled);
	}

	private _isConnectedServerReady(server: AgentHostMcpServer): boolean {
		return getActiveSessionServerPresentation(server).status === McpServerStatus.Ready && isPrimaryMcpServerEnabled(this._mcpService, undefined, server);
	}

	private _renderConnectedServerActions(server: AgentHostMcpServer, container: HTMLElement, disposables: DisposableStore): void {
		const state = getActiveSessionServerPresentation(server).status;
		renderMcpServerStatusActions(container, disposables, this._hoverService, {
			label: server.name,
			state,
			start: () => this._startConnectedServer(server),
			signIn: () => this._signInConnectedServer(server),
			statusHover: getMcpErrorMessage(state, server.state.kind === McpServerStatus.Error ? server.state.error?.message : undefined),
			openStatus: state === McpServerStatus.Error ? () => this._showConnectedServerDetails(server) : undefined,
		});
	}

	private async _startConnectedServer(server: AgentHostMcpServer): Promise<void> {
		this._pendingAutoExpand.add(server.id);
		await server.start();
	}

	private async _signInConnectedServer(server: AgentHostMcpServer): Promise<boolean> {
		const sessionResource = this._harnessService.activeSessionResource.get();
		try {
			const authenticated = await authenticateMcpServer(this._agentHostCustomizationService, sessionResource, server.id);
			if (authenticated && !this._store.isDisposed && isEqual(sessionResource, this._connectedSessionResource)) {
				this._pendingAutoExpand.add(server.id);
				this._connectedToolsChanged.trigger(undefined);
			}
			return authenticated;
		} catch (error) {
			this._notificationService.error(localize('mcpAuthenticationFailed', "Unable to sign in to {0}: {1}", server.name, getErrorMessage(error)));
			return false;
		}
	}

	private _showConnectedServerDetails(server: AgentHostMcpServer): void {
		this._onDidSelectServer.fire(createAgentHostMcpServerDetailInput(server, this._agentHostCustomizationService, this._harnessService, this._agentHostCustomizationsChanged));
	}

	private _renderTreeGroupActions(entry: IToolsGroupEntry, container: HTMLElement, disposables: DisposableStore): void {
		if (entry.groupKey === 'extensions') {
			this._renderBrowseToolsAction(container, disposables);
		}
	}

	private _renderBrowseToolsAction(container: HTMLElement, disposables: DisposableStore): void {
		if (this._environmentService.isSessionsWindow) {
			return;
		}
		const browseLabel = localize('toolsBrowseMarketplace', "Browse Marketplace");
		const actions = DOM.append(container, $('.tools-inventory-section-actions'));
		const browseButton = disposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: browseLabel,
			ariaLabel: browseLabel,
		}));
		browseButton.label = `$(${Codicon.library.id}) ${browseLabel}`;
		disposables.add(browseButton.onDidClick(() => this._setBrowseMode(true)));
	}

	private _showTreeEmptyState(text: string, subtext: string): void {
		DOM.clearNode(this._emptyState);
		this._emptyState.style.display = 'flex';
		const header = DOM.append(this._emptyState, $('.empty-state-header'));
		DOM.append(header, $('.empty-state-text')).textContent = text;
		DOM.append(this._emptyState, $('.empty-state-subtext')).textContent = subtext;
	}

	private _treeEntryId(entry: IToolsTreeEntry): string {
		if (entry.type === 'group-header') {
			return entry.id;
		}
		if (entry.type === 'empty') {
			return entry.id;
		}
		return this._entryRowId(entry);
	}

	private _getTreeEntryLabel(entry: IToolsTreeEntry): string {
		if (entry.type === 'group-header') {
			return entry.label;
		}
		if (entry.type === 'empty' || entry.type === 'connected') {
			if (entry.type === 'connected' && entry.server) {
				return localize('toolsConnectedServerAriaLabel', "{0}, {1}", entry.label, getMcpStatusPresentation(getActiveSessionServerPresentation(entry.server).status)?.label ?? '');
			}
			return entry.label;
		}
		return entry.type === 'set'
			? entry.vm.toolSet.description ?? entry.vm.toolSet.referenceName
			: entry.toolVm.tool.displayName ?? entry.toolVm.tool.id;
	}

	/** Flattens a section's tool sets into rows, expanding each set's tools when the set is expanded. */
	private _computeSectionEntries(setVms: readonly IToolSetViewModel[]): IToolsRowEntry[] {
		const entries: IToolsRowEntry[] = [];
		for (const vm of setVms) {
			entries.push({ type: 'set', vm });
			if (this._isRowExpanded(vm)) {
				for (const toolVm of vm.visibleTools) {
					entries.push({ type: 'tool', setVm: vm, toolVm });
				}
			}
		}
		return entries;
	}

	private _isRowExpanded(vm: IToolSetViewModel): boolean {
		return vm.forceExpanded || this._expanded.get().has(vm.toolSet.id);
	}

	private _entryRowId(entry: IToolsRowEntry): string {
		if (entry.type === 'connected') {
			return entry.id;
		}
		return entry.type === 'set' ? `set:${entry.vm.toolSet.id}` : `tool:${entry.setVm.toolSet.id}:${entry.toolVm.tool.id}`;
	}

	/** Space toggles enablement; Enter expands connected sources or runs their primary action. */
	private _activateToolEntry(entry: IToolsRowEntry, viaEnter: boolean): void {
		if (entry.type === 'connected') {
			if (entry.server) {
				const server = entry.server;
				const enabled = isPrimaryMcpServerEnabled(this._mcpService, undefined, server);
				if (!viaEnter) {
					this._setConnectedServerEnabled(server, !enabled);
				} else if (entry.expandable) {
					this._toggleCollapsed(entry.id);
				} else if (server.enabled && enabled) {
					const state = getActiveSessionServerPresentation(server).status;
					if (state === McpServerStatus.Stopped) {
						void this._startConnectedServer(server);
					} else if (state === McpServerStatus.AuthRequired) {
						void this._signInConnectedServer(server);
					} else if (state === McpServerStatus.Error) {
						this._showConnectedServerDetails(server);
					}
				}
			} else if (viaEnter && entry.expandable) {
				this._toggleCollapsed(entry.id);
			}
			return;
		}
		const readOnly = entry.type === 'set' ? entry.vm.readOnly : entry.setVm.readOnly;
		if (readOnly) {
			if (viaEnter && entry.type === 'set') {
				this._toggleCollapsed(entry.vm.toolSet.id);
			}
			return;
		}
		if (entry.type === 'set') {
			const vm = entry.vm;
			const current = getToolSetTriState(this._currentState(), vm.toolSet.id, vm.allToolIds);
			this._enablementService.setToolSetEnabled(this._sessionType, vm.toolSet.id, vm.allToolIds, current !== true);
		} else {
			const { setVm, toolVm } = entry;
			const current = isToolEnabledInSet(this._currentState(), setVm.toolSet.id, toolVm.tool.id);
			this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, toolVm.tool.id, !current);
		}
	}

	/**
	 * Subtitle for a tool-set row: the set's own `detail`, or for extension sets the extension's
	 * description (falling back to a generic "contributed by" label).
	 */
	private _resolveSetDetail(ts: IToolSet): string | undefined {
		if (ts.detail) {
			return ts.detail;
		}
		if (ts.source.type !== 'extension') {
			return undefined;
		}
		const source = ts.source;
		const extension = this._extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, source.extensionId));
		return extension?.description || localize('toolsSetExtensionDetail', "Tools contributed by {0}", source.label);
	}

	private _toggleCollapsed(toolSetId: string): void {
		const next = new Set(this._expanded.get());
		if (next.has(toolSetId)) {
			next.delete(toolSetId);
		} else {
			next.add(toolSetId);
		}
		this._expanded.set(next, undefined);
	}

	private _currentState(): IToolEnablementState {
		return this._enablementService.getState(this._sessionType);
	}

	/** Resolve the installed, non-builtin extension backing an extension-provided tool set. */
	private _resolveExtensionForToolSet(ts: IToolSet): IExtension | undefined {
		if (ts.source.type !== 'extension') {
			return undefined;
		}
		const source = ts.source;
		const extension = this._extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, source.extensionId));
		if (!extension || extension.local?.isBuiltin) {
			return undefined;
		}
		return extension;
	}

	private _onGalleryContextMenu(e: IListContextMenuEvent<IExtension>): void {
		const extension = e.element;
		if (!extension || extension.state !== ExtensionState.Installed || extension.local?.isBuiltin) {
			return;
		}
		this._showExtensionContextMenu(e.anchor, extension);
	}

	private _showExtensionContextMenu(anchor: HTMLElement | StandardMouseEvent | IAnchor, extension: IExtension): void {
		const disposables = new DisposableStore();
		const uninstallAction = disposables.add(new Action(
			'toolsList.uninstallExtension',
			localize('uninstallExtension', "Uninstall Extension"),
			undefined,
			true,
			() => this._uninstallExtension(extension),
		));
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [uninstallAction],
			onHide: () => disposables.dispose(),
		});
	}

	private async _uninstallExtension(extension: IExtension): Promise<void> {
		const result = await this._dialogService.confirm({
			message: localize('confirmUninstallToolExtension', "Do you want to uninstall the extension '{0}'?", extension.displayName),
			detail: localize('confirmUninstallToolExtensionDetail', "This extension may contribute more than tools. Uninstalling it removes all of its contributions."),
			primaryButton: localize('uninstallExtensionBtn', "Uninstall Extension"),
			type: 'question',
		});
		if (result.confirmed) {
			await this._extensionsWorkbenchService.uninstall(extension);
		}
	}
}

/**
 * The Copilot CLI's built-in tools, surfaced read-only for reference. Mirrored from the published
 * "Tool availability values" table (the SDK does not expose this list at runtime); keep in sync:
 * https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#tool-availability-values
 */
const COPILOT_CLI_TOOLS: readonly { readonly name: string; readonly description: string }[] = [
	// Shell tools
	{ name: 'bash / powershell', description: localize('copilotCliTool.shell', "Execute commands") },
	{ name: 'list_bash / list_powershell', description: localize('copilotCliTool.listShell', "List active shell sessions") },
	{ name: 'read_bash / read_powershell', description: localize('copilotCliTool.readShell', "Read output from a shell session") },
	{ name: 'stop_bash / stop_powershell', description: localize('copilotCliTool.stopShell', "Terminate a shell session") },
	{ name: 'write_bash / write_powershell', description: localize('copilotCliTool.writeShell', "Send input to a shell session") },
	// File operation tools
	{ name: 'apply_patch', description: localize('copilotCliTool.applyPatch', "Apply patches (used by some models instead of edit/create)") },
	{ name: 'create', description: localize('copilotCliTool.create', "Create new files") },
	{ name: 'edit', description: localize('copilotCliTool.edit', "Edit files via string replacement") },
	{ name: 'view', description: localize('copilotCliTool.view', "Read files or directories") },
	// Agent and task delegation tools
	{ name: 'list_agents', description: localize('copilotCliTool.listAgents', "List available agents") },
	{ name: 'read_agent', description: localize('copilotCliTool.readAgent', "Check background agent status") },
	{ name: 'task', description: localize('copilotCliTool.task', "Run subagents") },
	// Other tools
	{ name: 'ask_user', description: localize('copilotCliTool.askUser', "Ask the user a question") },
	{ name: 'glob', description: localize('copilotCliTool.glob', "Find files matching patterns") },
	{ name: 'grep (or rg)', description: localize('copilotCliTool.grep', "Search for text in files") },
	{ name: 'skill', description: localize('copilotCliTool.skill', "Invoke custom skills") },
	{ name: 'web_fetch', description: localize('copilotCliTool.webFetch', "Fetch and parse web content") },
];

const CUSTOM_TOOL_SET_ORDER: Record<string, number> = {
	'copilot-cli': 0,
	'vscode-general': 1,
	'vscode-tasks': 2,
	'vscode-browser': 3,
	'vscode-notebooks': 4,
};

function sortKey(toolSet: IToolSet): string {
	const sourcePriority = toolSet.source.type === 'internal' ? '0' : '1';
	const order = CUSTOM_TOOL_SET_ORDER[toolSet.id];
	const orderKey = order !== undefined ? String(order) : `9-${toolSet.description ?? toolSet.referenceName}`;
	return `${sourcePriority}-${orderKey}`;
}
