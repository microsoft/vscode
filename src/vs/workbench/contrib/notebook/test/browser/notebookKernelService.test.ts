/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/services/notebookKernelServiceImpl';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { mock } from 'vs/base/test/common/mock';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';

suite('NotebookKernelService', () => {

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;
	let disposables: DisposableStore;

	let onDidAddNotebookDocument: Emitter<NotebookTextModel>;
	teardown(() => {
		disposables.dispose();
	});

	setup(function () {
		disposables = new DisposableStore();

		onDidAddNotebookDocument = new Emitter();
		disposables.add(onDidAddNotebookDocument);

		instantiationService = setupInstantiationService(disposables);
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidAddNotebookDocument = onDidAddNotebookDocument.event;
			override onWillRemoveNotebookDocument = Event.None;
			override getNotebookTextModels() { return []; }
		});
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu() {
				return new class extends mock<IMenu>() {
					override onDidChange = Event.None;
					override getActions() { return []; }
					override dispose() { }
				};
			}
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
		let info = kernelService.getMatchingKernel({ uri: u1, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// update priorities for u1 notebook
		kernelService.updateKernelNotebookAffinity(k2, u1, 2);
		kernelService.updateKernelNotebookAffinity(k2, u2, 1);

		// updated
		info = kernelService.getMatchingKernel({ uri: u1, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// NOT updated
		info = kernelService.getMatchingKernel({ uri: u2, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// reset
		kernelService.updateKernelNotebookAffinity(k2, u1, undefined);
		info = kernelService.getMatchingKernel({ uri: u1, viewType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);
	});

	test('new kernel with higher affinity wins, https://github.com/microsoft/vscode/issues/122028', function () {
		const notebook = URI.parse('foo:///one');

		const kernel = new TestNotebookKernel();
		kernelService.registerKernel(kernel);

		let info = kernelService.getMatchingKernel({ uri: notebook, viewType: 'foo' });
		assert.strictEqual(info.all.length, 1);
		assert.ok(info.all[0] === kernel);

		const betterKernel = new TestNotebookKernel();
		kernelService.registerKernel(betterKernel);

		info = kernelService.getMatchingKernel({ uri: notebook, viewType: 'foo' });
		assert.strictEqual(info.all.length, 2);

		kernelService.updateKernelNotebookAffinity(betterKernel, notebook, 2);
		info = kernelService.getMatchingKernel({ uri: notebook, viewType: 'foo' });
		assert.strictEqual(info.all.length, 2);
		assert.ok(info.all[0] === betterKernel);
		assert.ok(info.all[1] === kernel);
	});

	test('onDidChangeSelectedNotebooks not fired on initial notebook open #121904', function () {

		const uri = URI.parse('foo:///one');
		const jupyter = { uri, viewType: 'jupyter' };
		const dotnet = { uri, viewType: 'dotnet' };

		const jupyterKernel = new TestNotebookKernel({ viewType: jupyter.viewType });
		const dotnetKernel = new TestNotebookKernel({ viewType: dotnet.viewType });
		kernelService.registerKernel(jupyterKernel);
		kernelService.registerKernel(dotnetKernel);

		kernelService.selectKernelForNotebook(jupyterKernel, jupyter);
		kernelService.selectKernelForNotebook(dotnetKernel, dotnet);

		let info = kernelService.getMatchingKernel(dotnet);
		assert.strictEqual(info.selected === dotnetKernel, true);

		info = kernelService.getMatchingKernel(jupyter);
		assert.strictEqual(info.selected === jupyterKernel, true);
	});

	test('onDidChangeSelectedNotebooks not fired on initial notebook open #121904, p2', async function () {

		const uri = URI.parse('foo:///one');
		const jupyter = { uri, viewType: 'jupyter' };
		const dotnet = { uri, viewType: 'dotnet' };

		const jupyterKernel = new TestNotebookKernel({ viewType: jupyter.viewType });
		const dotnetKernel = new TestNotebookKernel({ viewType: dotnet.viewType });
		kernelService.registerKernel(jupyterKernel);
		kernelService.registerKernel(dotnetKernel);

		kernelService.selectKernelForNotebook(jupyterKernel, jupyter);
		kernelService.selectKernelForNotebook(dotnetKernel, dotnet);

		const transientOptions: TransientOptions = {
			transientOutputs: false,
			transientCellMetadata: {},
			transientDocumentMetadata: {},
			cellContentMetadata: {},
		};

		{
			// open as jupyter -> bind event
			const p1 = Event.toPromise(kernelService.onDidChangeSelectedNotebooks);
			const d1 = instantiationService.createInstance(NotebookTextModel, jupyter.viewType, jupyter.uri, [], {}, transientOptions);
			onDidAddNotebookDocument.fire(d1);
			const event = await p1;
			assert.strictEqual(event.newKernel, jupyterKernel.id);
		}
		{
			// RE-open as dotnet -> bind event
			const p2 = Event.toPromise(kernelService.onDidChangeSelectedNotebooks);
			const d2 = instantiationService.createInstance(NotebookTextModel, dotnet.viewType, dotnet.uri, [], {}, transientOptions);
			onDidAddNotebookDocument.fire(d2);
			const event2 = await p2;
			assert.strictEqual(event2.newKernel, dotnetKernel.id);
		}
	});
});

class TestNotebookKernel implements INotebookKernel {
	id: string = Math.random() + 'kernel';
	label: string = 'test-label';
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

	constructor(opts?: { languages?: string[]; label?: string; viewType?: string }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
		this.label = opts?.label ?? this.label;
		this.viewType = opts?.viewType ?? this.viewType;
	}
}
