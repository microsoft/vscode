/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IFolderLocation } from '../../../../platform/workspace/common/folderLocations.js';

/**
 * Renders the label of the command center into an element. While the folder is at an alternate location this is
 * the location's icon, the name and a branch-style group with the location description.
 */
export class CommandCenterLabel extends Disposable {

	private readonly hovers = this._register(new MutableDisposable());

	constructor(
		private readonly labelElement: HTMLElement,
		private readonly hoverDelegate: IHoverDelegate,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();
	}

	update(text: string, location: IFolderLocation | undefined): void {
		this.hovers.clear();
		const labelElement = this.labelElement;
		labelElement.classList.toggle('has-folder-location', !!location);
		labelElement.removeAttribute('aria-label');
		if (!location) {
			labelElement.textContent = text;
			return;
		}

		const description = location.description;
		const nameGroup = document.createElement('span');
		nameGroup.classList.add('folder-location-name-group');
		const icon = renderIcon(location.icon ?? Codicon.gitBranchCheckout);
		icon.classList.add('folder-location-icon');
		icon.ariaHidden = 'true';
		const name = document.createElement('span');
		name.classList.add('folder-location-name');
		name.textContent = text;
		nameGroup.append(icon, name);
		const children: HTMLElement[] = [nameGroup];

		if (description) {
			const separator = document.createElement('span');
			separator.classList.add('folder-location-separator');
			separator.ariaHidden = 'true';
			separator.textContent = '·';
			const branchGroup = document.createElement('span');
			branchGroup.classList.add('folder-location-branch-group');
			this.hovers.value = this.hoverService.setupManagedHover(this.hoverDelegate, branchGroup, description);
			const branchIcon = renderIcon(Codicon.gitBranchCompact);
			branchIcon.classList.add('folder-location-branch-icon');
			branchIcon.ariaHidden = 'true';
			const branch = document.createElement('span');
			branch.classList.add('folder-location-branch');
			branch.textContent = description;
			branchGroup.append(branchIcon, branch);
			children.push(separator, branchGroup);
			labelElement.setAttribute('aria-label', localize('label.withFolderLocationBranch', "{0}, branch {1}", text, description));
		} else {
			labelElement.setAttribute('aria-label', text);
		}
		labelElement.replaceChildren(...children);
	}
}
