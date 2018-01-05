/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/taskManager';

import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { localize } from 'vs/nls';
import { IDataSource, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { TPromise } from 'vs/base/common/winjs.base';
import { listProcesses, ProcessItem } from 'vs/base/node/ps';
import { remote } from 'electron';
import * as dom from 'vs/base/browser/dom';
import { pad } from 'vs/base/common/strings';
import { totalmem } from 'os';

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
		const data: IProcessItemTemplateData = Object.create(null);
		data.label = dom.append(container, $('.process-item'));

		return data;
	}

	public renderElement(tree: ITree, item: ProcessItem, templateId: string, templateData: IProcessItemTemplateData): void {
		const MB = 1024 * 1024;

		const memory = process.platform === 'win32' ? item.mem : (totalmem() * (item.mem / 100));
		templateData.label.textContent = `${item.name}\t${pad(Number(item.load.toFixed(0)), 5, ' ')}\t${pad(Number((memory / MB).toFixed(0)), 6, ' ')}\t${pad(Number((item.pid).toFixed(0)), 6, ' ')}`;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// No-op
	}
}

export function startup() {
	const tree = new Tree(window.document.body, {
		dataSource: new TaskManagerDataSource(),
		renderer: new TaskManagerRenderer()
	}, {
			alwaysFocused: true,
			ariaLabel: localize('taskManager', "Task Manager"),
			twistiePixels: 20
		});

	setInterval(() => listProcesses(remote.process.pid).then(processes => {
		const focus = tree.getFocus();
		const selection = tree.getSelection();
		tree.setInput(processes).then(() => {
			tree.setFocus(focus);
			tree.setSelection(selection);
		});
	}), 1000);
}