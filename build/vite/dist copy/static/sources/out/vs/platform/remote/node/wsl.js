/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as cp from 'child_process';
import { join } from '../../../base/common/path.js';
import { getWindowsBuildNumberAsync } from '../../../base/node/windowsVersion.js';
let hasWSLFeaturePromise;
export async function hasWSLFeatureInstalled(refresh = false) {
    if (hasWSLFeaturePromise === undefined || refresh) {
        hasWSLFeaturePromise = testWSLFeatureInstalled();
    }
    return hasWSLFeaturePromise;
}
async function testWSLFeatureInstalled() {
    const windowsBuildNumber = await getWindowsBuildNumberAsync();
    if (windowsBuildNumber === 0) {
        return false;
    }
    if (windowsBuildNumber >= 22000) {
        const wslExePath = getWSLExecutablePath();
        if (wslExePath) {
            return new Promise(s => {
                try {
                    cp.execFile(wslExePath, ['--status'], err => s(!err));
                }
                catch (e) {
                    s(false);
                }
            });
        }
    }
    else {
        const dllPath = getLxssManagerDllPath();
        if (dllPath) {
            try {
                if ((await fs.promises.stat(dllPath)).isFile()) {
                    return true;
                }
            }
            catch (e) {
            }
        }
    }
    return false;
}
function getSystem32Path(subPath) {
    const systemRoot = process.env['SystemRoot'];
    if (systemRoot) {
        const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
        return join(systemRoot, is32ProcessOn64Windows ? 'Sysnative' : 'System32', subPath);
    }
    return undefined;
}
function getWSLExecutablePath() {
    return getSystem32Path('wsl.exe');
}
/**
 * In builds < 22000 this dll inidcates that WSL is installed
 */
function getLxssManagerDllPath() {
    return getSystem32Path('lxss\\LxssManager.dll');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3NsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcmVtb3RlL25vZGUvd3NsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRixJQUFJLG9CQUFrRCxDQUFDO0FBRXZELE1BQU0sQ0FBQyxLQUFLLFVBQVUsc0JBQXNCLENBQUMsT0FBTyxHQUFHLEtBQUs7SUFDM0QsSUFBSSxvQkFBb0IsS0FBSyxTQUFTLElBQUksT0FBTyxFQUFFLENBQUM7UUFDbkQsb0JBQW9CLEdBQUcsdUJBQXVCLEVBQUUsQ0FBQztJQUNsRCxDQUFDO0lBQ0QsT0FBTyxvQkFBb0IsQ0FBQztBQUM3QixDQUFDO0FBRUQsS0FBSyxVQUFVLHVCQUF1QjtJQUNyQyxNQUFNLGtCQUFrQixHQUFHLE1BQU0sMEJBQTBCLEVBQUUsQ0FBQztJQUM5RCxJQUFJLGtCQUFrQixLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzlCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksa0JBQWtCLElBQUksS0FBSyxFQUFFLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsb0JBQW9CLEVBQUUsQ0FBQztRQUMxQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sSUFBSSxPQUFPLENBQVUsQ0FBQyxDQUFDLEVBQUU7Z0JBQy9CLElBQUksQ0FBQztvQkFDSixFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDdkQsQ0FBQztnQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNaLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDVixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztTQUFNLENBQUM7UUFDUCxNQUFNLE9BQU8sR0FBRyxxQkFBcUIsRUFBRSxDQUFDO1FBQ3hDLElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixJQUFJLENBQUM7Z0JBQ0osSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO29CQUNoRCxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO1lBQ0YsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxPQUFlO0lBQ3ZDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDN0MsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNoQixNQUFNLHNCQUFzQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDcEYsT0FBTyxJQUFJLENBQUMsVUFBVSxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVELFNBQVMsb0JBQW9CO0lBQzVCLE9BQU8sZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMscUJBQXFCO0lBQzdCLE9BQU8sZUFBZSxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFDakQsQ0FBQyJ9