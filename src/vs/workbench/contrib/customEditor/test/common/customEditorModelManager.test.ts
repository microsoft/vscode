/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICustomEditorModel } from '../../common/customEditor.js';
import { CustomEditorModelManager } from '../../common/customEditorModelManager.js';

class StubCustomEditorModel implements ICustomEditorModel {
	public readonly viewType: string;
	public readonly resource: URI;
	public readonly backupId: string | undefined = undefined;
	public readonly canHotExit: boolean = false;

	private readonly _onDidChangeReadonly = new Emitter<void>();
	public readonly onDidChangeReadonly = this._onDidChangeReadonly.event;

	private readonly _onDidChangeOrphaned = new Emitter<void>();
	public readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	private readonly _onDidChangeDirty = new Emitter<void>();
	public readonly onDidChangeDirty = this._onDidChangeDirty.event;

	constructor(viewType: string, resource: URI) {
		this.viewType = viewType;
		this.resource = resource;
	}

	public isReadonly(): boolean | IMarkdownString {
		return false;
	}

	public isOrphaned(): boolean {
		return false;
	}

	public isDirty(): boolean {
		return false;
	}

	public async revert(): Promise<void> {
		return;
	}

	public async saveCustomEditor(): Promise<URI | undefined> {
		return undefined;
	}

	public async saveCustomEditorAs(): Promise<boolean> {
		return true;
	}

	public dispose(): void {
		this._onDidChangeReadonly.dispose();
		this._onDidChangeOrphaned.dispose();
		this._onDidChangeDirty.dispose();
	}
}

suite('CustomEditorModelManager', () => {

	const resource = URI.parse('test:///foo');
	const viewType = 'test.viewType';

	ensureNoDisposablesAreLeakedInTestSuite();

	test('add then tryRetain returns same model', async () => {
		const manager = new CustomEditorModelManager();
		const model = new StubCustomEditorModel(viewType, resource);

		const ref = await manager.add(resource, viewType, Promise.resolve(model));
		try {
			assert.strictEqual(ref.object, model);

			const retained = await manager.tryRetain(resource, viewType)!;
			try {
				assert.strictEqual(retained.object, model);
			} finally {
				retained.dispose();
			}
		} finally {
			ref.dispose();
		}
	});

	test('rejected add evicts cache so subsequent open re-attempts resolver (issue #268301)', async () => {
		const manager = new CustomEditorModelManager();

		// First attempt: resolver rejects.
		const failure = new Error('boom');
		const failingModel = Promise.reject<ICustomEditorModel>(failure);
		// Swallow the unhandled rejection from the cache eviction handler attached
		// inside `add`; the test asserts the rejection propagates via the returned ref.
		failingModel.catch(() => { });

		await assert.rejects(manager.add(resource, viewType, failingModel), /boom/);

		// Allow the catch-handler microtask attached inside `add` to run, so the
		// cache entry has had a chance to be evicted before the next call.
		await new Promise<void>(resolve => queueMicrotask(resolve));

		// A subsequent tryRetain must return undefined (cache evicted), forcing the
		// caller to invoke `add` again instead of receiving the cached rejection.
		assert.strictEqual(manager.tryRetain(resource, viewType), undefined,
			'Expected tryRetain to return undefined after the previous resolver rejected');

		// And the caller must be able to add a fresh model under the same key.
		const fresh = new StubCustomEditorModel(viewType, resource);
		const ref = await manager.add(resource, viewType, Promise.resolve(fresh));
		try {
			assert.strictEqual(ref.object, fresh);
		} finally {
			ref.dispose();
		}
	});

	test('successful add does not evict cache entry', async () => {
		const manager = new CustomEditorModelManager();
		const model = new StubCustomEditorModel(viewType, resource);

		const ref = await manager.add(resource, viewType, Promise.resolve(model));
		try {
			// Let any deferred microtasks run.
			await new Promise<void>(resolve => queueMicrotask(resolve));

			const retained = manager.tryRetain(resource, viewType);
			assert.ok(retained, 'Expected cache entry to still exist after successful add');
			const r = await retained!;
			r.dispose();
		} finally {
			ref.dispose();
		}
	});
});
