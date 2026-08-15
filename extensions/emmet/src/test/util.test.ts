/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { getMappingForIncludedLanguages } from '../util';
import * as vscode from 'vscode';

suite('Tests for getMappingForIncludedLanguages with one-to-many mapping', () => {

	test('Should return empty object when no config is set', () => {
		const mapping = getMappingForIncludedLanguages();
		assert.ok(mapping);
		assert.strictEqual(Object.keys(mapping).length, 0);
	});

	test('Should handle single string mapping (backward compatibility)', async () => {
		const oldConfig = vscode.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
		await vscode.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': 'html' }, vscode.ConfigurationTarget.Global);
		
		try {
			const mapping = getMappingForIncludedLanguages();
			assert.strictEqual(mapping['javascript'], 'html');
		} finally {
			await vscode.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode.ConfigurationTarget.Global);
		}
	});

	test('Should handle array of languages mapping', async () => {
		const oldConfig = vscode.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
		await vscode.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': ['html', 'css', 'javascript'] }, vscode.ConfigurationTarget.Global);
		
		try {
			const mapping = getMappingForIncludedLanguages();
			assert.ok(Array.isArray(mapping['javascript']));
			assert.strictEqual((mapping['javascript'] as string[]).length, 3);
			assert.ok((mapping['javascript'] as string[]).includes('html'));
			assert.ok((mapping['javascript'] as string[]).includes('css'));
			assert.ok((mapping['javascript'] as string[]).includes('javascript'));
		} finally {
			await vscode.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode.ConfigurationTarget.Global);
		}
	});

	test('Should filter out invalid languages from array', async () => {
		const oldConfig = vscode.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
		await vscode.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': ['html', 'invalidlang', 'css'] }, vscode.ConfigurationTarget.Global);
		
		try {
			const mapping = getMappingForIncludedLanguages();
			assert.ok(Array.isArray(mapping['javascript']));
			assert.strictEqual((mapping['javascript'] as string[]).length, 2);
			assert.ok((mapping['javascript'] as string[]).includes('html'));
			assert.ok((mapping['javascript'] as string[]).includes('css'));
			assert.ok(!(mapping['javascript'] as string[]).includes('invalidlang'));
		} finally {
			await vscode.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode.ConfigurationTarget.Global);
		}
	});

	test('Should handle empty array', async () => {
		const oldConfig = vscode.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
		await vscode.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': [] }, vscode.ConfigurationTarget.Global);
		
		try {
			const mapping = getMappingForIncludedLanguages();
			assert.ok(!mapping['javascript']);
		} finally {
			await vscode.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode.ConfigurationTarget.Global);
		}
	});

	test('Should handle mixed string and array mappings', async () => {
		const oldConfig = vscode.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
		await vscode.workspace.getConfiguration('emmet').update('includeLanguages', { 
			'javascript': ['html', 'css'],
			'typescript': 'html'
		}, vscode.ConfigurationTarget.Global);
		
		try {
			const mapping = getMappingForIncludedLanguages();
			assert.ok(Array.isArray(mapping['javascript']));
			assert.strictEqual((mapping['javascript'] as string[]).length, 2);
			assert.strictEqual(mapping['typescript'], 'html');
		} finally {
			await vscode.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode.ConfigurationTarget.Global);
		}
	});

	test('Should filter invalid string mappings', async () => {
		const oldConfig = vscode.workspace.getConfiguration('emmet').inspect('includeLanguages')?.globalValue;
		await vscode.workspace.getConfiguration('emmet').update('includeLanguages', { 'javascript': 'invalidlang' }, vscode.ConfigurationTarget.Global);
		
		try {
			const mapping = getMappingForIncludedLanguages();
			assert.ok(!mapping['javascript']);
		} finally {
			await vscode.workspace.getConfiguration('emmet').update('includeLanguages', oldConfig, vscode.ConfigurationTarget.Global);
		}
	});
});