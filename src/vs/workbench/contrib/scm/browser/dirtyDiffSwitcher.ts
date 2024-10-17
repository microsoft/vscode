/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ISelectOptionItem } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { SelectActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { peekViewTitleBackground } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';

export interface IQuickDiffSelectItem extends ISelectOptionItem {
	provider: string;
}

export class SwitchQuickDiffViewItem extends SelectActionViewItem<IQuickDiffSelectItem> {
	private readonly optionsItems: IQuickDiffSelectItem[];

	constructor(
		action: IAction,
		providers: string[],
		selected: string,
		@IContextViewService contextViewService: IContextViewService,
		@IThemeService themeService: IThemeService
	) {
		const items = providers.map(provider => ({ provider, text: provider }));
		let startingSelection = providers.indexOf(selected);
		if (startingSelection === -1) {
			startingSelection = 0;
		}
		const styles = { ...defaultSelectBoxStyles };
		const theme = themeService.getColorTheme();
		const editorBackgroundColor = theme.getColor(editorBackground);
		const peekTitleColor = theme.getColor(peekViewTitleBackground);
		const opaqueTitleColor = peekTitleColor?.makeOpaque(editorBackgroundColor!) ?? editorBackgroundColor!;
		styles.selectBackground = opaqueTitleColor.lighten(.6).toString();
		super(null, action, items, startingSelection, contextViewService, styles, { ariaLabel: nls.localize('remotes', 'Switch quick diff base') });
		this.optionsItems = items;
	}

	public setSelection(provider: string) {
		const index = this.optionsItems.findIndex(item => item.provider === provider);
		this.select(index);
	}

	protected override getActionContext(_: string, index: number): IQuickDiffSelectItem {
		return this.optionsItems[index];
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.setFocusable(true);
	}
}

export class SwitchQuickDiffBaseAction extends Action {

	public static readonly ID = 'quickDiff.base.switch';
	public static readonly LABEL = nls.localize('quickDiff.base.switch', "Switch Quick Diff Base");

	constructor(private readonly callback: (event?: IQuickDiffSelectItem) => void) {
		super(SwitchQuickDiffBaseAction.ID, SwitchQuickDiffBaseAction.LABEL, undefined, undefined);
	}

	override async run(event?: IQuickDiffSelectItem): Promise<void> {
		return this.callback(event);
	}
}
