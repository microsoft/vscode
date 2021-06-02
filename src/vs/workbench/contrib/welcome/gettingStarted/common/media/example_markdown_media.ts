/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export default () => `
<checklist>
	<checkbox on-checked="setTheme:Default Light+" checked-on="config.workbench.colorTheme == 'Default Light+'">
		<img width="200" src="./light.png"/>
		${escape(localize('light', "Light"))}
	</checkbox>
	<checkbox on-checked="setTheme:Default Dark+" checked-on="config.workbench.colorTheme == 'Default Dark+'">
		<img width="200" src="./dark.png"/>
		${escape(localize('dark', "Dark"))}
	</checkbox>
	<checkbox on-checked="setTheme:Quiet Light" checked-on="config.workbench.colorTheme == 'Quiet Light'">
		<img width="200" src="./quiet-light.png"/>
		Quiet Light
	</checkbox>
	<checkbox on-checked="setTheme:Monokai" checked-on="config.workbench.colorTheme == 'Monokai'">
		<img width="200" src="./monokai.png"/>
		Monokai
	</checkbox>
	<checkbox on-checked="command:workbench.action.selectTheme" checked-on="false">
		<img width="200" src="./more.png"/>
		See More...
	</checkbox>
</checklist>

\`\`\`js
const btn = document.getElementById('btn')
let count = 0
function render() {
	btn.innerText = \`Count: \${count}\`
}
btn.addEventListener('click', () => {
	// Count from 1 to 10.
	if (count < 10) {
		count += 1
		render()
	}
})
\`\`\`
`;
