/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { LayoutSettings, ModernUIDensity } from '../../services/layout/browser/layoutService.js';

export const LayoutDensityMenu = new MenuId('LayoutDensityMenu');

const layoutDensityOptions = [
	{ density: ModernUIDensity.Default, title: localize2('layoutDensityDefault', "Default") },
	{ density: ModernUIDensity.Compact, title: localize2('layoutDensityCompact', "Compact") },
] as const;

for (let index = 0; index < layoutDensityOptions.length; index++) {
	const option = layoutDensityOptions[index];
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: `workbench.action.setLayoutDensity.${option.density}`,
				title: option.title,
				toggled: ContextKeyExpr.equals(`config.${LayoutSettings.MODERN_UI_DENSITY}`, option.density),
				menu: {
					id: LayoutDensityMenu,
					order: index + 1,
				},
			});
		}

		override run(accessor: ServicesAccessor): Promise<void> {
			return accessor.get(IConfigurationService).updateValue(LayoutSettings.MODERN_UI_DENSITY, option.density);
		}
	});
}
