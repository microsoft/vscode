/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getActiveDocument, getActiveWindow } from '../../../../base/browser/dom.js';
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

	async pickIcons(instanceId: number): Promise<ThemeIcon | undefined> {
		//Get the active document for current context
		const doc = getActiveDocument();

		//Select the default terminal tab if present
		const defaultTab = doc.querySelector('.single-terminal-tab') as HTMLElement;

		//Select terminal tab corresponding to the instance id
		const terminalTab = doc.getElementById(`terminal-tab-instance-${instanceId}`);

		//Use terminal tab if present, else use default tab or document body
		const target = terminalTab ? terminalTab : defaultTab ?? doc.body;
		const dimension = new Dimension(486, 260);

		return new Promise<ThemeIcon | undefined>(resolve => {

			//Bind selection handler to resolve the promise
			const selectHandler = (e: ThemeIcon) => {
				resolve(e);
				this._iconSelectBox.dispose();
			};

			//Register selection event and initialize icon select box
			this._register(this._iconSelectBox.onDidSelect(selectHandler));
			this._iconSelectBox.clearInput();

			//Show hover widget using target element
			const hoverWidget = this._hoverService.showHover({
				content: this._iconSelectBox.domNode,
				target: target,
				//Change the position to left so that the hover widget is not clipped by the window
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

			//Register the hover widget if created
			if (hoverWidget) {
				this._register(hoverWidget);
			}

			//Layout and focus the icon select box
			this._iconSelectBox.layout(dimension);
			this._iconSelectBox.focus();

			//Trigger a resize event to ensure the hover widget is positioned correctly
			setTimeout(() => {
				getActiveWindow().dispatchEvent(new Event('resize'));
			}, 10);
		});

	}
}
