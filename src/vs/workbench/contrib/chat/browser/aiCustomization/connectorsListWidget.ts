/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ConnectorConnectionStatus, IConnectorPresentation, IConnectorsManagementService } from '../../common/connectorsManagementService.js';
import { CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from './customizationGroupHeaderRenderer.js';

const $ = DOM.$;
const CONNECTOR_ITEM_HEIGHT = 64;
type ConnectorGroup = 'connected' | 'available';

interface IConnectorGroupEntry {
	readonly type: 'group-header';
	readonly id: string;
	readonly group: ConnectorGroup;
	readonly label: string;
	readonly count: number;
	readonly isFirst: boolean;
}

interface IConnectorItemEntry {
	readonly type: 'connector-item';
	readonly connector: IConnectorPresentation;
}

type ConnectorListEntry = IConnectorGroupEntry | IConnectorItemEntry;

export type ConnectorPrimaryAction = 'connect' | 'refresh' | 'disconnect' | 'reconnect';

export function getConnectorPrimaryAction(connectionStatus: ConnectorConnectionStatus): ConnectorPrimaryAction {
	switch (connectionStatus) {
		case 'connected':
			return 'disconnect';
		case 'pending':
			return 'refresh';
		case 'error':
			return 'reconnect';
		case 'not_connected':
			return 'connect';
	}
}

export function filterAndGroupConnectors(connectors: readonly IConnectorPresentation[], query: string): readonly ConnectorListEntry[] {
	const normalizedQuery = query.trim().toLowerCase();
	const matches = connectors.filter(connector => {
		if (!normalizedQuery) {
			return true;
		}
		return [
			connector.displayName,
			connector.description,
		].some(value => value?.toLowerCase().includes(normalizedQuery));
	});
	const connected = matches.filter(connector => connector.connectionStatus === 'connected');
	const available = matches.filter(connector => connector.connectionStatus !== 'connected');
	const entries: ConnectorListEntry[] = [];
	if (connected.length > 0) {
		entries.push({
			type: 'group-header',
			id: 'connectors-connected',
			group: 'connected',
			label: localize('connectors.connected', "Connected"),
			count: connected.length,
			isFirst: true,
		}, ...connected.map(connector => ({ type: 'connector-item' as const, connector })));
	}
	if (available.length > 0) {
		entries.push({
			type: 'group-header',
			id: 'connectors-available',
			group: 'available',
			label: localize('connectors.available', "Available"),
			count: available.length,
			isFirst: connected.length === 0,
		}, ...available.map(connector => ({ type: 'connector-item' as const, connector })));
	}
	return entries;
}

class ConnectorItemDelegate implements IListVirtualDelegate<ConnectorListEntry> {
	getHeight(element: ConnectorListEntry): number {
		return element.type === 'group-header'
			? element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR
			: CONNECTOR_ITEM_HEIGHT;
	}

	getTemplateId(element: ConnectorListEntry): string {
		return element.type === 'group-header' ? 'connectorGroupHeader' : 'connectorItem';
	}
}

interface IConnectorGroupHeaderTemplateData {
	readonly label: HTMLElement;
	readonly count: HTMLElement;
}

class ConnectorGroupHeaderRenderer implements IListRenderer<IConnectorGroupEntry, IConnectorGroupHeaderTemplateData> {
	readonly templateId = 'connectorGroupHeader';

	renderTemplate(container: HTMLElement): IConnectorGroupHeaderTemplateData {
		container.classList.add('connector-section-header');
		const headingRow = DOM.append(container, $('.plugin-card-section-heading-row'));
		const label = DOM.append(headingRow, $('h3.plugin-card-section-title'));
		const count = DOM.append(headingRow, $('.plugin-card-section-count'));
		return { label, count };
	}

	renderElement(element: IConnectorGroupEntry, _index: number, templateData: IConnectorGroupHeaderTemplateData): void {
		templateData.label.textContent = element.label;
		templateData.count.textContent = String(element.count);
	}

	disposeTemplate(_templateData: IConnectorGroupHeaderTemplateData): void { }
}

interface IConnectorItemTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly status: HTMLElement;
	readonly action: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

class ConnectorItemRenderer implements IListRenderer<IConnectorItemEntry, IConnectorItemTemplateData> {
	readonly templateId = 'connectorItem';

	constructor(
		private readonly runAction: (connector: IConnectorPresentation) => void,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IConnectorItemTemplateData {
		container.classList.add('connector-list-item');
		const details = DOM.append(container, $('.connector-list-item-details.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const name = DOM.append(nameRow, $('.connector-list-item-name.plugin-list-item-name'));
		const statusElement = DOM.append(nameRow, $('.plugin-list-item-status.mcp-runtime-status-badge'));
		const description = DOM.append(details, $('.connector-list-item-description.plugin-list-item-description'));
		const trailing = DOM.append(container, $('.connector-list-item-trailing'));
		const actionContainer = DOM.append(trailing, $('.connector-list-item-action'));
		const action = new Button(actionContainer, { ...defaultButtonStyles, secondary: true });
		const templateDisposables = new DisposableStore();
		templateDisposables.add(action);
		return { container, name, description, status: statusElement, action, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(element: IConnectorItemEntry, _index: number, templateData: IConnectorItemTemplateData): void {
		templateData.elementDisposables.clear();
		const { connector } = element;
		templateData.name.textContent = connector.displayName;
		templateData.description.textContent = connector.description;
		templateData.status.textContent = getConnectorStatusLabel(connector.connectionStatus);
		templateData.status.className = 'plugin-list-item-status mcp-runtime-status-badge';
		const statusClass = getConnectorStatusClass(connector.connectionStatus);
		if (statusClass) {
			templateData.status.classList.add(statusClass);
		}
		const action = getConnectorPrimaryAction(connector.connectionStatus);
		templateData.action.label = getConnectorActionLabel(action);
		templateData.action.setTitle(localize('connectors.actionFor', "{0} {1}", getConnectorActionLabel(action), connector.displayName));
		templateData.elementDisposables.add(templateData.action.onDidClick(event => {
			event?.stopPropagation();
			this.runAction(connector);
		}));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.name, () => ({ content: connector.displayName })));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.description, () => ({ content: connector.description })));
	}

	disposeElement(_element: IConnectorItemEntry, _index: number, templateData: IConnectorItemTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IConnectorItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

export function getConnectorStatusClass(connectionStatus: ConnectorConnectionStatus): string | undefined {
	switch (connectionStatus) {
		case 'connected':
			return 'running';
		case 'pending':
			return 'starting';
		case 'error':
			return 'error';
		case 'not_connected':
			return undefined;
	}
}

export function getConnectorStatusLabel(connectionStatus: ConnectorConnectionStatus): string {
	switch (connectionStatus) {
		case 'connected':
			return localize('connectors.status.connected', "Connected");
		case 'pending':
			return localize('connectors.status.pending', "Connection pending");
		case 'error':
			return localize('connectors.status.error', "Needs attention");
		case 'not_connected':
			return localize('connectors.status.notConnected', "Not connected");
	}
}

export function getConnectorActionLabel(action: ConnectorPrimaryAction): string {
	switch (action) {
		case 'connect':
			return localize('connectors.action.connect', "Connect");
		case 'refresh':
			return localize('connectors.action.refresh', "Refresh");
		case 'disconnect':
			return localize('connectors.action.disconnect', "Disconnect");
		case 'reconnect':
			return localize('connectors.action.reconnect', "Reconnect");
	}
}

export class ConnectorsListWidget extends Disposable {
	readonly element: HTMLElement;

	private readonly _onDidSelectConnector = this._register(new Emitter<IConnectorPresentation>());
	readonly onDidSelectConnector = this._onDidSelectConnector.event;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly list: WorkbenchList<ConnectorListEntry>;
	private readonly searchInput: InputBox;
	private readonly stateContainer: HTMLElement;
	private readonly listContainer: HTMLElement;
	private connectors: readonly IConnectorPresentation[] = [];
	private available = true;
	private visible = false;
	private loading = false;
	private lastHeight = 0;
	private lastWidth = 0;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@IConnectorsManagementService private readonly connectorsService: IConnectorsManagementService,
		@IHoverService hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = $('.connectors-list-widget.mcp-list-widget.plugin-list-widget');

		const header = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = localize('connectors.title', "Connectors");
		const description = DOM.append(header, $('p.section-title-description'));
		DOM.append(description, $('span.section-title-description-text')).textContent = localize(
			'connectors.description',
			"Connect services to give agents secure access to your work and data."
		);

		const searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));
		const searchContainer = DOM.append(searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('connectors.searchPlaceholder', "Search connectors..."),
			ariaLabel: localize('connectors.searchAriaLabel', "Search connectors"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(() => this.render()));

		this.stateContainer = DOM.append(this.element, $('.connectors-state'));
		this.stateContainer.setAttribute('role', 'status');
		this.stateContainer.setAttribute('aria-live', 'polite');
		this.listContainer = DOM.append(this.element, $('.connectors-list-container'));
		this.list = this._register(instantiationService.createInstance(
			WorkbenchList<ConnectorListEntry>,
			'ConnectorsManagementList',
			this.listContainer,
			new ConnectorItemDelegate(),
			[
				new ConnectorGroupHeaderRenderer(),
				new ConnectorItemRenderer(connector => void this.runConnectorAction(connector, getConnectorPrimaryAction(connector.connectionStatus)), hoverService),
			],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				openOnSingleClick: true,
				identityProvider: {
					getId: element => element.type === 'group-header' ? element.id : element.connector.id,
				},
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('connectors.listAriaLabel', "Connectors"),
					getAriaLabel: element => element.type === 'group-header'
						? element.count === 1
							? localize('connectors.groupAriaLabelSingular', "{0}, 1 connector", element.label)
							: localize('connectors.groupAriaLabelPlural', "{0}, {1} connectors", element.label, element.count)
						: localize(
							'connectors.itemAriaLabel',
							"{0}. {1} Status: {2}. {3}",
							element.connector.displayName,
							element.connector.description,
							getConnectorStatusLabel(element.connector.connectionStatus),
							getConnectorActionLabel(getConnectorPrimaryAction(element.connector.connectionStatus))
						),
				},
			}
		));
		this._register(this.list.onDidOpen(event => {
			if (event.element?.type === 'connector-item') {
				this._onDidSelectConnector.fire(event.element.connector);
			}
		}));
		this._register(this.connectorsService.onDidChangeConnectors(() => {
			if (this.visible) {
				void this.load();
			}
		}));
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (visible) {
			void this.load();
		}
	}

	focusSearch(): void {
		this.searchInput.focus();
	}

	layout(height: number, width: number): void {
		this.lastHeight = height;
		this.lastWidth = width;
		const listTop = this.listContainer.offsetTop;
		this.list.layout(Math.max(0, height - listTop), width);
		this.element.classList.toggle('narrow-layout', width < 500);
	}

	private async load(): Promise<void> {
		this.loading = true;
		this.render();
		try {
			const snapshot = await this.connectorsService.getConnectors();
			this.available = snapshot.available;
			this.connectors = snapshot.connectors;
		} catch (error) {
			this.available = true;
			this.connectors = [];
			this.notificationService.error(localize('connectors.loadFailed', "Unable to load connectors: {0}", error instanceof Error ? error.message : String(error)));
		} finally {
			this.loading = false;
			this.render();
		}
	}

	private render(): void {
		const entries = filterAndGroupConnectors(this.connectors, this.searchInput.value);
		this.list.splice(0, this.list.length, entries);
		this._onDidChangeItemCount.fire(this.connectors.length);
		this.listContainer.style.display = entries.length > 0 ? '' : 'none';
		this.stateContainer.style.display = entries.length > 0 ? 'none' : '';
		this.stateContainer.textContent = this.loading
			? localize('connectors.loading', "Loading connectors...")
			: !this.available
				? localize('connectors.unavailable', "Connectors are not available in this build.")
				: this.connectors.length === 0
					? localize('connectors.empty', "No connectors are available.")
					: localize('connectors.noResults', "No connectors match your search.");
		if (!this.loading) {
			status(localize('connectors.resultCount', "{0} connectors shown", entries.filter(entry => entry.type === 'connector-item').length));
		}
		if (this.lastHeight > 0) {
			this.layout(this.lastHeight, this.lastWidth);
		}
	}

	private async runConnectorAction(connector: IConnectorPresentation, action: ConnectorPrimaryAction): Promise<void> {
		try {
			switch (action) {
				case 'connect':
				case 'reconnect':
					await this.connectorsService.connect(connector.id);
					break;
				case 'refresh':
					await this.connectorsService.refresh(connector.id);
					break;
				case 'disconnect':
					await this.connectorsService.disconnect(connector.id);
					break;
			}
			await this.load();
			status(localize('connectors.actionComplete', "{0}: {1}", connector.displayName, getConnectorActionLabel(action)));
		} catch (error) {
			this.notificationService.error(localize(
				'connectors.actionFailed',
				"Unable to update {0}: {1}",
				connector.displayName,
				error instanceof Error ? error.message : String(error)
			));
		}
	}
}
