/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { Event } from 'vs/base/common/event';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/notebookKernelServiceImpl';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { mock } from 'vs/base/test/common/mock';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('NotebookKernelService', () => {

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;
	const dispoables = new DisposableStore();

	setup(function () {
		dispoables.clear();
		instantiationService = setupInstantiationService();
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidAddNotebookDocument = Event.None;
			override getNotebookTextModels() { return []; }
		});
		kernelService = instantiationService.createInstance(NotebookKernelService);
		instantiationService.set(INotebookKernelService, kernelService);
	});


	test('notebook priorities', function () {

		const u1 = URI.parse('foo:///one');
		const u2 = URI.parse('foo:///two');

		const k1 = new TestNotebookKernel({ label: 'z' });
		const k2 = new TestNotebookKernel({ label: 'a' });

		kernelService.registerKernel(k1);
		kernelService.registerKernel(k2);

		// equal priorities -> sort by name
		let info = kernelService.getNotebookKernels({ uri: u1, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// update priorities for u1 notebook
		kernelService.updateKernelNotebookAffinity(k2, u1, 2);
		kernelService.updateKernelNotebookAffinity(k2, u2, 1);

		// updated
		info = kernelService.getNotebookKernels({ uri: u1, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// NOT updated
		info = kernelService.getNotebookKernels({ uri: u2, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// reset
		kernelService.updateKernelNotebookAffinity(k2, u1, undefined);
		info = kernelService.getNotebookKernels({ uri: u1, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);
	});

	test('new kernel with higher affinity wins, https://github.com/microsoft/vscode/issues/122028', function () {
		const notebook = URI.parse('foo:///one');

		const kernel = new TestNotebookKernel();
		kernelService.registerKernel(kernel);

		let info = kernelService.getNotebookKernels({ uri: notebook, viewType: 'foo' });
		assert.strictEqual(info.all.length, 1);
		assert.ok(info.all[0] === kernel);

		const betterKernel = new TestNotebookKernel();
		kernelService.registerKernel(betterKernel);

		info = kernelService.getNotebookKernels({ uri: notebook, viewType: 'foo' });
		assert.strictEqual(info.all.length, 2);

		kernelService.updateKernelNotebookAffinity(betterKernel, notebook, 2);
		info = kernelService.getNotebookKernels({ uri: notebook, viewType: 'foo' });
		assert.strictEqual(info.all.length, 2);
		assert.ok(info.all[0] === betterKernel);
		assert.ok(info.all[1] === kernel);
	});
});

class TestNotebookKernel implements INotebookKernel {
	id: string = Math.random() + 'kernel';
	label: string = '';
	viewType = '*';
	onDidChange = Event.None;
	extension: ExtensionIdentifier = new ExtensionIdentifier('test');
	localResourceRoot: URI = URI.file('/test');
	description?: string | undefined;
	detail?: string | undefined;
	preloadUris: URI[] = [];
	preloadProvides: string[] = [];
	supportedLanguages: string[] = [];
	executeNotebookCellsRequest(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelNotebookCellExecution(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	constructor(opts?: { languages?: string[], label?: string }) {
		this.supportedLanguages = opts?.languages ?? ['text/plain'];
		this.label = opts?.label ?? 'test-label';
	}
}
