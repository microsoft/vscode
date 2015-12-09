/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { Promise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import Severity from 'vs/base/common/severity';
import { IPluginService, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import { IMessageService } from 'vs/platform/message/common/message';
import { IExtensionsService } from 'vs/workbench/parts/extensions/common/extensions';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';

export class ListExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listExtensions';
	static LABEL = nls.localize('showInstalledExtensions', "Show Installed Extensions");

	constructor(
		id: string,
		label: string,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	public run(): Promise {
		return this.quickOpenService.show('ext ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowExtensionsStatusAction extends Action {

	static ID = 'workbench.extensions.action.showExtensionsStatus';
	static LABEL = nls.localize('showInstalledExtensions', "Show Extensions Status");
	private status: { [id: string]: IPluginStatus };

	constructor(
		id: string,
		label: string,
		@IPluginService pluginService: IPluginService,
		@IMessageService private messageService: IMessageService

	) {
		super(id, label, null, true);

		pluginService.onReady().then(() => {
			this.status = pluginService.getPluginsStatus();
		});
	}

	public run(): Promise {
		Object.keys(this.status).forEach(key => {
			this.status[key].messages.forEach(m => {
				if (m.type > Severity.Ignore) {
					this.messageService.show(m.type, m.message);
				}
			});
		});

		return Promise.as(null);
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class InstallExtensionAction extends Action {

	static ID = 'workbench.extensions.action.installExtension';
	static LABEL = nls.localize('installExtension', "Install Extension");

	constructor(
		id: string,
		label: string,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	public run(): Promise {
		return this.quickOpenService.show('ext install ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ListOutdatedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listOutdatedExtensions';
	static LABEL = nls.localize('showOutdatedExtensions', "Show Outdated Extensions");

	constructor(
		id: string,
		label: string,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, null, true);
	}

	public run(): Promise {
		return this.quickOpenService.show('ext update ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}
