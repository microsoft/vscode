/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { setupInstantiationService } from './testNotebookEditor.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { INotebookKernel, INotebookKernelService, VariablesResult } from '../../common/notebookKernelService.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { INotebookService } from '../../common/notebookService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { TransientOptions } from '../../common/notebookCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';

suite('NotebookKernelService', () => {

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;
	let disposables: DisposableStore;

	let onDidAddNotebookDocument: Emitter<NotebookTextModel>;
	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

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
		kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
		instantiationService.set(INotebookKernelService, kernelService);
	});

	test('notebook priorities', function () {

		const u1 = URI.parse('foo:///one');
		const u2 = URI.parse('foo:///two');

		const k1 = new TestNotebookKernel({ label: 'z' });
		const k2 = new TestNotebookKernel({ label: 'a' });

		disposables.add(kernelService.registerKernel(k1));
		disposables.add(kernelService.registerKernel(k2));

		// equal priorities -> sort by name
		let info = kernelService.getMatchingKernel({ uri: u1, notebookType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// update priorities for u1 notebook
		kernelService.updateKernelNotebookAffinity(k2, u1, 2);
		kernelService.updateKernelNotebookAffinity(k2, u2, 1);

		// updated
		info = kernelService.getMatchingKernel({ uri: u1, notebookType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// NOT updated
		info = kernelService.getMatchingKernel({ uri: u2, notebookType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);

		// reset
		kernelService.updateKernelNotebookAffinity(k2, u1, undefined);
		info = kernelService.getMatchingKernel({ uri: u1, notebookType: 'foo' });
		assert.ok(info.all[0] === k2);
		assert.ok(info.all[1] === k1);
	});

	test('new kernel with higher affinity wins, https://github.com/microsoft/vscode/issues/122028', function () {
		const notebook = URI.parse('foo:///one');

		const kernel = new TestNotebookKernel();
		disposables.add(kernelService.registerKernel(kernel));

		let info = kernelService.getMatchingKernel({ uri: notebook, notebookType: 'foo' });
		assert.strictEqual(info.all.length, 1);
		assert.ok(info.all[0] === kernel);

		const betterKernel = new TestNotebookKernel();
		disposables.add(kernelService.registerKernel(betterKernel));

		info = kernelService.getMatchingKernel({ uri: notebook, notebookType: 'foo' });
		assert.strictEqual(info.all.length, 2);

		kernelService.updateKernelNotebookAffinity(betterKernel, notebook, 2);
		info = kernelService.getMatchingKernel({ uri: notebook, notebookType: 'foo' });
		assert.strictEqual(info.all.length, 2);
		assert.ok(info.all[0] === betterKernel);
		assert.ok(info.all[1] === kernel);
	});

	test('onDidChangeSelectedNotebooks not fired on initial notebook open #121904', function () {

		const uri = URI.parse('foo:///one');
		const jupyter = { uri, viewType: 'jupyter', notebookType: 'jupyter' };
		const dotnet = { uri, viewType: 'dotnet', notebookType: 'dotnet' };

		const jupyterKernel = new TestNotebookKernel({ viewType: jupyter.viewType });
		const dotnetKernel = new TestNotebookKernel({ viewType: dotnet.viewType });
		disposables.add(kernelService.registerKernel(jupyterKernel));
		disposables.add(kernelService.registerKernel(dotnetKernel));

		kernelService.selectKernelForNotebook(jupyterKernel, jupyter);
		kernelService.selectKernelForNotebook(dotnetKernel, dotnet);

		let info = kernelService.getMatchingKernel(dotnet);
		assert.strictEqual(info.selected === dotnetKernel, true);

		info = kernelService.getMatchingKernel(jupyter);
		assert.strictEqual(info.selected === jupyterKernel, true);
	});

	test('onDidChangeSelectedNotebooks not fired on initial notebook open #121904, p2', async function () {

		const uri = URI.parse('foo:///one');
		const jupyter = { uri, viewType: 'jupyter', notebookType: 'jupyter' };
		const dotnet = { uri, viewType: 'dotnet', notebookType: 'dotnet' };

		const jupyterKernel = new TestNotebookKernel({ viewType: jupyter.viewType });
		const dotnetKernel = new TestNotebookKernel({ viewType: dotnet.viewType });
		disposables.add(kernelService.registerKernel(jupyterKernel));
		disposables.add(kernelService.registerKernel(dotnetKernel));

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
			const d1 = disposables.add(instantiationService.createInstance(NotebookTextModel, jupyter.viewType, jupyter.uri, [], {}, transientOptions));
			onDidAddNotebookDocument.fire(d1);
			const event = await p1;
			assert.strictEqual(event.newKernel, jupyterKernel.id);
		}
		{
			// RE-open as dotnet -> bind event
			const p2 = Event.toPromise(kernelService.onDidChangeSelectedNotebooks);
			const d2 = disposables.add(instantiationService.createInstance(NotebookTextModel, dotnet.viewType, dotnet.uri, [], {}, transientOptions));
			onDidAddNotebookDocument.fire(d2);
			const event2 = await p2;
			assert.strictEqual(event2.newKernel, dotnetKernel.id);
		}
	});

	test('REPL kernel affinity with updateKernelReplAffinity', function () {
		const notebook = URI.parse('foo:///repl');
		const repl = { uri: notebook, notebookType: 'repl' };

		const pythonKernel = new TestNotebookKernel({ label: 'Python' });
		pythonKernel.id = 'python-kernel';
		pythonKernel.viewType = 'repl';
		
		const jupyterKernel = new TestNotebookKernel({ label: 'Jupyter' });
		jupyterKernel.id = 'jupyter-kernel';
		jupyterKernel.viewType = 'repl';
		
		disposables.add(kernelService.registerKernel(pythonKernel));
		disposables.add(kernelService.registerKernel(jupyterKernel));

		// Initially both kernels have equal affinity
		let info = kernelService.getMatchingKernel(repl);
		assert.strictEqual(info.all.length, 2);

		// Set REPL affinity for Python kernel to be preferred for all REPLs
		kernelService.updateKernelReplAffinity(pythonKernel, { notebookType: 'repl' }, 2); // Preferred

		// Python kernel should now be first (highest affinity)
		info = kernelService.getMatchingKernel(repl);
		assert.strictEqual(info.all.length, 2);
		assert.strictEqual(info.all[0], pythonKernel);
		assert.strictEqual(info.all[1], jupyterKernel);

		// Remove REPL affinity for Python kernel
		kernelService.updateKernelReplAffinity(pythonKernel, { notebookType: 'repl' }, undefined);

		// Now both should have default affinity again, ordered by label
		info = kernelService.getMatchingKernel(repl);
		assert.strictEqual(info.all.length, 2);
		// Order should be by label (Jupyter < Python alphabetically)
		assert.strictEqual(info.all[0], jupyterKernel);
		assert.strictEqual(info.all[1], pythonKernel);
	});

	test('REPL kernel affinity with language-specific selector', function () {
		const notebook = URI.parse('foo:///python-repl');
		// Create a REPL with Python language metadata
		const pythonRepl = { 
			uri: notebook, 
			notebookType: 'repl',
			metadata: { language_info: { name: 'python' } }
		};

		const pythonKernel = new TestNotebookKernel({ label: 'Python' });
		pythonKernel.id = 'python-kernel';
		pythonKernel.viewType = 'repl';
		
		const jupyterKernel = new TestNotebookKernel({ label: 'Jupyter' });
		jupyterKernel.id = 'jupyter-kernel';
		jupyterKernel.viewType = 'repl';
		
		disposables.add(kernelService.registerKernel(pythonKernel));
		disposables.add(kernelService.registerKernel(jupyterKernel));

		// Set language-specific affinity: Python kernel preferred for Python language
		kernelService.updateKernelReplAffinity(pythonKernel, { language: 'python', notebookType: 'repl' }, 2);
		
		// Set generic REPL affinity: Jupyter kernel preferred for all REPLs
		kernelService.updateKernelReplAffinity(jupyterKernel, { notebookType: 'repl' }, 2);

		// For Python REPL, language-specific affinity should win
		let info = kernelService.getMatchingKernel(pythonRepl);
		assert.strictEqual(info.all.length, 2);
		assert.strictEqual(info.all[0], pythonKernel); // Python kernel wins due to language-specific affinity

		// For a generic REPL without language metadata, generic affinity should apply
		const genericRepl = { uri: URI.parse('foo:///generic-repl'), notebookType: 'repl' };
		info = kernelService.getMatchingKernel(genericRepl);
		assert.strictEqual(info.all.length, 2);
		assert.strictEqual(info.all[0], jupyterKernel); // Jupyter kernel wins due to generic REPL affinity
	});

	test('REPL affinity does not affect non-REPL notebooks', function () {
		const notebook = URI.parse('foo:///regular');
		const regular = { uri: notebook, notebookType: 'jupyter' };

		const kernel1 = new TestNotebookKernel({ label: 'Kernel1' });
		kernel1.id = 'kernel1';
		kernel1.viewType = 'jupyter';
		
		const kernel2 = new TestNotebookKernel({ label: 'Kernel2' });
		kernel2.id = 'kernel2';
		kernel2.viewType = 'jupyter';
		
		disposables.add(kernelService.registerKernel(kernel1));
		disposables.add(kernelService.registerKernel(kernel2));

		// Set REPL affinity (should not affect regular notebooks)
		kernelService.updateKernelReplAffinity(kernel1, { notebookType: 'repl' }, 2);

		// Regular notebook should not be affected by REPL affinity
		let info = kernelService.getMatchingKernel(regular);
		assert.strictEqual(info.all.length, 2);
		// Both should have equal default affinity, so order should be by label
		assert.strictEqual(info.all[0].label <= info.all[1].label, true);

		// Setting notebook affinity should still work
		kernelService.updateKernelNotebookAffinity(kernel2, notebook, 2);
		info = kernelService.getMatchingKernel(regular);
		assert.strictEqual(info.all.length, 2);
		assert.strictEqual(info.all[0], kernel2); // Higher notebook affinity
		assert.strictEqual(info.all[1], kernel1);
	});

	test('REPL kernel affinity works for any notebook type (not just repl)', function () {
		// Test that REPL affinity is not restricted to 'repl' notebook type
		const notebook = URI.parse('foo:///interactive-python');
		const interactiveNotebook = { uri: notebook, notebookType: 'interactive', metadata: { language_info: { name: 'python' } } };

		const pythonKernel = new TestNotebookKernel({ label: 'Python' });
		pythonKernel.id = 'python-kernel';
		pythonKernel.viewType = 'interactive';
		
		const generalKernel = new TestNotebookKernel({ label: 'General' });
		generalKernel.id = 'general-kernel';
		generalKernel.viewType = 'interactive';
		
		disposables.add(kernelService.registerKernel(pythonKernel));
		disposables.add(kernelService.registerKernel(generalKernel));

		// Set language-specific affinity for Python kernel on any notebook type
		kernelService.updateKernelReplAffinity(pythonKernel, { language: 'python' }, 2);

		// Python kernel should be preferred for Python interactive notebook
		let info = kernelService.getMatchingKernel(interactiveNotebook);
		assert.strictEqual(info.all.length, 2);
		assert.strictEqual(info.all[0], pythonKernel); // Should be first due to affinity
	});

	test('REPL kernel affinity cleared for untitled documents', function () {
		const untitledNotebook = URI.parse('untitled:///new-notebook');
		const untitledREPL = { uri: untitledNotebook, notebookType: 'jupyter-notebook' };

		const kernel = new TestNotebookKernel({ label: 'Test Kernel' });
		kernel.id = 'test-kernel';
		kernel.viewType = 'jupyter-notebook';
		
		disposables.add(kernelService.registerKernel(kernel));

		// Set REPL affinity for the kernel
		kernelService.updateKernelReplAffinity(kernel, { notebookType: 'jupyter-notebook' }, 2);
		
		// Verify affinity is set initially
		let info = kernelService.getMatchingKernel(untitledREPL);
		assert.strictEqual(info.all.length, 1);
		assert.strictEqual(info.suggestions.length, 1); // Should be suggested due to affinity

		// Select kernel for untitled document - this should clear affinity
		kernelService.selectKernelForNotebook(kernel, untitledREPL);

		// Create another similar REPL to test if affinity was cleared
		const anotherREPL = { uri: URI.parse('file:///another-repl'), notebookType: 'jupyter-notebook' };
		
		// If affinity was cleared, this kernel should not have preferred status
		info = kernelService.getMatchingKernel(anotherREPL);
		assert.strictEqual(info.all.length, 1);
		assert.strictEqual(info.suggestions.length, 0); // No suggestions since affinity was cleared
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
	provideVariables(notebookUri: URI, parentId: number | undefined, kind: 'named' | 'indexed', start: number, token: CancellationToken): AsyncIterableProducer<VariablesResult> {
		return AsyncIterableProducer.EMPTY;
	}

	constructor(opts?: { languages?: string[]; label?: string; viewType?: string }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
		this.label = opts?.label ?? this.label;
		this.viewType = opts?.viewType ?? this.viewType;
	}
}
