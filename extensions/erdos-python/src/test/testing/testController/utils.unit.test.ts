import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { CancellationToken, TestController, TestItem, Uri, Range, Position } from 'vscode';
import { writeTestIdsFile, populateTestTree } from '../../../client/testing/testController/common/utils';
import { EXTENSION_ROOT_DIR } from '../../../client/constants';
import {
    DiscoveredTestNode,
    DiscoveredTestItem,
    ITestResultResolver,
} from '../../../client/testing/testController/common/types';
import { RunTestTag, DebugTestTag } from '../../../client/testing/testController/common/testItemUtilities';

suite('writeTestIdsFile tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should write test IDs to a temporary file', async () => {
        const testIds = ['test1', 'test2', 'test3'];
        const writeFileStub = sandbox.stub(fs.promises, 'writeFile').resolves();

        // Set up XDG_RUNTIME_DIR
        process.env = {
            ...process.env,
            XDG_RUNTIME_DIR: '/xdg/runtime/dir',
        };

        await writeTestIdsFile(testIds);

        assert.ok(writeFileStub.calledOnceWith(sinon.match.string, testIds.join('\n')));
    });

    test('should handle error when accessing temp directory', async () => {
        const testIds = ['test1', 'test2', 'test3'];
        const error = new Error('Access error');
        const accessStub = sandbox.stub(fs.promises, 'access').rejects(error);
        const writeFileStub = sandbox.stub(fs.promises, 'writeFile').resolves();
        const mkdirStub = sandbox.stub(fs.promises, 'mkdir').resolves();

        const result = await writeTestIdsFile(testIds);

        const tempFileFolder = path.join(EXTENSION_ROOT_DIR, '.temp');

        assert.ok(result.startsWith(tempFileFolder));

        assert.ok(accessStub.called);
        assert.ok(mkdirStub.called);
        assert.ok(writeFileStub.calledOnceWith(sinon.match.string, testIds.join('\n')));
    });
});

suite('getTempDir tests', () => {
    let sandbox: sinon.SinonSandbox;
    let originalPlatform: NodeJS.Platform;
    let originalEnv: NodeJS.ProcessEnv;

    setup(() => {
        sandbox = sinon.createSandbox();
        originalPlatform = process.platform;
        originalEnv = process.env;
    });

    teardown(() => {
        sandbox.restore();
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        process.env = originalEnv;
    });

    test('should use XDG_RUNTIME_DIR on non-Windows if available', async () => {
        if (process.platform === 'win32') {
            return;
        }
        // Force platform to be Linux
        Object.defineProperty(process, 'platform', { value: 'linux' });

        // Set up XDG_RUNTIME_DIR
        process.env = { ...process.env, XDG_RUNTIME_DIR: '/xdg/runtime/dir' };

        const testIds = ['test1', 'test2', 'test3'];
        sandbox.stub(fs.promises, 'access').resolves();
        sandbox.stub(fs.promises, 'writeFile').resolves();

        // This will use getTempDir internally
        const result = await writeTestIdsFile(testIds);

        assert.ok(result.startsWith('/xdg/runtime/dir'));
    });
});

