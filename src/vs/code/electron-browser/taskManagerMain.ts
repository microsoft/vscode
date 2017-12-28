/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { localize } from 'vs/nls';
import { DefaultDragAndDrop, DefaultAccessibilityProvider, DefaultController, DefaultFilter, DefaultSorter } from 'vs/base/parts/tree/browser/treeDefaults';
import { IDataSource, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { TPromise } from 'vs/base/common/winjs.base';
import { listProcesses, ProcessItem } from 'vs/base/node/ps';
import { remote } from 'electron';
import * as dom from 'vs/base/browser/dom';

const $ = dom.$;

class TaskManagerDataSource implements IDataSource {

	public getId(tree: ITree, element: ProcessItem): string {
		return element.pid.toString();
	}

	public hasChildren(tree: ITree, element: ProcessItem): boolean {
		return element.children && element.children.length > 0;
	}

	public getChildren(tree: ITree, element: ProcessItem): TPromise<any> {
		return TPromise.as(element.children || []);
	}

	public getParent(tree: ITree, element: ProcessItem): TPromise<any> {
		return TPromise.as(null);
	}

	public shouldAutoexpand?(tree: ITree, element: ProcessItem): boolean {
		return true;
	}
}

interface IProcessItemTemplateData {
	label: HTMLElement;
}

class TaskManagerRenderer implements IRenderer {

	static readonly PROCESS_ITEM_TEMPLATE = 'processItem.template';

	public getHeight(tree: ITree, element: ProcessItem): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: ProcessItem): string {
		return TaskManagerRenderer.PROCESS_ITEM_TEMPLATE;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		let data: IProcessItemTemplateData = Object.create(null);
		data.label = dom.append(container, $('.item'));

		return data;
	}

	public renderElement(tree: ITree, element: ProcessItem, templateId: string, templateData: IProcessItemTemplateData): void {
		templateData.label.textContent = element.name;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// No-op
	}
}

export function startup() {
	const tree = new Tree(window.document.body, {
		accessibilityProvider: new DefaultAccessibilityProvider(),
		controller: new DefaultController(),
		dataSource: new TaskManagerDataSource(),
		dnd: new DefaultDragAndDrop(),
		filter: new DefaultFilter(),
		sorter: new DefaultSorter(),
		renderer: new TaskManagerRenderer()
	}, {
			alwaysFocused: true,
			ariaLabel: localize('taskManager', "Task Manager"),
		});

	setInterval(() => listProcesses(remote.process.pid).then(processes => tree.setInput(processes)), 1000);
}