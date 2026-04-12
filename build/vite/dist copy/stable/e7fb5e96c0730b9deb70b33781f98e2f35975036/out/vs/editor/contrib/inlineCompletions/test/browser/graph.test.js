/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DirectedGraph } from '../../browser/model/graph.js';
suite('DirectedGraph', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('from - creates empty graph', () => {
        const graph = DirectedGraph.from([], () => []);
        assert.deepStrictEqual(graph.getOutgoing('a'), []);
    });
    test('from - creates graph with single node', () => {
        const graph = DirectedGraph.from(['a'], () => []);
        assert.deepStrictEqual(graph.getOutgoing('a'), []);
    });
    test('from - creates graph with nodes and edges', () => {
        const nodes = ['a', 'b', 'c'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['b', 'c'];
                case 'b':
                    return ['c'];
                case 'c':
                    return [];
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        assert.deepStrictEqual([...graph.getOutgoing('a')].sort(), ['b', 'c']);
        assert.deepStrictEqual(graph.getOutgoing('b'), ['c']);
        assert.deepStrictEqual(graph.getOutgoing('c'), []);
    });
    test('from - handles duplicate edges', () => {
        const nodes = ['a', 'b'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['b', 'b']; // Duplicate edge
                case 'b':
                    return [];
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        assert.deepStrictEqual(graph.getOutgoing('a'), ['b']);
        assert.deepStrictEqual(graph.getOutgoing('b'), []);
    });
    test('removeCycles - no cycles', () => {
        const nodes = ['a', 'b', 'c'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['b'];
                case 'b':
                    return ['c'];
                case 'c':
                    return [];
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        const result = graph.removeCycles();
        assert.deepStrictEqual(result.foundCycles, []);
        assert.deepStrictEqual(graph.getOutgoing('a'), ['b']);
        assert.deepStrictEqual(graph.getOutgoing('b'), ['c']);
        assert.deepStrictEqual(graph.getOutgoing('c'), []);
    });
    test('removeCycles - simple cycle', () => {
        const nodes = ['a', 'b'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['b'];
                case 'b':
                    return ['a']; // Creates cycle
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        const result = graph.removeCycles();
        assert.strictEqual(result.foundCycles.length, 1);
        assert.ok(result.foundCycles.includes('a') || result.foundCycles.includes('b'));
        // After removing cycles, one of the edges should be removed
        const aOutgoing = graph.getOutgoing('a');
        const bOutgoing = graph.getOutgoing('b');
        assert.ok((aOutgoing.length === 0 && bOutgoing.length === 1) ||
            (aOutgoing.length === 1 && bOutgoing.length === 0));
    });
    test('removeCycles - self loop', () => {
        const nodes = ['a'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['a']; // Self loop
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        const result = graph.removeCycles();
        assert.deepStrictEqual(result.foundCycles, ['a']);
        assert.deepStrictEqual(graph.getOutgoing('a'), []);
    });
    test('removeCycles - complex cycle', () => {
        const nodes = ['a', 'b', 'c', 'd'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['b'];
                case 'b':
                    return ['c'];
                case 'c':
                    return ['d', 'a']; // Creates cycle back to 'a'
                case 'd':
                    return [];
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        const result = graph.removeCycles();
        assert.ok(result.foundCycles.length >= 1);
        // After removing cycles, there should be no path back to 'a' from 'c'
        const cOutgoing = graph.getOutgoing('c');
        assert.ok(!cOutgoing.includes('a'));
    });
    test('removeCycles - multiple disconnected cycles', () => {
        const nodes = ['a', 'b', 'c', 'd'];
        const getOutgoing = (node) => {
            switch (node) {
                case 'a':
                    return ['b'];
                case 'b':
                    return ['a']; // Cycle 1: a <-> b
                case 'c':
                    return ['d'];
                case 'd':
                    return ['c']; // Cycle 2: c <-> d
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        const result = graph.removeCycles();
        assert.ok(result.foundCycles.length >= 2);
        // After removing cycles, each pair should have only one direction
        const aOutgoing = graph.getOutgoing('a');
        const bOutgoing = graph.getOutgoing('b');
        const cOutgoing = graph.getOutgoing('c');
        const dOutgoing = graph.getOutgoing('d');
        assert.ok((aOutgoing.length === 0 && bOutgoing.length === 1) ||
            (aOutgoing.length === 1 && bOutgoing.length === 0));
        assert.ok((cOutgoing.length === 0 && dOutgoing.length === 1) ||
            (cOutgoing.length === 1 && dOutgoing.length === 0));
    });
    test('getOutgoing - non-existent node', () => {
        const graph = DirectedGraph.from(['a'], () => []);
        assert.deepStrictEqual(graph.getOutgoing('b'), []);
    });
    test('with number nodes', () => {
        const nodes = [1, 2, 3];
        const getOutgoing = (node) => {
            switch (node) {
                case 1:
                    return [2, 3];
                case 2:
                    return [3];
                case 3:
                    return [];
                default:
                    return [];
            }
        };
        const graph = DirectedGraph.from(nodes, getOutgoing);
        assert.deepStrictEqual([...graph.getOutgoing(1)].sort(), [2, 3]);
        assert.deepStrictEqual(graph.getOutgoing(2), [3]);
        assert.deepStrictEqual(graph.getOutgoing(3), []);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGgudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL3Rlc3QvYnJvd3Nlci9ncmFwaC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFN0QsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFDM0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBQ3ZDLE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQVMsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7UUFDbEQsTUFBTSxLQUFLLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7UUFDdEQsTUFBTSxLQUFLLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FB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