/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import {forEach} from 'vs/base/common/collections';
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import {onUnexpectedError} from 'vs/base/common/errors';
import { Action } from 'vs/base/common/actions';
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { IPluginService, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { UninstallAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IExtensionsService, IExtension, IExtensionTipsService } from 'vs/workbench/parts/extensions/common/extensions';
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
			const extensionLabel = nls.localize('extension', "extension");
			this.domNode.title = `${ this.messageCount } ${ extensionLabel } ${ issueLabel }`;
			this.domNode.textContent = `${ this.messageCount } ${ issueLabel }`;

			this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
				this.extensionsService.getInstalled().done(installed => {
					Object.keys(this.status).forEach(key => {
						this.status[key].messages.forEach(m => {
							if (m.type > Severity.Info) {
								const extension = installed.filter(ext => ext.path === m.source).pop();
								const actions = [CloseAction];
								const name = (extension && extension.name) || m.source;
								const message = `${ name }: ${ m.message }`;

								if (extension) {
									const actionLabel = nls.localize('uninstall', "Uninstall");
									actions.push(new Action('extensions.uninstall2', actionLabel, null, true, () => this.instantiationService.createInstance(UninstallAction).run(extension)));
								}

								this.messageService.show(m.type, { message, actions });
							}
						});
					});
				}, onUnexpectedError);
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
	private _previousTips: { [id: string]: number };

	constructor(
		@IQuickOpenService private _quickOpenService: IQuickOpenService,
		@IExtensionTipsService private _extensionTipsService: IExtensionTipsService,
		@IStorageService private _storageService: IStorageService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@ITelemetryService private _telemetryService: ITelemetryService
	) {
		// previously shown tips, not older than 28 days
		this._previousTips = JSON.parse(this._storageService.get('extensionsAssistant/tips', StorageScope.GLOBAL, '{}'));
		const now = Date.now();
		forEach(this._previousTips, (entry, rm) => {
			if (now - entry.value > ExtensionTipsStatusbarItem._dontSuggestAgainTimeout) {
				rm();
			}
		});

		// show/hide tips depending on configuration
		let localDispose: lifecycle.Disposable[] = [];
		let update = () => {
			localDispose = lifecycle.disposeAll(localDispose);
			this._configurationService.loadConfiguration('extensions').then(value => {
				if (value && value.showTips === true) {
					this._extensionTipsService.onDidChangeTips(this._onTips, this, localDispose);
					this._onTips(this._extensionTipsService.tips);
				} else {
					this._onTips([]);
				}
			}, onUnexpectedError);
			this._configurationService.onDidUpdateConfiguration(update, this, localDispose);
		};
		update();
	}

	private _onTips(tips: IExtension[]): void {
		if (!this._domNode) {
			return;
		}

		if (tips.length === 0) {
			dom.addClass(this._domNode, 'disabled');
			return;
		}

		function extid(ext: IExtension): string {
			return `${ext.publisher}.${ext.name}@${ext.version}`;
		}

		// check for new tips
		let hasNewTips = false;
		for (let tip of tips) {
			const id = extid(tip);
			if (!this._previousTips[id]) {
				this._previousTips[id] = Date.now();
				hasNewTips = true;
			}
		}
		if (hasNewTips) {
			dom.removeClass(this._domNode, 'disabled');
			this._telemetryService.publicLog('extensionGallery:tips', { hintingTips: true });
		}
	}

	public render(container: HTMLElement): lifecycle.IDisposable {

		this._domNode = document.createElement('a');
		this._domNode.className = 'extensions-suggestions disabled';
		this._label = new OcticonLabel(this._domNode);
		this._label.text = '$(light-bulb) extension tips';
		container.appendChild(this._domNode);

		return dom.addDisposableListener(this._domNode, 'click', event => this._onClick(event));
	}

	private _onClick(event: MouseEvent): void {
		this._storageService.store('extensionsAssistant/tips', JSON.stringify(this._previousTips), StorageScope.GLOBAL);
		this._telemetryService.publicLog('extensionGallery:tips', { revealingTips: true });
		this._quickOpenService.show('ext tips ').then(() => dom.addClass(this._domNode, 'disabled'));
	}
}