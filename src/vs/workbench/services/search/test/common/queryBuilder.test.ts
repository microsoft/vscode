/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { testWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { resolveResourcesForSearchIncludes } from 'vs/workbench/services/search/common/queryBuilder';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';

suite('QueryBuilderCommon', () => {
	let context: IWorkspaceContextService;

	setup(() => {
		const workspace = testWorkspace(URI.file("C:\\testWorkspace"));
		context = new TestContextService(workspace);
	});

	test('resolveResourcesForSearchIncludes passes through paths without special glob characters', () => {
		const actual = resolveResourcesForSearchIncludes([URI.file("C:\\testWorkspace\\pages\\blog")], context);
		assert.deepStrictEqual(actual, ["./pages/blog"]);
	});

	test('resolveResourcesForSearchIncludes escapes paths with special characters', () => {
		const actual = resolveResourcesForSearchIncludes([URI.file("C:\\testWorkspace\\pages\\blog\\[postId]")], context);
		assert.deepStrictEqual(actual, ["./pages/blog/[[]postId[]]"]);
	});
});
