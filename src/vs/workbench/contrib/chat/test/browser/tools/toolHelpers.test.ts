/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { resolveToolUri, findLineNumber, findSymbolColumn, errorResult } from '../../../browser/tools/toolHelpers.js';

suite('Tool Helpers', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockWorkspaceService(folderUri?: URI): IWorkspaceContextService {
		const uri = folderUri ?? URI.parse('file:///workspace');
		const folder = {
			uri,
			toResource: (relativePath: string) => URI.joinPath(uri, relativePath),
		} as unknown as IWorkspaceFolder;
		return {
			_serviceBrand: undefined,
			getWorkspace: () => ({ folders: [folder] }),
			getWorkspaceFolder: (u: URI) => {
				if (u.toString().startsWith(uri.toString())) {
					return folder;
				}
				return null;
			},
		} as unknown as IWorkspaceContextService;
	}

	suite('resolveToolUri', () => {

		test('resolves full URI string', () => {
			const ws = createMockWorkspaceService();
			const result = resolveToolUri({ symbol: 'x', lineContent: 'x', uri: 'file:///test/file.ts' }, ws);
			assert.strictEqual(result?.toString(), 'file:///test/file.ts');
		});

		test('resolves workspace-relative filePath', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///project'));
			const result = resolveToolUri({ symbol: 'x', lineContent: 'x', filePath: 'src/index.ts' }, ws);
			assert.strictEqual(result?.toString(), 'file:///project/src/index.ts');
		});

		test('prefers uri over filePath', () => {
			const ws = createMockWorkspaceService();
			const result = resolveToolUri({ symbol: 'x', lineContent: 'x', uri: 'file:///explicit.ts', filePath: 'other.ts' }, ws);
			assert.strictEqual(result?.toString(), 'file:///explicit.ts');
		});

		test('returns undefined when neither provided', () => {
			const ws = createMockWorkspaceService();
			const result = resolveToolUri({ symbol: 'x', lineContent: 'x' }, ws);
			assert.strictEqual(result, undefined);
		});
	});

	suite('findLineNumber', () => {

		test('finds exact match', () => {
			const model = disposables.add(createTextModel('line one\nline two\nline three'));
			assert.strictEqual(findLineNumber(model, 'line two'), 2);
		});

		test('handles whitespace normalization', () => {
			const model = disposables.add(createTextModel('function   doSomething(x:  number) {}'));
			assert.strictEqual(findLineNumber(model, 'function doSomething(x: number)'), 1);
		});

		test('returns undefined when not found', () => {
			const model = disposables.add(createTextModel('hello world'));
			assert.strictEqual(findLineNumber(model, 'not here'), undefined);
		});

		test('handles regex special characters in content', () => {
			const model = disposables.add(createTextModel('const arr = [1, 2, 3];'));
			assert.strictEqual(findLineNumber(model, '[1, 2, 3]'), 1);
		});

		test('finds partial line match', () => {
			const model = disposables.add(createTextModel('import { MyClass } from "./myModule";'));
			assert.strictEqual(findLineNumber(model, 'MyClass'), 1);
		});

		test('trims leading and trailing whitespace from input', () => {
			const model = disposables.add(createTextModel('const x = 42;'));
			assert.strictEqual(findLineNumber(model, '  const x = 42;  '), 1);
		});
	});

	suite('findSymbolColumn', () => {

		test('finds symbol with word boundaries', () => {
			assert.strictEqual(findSymbolColumn('const myVar = 42;', 'myVar'), 7);
		});

		test('returns 1-based column', () => {
			assert.strictEqual(findSymbolColumn('x = 1', 'x'), 1);
		});

		test('does not match partial words', () => {
			assert.strictEqual(findSymbolColumn('const myVariable = 42;', 'myVar'), undefined);
		});

		test('returns undefined when not found', () => {
			assert.strictEqual(findSymbolColumn('hello world', 'missing'), undefined);
		});

		test('handles regex special characters in symbol name', () => {
			assert.strictEqual(findSymbolColumn('arr[0] = 1', 'arr'), 1);
		});

		test('finds first occurrence', () => {
			assert.strictEqual(findSymbolColumn('foo + foo', 'foo'), 1);
		});
	});

	suite('errorResult', () => {

		test('creates result with text content', () => {
			const result = errorResult('something went wrong');
			const textPart = result.content.find(p => p.kind === 'text');
			assert.ok(textPart);
			assert.strictEqual((textPart as { kind: 'text'; value: string }).value, 'something went wrong');
		});

		test('sets toolResultMessage', () => {
			const result = errorResult('error message');
			assert.ok(result.toolResultMessage);
		});
	});
});
