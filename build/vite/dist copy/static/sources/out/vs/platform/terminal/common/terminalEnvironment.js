/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OS } from '../../../base/common/platform.js';
/**
 * Aggressively escape non-windows paths to prepare for being sent to a shell. This will do some
 * escaping inaccurately to be careful about possible script injection via the file path. For
 * example, we're trying to prevent this sort of attack: `/foo/file$(echo evil)`.
 */
export function escapeNonWindowsPath(path, shellType) {
    let newPath = path;
    if (newPath.includes('\\')) {
        newPath = newPath.replace(/\\/g, '\\\\');
    }
    let escapeConfig;
    switch (shellType) {
        case "bash" /* PosixShellType.Bash */:
        case "sh" /* PosixShellType.Sh */:
        case "zsh" /* PosixShellType.Zsh */:
        case "gitbash" /* WindowsShellType.GitBash */:
            escapeConfig = {
                bothQuotes: (path) => `$'${path.replace(/'/g, '\\\'')}'`,
                singleQuotes: (path) => `'${path.replace(/'/g, '\\\'')}'`,
                noSingleQuotes: (path) => `'${path}'`
            };
            break;
        case "fish" /* PosixShellType.Fish */:
            escapeConfig = {
                bothQuotes: (path) => `"${path.replace(/"/g, '\\"')}"`,
                singleQuotes: (path) => `'${path.replace(/'/g, '\\\'')}'`,
                noSingleQuotes: (path) => `'${path}'`
            };
            break;
        case "pwsh" /* GeneralShellType.PowerShell */:
            // PowerShell should be handled separately in preparePathForShell
            // but if we get here, use PowerShell escaping
            escapeConfig = {
                bothQuotes: (path) => `"${path.replace(/"/g, '`"')}"`,
                singleQuotes: (path) => `'${path.replace(/'/g, '\'\'')}'`,
                noSingleQuotes: (path) => `'${path}'`
            };
            break;
        default:
            // Default to POSIX shell escaping for unknown shells
            escapeConfig = {
                bothQuotes: (path) => `$'${path.replace(/'/g, '\\\'')}'`,
                singleQuotes: (path) => `'${path.replace(/'/g, '\\\'')}'`,
                noSingleQuotes: (path) => `'${path}'`
            };
            break;
    }
    // Remove dangerous characters except single and double quotes, which we'll escape properly
    const bannedChars = /[\`\$\|\&\>\~\#\!\^\*\;\<]/g;
    newPath = newPath.replace(bannedChars, '');
    // Apply shell-specific escaping based on quote content
    if (newPath.includes('\'') && newPath.includes('"')) {
        return escapeConfig.bothQuotes(newPath);
    }
    else if (newPath.includes('\'')) {
        return escapeConfig.singleQuotes(newPath);
    }
    else {
        return escapeConfig.noSingleQuotes(newPath);
    }
}
/**
 * Collapses the user's home directory into `~` if it exists within the path, this gives a shorter
 * path that is more suitable within the context of a terminal.
 */
export function collapseTildePath(path, userHome, separator) {
    if (!path) {
        return '';
    }
    if (!userHome) {
        return path;
    }
    // Trim the trailing separator from the end if it exists
    if (userHome.match(/[\/\\]$/)) {
        userHome = userHome.slice(0, userHome.length - 1);
    }
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
    const normalizedUserHome = userHome.replace(/\\/g, '/').toLowerCase();
    if (!normalizedPath.includes(normalizedUserHome)) {
        return path;
    }
    return `~${separator}${path.slice(userHome.length + 1)}`;
}
/**
 * Sanitizes a cwd string, removing any wrapping quotes and making the Windows drive letter
 * uppercase.
 * @param cwd The directory to sanitize.
 */
export function sanitizeCwd(cwd) {
    // Sanity check that the cwd is not wrapped in quotes (see #160109)
    if (cwd.match(/^['"].*['"]$/)) {
        cwd = cwd.substring(1, cwd.length - 1);
    }
    // Make the drive letter uppercase on Windows (see #9448)
    if (OS === 1 /* OperatingSystem.Windows */ && cwd && cwd[1] === ':') {
        return cwd[0].toUpperCase() + cwd.substring(1);
    }
    return cwd;
}
/**
 * Determines whether the given shell launch config should use the environment variable collection.
 * @param slc The shell launch config to check.
 */
export function shouldUseEnvironmentVariableCollection(slc) {
    return !slc.strictEnv;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFbnZpcm9ubWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBbUIsRUFBRSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHdkU7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxJQUFZLEVBQUUsU0FBNkI7SUFDL0UsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDO0lBQ25CLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQzVCLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBWUQsSUFBSSxZQUErQixDQUFDO0lBQ3BDLFFBQVEsU0FBUyxFQUFFLENBQUM7UUFDbkIsc0NBQXlCO1FBQ3pCLGtDQUF1QjtRQUN2QixvQ0FBd0I7UUFDeEI7WUFDQyxZQUFZLEdBQUc7Z0JBQ2QsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxHQUFHO2dCQUN4RCxZQUFZLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEdBQUc7Z0JBQ3pELGNBQWMsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxJQUFJLEdBQUc7YUFDckMsQ0FBQztZQUNGLE1BQU07UUFDUDtZQUNDLFlBQVksR0FBRztnQkFDZCxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFD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