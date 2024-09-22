/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getActiveDocument } from '../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { codiconsLibrary } from '../../../../base/common/codiconsLibrary.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getIconRegistry, IconContribution } from '../../../../platform/theme/common/iconRegistry.js';
import { WorkbenchIconSelectBox } from '../../../services/userDataProfile/browser/iconSelectBox.js';

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

	async pickIcons(eventSource?: 'inline-tab' | 'other'): Promise<ThemeIcon | undefined> {
		const isEventSourceInlineTab = eventSource === 'inline-tab';
		const dimension = isEventSourceInlineTab ? new Dimension(486, 360) : new Dimension(486, 260);
		const target = isEventSourceInlineTab ?
			getActiveDocument().getElementById('workbench.parts.panel') :
			getActiveDocument().getElementById('workbench.parts.editor');
		const position = isEventSourceInlineTab ? HoverPosition.LEFT : HoverPosition.BELOW;
		return new Promise<ThemeIcon | undefined>(resolve => {
			this._register(this._iconSelectBox.onDidSelect(e => {
				resolve(e);
				this._iconSelectBox.dispose();
			}));
			this._iconSelectBox.clearInput();
			const hoverWidget = this._hoverService.showHover({
				content: this._iconSelectBox.domNode,
				target: target || getActiveDocument().body,
				position: {
					hoverPosition: position,
				},
				persistence: {
					sticky: true,
				},
				appearance: {
					showPointer: isEventSourceInlineTab ? false : true
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
