/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { getOutput } from '../../browser/outputHelpers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('outputHelpers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockInstance(lines) {
        const buffer = {
            length: lines.length,
            getLine: (index) => {
                const line = lines[index];
                if (!line) {
                    return undefined;
                }
                return {
                    isWrapped: !!line.isWrapped,
                    translateToString: (trimRight) => trimRight ? line.text.replace(/\s+$/g, '') : line.text
                };
            }
        };
        return {
            xterm: {
                raw: {
                    buffer: {
                        active: buffer
                    }
                }
            }
        };
    }
    test('preserves explicit newline after an 80-column soft wrap', () => {
        const line80 = 'A'.repeat(80);
        const instance = createMockInstance([
            { text: line80 },
            { text: 'X', isWrapped: true },
            { text: 'after' }
        ]);
        const output = getOutput(instance);
        strictEqual(output, `${line80}X\nafter`);
    });
    test('rewinds marker when it starts on a wrapped continuation line', () => {
        const line80 = 'A'.repeat(80);
        const instance = createMockInstance([
            { text: line80 },
            { text: 'X', isWrapped: true },
            { text: 'after' }
        ]);
        const marker = { line: 1 };
        const output = getOutput(instance, marker);
        strictEqual(output, `${line80}X\nafter`);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0SGVscGVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL3Rlc3QvYnJvd3Nlci9vdXRwdXRIZWxwZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUdyQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdEcsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFDM0IsdUNBQXVDLEVBQUUsQ0FBQztJQUMxQyxTQUFTLGtCQUFrQixDQUFDLEtBQThDO1FBQ3pFLE1BQU0sTUFBTSxHQUFHO1lBQ2QsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3BCLE9BQU8sRUFBRSxDQUFDLEtBQWEsRUFBRSxFQUFFO2dCQUMxQixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDWCxPQUFPLFNBQVMsQ0FBQztnQkFDbEIsQ0FBQztnQkFDRCxPQUFPO29CQUNOLFNBQVMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7b0JBQzNCLGlCQUFpQixFQUFFLENBQUMsU0FBbUIsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJO2lCQUNsRyxDQUFDO1lBQ0gsQ0FBQztTQUNELENBQUM7UUFDRixPQUFPO1lBQ04sS0FBSyxFQUFFO2dCQUNOLEdBQUcsRUFBRTtvQkFDSixNQUFNLEVBQUU7d0JBQ1AsTUFBTSxFQUFFLE1BQU07cUJBQ2Q7aUJBQ0Q7YUFDRDtTQUMrQixDQUFDO0lBQ25DLENBQUM7SUFFRCxJQUFJLENBQUMseURBQXlELEVBQUUsR0FBRyxFQUFFO1FBQ3BFLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUIsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7WUFDbkMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2hCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO1lBQzlCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRTtTQUNqQixDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbkMsV0FBVyxDQUFDLE1BQU0sRUFBRSxHQUFHLE1BQU0sVUFBVSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO1FBQ3pFLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUIsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUM7WUFDbkMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2hCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO1lBQzlCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRTtTQUNqQixDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQWtCLENBQUM7UUFDM0MsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMzQyxXQUFXLENBQUMsTUFBTSxFQUFFLEdBQUcsTUFBTSxVQUFVLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=