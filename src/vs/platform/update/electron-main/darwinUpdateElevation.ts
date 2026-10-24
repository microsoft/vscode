/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants, promises } from 'fs';
import { dirname } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';

/**
 * Returns whether installing an update of the application bundle at the given path requires administrator
 * privileges. This mirrors the check Squirrel.Mac performs when preparing a downloaded update: when the bundle,
 * or its parent folder, is not writable by the current user, the update is installed by a privileged helper and
 * macOS asks the user to authenticate as an administrator. This is typically the case for installs deployed by
 * device management tools, which are owned by root.
 *
 * @param bundlePath The path of the application bundle.
 * @param directContentsWrite Whether Squirrel.Mac writes the update directly into the bundle (as configured by the
 * `SquirrelMacEnableDirectContentsWrite` user default), in which case only the bundle itself needs to be writable.
 */
export async function isElevationRequiredToInstallUpdate(bundlePath: string, directContentsWrite: boolean): Promise<boolean> {
	let resolvedBundlePath: string;
	try {
		resolvedBundlePath = await Promises.realpath(bundlePath);
	} catch {
		return false;
	}

	if (!await canWrite(resolvedBundlePath)) {
		return true;
	}

	return !directContentsWrite && !await canWrite(dirname(resolvedBundlePath));
}

async function canWrite(path: string): Promise<boolean> {
	try {
		await promises.access(path, constants.W_OK);
		return true;
	} catch (error) {
		// Only missing permissions lead to a privileged install: read-only volumes, for example, make Squirrel.Mac fail
		// before an update is downloaded. Like Squirrel.Mac, assume no elevation is needed for any other error.
		return error.code !== 'EACCES' && error.code !== 'EPERM';
	}
}
