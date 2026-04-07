/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatResponseFileTreePart } from '../../../../vscodeTypes';
import { convertFileTreeToChatResponseFileTree } from '../../common/fileTreeParser';

suite('convertFileTreeToChatResponseFileTree', () => {
	const generatePreviewURI = (filename: string) => URI.file(`/preview/${filename}`);

	test('should convert a simple file tree', () => {
		const fileStructure = `
project
├── file1.txt
└── file2.txt
		`;

		const { chatResponseTree, projectName } = convertFileTreeToChatResponseFileTree(fileStructure, generatePreviewURI);

		expect(projectName).toBe('project');
		expect(chatResponseTree).to.deep.equal(new ChatResponseFileTreePart([
			{
				name: 'project',
				children: [
					{ name: 'file1.txt' },
					{ name: 'file2.txt' }
				]
			}
		], URI.file('/preview/project')));
	});

	test('should handle nested directories', () => {
		const fileStructure = `
project
├── dir1
│   └── file1.txt
└── dir2
    └── file2.txt
		`;

		const { chatResponseTree, projectName } = convertFileTreeToChatResponseFileTree(fileStructure, generatePreviewURI);

		expect(projectName).toBe('project');
		expect(chatResponseTree).to.deep.equal(new ChatResponseFileTreePart([
			{
				name: 'project',
				children: [
					{
						name: 'dir1',
						children: [{ name: 'file1.txt' }]
					},
					{
						name: 'dir2',
						children: [{ name: 'file2.txt' }]
					}
				]
			}
		], URI.file('/preview/project')));
	});

	test('should filter out unwanted files', () => {
		const fileStructure = `
project
├── node_modules
├── file1.txt
└── file2.txt
		`;

		const { chatResponseTree, projectName } = convertFileTreeToChatResponseFileTree(fileStructure, generatePreviewURI);

		expect(projectName).toBe('project');
		expect(chatResponseTree).to.deep.equal(new ChatResponseFileTreePart([
			{
				name: 'project',
				children: [
					{ name: 'file1.txt' },
					{ name: 'file2.txt' }
				]
			}
		], URI.file('/preview/project')));
	});
});
