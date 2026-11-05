/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { themeColorFromId, ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ansiColorMap } from '../../../../../workbench/contrib/terminal/common/terminalColorRegistry.js';
import { IconPicker } from '../../../../../workbench/services/userDataProfile/browser/iconPicker.js';

export class SessionGroupAppearancePicker extends Disposable {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	async changeIcon(setIcon: (icon: string | undefined) => void): Promise<void> {
		const picker = this._register(this.instantiationService.createInstance(IconPicker));
		try {
			const selected = await picker.pickIcons(localize('groupIcon', "Change group icon"));
			if (selected !== undefined) {
				setIcon(selected?.id);
			}
		} finally {
			this._store.delete(picker);
		}
	}

	async changeColor(currentColor: string | undefined, setColor: (color: string | undefined) => void): Promise<void> {
		const colorNames = [
			localize('black', "Black"),
			localize('red', "Red"),
			localize('green', "Green"),
			localize('yellow', "Yellow"),
			localize('blue', "Blue"),
			localize('magenta', "Magenta"),
			localize('cyan', "Cyan"),
			localize('white', "White"),
		];
		const items: IQuickPickItem[] = Object.entries(ansiColorMap).filter(([, color]) => color.index < colorNames.length).map(([id, color]) => ({
			id,
			label: colorNames[color.index],
			description: id,
			iconClass: ThemeIcon.asClassName(Codicon.circleFilled),
			iconColor: themeColorFromId(id),
		}));
		const reset: IQuickPickItem = { label: localize('resetColor', "Reset to default") };
		const selected = await this.quickInputService.pick([...items, { type: 'separator' }, reset], {
			placeHolder: localize('selectGroupColor', "Select a color for the group"),
			activeItem: items.find(item => item.id === currentColor),
			matchOnDescription: true,
		});
		if (selected) {
			setColor(selected.id);
		}
	}
}
