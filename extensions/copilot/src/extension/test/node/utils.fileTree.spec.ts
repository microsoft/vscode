/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'vitest';
import { fileTreePartToMarkdown } from '../../../util/common/fileTree';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatResponseFileTreePart } from '../../../vscodeTypes';


suite('fileTreeParsing', () => {
	test('Simple File tree', () => {
		const baseUri = URI.parse('file://foo/projectName',);
		const fileTreePart: ChatResponseFileTreePart = {
			baseUri: baseUri,
			value: [
				{
					name: 'src',
					children: [
						{
							name: 'file1.ts'
						},
						{
							name: 'file2.ts'
						},
					]
				},
				{
					name: 'package.json'
				}
			]
		};

		const fileTreeMarkdown = fileTreePartToMarkdown(fileTreePart);
		assert.equal(fileTreeMarkdown, '```filetree\nprojectName\n├── src\n|   ├── file1.ts\n|   └── file2.ts\n└── package.json\n```\n');
	});

	test('File tree', () => {
		const baseUri = URI.parse('file://foo/my-vscode-extension',);
		const fileTreePart: ChatResponseFileTreePart = {
			baseUri: baseUri,
			value: [
				{
					name: '.vscode',
					children: [
						{
							name: 'launch.json'
						},
						{
							name: 'tasks.json'
						},
					]
				},
				{
					name: 'src',
					children: [
						{
							name: 'extensions.ts'
						},
					]
				},
				{
					name: 'test',
					children: [
						{
							name: 'extension.test.ts'
						}
					]
				},
				{
					name: 'package.json'
				},
				{
					name: 'tsconfig.json'
				},
				{
					name: 'README.md'
				}
			]
		};

		const fileTreeMarkdown = fileTreePartToMarkdown(fileTreePart);
		assert.equal(fileTreeMarkdown, '```filetree\nmy-vscode-extension\n├── .vscode\n|   ├── launch.json\n|   └── tasks.json\n├── src\n|   └── extensions.ts\n├── test\n|   └── extension.test.ts\n├── package.json\n├── tsconfig.json\n└── README.md\n```\n');
	});
});
