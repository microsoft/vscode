/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import errors = require('vs/base/common/errors');
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { IPluginService } from 'vs/platform/plugins/common/plugins';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';

var $ = dom.emmet;

export class ExtensionsStatusbarItem implements statusbar.IStatusbarItem {

	private toDispose: lifecycle.IDisposable[];
	private domNode: HTMLElement;

	constructor(
		@IPluginService pluginService: IPluginService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		this.toDispose = [];

		pluginService.onReady().then(() => {
			const pluginsStatus = pluginService.getPluginsStatus();
			Object.keys(pluginsStatus).forEach(key => {
				const severity = pluginsStatus[key].messages.reduce((maxSeverity, message) => Math.max(maxSeverity, message.type), Severity.Ignore);
				this.domNode.classList.add(Severity[severity].toLowerCase());
			});
		});
	}

	public render(container: HTMLElement): lifecycle.IDisposable {
		this.domNode = dom.append(container, $('.extensions-statusbar octicon octicon-package'));
		this.domNode.title = nls.localize('extensions', "Extensions"),
		this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
			this.quickOpenService.show('>extensions: ').done(null, errors.onUnexpectedError);
		}));

		return {
			dispose: () => lifecycle.disposeAll(this.toDispose)
		};
	}
}
