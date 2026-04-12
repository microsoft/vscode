/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { extractCdPrefix } from '../../runInTerminalHelpers.js';
export class CommandLineCdPrefixRewriter extends Disposable {
    rewrite(options) {
        if (!options.cwd) {
            return undefined;
        }
        // Re-write the command if it starts with `cd <dir> && <suffix>` or `cd <dir>; <suffix>`
        // to just `<suffix>` if the directory matches the current terminal's cwd. This simplifies
        // the result in the chat by removing redundancies that some models like to add.
        const extracted = extractCdPrefix(options.commandLine, options.shell, options.os);
        if (extracted) {
            // Normalize trailing slashes
            let cdDirPath = extracted.directory.replace(/(?:[\\\/])$/, '');
            let cwdFsPath = options.cwd.fsPath.replace(/(?:[\\\/])$/, '');
            // Case-insensitive comparison on Windows
            if (options.os === 1 /* OperatingSystem.Windows */) {
                cdDirPath = cdDirPath.toLowerCase();
                cwdFsPath = cwdFsPath.toLowerCase();
            }
            if (cdDirPath === cwdFsPath) {
                return { rewritten: extracted.command, reasoning: 'Removed redundant cd command' };
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVDZFByZWZpeFJld3JpdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZUNkUHJlZml4UmV3cml0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUdoRSxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTtJQUMxRCxPQUFPLENBQUMsT0FBb0M7UUFDM0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNsQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsd0ZBQXdGO1FBQ3hGLDBGQUEwRjtRQUMxRixnRkFBZ0Y7UUFDaEYsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEYsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLDZCQUE2QjtZQUM3QixJQUFJLFNBQVMsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDL0QsSUFBSSxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5RCx5Q0FBeUM7WUFDekMsSUFBSSxPQUFPLENBQUMsRUFBRSxvQ0FBNEIsRUFBRSxDQUFDO2dCQUM1QyxTQUFTLEdBQUcsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNwQyxTQUFTLEdBQUcsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3JDLENBQUM7WUFDRCxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSw4QkFBOEIsRUFBRSxDQUFDO1lBQ3BGLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztDQUNEIn0=