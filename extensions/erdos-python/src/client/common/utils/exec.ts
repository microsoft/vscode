// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fsapi from 'fs';
import * as path from 'path';
import { getEnvironmentVariable, getOSType, OSType } from './platform';

/**
 * Determine the env var to use for the executable search path.
 */
export function getSearchPathEnvVarNames(ostype = getOSType()): ('Path' | 'PATH')[] {
    if (ostype === OSType.Windows) {
        // On Windows both are supported now.
        return ['Path', 'PATH'];
    }
    return ['PATH'];
}

/**
 * Get the OS executable lookup "path" from the appropriate env var.
 */
export function getSearchPathEntries(): string[] {
    const envVars = getSearchPathEnvVarNames();
    for (const envVar of envVars) {
        const value = getEnvironmentVariable(envVar);
        if (value !== undefined) {
            return parseSearchPathEntries(value);
        }
    }
    // No env var was set.
    return [];
}

function parseSearchPathEntries(envVarValue: string): string[] {
    return envVarValue
        .split(path.delimiter)
        .map((entry: string) => entry.trim())
        .filter((entry) => entry.length > 0);
}

/**
 * Determine if the given file is executable by the current user.
 *
 * If the file does not exist or has any other problem when accessed
 * then `false` is returned.  The caller is responsible to determine
 * whether or not the file exists.
 *
 * If it could not be determined if the file is executable (e.g. on
 * Windows) then `undefined` is returned.  This allows the caller
 * to decide what to do.
 */
export async function isValidAndExecutable(filename: string): Promise<boolean | undefined> {
    // There are three options when it comes to checking if a file
    // is executable: `fs.stat()`, `fs.access()`, and
    // `child_process.exec()`.  `stat()` requires non-trivial logic
    // to deal with user/group/everyone permissions.  `exec()` requires
    // that we make an attempt to actually execute the file, which is
    // beyond the scope of this function (due to potential security
    // risks).  That leaves `access()`, which is what we use.
    try {
        // We do not need to check if the file exists.  `fs.access()`
        // takes care of that for us.
        await fsapi.promises.access(filename, fsapi.constants.X_OK);
    } catch (err) {
        return false;
    }
    if (getOSType() === OSType.Windows) {
        // On Windows a file is determined to be executable through
        // its ACLs.  However, the FS-related functionality provided
        // by node does not check them (currently).  This includes both
        // `fs.stat()` and `fs.access()` (which we used above).  One
        // option is to use the "acl" NPM package (or something similar)
        // to make the relevant checks.  However, we want to avoid
        // adding a dependency needlessly.  Another option is to fall
        // back to checking the filename's suffix (e.g. ".exe").  The
        // problem there is that such a check is a bit *too* naive.
        // Finally, we could still go the `exec()` route.  We'd
        // rather not given the concern identified above.  Instead,
        // it is good enough to return `undefined` and let the
        // caller decide what to do about it.  That is better
        // than returning `true` when we aren't sure.
        //
        // Note that we still call `fs.access()` on Windows first,
        // in case node makes it smarter later.
        return undefined;
    }
    return true;
}
