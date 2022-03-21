/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export default () => `
<checklist>
	<checkbox when-checked="setTheme:Default Light+" checked-on="config.workbench.colorTheme == 'Default Light+'">
		<img width="150" src="./light.png"/>
		${escape(localize('light', "Light"))}
	</checkbox>
	<checkbox when-checked="setTheme:Default Dark+" checked-on="config.workbench.colorTheme == 'Default Dark+'">
		<img width="150" src="./dark.png"/>
		${escape(localize('dark', "Dark"))}
	</checkbox>
	<checkbox when-checked="setTheme:Default High Contrast" checked-on="config.workbench.colorTheme == 'Default High Contrast'">
		<img width="150" src="./monokai.png"/>
		${escape(localize('HighContrast', "Dark High Contrast"))}
	</checkbox>
	<checkbox when-checked="setTheme:Default High Contrast Light" checked-on="config.workbench.colorTheme == 'Default High Contrast Light'">
		<img width="150" src="./light-hc.png"/>
		${escape(localize('HighContrastLight', "Light High Contrast"))}
	</checkbox>
</checklist>
<checkbox when-checked="command:workbench.action.selectTheme" checked-on="false">
	${escape(localize('seeMore', "See More Themes..."))}
</checkbox>
`;
