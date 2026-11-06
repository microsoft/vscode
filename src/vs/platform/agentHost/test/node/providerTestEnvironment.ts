/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';

export function createIsolatedProviderEnvironment(homeDir: string, environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return {
		...environment,
		HOME: homeDir,
		USERPROFILE: homeDir,
		APPDATA: join(homeDir, 'AppData', 'Roaming'),
		LOCALAPPDATA: join(homeDir, 'AppData', 'Local'),
		XDG_CONFIG_HOME: join(homeDir, '.config'),
		COPILOT_HOME: join(homeDir, '.copilot'),
		COPILOT_SKILLS_DIRS: undefined,
		CLAUDE_CONFIG_DIR: undefined,
		CODEX_HOME: undefined,
		...(isWindows && homeDir.match(/^[A-Za-z]:[\\/]/) ? {
			HOMEDRIVE: homeDir.slice(0, 2),
			HOMEPATH: homeDir.slice(2).replace(/\//g, '\\'),
		} : {}),
	};
}
