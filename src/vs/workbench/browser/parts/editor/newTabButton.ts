/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { ILocalizedString } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isEditorCommandsContext } from '../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';

export const NEW_TAB_BUTTON_SETTING = 'workbench.editor.experimental.newTabButton';

/**
 * What an entry of the new tab button opens.
 */
export type NewTabButtonAction = 'untitledFile' | 'markdown' | 'chat' | 'browser';

export interface INewTabButtonEntry {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	readonly order: number;
	readonly action: NewTabButtonAction;
	/** Hides the entry while the feature it opens is not available. */
	readonly when?: ContextKeyExpression;
}

/**
 * An entry of the new tab (`+`) button at the end of the editor tab bar ({@link MenuId.EditorTabsBarAddTab}), shown
 * while {@link NEW_TAB_BUTTON_SETTING} is on. It opens its tab in the group of the button it was picked from.
 */
export abstract class NewTabButtonEntryAction extends Action2 {

	private readonly _action: NewTabButtonAction;

	constructor(entry: INewTabButtonEntry) {
		super({
			id: entry.id,
			title: entry.title,
			icon: entry.icon,
			f1: false,
			menu: {
				id: MenuId.EditorTabsBarAddTab,
				group: 'navigation',
				order: entry.order,
				when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${NEW_TAB_BUTTON_SETTING}`, true), entry.when)
			}
		});
		this._action = entry.action;
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): Promise<unknown> {
		type NewTabButtonEvent = { action: NewTabButtonAction };
		type NewTabButtonClassification = {
			owner: 'hediet';
			comment: 'Which entry of the new tab button in the editor tab bar is picked.';
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What the picked entry opens: untitledFile, markdown, chat or browser.' };
		};
		accessor.get(ITelemetryService).publicLog2<NewTabButtonEvent, NewTabButtonClassification>('newTabButton', { action: this._action });

		const editorGroupsService = accessor.get(IEditorGroupsService);
		const context = args.find(isEditorCommandsContext);
		const group = (context && editorGroupsService.getGroup(context.groupId)) ?? editorGroupsService.activeGroup;
		// Commands that open in the active group then open in the group of the button.
		editorGroupsService.activateGroup(group);

		return this.openTab(accessor, group);
	}

	/**
	 * Opens the new tab. The accessor is only valid until the first `await`.
	 */
	protected abstract openTab(accessor: ServicesAccessor, group: IEditorGroup): Promise<unknown>;
}
