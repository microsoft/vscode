/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as platform from '../../common/platform.js';
import { enumeratePowerShellInstallations, getFirstAvailablePowerShellInstallation } from '../../node/powershell.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
function checkPath(exePath) {
    // Check to see if the path exists
    let pathCheckResult = false;
    try {
        const stat = fs.statSync(exePath);
        pathCheckResult = stat.isFile();
    }
    catch {
        // fs.exists throws on Windows with SymbolicLinks so we
        // also use lstat to try and see if the file exists.
        try {
            pathCheckResult = fs.statSync(fs.readlinkSync(exePath)).isFile();
        }
        catch {
        }
    }
    assert.strictEqual(pathCheckResult, true);
}
if (platform.isWindows) {
    suite('PowerShell finder', () => {
        ensureNoDisposablesAreLeakedInTestSuite();
        test('Can find first available PowerShell', async () => {
            const pwshExe = await getFirstAvailablePowerShellInstallation();
            const exePath = pwshExe?.exePath;
            assert.notStrictEqual(exePath, null);
            assert.notStrictEqual(pwshExe?.displayName, null);
            checkPath(exePath);
        });
        test('Can enumerate PowerShells', async () => {
            const pwshs = new Array();
            for await (const p of enumeratePowerShellInstallations()) {
                pwshs.push(p);
            }
            const powershellLog = 'Found these PowerShells:\n' + pwshs.map(p => `${p.displayName}: ${p.exePath}`).join('\n');
            assert.strictEqual(pwshs.length >= 1, true, powershellLog);
            for (const pwsh of pwshs) {
                checkPath(pwsh.exePath);
            }
            // The last one should always be Windows PowerShell.
            assert.strictEqual(pwshs[pwshs.length - 1].displayName, 'Windows PowerShell', powershellLog);
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG93ZXJzaGVsbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L25vZGUvcG93ZXJzaGVsbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssUUFBUSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSx1Q0FBdUMsRUFBeUIsTUFBTSwwQkFBMEIsQ0FBQztBQUM1SSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU3RSxTQUFTLFNBQVMsQ0FBQyxPQUFlO0lBQ2pDLGtDQUFrQztJQUNsQyxJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUM7SUFDNUIsSUFBSSxDQUFDO1FBQ0osTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNsQyxlQUFlLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUix1REFBdUQ7UUFDdkQsb0RBQW9EO1FBQ3BELElBQUksQ0FBQztZQUNKLGVBQWUsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNsRSxDQUFDO1FBQUMsTUFBTSxDQUFDO1FBRVQsQ0FBQztJQUNGLENBQUM7SUFFRCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBRUQsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDeEIsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtRQUMvQix1Q0FBdUMsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN0RCxNQUFNLE9BQU8sR0FBRyxNQUFNLHVDQUF1QyxFQUFFLENBQUM7WUFDaEUsTUFBTSxPQUFPLEdBQUcsT0FBTyxFQUFFLE9BQU8sQ0FBQztZQUNqQyxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFbEQsU0FBUyxDQUFDLE9BQVEsQ0FBQyxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxFQUF5QixDQUFDO1lBQ2pELElBQUksS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLGdDQUFnQyxFQUFFLEVBQUUsQ0FBQztnQkFDMUQsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNmLENBQUM7WUFFRCxNQUFNLGFBQWEsR0FBRyw0QkFBNEIsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxLQUFLLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqSCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztZQUUzRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUMxQixTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3pCLENBQUM7WUFFRCxvREFBb0Q7WUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDOUYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMifQ==