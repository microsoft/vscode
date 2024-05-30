/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getActiveDocument } from 'vs/base/browser/dom';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { codiconsLibrary } from 'vs/base/common/codiconsLibrary';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import type { ThemeIcon } from 'vs/base/common/themables';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { defaultInputBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { getIconRegistry, IconContribution } from 'vs/platform/theme/common/iconRegistry';
import { WorkbenchIconSelectBox } from 'vs/workbench/services/userDataProfile/browser/iconSelectBox';

const icons = new Lazy<IconContribution[]>(() => {
	const iconDefinitions = getIconRegistry().getIcons();
	const includedChars = new Set<string>();
	const dedupedIcons = iconDefinitions.filter(e => {
		if (e.id === codiconsLibrary.blank.id) {
			return false;
		}
		if (!('fontCharacter' in e.defaults)) {
			return false;
		}
		if (includedChars.has(e.defaults.fontCharacter)) {
			return false;
		}
		includedChars.add(e.defaults.fontCharacter);
		return true;
	});
	return dedupedIcons;
});

export class TerminalIconPicker extends Disposable {
	private readonly _iconSelectBox: WorkbenchIconSelectBox;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService private readonly _hoverService: IHoverService
	) {
		super();

		this._iconSelectBox = instantiationService.createInstance(WorkbenchIconSelectBox, {
			icons: icons.value,
			inputBoxStyles: defaultInputBoxStyles,
			showIconInfo: true
		});
	}

	async pickIcons(): Promise<ThemeIcon | undefined> {
		const dimension = new Dimension(486, 260);
		return new Promise<ThemeIcon | undefined>(resolve => {
			this._register(this._iconSelectBox.onDidSelect(e => {
				resolve(e);
				this._iconSelectBox.dispose();
			}));
			this._iconSelectBox.clearInput();
			const hoverWidget = this._hoverService.showHover({
				content: this._iconSelectBox.domNode,
				target: getActiveDocument().body,
				position: {
					hoverPosition: HoverPosition.BELOW,
				},
				persistence: {
					sticky: true,
				},
				appearance: {
					showPointer: true
				}
			}, true);
			if (hoverWidget) {
				this._register(hoverWidget);
			}
			this._iconSelectBox.layout(dimension);
			this._iconSelectBox.focus();
		});
	}
}
