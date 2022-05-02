/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';


MenuRegistry.appendMenuItem(MenuId.TitleMenu, {
	submenu: MenuId.TitleMenuQuickPick,
	title: localize('title', "Change Quick Pick Mode"),
	icon: Codicon.settingsGear,
	order: Number.MAX_SAFE_INTEGER
});
