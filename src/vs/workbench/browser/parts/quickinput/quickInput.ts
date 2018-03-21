/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { Component } from 'vs/workbench/common/component';
import { IQuickInputService } from 'vs/platform/quickInput/common/quickInput';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { Dimension } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant, ITheme, ICssStyleCollector, IThemeService } from 'vs/platform/theme/common/themeService';
import { buttonBackground, buttonForeground, contrastBorder, buttonHoverBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IQuickOpenService, IPickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken } from 'vs/base/common/cancellation';
import { QuickInputCheckboxList } from './quickInputCheckboxList';
import { QuickInputBox } from './quickInputBox';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CLOSE_ON_FOCUS_LOST_CONFIG } from 'vs/workbench/browser/quickopen';

const $ = dom.$;

export class QuickInputService extends Component implements IQuickInputService {

	public _serviceBrand: any;

	private static readonly ID = 'workbench.component.quickinput';
	private static readonly MAX_WIDTH = 600;				// Max total width of quick open widget

	private layoutDimensions: Dimension;
	private container: HTMLElement;
	private inputBox: QuickInputBox;
	private checkboxList: QuickInputCheckboxList;

	private resolve: (value?: object[] | Thenable<object[]>) => void;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IThemeService themeService: IThemeService
	) {
		super(QuickInputService.ID, themeService);
	}

	private create() {
		if (this.container) {
			return;
		}

		const workbench = document.getElementById(this.partService.getWorkbenchElementId());
		this.container = dom.append(workbench, $('.quick-input-widget'));
		this.container.style.display = 'none';

		const headerContainer = dom.append(this.container, $('.quick-input-header'));

		this.inputBox = new QuickInputBox(headerContainer);
		this.toUnbind.push(this.inputBox);
		this.inputBox.style(this.themeService.getTheme());
		this.inputBox.onDidChange(value => {
			this.checkboxList.filter(value);
		});
		this.toUnbind.push(this.inputBox.onKeyDown(event => {
			switch (event.keyCode) {
				case KeyCode.DownArrow:
					this.checkboxList.focus('Next');
					break;
				case KeyCode.UpArrow:
					this.checkboxList.focus('Previous');
					break;
				case KeyCode.PageDown:
					this.checkboxList.focus('NextPage');
					break;
				case KeyCode.PageUp:
					this.checkboxList.focus('PreviousPage');
					break;
				case KeyCode.Space:
					if (event.ctrlKey) {
						this.checkboxList.toggleCheckbox();
					}
					break;
			}
		}));

		const ok = dom.append(headerContainer, $('button.quick-input-action'));
		ok.textContent = localize('ok', "OK");
		this.toUnbind.push(dom.addDisposableListener(ok, dom.EventType.CLICK, e => this.close(true)));

		this.checkboxList = this.instantiationService.createInstance(QuickInputCheckboxList, this.container);
		this.toUnbind.push(this.checkboxList);

		this.toUnbind.push(dom.addDisposableListener(this.container, 'focusout', (e: FocusEvent) => {
			for (let element = <Element>e.relatedTarget; element; element = element.parentElement) {
				if (element === this.container) {
					return;
				}
			}
			if (this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG)) {
				this.close(false);
			}
		}));
		this.toUnbind.push(dom.addDisposableListener(this.container, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Enter:
					dom.EventHelper.stop(e, true);
					this.close(true);
					break;
				case KeyCode.Escape:
					dom.EventHelper.stop(e, true);
					this.close(false);
					break;
			}
		}));

		this.toUnbind.push(this.quickOpenService.onShow(() => this.close(false)));
	}

	private close(ok: boolean) {
		if (this.resolve) {
			if (ok) {
				this.resolve(this.checkboxList.getSelectedElements());
			} else {
				this.resolve();
			}
		}
		this.container.style.display = 'none';
	}

	async pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions, token?: CancellationToken): TPromise<T[]> {
		this.create();
		this.quickOpenService.close();
		if (this.resolve) {
			this.resolve();
		}

		this.inputBox.setValue('');
		// TODO: Localize shortcut.
		this.inputBox.setPlaceholder(options.placeHolder ? localize('quickInput.ctrlSpaceToSelectWithPlaceholder', "{1} ({0} to toggle)", 'Cmd+Space', options.placeHolder) : localize('quickInput.ctrlSpaceToSelect', "{0} to toggle", 'Cmd+Space'));
		// TODO: Progress indication.
		this.checkboxList.setElements(await picks);

		this.container.style.display = null;
		this.updateLayout();
		this.inputBox.setFocus();

		return new TPromise<T[]>(resolve => this.resolve = resolve);
	}

	public layout(dimension: Dimension): void {
		this.layoutDimensions = dimension;
		this.updateLayout();
	}

	private updateLayout() {
		if (this.layoutDimensions && this.container) {
			const titlebarOffset = this.partService.getTitleBarOffset();
			this.container.style.top = `${titlebarOffset}px`;

			const style = this.container.style;
			const width = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickInputService.MAX_WIDTH);
			style.width = width + 'px';
			style.marginLeft = '-' + (width / 2) + 'px';

			this.inputBox.layout();
			this.checkboxList.layout();
		}
	}

	protected updateStyles() {
		this.inputBox.style(this.themeService.getTheme());
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const sideBarBackground = theme.getColor(SIDE_BAR_BACKGROUND);
	const sideBarForeground = theme.getColor(SIDE_BAR_FOREGROUND);
	const contrastBorderColor = theme.getColor(contrastBorder);
	const widgetShadowColor = theme.getColor(widgetShadow);
	collector.addRule(`.quick-input-widget {
		${sideBarBackground ? `background-color: ${sideBarBackground};` : ''}
		${sideBarForeground ? `color: ${sideBarForeground};` : ''}
		${contrastBorderColor ? `border: 1px solid ${contrastBorderColor};` : ''}
		${widgetShadowColor ? `box-shadow: 0 5px 8px ${widgetShadowColor};` : ''}
	}`);

	const buttonBackgroundColor = theme.getColor(buttonBackground);
	const buttonForegroundColor = theme.getColor(buttonForeground);
	collector.addRule(`.quick-input-action {
		${buttonBackgroundColor ? `background-color: ${buttonBackgroundColor};` : ''}
		${buttonForegroundColor ? `color: ${buttonForegroundColor};` : ''}
		${contrastBorderColor ? `border: 1px solid ${contrastBorderColor};` : ''}
	}`);

	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.quick-input-action:hover { background-color: ${buttonHoverBackgroundColor}; }`);
		collector.addRule(`.quick-input-action:focus { background-color: ${buttonHoverBackgroundColor}; }`);
	}
});
