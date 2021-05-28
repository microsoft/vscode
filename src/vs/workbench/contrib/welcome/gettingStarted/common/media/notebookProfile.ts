/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

const profileArg = (profile: string) => encodeURIComponent(JSON.stringify({ profile }));

export default () => `
<checklist>
	<checkbox on-checked="command:notebook.setProfile?${profileArg('default')}" checked-on="config.workbench.colorTheme == 'Default Light+'">
		<img width="350" src="./notebookThemes/default.png"/>
		${escape(localize('default', "Default"))}
	</checkbox>
	<checkbox on-checked="command:notebook.setProfile?${profileArg('jupyter')}" checked-on="config.workbench.colorTheme == 'Default Light+'">
		<img width="350" src="./notebookThemes/jupyter.png"/>
		${escape(localize('jupyter', "Jupyter"))}
	</checkbox>
	<checkbox on-checked="command:notebook.setProfile?${profileArg('colab')}" checked-on="config.workbench.colorTheme == 'Default Light+'">
		<img width="350" src="./notebookThemes/colab.png"/>
		${escape(localize('colab', "Colab"))}
	</checkbox>
</checklist>
`;
