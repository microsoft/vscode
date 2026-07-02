/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRevertOptions, ISaveOptions } from '../../../../common/editor.js';
import { ICustomEditorModel } from '../../common/customEditor.js';
import { CustomEditorModelManager } from '../../common/customEditorModelManager.js';

class MockCustomEditorModel extends Disposable implements ICustomEditorModel {
	readonly viewType: string;
	readonly resource: URI;
	readonly backupId = undefined;
	readonly canHotExit = false;
	readonly onDidChangeReadonly = Event.None;
	readonly onDidChangeOrphaned = Event.None;
	readonly onDidChangeDirty = Event.None;

	constructor(resource: URI, viewType: string) {
		super();
		this.resource = resource;
		this.viewType = viewType;
	}

	isReadonly(): boolean | IMarkdownString { return false; }
	isOrphaned(): boolean { return false; }
	isDirty(): boolean { return false; }
	async revert(_options?: IRevertOptions): Promise<void> { }
	async saveCustomEditor(_options?: ISaveOptions): Promise<URI | undefined> { return undefined; }
	async saveCustomEditorAs(_resource: URI, _targetResource: URI, _options?: ISaveOptions): Promise<boolean> { return false; }
}

suite('CustomEditorModelManager', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.parse('test://foo/bar.fnf');
	const viewType = 'my.editor';

	test('add and retain a model', async () => {
		const manager = new CustomEditorModelManager();
		const model = new MockCustomEditorModel(resource, viewType);
		const ref = await manager.add(resource, viewType, Promise.resolve(model));
		assert.strictEqual(ref.object, model);
		ref.dispose();
	});

	test('tryRetain returns undefined for unknown resource', () => {
		const manager = new CustomEditorModelManager();
		assert.strictEqual(manager.tryRetain(resource, viewType), undefined);
	});

	test('add throws if model already exists', async () => {
		const manager = new CustomEditorModelManager();
		const model = new MockCustomEditorModel(resource, viewType);
		const ref = await manager.add(resource, viewType, Promise.resolve(model));
		assert.throws(() => manager.add(resource, viewType, Promise.resolve(model)));
		ref.dispose();
	});

	test('stale entry is cleaned up when model promise rejects, allowing a new model for the same resource', async () => {
		// Reproduces the scenario from https://github.com/microsoft/vscode/issues/278883:
		// A file is deleted while a custom text editor is open. On the next session restore,
		// CustomTextEditorModel.create() fails (file not found). Without the model.catch()
		// cleanup the rejected promise stays in _references and blocks any subsequent attempt
		// to open a new file with the same name in the same custom editor.
		const manager = new CustomEditorModelManager();

		let rejectModel!: (err: Error) => void;
		const rejectedModel: Promise<ICustomEditorModel> = new Promise((_resolve, reject) => {
			rejectModel = reject;
		});
		rejectedModel.catch(() => { /* swallow unhandled rejection */ });

		// Simulate what resolveWebview does: add the model (counter goes to 1).
		const pendingRef = manager.add(resource, viewType, rejectedModel);
		pendingRef.catch(() => { /* expected */ });

		// Trigger the rejection.
		rejectModel(new Error('file not found'));

		// Wait a microtask so all .catch() handlers have run.
		await Promise.resolve();

		// The stale entry must be gone — tryRetain returns undefined.
		assert.strictEqual(manager.tryRetain(resource, viewType), undefined);

		// A fresh model for the same resource must now be addable and usable.
		const newModel = new MockCustomEditorModel(resource, viewType);
		const ref = await manager.add(resource, viewType, Promise.resolve(newModel));
		assert.strictEqual(ref.object, newModel);
		ref.dispose();
	});
});
