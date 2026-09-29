/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { disposeAll } from '../../utils/dispose';
import { joinLines, withRandomFileEditor } from '../testUtils';
import { updateConfig, VsCodeConfiguration } from './referencesCodeLens.test';

const Config = {
	referencesCodeLens: 'typescript.referencesCodeLens.enabled',
	implementationsCodeLens: 'typescript.implementationsCodeLens.enabled',
	showOnAllClassMethods: 'typescript.implementationsCodeLens.showOnAllClassMethods',
};

function getCodeLenses(doc: vscode.TextDocument) {
	return vscode.commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', doc.uri);
}

suite('TypeScript Implementations CodeLens', () => {
	const configDefaults = Object.freeze<VsCodeConfiguration>({
		[Config.referencesCodeLens]: false,
		[Config.implementationsCodeLens]: true,
		[Config.showOnAllClassMethods]: false,
	});

	const _disposables: vscode.Disposable[] = [];
	let oldConfig: { [key: string]: any } = {};

	setup(async () => {
		// the tests assume that typescript features are registered
		await vscode.extensions.getExtension('vscode.typescript-language-features')!.activate();

		// Save off config and apply defaults
		oldConfig = await updateConfig(configDefaults);
	});

	teardown(async () => {
		disposeAll(_disposables);

		// Restore config
		await updateConfig(oldConfig);

		return vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Should show on interfaces and abstract classes', async () => {
		await withRandomFileEditor(
			joinLines(
				'interface IFoo {}',
				'class Foo implements IFoo {}',
				'abstract class AbstractBase {}',
				'class Concrete extends AbstractBase {}'
			),
			'ts',
			async (_editor: vscode.TextEditor, doc: vscode.TextDocument) => {
				const lenses = await getCodeLenses(doc);
				assert.strictEqual(lenses?.length, 2);

				assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected interface IFoo to have a CodeLens');
				assert.strictEqual(lenses?.[1].range.start.line, 2, 'Expected abstract class AbstractBase to have a CodeLens');
			},
		);
	});

	test('Should show on abstract methods, properties, and getters', async () => {
		await withRandomFileEditor(
			joinLines(
				'abstract class Base {',
				'    abstract method(): void;',
				'    abstract property: string;',
				'    abstract get getter(): number;',
				'}',
				'class Derived extends Base {',
				'    method() {}',
				'    property = "test";',
				'    get getter() { return 42; }',
				'}',
			),
			'ts',
			async (_editor: vscode.TextEditor, doc: vscode.TextDocument) => {
				const lenses = await getCodeLenses(doc);
				assert.strictEqual(lenses?.length, 4);

				assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected abstract class to have a CodeLens');
				assert.strictEqual(lenses?.[1].range.start.line, 1, 'Expected abstract method to have a CodeLens');
				assert.strictEqual(lenses?.[2].range.start.line, 2, 'Expected abstract property to have a CodeLens');
				assert.strictEqual(lenses?.[3].range.start.line, 3, 'Expected abstract getter to have a CodeLens');
			},
		);
	});

	test('Should not show implementations on methods by default', async () => {
		await withRandomFileEditor(
			joinLines(
				'abstract class A {',
				'    foo() {}',
				'}',
				'class B extends A {',
				'    foo() {}',
				'}',
			),
			'ts',
			async (_editor: vscode.TextEditor, doc: vscode.TextDocument) => {
				const lenses = await getCodeLenses(doc);
				assert.strictEqual(lenses?.length, 1);
			},
		);
	});

	test('should show on all methods when showOnAllClassMethods is enabled', async () => {
		await updateConfig({
			[Config.showOnAllClassMethods]: true
		});

		await withRandomFileEditor(
			joinLines(
				'abstract class A {',
				'    foo() {}',
				'}',
				'class B extends A {',
				'    foo() {}',
				'}',
			),
			'ts',
			async (_editor: vscode.TextEditor, doc: vscode.TextDocument) => {
				const lenses = await getCodeLenses(doc);
				assert.strictEqual(lenses?.length, 3);

				assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected class A to have a CodeLens');
				assert.strictEqual(lenses?.[1].range.start.line, 1, 'Expected method A.foo to have a CodeLens');
				assert.strictEqual(lenses?.[2].range.start.line, 4, 'Expected method B.foo to have a CodeLens');
			},
		);
	});

	test('should not show on private methods when showOnAllClassMethods is enabled', async () => {
		await updateConfig({
			[Config.showOnAllClassMethods]: true
		});

		await withRandomFileEditor(
			joinLines(
				'abstract class A {',
				'    public foo() {}',
				'    private bar() {}',
				'    protected baz() {}',
				'}',
				'class B extends A {',
				'    public foo() {}',
				'    protected baz() {}',
				'}',
			),
			'ts',
			async (_editor: vscode.TextEditor, doc: vscode.TextDocument) => {
				const lenses = await getCodeLenses(doc);
				assert.strictEqual(lenses?.length, 5);

				assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected class A to have a CodeLens');
				assert.strictEqual(lenses?.[1].range.start.line, 1, 'Expected method A.foo to have a CodeLens');
				assert.strictEqual(lenses?.[2].range.start.line, 3, 'Expected method A.baz to have a CodeLens');
				assert.strictEqual(lenses?.[3].range.start.line, 6, 'Expected method B.foo to have a CodeLens');
				assert.strictEqual(lenses?.[4].range.start.line, 7, 'Expected method B.baz to have a CodeLens');
			},
		);
	});
});
