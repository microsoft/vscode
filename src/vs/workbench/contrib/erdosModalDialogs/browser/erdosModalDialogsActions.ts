/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IsDevelopmentContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

const enum ErdosModalDialogsCommandId {
	ShowExampleDialog = 'workbench.action.erdosModalDialogs.showExampleDialog',
}

const ERDOS_MODAL_DIALOGS_ACTION_CATEGORY = localize('erdosModalDialogsCategory', "ModalDialogs");

export function registerErdosModalDialogsActions() {
	const category: ILocalizedString = {
		value: ERDOS_MODAL_DIALOGS_ACTION_CATEGORY,
		original: 'ModalDialogs'
	};

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosModalDialogsCommandId.ShowExampleDialog,
				title: {
					value: localize('workbench.action.erdosModalDialogs.showExampleModalDialog', "Show Example Modal Dialog"),
					original: 'Show Example Dialog'
				},
				f1: true,
				category,
				precondition: IsDevelopmentContext
			});
		}

		async run(accessor: ServicesAccessor) {
		}
	});
}