suite('populateTestTree tests', () => {
    let sandbox: sinon.SinonSandbox;
    let testController: TestController;
    let resultResolver: ITestResultResolver;
    let cancelationToken: CancellationToken;
    let createTestItemStub: sinon.SinonStub;
    let itemsAddStub: sinon.SinonStub;
    let itemsGetStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Create stubs for TestController methods
        createTestItemStub = sandbox.stub();
        itemsAddStub = sandbox.stub();
        itemsGetStub = sandbox.stub();

        // Create mock TestController
        testController = {
            createTestItem: createTestItemStub,
            items: {
                add: itemsAddStub,
                get: itemsGetStub,
                delete: sandbox.stub(),
                replace: sandbox.stub(),
                forEach: sandbox.stub(),
                size: 0,
                [Symbol.iterator]: sandbox.stub(),
            },
        } as any;

        // Create mock result resolver
        resultResolver = {
            runIdToTestItem: new Map(),
            runIdToVSid: new Map(),
            vsIdToRunId: new Map(),
            detailedCoverageMap: new Map(),
            resolveDiscovery: sandbox.stub(),
            resolveExecution: sandbox.stub(),
            _resolveDiscovery: sandbox.stub(),
            _resolveExecution: sandbox.stub(),
            _resolveCoverage: sandbox.stub(),
        };

        // Mock cancellation token
        cancelationToken = {
            isCancellationRequested: false,
            onCancellationRequested: sandbox.stub(),
        } as any;
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should create a root node if testRoot is undefined', () => {
        // Arrange
        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [],
        };

        const mockRootItem: TestItem = {
            id: '/test/path/root',
            label: 'RootTest',
            uri: Uri.file('/test/path/root'),
            canResolveChildren: true,
            tags: [RunTestTag, DebugTestTag],
            children: {
                add: sandbox.stub(),
                get: sandbox.stub(),
                delete: sandbox.stub(),
                replace: sandbox.stub(),
                forEach: sandbox.stub(),
                size: 0,
                [Symbol.iterator]: sandbox.stub(),
            },
        } as any;

        createTestItemStub.returns(mockRootItem);

        // Act
        populateTestTree(testController, testTreeData, undefined, resultResolver, cancelationToken);

        // Assert
        assert.ok(createTestItemStub.calledOnce);
        // Check the args manually - function uses testTreeData.path as id
        const call = createTestItemStub.firstCall;
        assert.strictEqual(call.args[0], '/test/path/root');
        assert.strictEqual(call.args[1], 'RootTest');
        // Don't check Uri.file since it's complex to compare
        assert.ok(itemsAddStub.calledOnceWith(mockRootItem));
        assert.strictEqual(mockRootItem.canResolveChildren, true);
        assert.deepStrictEqual(mockRootItem.tags, [RunTestTag, DebugTestTag]);
    });

    test('should recursively add children as TestItems', () => {
        // Arrange
        // Tree structure:
        // RootWorkspaceFolder (folder)
        // └── test_example (test)
        const testItem: DiscoveredTestItem = {
            path: '/test/path/test.py',
            name: 'test_example',
            type_: 'test',
            id_: 'test-id',
            lineno: 10,
            runID: 'run-id-123',
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootWorkspaceFolder',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem],
        };

        const childrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            id: 'root-id',
            children: {
                add: childrenAddStub,
            },
        } as any;

        const mockTestItem: TestItem = {
            id: 'test-id',
            label: 'test_example',
            uri: Uri.file('/test/path/test.py'),
            canResolveChildren: false,
            tags: [],
            range: undefined,
        } as any;

        createTestItemStub.returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        assert.ok(createTestItemStub.calledOnceWith('test-id', 'test_example', sinon.match.any));
        assert.ok(childrenAddStub.calledOnceWith(mockTestItem));
        assert.strictEqual(mockTestItem.canResolveChildren, false);
        assert.deepStrictEqual(mockTestItem.tags, [RunTestTag, DebugTestTag]);
    });

    test('should create TestItem with correct range when lineno is provided', () => {
        // Arrange
        const testItem: DiscoveredTestItem = {
            path: '/test/path/test.py',
            name: 'test_example',
            type_: 'test',
            id_: 'test-id',
            lineno: 5,
            runID: 'run-id-123',
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem],
        };

        const mockRootItem: TestItem = {
            children: { add: sandbox.stub() },
        } as any;

        const mockTestItem: TestItem = {
            tags: [],
            range: undefined,
        } as any;

        createTestItemStub.returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        const expectedRange = new Range(new Position(4, 0), new Position(5, 0));
        assert.deepStrictEqual(mockTestItem.range, expectedRange);
    });

    test('should handle lineno = 0 correctly', () => {
        // Arrange
        const testItem: DiscoveredTestItem = {
            path: '/test/path/test.py',
            name: 'test_example',
            type_: 'test',
            id_: 'test-id',
            lineno: '0',
            runID: 'run-id-123',
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem],
        };

        const mockRootItem: TestItem = {
            children: { add: sandbox.stub() },
        } as any;

        const mockTestItem: TestItem = {
            tags: [],
            range: undefined,
        } as any;

        createTestItemStub.returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert- if lineno is '0', range should be defined but at the top
        const expectedRange = new Range(new Position(0, 0), new Position(0, 0));

        assert.deepStrictEqual(mockTestItem.range, expectedRange);
    });

    test('should update resultResolver mappings correctly for test items', () => {
        // Arrange
        const testItem: DiscoveredTestItem = {
            path: '/test/path/test.py',
            name: 'test_example',
            type_: 'test',
            id_: 'test-id',
            lineno: 10,
            runID: 'run-id-123',
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem],
        };

        const mockRootItem: TestItem = {
            children: { add: sandbox.stub() },
        } as any;

        const mockTestItem: TestItem = {
            id: 'test-id',
            tags: [],
        } as any;

        createTestItemStub.returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        assert.strictEqual(resultResolver.runIdToTestItem.get('run-id-123'), mockTestItem);
        assert.strictEqual(resultResolver.runIdToVSid.get('run-id-123'), 'test-id');
        assert.strictEqual(resultResolver.vsIdToRunId.get('test-id'), 'run-id-123');
    });

    test('should create nodes for non-leaf items and recurse', () => {
        // Arrange
        // Tree structure:
        // RootTest (folder)
        // └── NestedFolder (folder)
        //     └── nested_test (test)
        const nestedTestItem: DiscoveredTestItem = {
            path: '/test/path/nested_test.py',
            name: 'nested_test',
            type_: 'test',
            id_: 'nested-test-id',
            lineno: 5,
            runID: 'nested-run-id',
        };

        const nestedNode: DiscoveredTestNode = {
            path: '/test/path/nested',
            name: 'NestedFolder',
            type_: 'folder',
            id_: 'nested-id',
            children: [nestedTestItem],
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [nestedNode],
        };

        const rootChildrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            children: { add: rootChildrenAddStub },
        } as any;

        const nestedChildrenAddStub = sandbox.stub();
        const mockNestedNode: TestItem = {
            id: 'nested-id',
            canResolveChildren: true,
            tags: [],
            children: { add: nestedChildrenAddStub },
        } as any;

        const mockNestedTestItem: TestItem = {
            id: 'nested-test-id',
            tags: [],
        } as any;

        createTestItemStub.onFirstCall().returns(mockNestedNode);
        createTestItemStub.onSecondCall().returns(mockNestedTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        // Should create nested node - uses child.id_ for non-leaf nodes
        assert.ok(createTestItemStub.calledWith('nested-id', 'NestedFolder', sinon.match.any));
        assert.ok(rootChildrenAddStub.calledWith(mockNestedNode));
        assert.strictEqual(mockNestedNode.canResolveChildren, true);
        assert.deepStrictEqual(mockNestedNode.tags, [RunTestTag, DebugTestTag]);

        // Should create nested test item - uses child.id_ for test items too
        assert.ok(createTestItemStub.calledWith('nested-test-id', 'nested_test', sinon.match.any));
        assert.ok(nestedChildrenAddStub.calledWith(mockNestedTestItem));
    });

    test('should reuse existing nodes when they already exist', () => {
        // Arrange
        // Tree structure:
        // RootTest (folder)
        // └── ExistingFolder (folder, already exists)
        //     └── test_example (test)
        const testItem: DiscoveredTestItem = {
            path: '/test/path/test.py',
            name: 'test_example',
            type_: 'test',
            id_: 'test-id',
            lineno: 10,
            runID: 'run-id-123',
        };

        const nestedNode: DiscoveredTestNode = {
            path: '/test/path/existing',
            name: 'ExistingFolder',
            type_: 'folder',
            id_: 'existing-id',
            children: [testItem],
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [nestedNode],
        };

        const rootChildrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            children: { add: rootChildrenAddStub },
        } as any;

        const existingChildrenAddStub = sandbox.stub();
        const existingNode: TestItem = {
            id: 'existing-id',
            children: { add: existingChildrenAddStub },
        } as any;

        const mockTestItem: TestItem = {
            tags: [],
        } as any;

        // Mock existing node in testController.items
        itemsGetStub.withArgs('/test/path/existing').returns(existingNode);
        createTestItemStub.returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        // Should not create a new node, should reuse existing one
        assert.ok(createTestItemStub.calledOnceWith('test-id', 'test_example', sinon.match.any));
        // Should not create a new node for the existing folder
        assert.ok(createTestItemStub.neverCalledWith('existing-id', 'ExistingFolder', sinon.match.any));
        assert.ok(existingChildrenAddStub.calledWith(mockTestItem));
        // Should not add existing node to root children again
        assert.ok(rootChildrenAddStub.notCalled);
    });

    test('should respect cancellation token and stop processing', () => {
        // Arrange
        const testItem1: DiscoveredTestItem = {
            path: '/test/path/test1.py',
            name: 'test1',
            type_: 'test',
            id_: 'test1-id',
            lineno: 10,
            runID: 'run-id-1',
        };

        const testItem2: DiscoveredTestItem = {
            path: '/test/path/test2.py',
            name: 'test2',
            type_: 'test',
            id_: 'test2-id',
            lineno: 20,
            runID: 'run-id-2',
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem1, testItem2],
        };

        const rootChildrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            children: { add: rootChildrenAddStub },
        } as any;

        // Set cancellation token to be cancelled
        const cancelledToken = {
            isCancellationRequested: true,
            onCancellationRequested: sandbox.stub(),
        } as any;

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelledToken);

        // Assert - no test items should be created when cancelled
        assert.ok(createTestItemStub.notCalled);
        assert.ok(rootChildrenAddStub.notCalled);
        assert.strictEqual(resultResolver.runIdToTestItem.size, 0);
    });

    test('should handle empty children array gracefully', () => {
        // Arrange
        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [],
        };

        const rootChildrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            children: { add: rootChildrenAddStub },
        } as any;

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert - should complete without errors
        assert.ok(createTestItemStub.notCalled);
        assert.ok(rootChildrenAddStub.notCalled);
    });

    test('should add correct tags to all created items', () => {
        // Arrange
        // Tree structure:
        // RootTest (folder)
        // └── NestedFolder (folder)
        //     └── test_example (test)
        const testItem: DiscoveredTestItem = {
            path: '/test/path/test.py',
            name: 'test_example',
            type_: 'test',
            id_: 'test-id',
            lineno: 10,
            runID: 'run-id-123',
        };

        const nestedNode: DiscoveredTestNode = {
            path: '/test/path/nested',
            name: 'NestedFolder',
            type_: 'folder',
            id_: 'nested-id',
            children: [testItem],
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [nestedNode],
        };

        const mockRootItem: TestItem = {
            id: 'root-id',
            tags: [],
            canResolveChildren: true,
            children: { add: sandbox.stub() },
        } as any;

        const mockNestedNode: TestItem = {
            id: 'nested-id',
            tags: [],
            canResolveChildren: true,
            children: { add: sandbox.stub() },
        } as any;

        const mockTestItem: TestItem = {
            id: 'test-id',
            tags: [],
            canResolveChildren: false,
        } as any;

        createTestItemStub.onCall(0).returns(mockRootItem);
        createTestItemStub.onCall(1).returns(mockNestedNode);
        createTestItemStub.onCall(2).returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, undefined, resultResolver, cancelationToken);

        // Assert - All items should have RunTestTag and DebugTestTag
        assert.deepStrictEqual(mockRootItem.tags, [RunTestTag, DebugTestTag]);
        assert.deepStrictEqual(mockNestedNode.tags, [RunTestTag, DebugTestTag]);
        assert.deepStrictEqual(mockTestItem.tags, [RunTestTag, DebugTestTag]);
    });
    test('should handle a test node with no lineno property', () => {
        // Arrange
        // Tree structure:
        // RootTest (folder)
        // └── test_without_lineno (test, no lineno)
        const testItem = {
            path: '/test/path/test.py',
            name: 'test_without_lineno',
            type_: 'test',
            id_: 'test-no-lineno-id',
            runID: 'run-id-no-lineno',
        } as DiscoveredTestItem;

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem],
        };

        const childrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            id: 'root-id',
            children: {
                add: childrenAddStub,
            },
        } as any;

        const mockTestItem: TestItem = {
            id: 'test-no-lineno-id',
            label: 'test_without_lineno',
            uri: Uri.file('/test/path/test.py'),
            canResolveChildren: false,
            tags: [],
            range: undefined,
        } as any;

        createTestItemStub.returns(mockTestItem);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        assert.ok(createTestItemStub.calledOnceWith('test-no-lineno-id', 'test_without_lineno', sinon.match.any));
        assert.ok(childrenAddStub.calledOnceWith(mockTestItem));
        // range is undefined since lineno is not provided
        assert.strictEqual(mockTestItem.range, undefined);
        assert.deepStrictEqual(mockTestItem.tags, [RunTestTag, DebugTestTag]);
    });

    test('should handle a node with multiple children', () => {
        // Arrange
        // Tree structure:
        // RootTest (folder)
        // ├── test_one (test)
        // └── test_two (test)
        const testItem1: DiscoveredTestItem = {
            path: '/test/path/test1.py',
            name: 'test_one',
            type_: 'test',
            id_: 'test-one-id',
            lineno: 3,
            runID: 'run-id-one',
        };
        const testItem2: DiscoveredTestItem = {
            path: '/test/path/test2.py',
            name: 'test_two',
            type_: 'test',
            id_: 'test-two-id',
            lineno: 7,
            runID: 'run-id-two',
        };

        const testTreeData: DiscoveredTestNode = {
            path: '/test/path/root',
            name: 'RootTest',
            type_: 'folder',
            id_: 'root-id',
            children: [testItem1, testItem2],
        };

        const childrenAddStub = sandbox.stub();
        const mockRootItem: TestItem = {
            id: 'root-id',
            children: {
                add: childrenAddStub,
            },
        } as any;

        const mockTestItem1: TestItem = {
            id: 'test-one-id',
            label: 'test_one',
            uri: Uri.file('/test/path/test1.py'),
            canResolveChildren: false,
            tags: [],
            range: new Range(new Position(2, 0), new Position(3, 0)),
        } as any;
        const mockTestItem2: TestItem = {
            id: 'test-two-id',
            label: 'test_two',
            uri: Uri.file('/test/path/test2.py'),
            canResolveChildren: false,
            tags: [],
            range: new Range(new Position(6, 0), new Position(7, 0)),
        } as any;

        createTestItemStub.onFirstCall().returns(mockTestItem1);
        createTestItemStub.onSecondCall().returns(mockTestItem2);

        // Act
        populateTestTree(testController, testTreeData, mockRootItem, resultResolver, cancelationToken);

        // Assert
        assert.ok(createTestItemStub.calledWith('test-one-id', 'test_one', sinon.match.any));
        assert.ok(createTestItemStub.calledWith('test-two-id', 'test_two', sinon.match.any));
        // two test items called with mockRootItem's method childrenAddStub
        assert.strictEqual(childrenAddStub.callCount, 2);
        assert.deepStrictEqual(mockTestItem1.tags, [RunTestTag, DebugTestTag]);
        assert.deepStrictEqual(mockTestItem2.tags, [RunTestTag, DebugTestTag]);
        assert.deepStrictEqual(mockTestItem1.range, new Range(new Position(2, 0), new Position(3, 0)));
        assert.deepStrictEqual(mockTestItem2.range, new Range(new Position(6, 0), new Position(7, 0)));
    });
});
