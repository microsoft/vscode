/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import { emmet as $, append, toggleClass } from 'vs/base/browser/dom';
import lifecycle = require('vs/base/common/lifecycle');
import { onUnexpectedPromiseError as _ } from 'vs/base/common/errors';
import { assign } from 'vs/base/common/objects';
import { Action } from 'vs/base/common/actions';
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { IExtensionService, IMessage } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { UninstallAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IExtensionsService, commandCategory } from 'vs/workbench/parts/extensions/common/extensions';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';

interface IState {
	errors: IMessage[];
}

export class ExtensionsStatusbarItem implements statusbar.IStatusbarItem {

	private domNode: HTMLElement;
	private state: IState = { errors: [] };

	constructor(
		@IExtensionService private extensionService: IExtensionService,
		@IMessageService private messageService: IMessageService,
		@IExtensionsService protected extensionsService: IExtensionsService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IQuickOpenService protected quickOpenService: IQuickOpenService
	) {}

	render(container: HTMLElement): lifecycle.IDisposable {
		this.domNode = append(container, $('a.extensions-statusbar'));
		this.domNode.onclick = () => this.onClick();

		append(this.domNode, $('span.octicon.octicon-package'));

		_(this.extensionService.onReady()).done(() => {
			const status = this.extensionService.getExtensionsStatus();
			const errors = Object.keys(status)
				.map(k => status[k].messages)
				.reduce((r, m) => r.concat(m), [])
				.filter(m => m.type > Severity.Info);

			this.updateState({ errors });
		});

		return null;
	}

	private updateState(obj: any): void {
		this.state = assign(this.state, obj);
		this.onStateChange();
	}

	private onStateChange(): void {
		toggleClass(this.domNode, 'has-errors', this.state.errors.length > 0);

		if (this.state.errors.length > 0) {
			const issueLabel = this.state.errors.length > 1 ? nls.localize('issues', "issues") : nls.localize('issue', "issue");
			const extensionLabel = nls.localize('extension', "extension");
			this.domNode.title = `${ this.state.errors.length } ${ extensionLabel } ${ issueLabel }`;
		} else {
			this.domNode.title = nls.localize('extensions', "Extensions");
		}
	}

	private onClick(): void {
		if (this.state.errors.length > 0) {
			this.showErrors(this.state.errors);
			this.updateState({ errors: [] });
		} else {
			this.quickOpenService.show(`>${commandCategory}: `);
		}
	}

	private showErrors(errors: IMessage[]): void {
		_(this.extensionsService.getInstalled()).done(installed => {
			errors.forEach(m => {
				const extension = installed.filter(ext => ext.path === m.source).pop();
				const actions = [CloseAction];
				const name = (extension && extension.name) || m.source;
				const message = `${ name }: ${ m.message }`;

				if (extension) {
					const actionLabel = nls.localize('uninstall', "Uninstall");
					actions.push(new Action('extensions.uninstall2', actionLabel, null, true, () => this.instantiationService.createInstance(UninstallAction).run(extension)));
				}

				this.messageService.show(m.type, { message, actions });
			});
		});
	}
}