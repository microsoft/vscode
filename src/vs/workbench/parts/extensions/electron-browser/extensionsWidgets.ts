/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import {forEach} from 'vs/base/common/collections';
import errors = require('vs/base/common/errors');
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import { Action } from 'vs/base/common/actions';
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { IPluginService, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { UninstallAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IExtensionsService, IGalleryService, IExtension, IExtensionTipsService } from 'vs/workbench/parts/extensions/common/extensions';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';

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
			const issueLabel = this.messageCount > 1 ? nls.localize('issues', "issues") : nls.localize('issue', "issue");
			const extensionLabel = nls.localize('extension', "extension")
			this.domNode.title = `${ this.messageCount } ${ extensionLabel } ${ issueLabel }`;
			this.domNode.textContent = `${ this.messageCount } ${ issueLabel }`;

			this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
				this.extensionsService.getInstalled().done(installed => {
					Object.keys(this.status).forEach(key => {
						this.status[key].messages.forEach(m => {
							if (m.type > Severity.Info) {
								const extension = installed.filter(ext => ext.path === m.source).pop();
								const actions = [CloseAction];
								if (extension) {
									const actionLabel = nls.localize('uninstall', "Uninstall") + ' ' + (extension.name ? extension.name : 'Extension');
									actions.push(new Action('extensions.uninstall2', actionLabel, null, true, () => this.instantiationService.createInstance(UninstallAction).run(extension)));
								}

								this.messageService.show(m.type, {
									message:  ( m.source ? '[' + m.source + ']: ' : '') + m.message,
									actions
								});
							}
						});
					});
				}, errors.onUnexpectedError);
			}));
		}

		return {
			dispose: () => lifecycle.disposeAll(this.toDispose)
		};
	}
}

export class ExtensionTipsStatusbarItem implements statusbar.IStatusbarItem {

	private static _dontSuggestAgainTimeout = 1000 * 60 * 60 * 24 * 28; // 4 wks

	private _domNode: HTMLElement;
	private _label: OcticonLabel;

	constructor(
		@IQuickOpenService private _quickOpenService: IQuickOpenService,
		@IExtensionTipsService private _extensionTipsService: IExtensionTipsService,
		@IStorageService private _storageService: IStorageService
	) {

		const previousTips = <{ [id: string]: number }>JSON.parse(this._storageService.get('extensionsAssistant/tips', StorageScope.GLOBAL, '{}'));

		// forget previous tips after 28 days
		const now = Date.now();
		forEach(previousTips, (entry, rm) => {
			if (now - entry.value > ExtensionTipsStatusbarItem._dontSuggestAgainTimeout) {
				rm();
			}
		});

		function extid(ext: IExtension): string {
			return `${ext.publisher}.${ext.name}@${ext.version}`;
		};

		this._extensionTipsService.onDidChangeTips(tips => {

			if (tips.length === 0) {
				dom.removeClass(this._domNode, 'active');
				return;
			}

			// check for new tips
			let hasNewTips = false;
			for (let tip of tips) {
				const id = extid(tip);
				if (!previousTips[id]) {
					previousTips[id] = Date.now();
					hasNewTips = true;
				}
			}
			if (hasNewTips) {
				dom.addClass(this._domNode, 'active');
				this._storageService.store('extensionsAssistant/tips', JSON.stringify(previousTips), StorageScope.GLOBAL);
			}
		});
	}

	public render(container: HTMLElement): lifecycle.IDisposable {

		this._domNode = document.createElement('a');
		this._domNode.className = 'extensions-suggestions';
		this._label = new OcticonLabel(this._domNode);
		this._label.text = '$(light-bulb) extension tips';
		container.appendChild(this._domNode);

		return dom.addDisposableListener(this._domNode, 'click', event => this._onClick(event));
	}

	private _onClick(event: MouseEvent): void {
		this._quickOpenService.show('ext tips ').then(() => dom.removeClass(this._domNode, 'active'));
	}
}