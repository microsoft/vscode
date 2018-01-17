/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { Disposable, toDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, InstallExtensionEvent, DidInstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { localize } from 'vs/nls';
import { getIdFromLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

export class InstallingStatusItem extends Disposable implements IStatusbarItem {

	private statusElement: HTMLElement;
	private installingExtensions: string[] = [];

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService
	) {
		super();
		this.statusElement = DOM.$('div');
		this.statusElement.style.display = 'none';

		this._register(extensionManagementService.onInstallExtension(e => this.onInstallingExtension(e)));
		this._register(extensionManagementService.onDidInstallExtension(e => this.onDidInstallExtension(e)));
	}

	render(parent: HTMLElement): IDisposable {
		parent.appendChild(this.statusElement);
		return toDisposable(() => this.dispose());
	}

	private onInstallingExtension(e: InstallExtensionEvent): void {
		this.statusElement.style.display = 'block';
		this.installingExtensions.push(getIdFromLocalExtensionId(e.identifier.id));

		if (this.installingExtensions.length === 1) {
			this.statusElement.textContent = localize('installingExtension', "Installing {0}", this.installingExtensions[0]);
		} else {
			this.statusElement.textContent = localize('installingExtensions', "Installing {0} extensions", this.installingExtensions.length);
		}
	}

	private onDidInstallExtension(e: DidInstallExtensionEvent): void {
		const index = this.installingExtensions.indexOf(getIdFromLocalExtensionId(e.identifier.id));
		if (index !== -1) {
			this.installingExtensions.splice(index, 1);
			if (this.installingExtensions.length === 0) {
				this.statusElement.textContent = '';
				this.statusElement.style.display = 'none';
			} else if (this.installingExtensions.length === 1) {
				this.statusElement.textContent = localize('installingExtension', "Installing {0}", this.installingExtensions[0]);
			} else {
				this.statusElement.textContent = localize('installingExtensions', "Installing {0} extensions", this.installingExtensions.length);
			}

		}
	}

}