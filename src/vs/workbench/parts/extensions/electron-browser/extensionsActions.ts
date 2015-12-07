/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import { Promise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IPluginService, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import { NumberBadge } from 'vs/workbench/services/activity/common/activityService';
import { ActivityActionItem } from 'vs/workbench/browser/parts/activityBar/activityAction';
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

export class GlobalExtensionsAction extends Action {
	static ID = 'workbench.extensions.action.globalExtensions';
	static LABEL = nls.localize('extensions', "Extensions");

	constructor(
		id: string,
		label: string,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, 'extensions', true);
	}

	public run(): Promise {
		return this.quickOpenService.show('ext install ');
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class GlobalExtensionsActionItem extends ActivityActionItem {
	private status: { [id: string]: IPluginStatus };
	private severity: Severity;
	private messageCount: number;

	constructor(
		private pluginService: IPluginService,
		action: Action
	) {
		super(action);
		this.severity = Severity.Ignore;
		this.messageCount = 0;

		this.pluginService.onReady().then(() => {
			this.status = this.pluginService.getPluginsStatus();
			Object.keys(this.status).forEach(key => {
				this.severity = this.status[key].messages.reduce((maxSeverity, message) => Math.max(maxSeverity, message.type), this.severity);
				this.messageCount += this.status[key].messages.length;
			});

			if (this.severity > Severity.Info) {
				this.setBadge(new NumberBadge(this.messageCount, () => nls.localize('extensionsMessages', "There are extensions messages")));
			}
		});
	}
}
