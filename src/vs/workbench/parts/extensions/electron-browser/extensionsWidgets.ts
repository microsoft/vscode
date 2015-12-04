/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { IPluginService, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import { IMessageService } from 'vs/platform/message/common/message';

var $ = dom.emmet;

export class ExtensionsStatusbarItem implements statusbar.IStatusbarItem {

	private toDispose: lifecycle.IDisposable[];
	private severity: Severity;
	private domNode: HTMLElement;
	private status: { [id: string]: IPluginStatus };

	constructor(
		@IPluginService private pluginService: IPluginService,
		@IMessageService private messageService: IMessageService
	) {
		this.toDispose = [];
		this.severity = Severity.Ignore;

		this.pluginService.onReady().then(() => {
			this.status = this.pluginService.getPluginsStatus();
			Object.keys(this.status).forEach(key => {
				this.severity = this.status[key].messages.reduce((maxSeverity, message) => Math.max(maxSeverity, message.type), this.severity);
			});
			this.domNode.hidden = this.severity === Severity.Ignore;
		});
	}

	public render(container: HTMLElement): lifecycle.IDisposable {
		this.domNode = dom.append(container, $('.extensions-statusbar octicon octicon-package'));
		this.domNode.title = nls.localize('extensionsStatus', "Extensions Status"),
		this.domNode.hidden = true;
		this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
			Object.keys(this.status).forEach(key => {
				this.status[key].messages.forEach(m => {
					if (m.type === this.severity) {
						this.messageService.show(m.type, m.message);
					}
				});
			});
		}));

		return {
			dispose: () => lifecycle.disposeAll(this.toDispose)
		};
	}
}
