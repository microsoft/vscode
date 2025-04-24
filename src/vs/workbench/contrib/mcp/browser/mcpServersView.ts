/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { WrappedList } from '../../../../base/browser/ui/list/wrappedListWidget.js';
import { combinedDisposable, Disposable, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { DefaultIconPath } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IWorkbenchMcpServer, McpServerContainers } from '../common/mcpTypes.js';
import { AddAction } from './mcpServerActions.js';
import { PublisherWidget, InstallCountWidget, RatingsWidget } from './mcpServerWidgets.js';

export class McpServersView extends Disposable {

	readonly element: HTMLElement;

	private readonly list: WrappedList<IWorkbenchMcpServer>;

	constructor(
		parent: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.element = dom.append(parent, dom.$('.mcp-servers-view'));
		this.list = this._register(new WrappedList<IWorkbenchMcpServer>('', this.element,
			{
				getDimension: () => new dom.Dimension(280, 96),
				getTemplateId: () => McpServerRenderer.templateId,
			},
			instantiationService.createInstance(McpServerRenderer)));
	}

	setElements(elements: IWorkbenchMcpServer[]): void {
		this.list.set(elements);
	}

	layout(dimension: dom.Dimension): void {
		this.list.layout(dimension.height, dimension.width);
	}

}

interface IMcpServerTemplateData {
	root: HTMLElement;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	installCount: HTMLElement;
	ratings: HTMLElement;
	mcpServer: IWorkbenchMcpServer | null;
	disposables: IDisposable[];
	mcpServerDisposables: IDisposable[];
	actionbar: ActionBar;
}

class McpServerRenderer implements IListRenderer<IWorkbenchMcpServer, IMcpServerTemplateData> {

	static readonly templateId = 'mcpServer';
	readonly templateId = McpServerRenderer.templateId;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	renderTemplate(root: HTMLElement): IMcpServerTemplateData {
		const element = dom.append(root, dom.$('.mcp-server-item'));
		const iconContainer = dom.append(element, dom.$('.icon-container'));
		const icon = dom.append(iconContainer, dom.$<HTMLImageElement>('img.icon', { alt: '' }));
		const details = dom.append(element, dom.$('.details-container'));
		const nameContainer = dom.append(details, dom.$('.name-container'));
		const name = dom.append(nameContainer, dom.$('span.name'));
		const publisherWidget = this.instantiationService.createInstance(PublisherWidget, dom.append(details, dom.$('.publisher-container')), true);
		const footerContainer = dom.append(details, dom.$('.footer-container'));
		const statsContainer = dom.append(footerContainer, dom.$('.stats-container'));
		const installCount = dom.append(statsContainer, dom.$('span.install-count'));
		const ratings = dom.append(statsContainer, dom.$('span.ratings'));
		const actionbar = new ActionBar(dom.append(footerContainer, dom.$('.actions-container')));

		actionbar.setFocusable(false);
		const actionBarListener = actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));

		const actions = [
			this.instantiationService.createInstance(AddAction),
		];

		const widgets = [
			publisherWidget,
			this.instantiationService.createInstance(InstallCountWidget, installCount, true),
			this.instantiationService.createInstance(RatingsWidget, ratings, true),
		];
		const extensionContainers: McpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets]);

		actionbar.push(actions, { icon: true, label: true });
		const disposable = combinedDisposable(...actions, ...widgets, actionbar, actionBarListener, extensionContainers);

		return {
			root, element, icon, name, installCount, ratings, disposables: [disposable], actionbar,
			mcpServerDisposables: [],
			set mcpServer(mcpServer: IWorkbenchMcpServer) {
				extensionContainers.mcpServer = mcpServer;
			}
		};
	}

	renderElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.element.classList.remove('loading');
		data.element.classList.remove('hidden');
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);

		if (!mcpServer) {
			data.element.classList.add('hidden');
			data.mcpServer = null;
			return;
		}

		data.root.setAttribute('data-mcp-server-id', mcpServer.id);
		data.mcpServerDisposables.push(dom.addDisposableListener(data.icon, 'error', () => data.icon.src = DefaultIconPath, { once: true }));
		data.icon.src = mcpServer.iconUrl;

		if (!data.icon.complete) {
			data.icon.style.visibility = 'hidden';
			data.icon.onload = () => data.icon.style.visibility = 'inherit';
		} else {
			data.icon.style.visibility = 'inherit';
		}

		data.name.textContent = mcpServer.label;

		data.installCount.style.display = '';
		data.ratings.style.display = '';
		data.mcpServer = mcpServer;
	}

	disposeElement(mcpServer: IWorkbenchMcpServer, index: number, data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
	}

	disposeTemplate(data: IMcpServerTemplateData): void {
		data.mcpServerDisposables = dispose(data.mcpServerDisposables);
		data.disposables = dispose(data.disposables);
	}
}
