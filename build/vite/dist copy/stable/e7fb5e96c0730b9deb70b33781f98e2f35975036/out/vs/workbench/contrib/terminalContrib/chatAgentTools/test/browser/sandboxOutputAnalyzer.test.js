/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { outputLooksSandboxBlocked } from '../../browser/tools/sandboxOutputAnalyzer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('outputLooksSandboxBlocked', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const positives = [
        ['macOS sandbox file write', '/bin/bash: /tmp/test.txt: Operation not permitted'],
        ['Linux sandbox file write', '/usr/bin/bash: /tmp/test.txt: Read-only file system'],
        ['Permission denied', 'bash: ./script.sh: Permission denied'],
        ['sandbox-exec reference', 'sandbox-exec: some error occurred'],
        ['bwrap reference', 'bwrap: error setting up namespace'],
        ['sandbox_violation', 'sandbox_violation: deny(1) file-write-create /tmp/foo'],
        ['case insensitive', '/bin/bash: OPERATION NOT PERMITTED'],
        ['wrapped across lines', '/bin/bash: Operation not\npermitted'],
    ];
    for (const [label, output] of positives) {
        test(`detects: ${label}`, () => {
            strictEqual(outputLooksSandboxBlocked(output), true);
        });
    }
    const negatives = [
        ['normal output', 'hello world'],
        ['empty output', ''],
        ['unrelated error', 'Error: ENOENT: no such file or directory'],
    ];
    for (const [label, output] of negatives) {
        test(`ignores: ${label}`, () => {
            strictEqual(outputLooksSandboxBlocked(output), false);
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveE91dHB1dEFuYWx5emVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL3NhbmRib3hPdXRwdXRBbmFseXplci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDekYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdEcsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN2Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sU0FBUyxHQUF1QjtRQUNyQyxDQUFDLDBCQUEwQixFQUFFLG1EQUFtRCxDQUFDO1FBQ2pGLENBQUMsMEJBQTBCLEVBQUUscURBQXFELENBQUM7UUFDbkYsQ0FBQyxtQkFBbUIsRUFBRSxzQ0FBc0MsQ0FBQztRQUM3RCxDQUFDLHdCQUF3QixFQUFFLG1DQUFtQyxDQUFDO1FBQy9ELENBQUMsaUJBQWlCLEVBQUUsbUNBQW1DLENBQUM7UUFDeEQsQ0FBQyxtQkFBbUIsRUFBRSx1REFBdUQsQ0FBQztRQUM5RSxDQUFDLGtCQUFrQixFQUFFLG9DQUFvQyxDQUFDO1FBQzFELENBQUMsc0JBQXNCLEVBQUUscUNBQXFDLENBQUM7S0FDL0QsQ0FBQztJQUVGLEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUN6QyxJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUU7WUFDOUIsV0FBVyxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELE1BQU0sU0FBUyxHQUF1QjtRQUNyQyxDQUFDLGVBQWUsRUFBRSxhQUFhLENBQUM7UUFDaEMsQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDO1FBQ3BCLENBQUMsaUJBQWlCLEVBQUUsMENBQTBDLENBQUM7S0FDL0QsQ0FBQztJQUVGLEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUN6QyxJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUU7WUFDOUIsV0FBVyxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDIn0=