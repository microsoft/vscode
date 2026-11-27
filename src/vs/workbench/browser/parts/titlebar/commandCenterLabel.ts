/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IFolderLocation } from '../../../../platform/workspace/common/folderLocations.js';

/**
 * Renders the label of the command center into an element. While the folder is at an alternate location this is
 * the name and a group with the location's icon and label, as the Explorer and the status bar show it.
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

		const name = document.createElement('span');
		name.classList.add('folder-location-name');
		name.textContent = text;
		const separator = document.createElement('span');
		separator.classList.add('folder-location-separator');
		separator.ariaHidden = 'true';
		separator.textContent = '·';
		const locationGroup = document.createElement('span');
		locationGroup.classList.add('folder-location-group');
		const tooltip = location.description
			? localize('label.folderLocationTooltipWithDescription', "{0} (alternate location of '{1}')\n{2}", location.label, text, location.description)
			: localize('label.folderLocationTooltip', "{0} (alternate location of '{1}')", location.label, text);
		this.hovers.value = this.hoverService.setupManagedHover(this.hoverDelegate, locationGroup, tooltip);
		const icon = renderIcon(location.icon);
		icon.classList.add('folder-location-icon');
		icon.ariaHidden = 'true';
		const locationLabel = document.createElement('span');
		locationLabel.classList.add('folder-location-label');
		locationLabel.textContent = location.label;
		locationGroup.append(icon, locationLabel);
		labelElement.setAttribute('aria-label', localize('label.withFolderLocation', "{0}, Folder Location, {1}", text, location.label));
		labelElement.replaceChildren(name, separator, locationGroup);
	}
}
