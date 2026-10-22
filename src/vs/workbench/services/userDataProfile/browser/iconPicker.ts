/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, DisposableResizeObserver, getActiveElement, getWindow, trackFocus } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, ItemActivation, QuickPickFocus } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { WorkbenchIconSelectBox } from './iconSelectBox.js';

export class IconPicker extends Disposable {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	/** Returns `null` for reset and `undefined` for cancellation. */
	async pickIcons(title = localize('changeIcon', "Change icon")): Promise<ThemeIcon | null | undefined> {
		const disposables = this._register(new DisposableStore());
		try {
			const picker = disposables.add(this.quickInputService.createQuickPick<IQuickPickItem>({ useSeparators: true }));
			const characters = new Set<string>();
			const icons = getIconRegistry().getIcons().filter(icon => {
				if (icon.id === 'blank' || ThemeIcon.isThemeIcon(icon.defaults) || characters.has(icon.defaults.fontCharacter)) {
					return false;
				}
				characters.add(icon.defaults.fontCharacter);
				return true;
			});
			const grid = disposables.add(this.instantiationService.createInstance(WorkbenchIconSelectBox, {
				icons,
				inputBoxStyles: defaultInputBoxStyles,
				showIconInfo: true,
			}));
			picker.title = title;
			picker.ariaLabel = localize('iconPicker', "Icon picker");
			picker.hideInput = true;
			picker.itemActivation = ItemActivation.NONE;
			picker.widget = grid.domNode;
			picker.items = [{ type: 'separator' }, { label: localize('resetIcon', "Reset to default") }];
			const focus = disposables.add(trackFocus(grid.domNode));
			disposables.add(focus.onDidFocus(() => picker.activeItems = []));
			disposables.add(focus.onDidBlur(() => picker.focus(QuickPickFocus.First)));
			return await new Promise<ThemeIcon | null | undefined>(resolve => {
				let settled = false;
				const complete = (result: ThemeIcon | null | undefined) => {
					if (!settled) {
						settled = true;
						resolve(result);
					}
				};
				disposables.add(picker.onDidHide(() => complete(undefined)));
				disposables.add(grid.onDidSelect(icon => complete(icon)));
				disposables.add(picker.onWillAccept(event => {
					const activeElement = getActiveElement();
					if (activeElement && grid.domNode.contains(activeElement)) {
						event.veto();
						const index = grid.getFocus()[0];
						if (index !== undefined) {
							grid.setSelection(index);
						}
					}
				}));
				disposables.add(picker.onDidAccept(() => complete(null)));
				picker.show();
				const container = grid.domNode.parentElement;
				if (!container) {
					throw new Error('The icon picker must be attached before layout');
				}
				let width = 0;
				const layout = () => {
					const containerWidth = container.clientWidth;
					if (containerWidth > 0 && containerWidth !== width) {
						width = containerWidth;
						grid.layout(new Dimension(width, 300));
					}
				};
				const observer = disposables.add(new DisposableResizeObserver('IconPicker.layout', layout, getWindow(container)));
				disposables.add(observer.observe(container));
				layout();
				grid.focus();
			});
		} finally {
			this._store.delete(disposables);
		}
	}
}
