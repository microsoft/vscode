/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as git from './git';

export function getVersion(root: string): string | undefined {
	let version = process.env['BUILD_SOURCEVERSION'];

	if (!version || !/^[0-9a-f]{40}$/i.test(version.trim())) {
		version = git.getVersion(root);
	}

	return version;
}
