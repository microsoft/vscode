/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isLinux } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
export class SandboxHelperService {
    static async checkSandboxDependenciesWith(findCommand, linux = isLinux) {
        if (!linux) {
            return undefined;
        }
        const [bubblewrapPath, socatPath] = await Promise.all([
            findCommand('bwrap'),
            findCommand('socat'),
        ]);
        return {
            bubblewrapInstalled: !!bubblewrapPath,
            socatInstalled: !!socatPath,
        };
    }
    checkSandboxDependencies() {
        return SandboxHelperService.checkSandboxDependenciesWith(findExecutable);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveEhlbHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3NhbmRib3gvbm9kZS9zYW5kYm94SGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFLakUsTUFBTSxPQUFPLG9CQUFvQjtJQUdoQyxNQUFNLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLFdBQXdCLEVBQUUsUUFBaUIsT0FBTztRQUMzRixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDckQsV0FBVyxDQUFDLE9BQU8sQ0FBQztZQUNwQixXQUFXLENBQUMsT0FBTyxDQUFDO1NBQ3BCLENBQUMsQ0FBQztRQUVILE9BQU87WUFDTixtQkFBbUIsRUFBRSxDQUFDLENBQUMsY0FBYztZQUNyQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLFNBQVM7U0FDM0IsQ0FBQztJQUNILENBQUM7SUFFRCx3QkFBd0I7UUFDdkIsT0FBTyxvQkFBb0IsQ0FBQyw0QkFBNEIsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUMxRSxDQUFDO0NBQ0QifQ==