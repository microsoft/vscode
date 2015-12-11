/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import errors = require('vs/base/common/errors');
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { IPluginService, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { UninstallAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';
import { IExtensionsService, IGalleryService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';

var $ = dom.emmet;

export class ExtensionsStatusbarItem implements statusbar.IStatusbarItem {

	private toDispose: lifecycle.IDisposable[];
	private domNode: HTMLElement;
	private status: { [id: string]: IPluginStatus };
	private container: HTMLElement;
	private messageCount: number;

	constructor(
		@IPluginService pluginService: IPluginService,
		@IMessageService private messageService: IMessageService,
		@IExtensionsService protected extensionsService: IExtensionsService,
		@IInstantiationService protected instantiationService: IInstantiationService

	) {
		this.toDispose = [];
		this.messageCount = 0;

		pluginService.onReady().then(() => {
			this.status = pluginService.getPluginsStatus();
			Object.keys(this.status).forEach(key => {
				this.messageCount += this.status[key].messages.filter(message => message.type > Severity.Info).length;
			});
			this.render(this.container);
		});
	}

	public render(container: HTMLElement): lifecycle.IDisposable {
		this.container = container;
		if (this.messageCount > 0) {
			this.domNode = dom.append(container, $('a.extensions-statusbar'));
			this.domNode.title = nls.localize('extensions', "Extensions"),
			this.domNode.textContent = `${ this.messageCount }`;

			this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
				Object.keys(this.status).forEach(key => {
					this.status[key].messages.forEach(m => {
						if (m.type > Severity.Ignore) {
							this.messageService.show(m.type, {
								message:  m.message,
								actions: [CloseAction, new actions.Action('extensions.uninstall2', nls.localize('uninstall', "Uninstall Extension"), null, true, () => {
									return this.extensionsService.getInstalled().then(installed => {
										const extension = installed.filter(ext => ext.path === m.source).pop();
										if (extension) {
											return this.instantiationService.createInstance(UninstallAction).run(extension);
										}
									});
								})]
							});
						}
					});
				});
			}));
		}

		return {
			dispose: () => lifecycle.disposeAll(this.toDispose)
		};
	}
}
