/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { untildify } from '../../../../base/common/labels.js';
import { isAbsolute, join, normalize } from '../../../../base/common/path.js';
import type { URI } from '../../../../base/common/uri.js';

export function resolveMcpServerWorkingDirectory(cwd: string | undefined, defaultCwd: URI | undefined): string | undefined {
	const expandedCwd = cwd ? untildify(cwd, homedir()) : undefined;
	if (!expandedCwd) {
		return defaultCwd?.fsPath;
	}
	if (defaultCwd && !isAbsolute(expandedCwd)) {
		return normalize(join(defaultCwd.fsPath, expandedCwd));
	}
	return cwd?.startsWith('~') ? normalize(expandedCwd) : expandedCwd;
}
