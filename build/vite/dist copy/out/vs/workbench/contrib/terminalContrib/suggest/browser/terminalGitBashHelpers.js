/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Converts a Git Bash absolute path to a Windows absolute path.
 * Examples:
 *   "/"      => "C:\\"
 *   "/c/"    => "C:\\"
 *   "/c/Users/foo" => "C:\\Users\\foo"
 *   "/d/bar" => "D:\\bar"
 */
export function gitBashToWindowsPath(path, driveLetter) {
    // Dynamically determine the system drive (default to 'C:' if not set)
    const systemDrive = (driveLetter || 'C:').toUpperCase();
    // Handle root "/"
    if (path === '/') {
        return `${systemDrive}\\`;
    }
    const match = path.match(/^\/([a-zA-Z])(\/.*)?$/);
    if (match) {
        const drive = match[1].toUpperCase();
        const rest = match[2] ? match[2].replace(/\//g, '\\') : '\\';
        return `${drive}:${rest}`;
    }
    // Fallback: just replace slashes
    return path.replace(/\//g, '\\');
}
/**
 *
 * @param path A Windows-style absolute path (e.g., "C:\Users\foo").
 * Converts it to a Git Bash-style absolute path (e.g., "/c/Users/foo").
 * @returns The Git Bash-style absolute path.
 */
export function windowsToGitBashPath(path) {
    // Convert Windows path (e.g. C:\Users\foo) to Git Bash path (e.g. /c/Users/foo)
    return path
        .replace(/^[a-zA-Z]:\\/, match => `/${match[0].toLowerCase()}/`)
        .replace(/\\/g, '/');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxHaXRCYXNoSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvdGVybWluYWxHaXRCYXNoSGVscGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRzs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxVQUFVLG9CQUFvQixDQUFDLElBQVksRUFBRSxXQUFvQjtJQUN0RSxzRUFBc0U7SUFDdEUsTUFBTSxXQUFXLEdBQUcsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDeEQsa0JBQWtCO0lBQ2xCLElBQUksSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ2xCLE9BQU8sR0FBRyxXQUFXLElBQUksQ0FBQztJQUMzQixDQUFDO0lBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ2xELElBQUksS0FBSyxFQUFFLENBQUM7UUFDWCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQzdELE9BQU8sR0FBRyxLQUFLLElBQUksSUFBSSxFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUNELGlDQUFpQztJQUNqQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ2xDLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxJQUFZO0lBQ2hELGdGQUFnRjtJQUNoRixPQUFPLElBQUk7U0FDVCxPQUFPLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQztTQUMvRCxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ3ZCLENBQUMifQ==