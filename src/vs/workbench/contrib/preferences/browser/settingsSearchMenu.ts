/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { SuggestEnabledInput } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';

export class SettingsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
	constructor(
		action: IAction,
		actionRunner: IActionRunner | undefined,
		private readonly searchWidget: SuggestEnabledInput,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				actionRunner,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
				menuAsChild: true
			}
		);
	}

	override render(container: HTMLElement): void {
		super.render(container);
	}

	private appendToSearchWidgetValue(s: string) {
		this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + ' ' + s);
	}

	getActions(): IAction[] {
		return [
			{
				id: 'modifiedSettingsSearch',
				label: localize('modified', "Modified"),
				tooltip: localize('modifiedTooltip', "View modified settings"),
				class: undefined,
				enabled: true,
				checked: false,
				run: () => { this.appendToSearchWidgetValue('@modified'); },
				dispose: () => { }
			}
		];
	}
}
