/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { observableValue, derived, autorun } from '../../../common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { debugGetObservableGraph } from '../../../common/observableInternal/logging/debugGetDependencyGraph.js';
suite('debug', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    test('debugGetDependencyGraph', () => {
        const myObservable1 = observableValue('myObservable1', 0);
        const myObservable2 = observableValue('myObservable2', 0);
        const myComputed1 = derived(reader => {
            /** @description myComputed1 */
            const value1 = myObservable1.read(reader);
            const value2 = myObservable2.read(reader);
            const sum = value1 + value2;
            return sum;
        });
        const myComputed2 = derived(reader => {
            /** @description myComputed2 */
            const value1 = myComputed1.read(reader);
            const value2 = myObservable1.read(reader);
            const value3 = myObservable2.read(reader);
            const sum = value1 + value2 + value3;
            return sum;
        });
        const myComputed3 = derived(reader => {
            /** @description myComputed3 */
            const value1 = myComputed2.read(reader);
            const value2 = myObservable1.read(reader);
            const value3 = myObservable2.read(reader);
            const sum = value1 + value2 + value3;
            return sum;
        });
        ds.add(autorun(reader => {
            /** @description myAutorun */
            myComputed3.read(reader);
        }));
        let idx = 0;
        assert.deepStrictEqual(debugGetObservableGraph(myComputed3, { type: 'dependencies', debugNamePostProcessor: name => `name${++idx}` }), '* derived name1:\n  value: 0\n  state: upToDate\n  dependencies:\n\t\t* derived name2:\n\t\t  value: 0\n\t\t  state: upToDate\n\t\t  dependencies:\n\t\t\t\t* derived name3:\n\t\t\t\t  value: 0\n\t\t\t\t  state: upToDate\n\t\t\t\t  dependencies:\n\t\t\t\t\t\t* observableValue name4:\n\t\t\t\t\t\t  value: 0\n\t\t\t\t\t\t  state: upToDate\n\t\t\t\t\t\t* observableValue name5:\n\t\t\t\t\t\t  value: 0\n\t\t\t\t\t\t  state: upToDate\n\t\t\t\t* observableValue name6 (already listed)\n\t\t\t\t* observableValue name7 (already listed)\n\t\t* observableValue name8 (already listed)\n\t\t* observableValue name9 (already listed)');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vb2JzZXJ2YWJsZXMvZGVidWcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ3RFLGlFQUFpRTtBQUNqRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUVoSCxLQUFLLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtJQUNuQixNQUFNLEVBQUUsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXJELElBQUksQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDcEMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxRCxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFELE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNwQywrQkFBK0I7WUFDL0IsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxQyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDNUIsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNwQywrQkFBK0I7WUFDL0IsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4QyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUMsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDckMsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNwQywrQkFBK0I7WUFDL0IsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4QyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUMsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDckMsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3ZCLDZCQUE2QjtZQUM3QixXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFHSixJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDWixNQUFNLENBQUMsZUFBZSxDQUNyQix1QkFBdUIsQ0FBQyxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLHNCQUFzQixFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFDOUcsZ25CQUFnbkIsQ0FDaG5CLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=