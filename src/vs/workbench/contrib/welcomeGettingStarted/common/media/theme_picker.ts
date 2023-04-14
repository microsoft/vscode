/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export default () => `
<checklist>
	<div class="theme-picker-row">
		<checkbox when-checked="setTheme:Default Dark+" checked-on="config.workbench.colorTheme == 'Default Dark+'">
			<img width="200" src="./dark.png"/>
			${escape(localize('dark', "Dark"))}
		</checkbox>
		<checkbox when-checked="setTheme:Default Light+" checked-on="config.workbench.colorTheme == 'Default Light+'">
			<img width="200" src="./light.png"/>
			${escape(localize('light', "Light"))}
		</checkbox>
	</div>
	<div class="theme-picker-row">
		<checkbox when-checked="setTheme:Default High Contrast" checked-on="config.workbench.colorTheme == 'Default High Contrast'">
			<img width="200" src="./dark-hc.png"/>
			${escape(localize('HighContrast', "Dark High Contrast"))}
		</checkbox>
		<checkbox when-checked="setTheme:Default High Contrast Light" checked-on="config.workbench.colorTheme == 'Default High Contrast Light'">
			<img width="200" src="./light-hc.png"/>
			${escape(localize('HighContrastLight', "Light High Contrast"))}
		</checkbox>
	</div>
</checklist>
<checkbox class="theme-picker-link" when-checked="command:workbench.action.selectTheme" checked-on="false">
	${escape(localize('seeMore', "See More Themes..."))}
</checkbox>
`;
