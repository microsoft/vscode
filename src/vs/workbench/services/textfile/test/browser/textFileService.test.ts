/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService, TestServiceAccessor, ITestTextFileEditorModelManager, TestTextFileService } from '../../../../test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TextFileEditorModel } from '../../common/textFileEditorModel.js';
import { FileOperation } from '../../../../../platform/files/common/files.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { EncodingMode, ITextFileService } from '../../common/textfiles.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';

suite('Files - TextFileService', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		const services = workbenchInstantiationService(undefined, disposables);
		instantiationService = services;
		// Register ICodeEditorService through the workbench helper before creating the Save As service.
		services.stub(ITextFileService, disposables.add(services.createInstance(TestTextFileService)));
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(<ITestTextFileEditorModelManager>accessor.textFileService.files);
		disposables.add(accessor.textFileService.files.onDidCreate(model => disposables.add(model)));
	});

	teardown(() => {
		disposables.clear();
	});

	test('isDirty/getDirty - files and untitled', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();

		assert.ok(!accessor.textFileService.isDirty(model.resource));
		model.textEditorModel!.setValue('foo');

		assert.ok(accessor.textFileService.isDirty(model.resource));

		const untitled = disposables.add(await accessor.textFileService.untitled.resolve());

		assert.ok(!accessor.textFileService.isDirty(untitled.resource));
		untitled.textEditorModel?.setValue('changed');

		assert.ok(accessor.textFileService.isDirty(untitled.resource));
	});

	test('save - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.strictEqual(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAll - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.strictEqual(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAs - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.saveAs(model.resource);
		assert.strictEqual(res!.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	for (const sourceKind of ['untitled', 'associated untitled', 'file'] as const) {
		test(`saveAs - preserves concurrent edits from ${sourceKind} source`, async function () {
			const original = 'content copied to target';
			const edited = `${original}\nedit made while Save As is pending`;
			const target = toResource.call(this, '/path/save-as-target.txt');
			const untitled = sourceKind === 'file' ? undefined : disposables.add(await (sourceKind === 'associated untitled'
				? accessor.textFileService.untitled.resolve({ associatedResource: target, initialValue: original })
				: accessor.textFileService.untitled.resolve({ initialValue: original })));
			const source = untitled ?? disposables.add(await accessor.textFileService.files.resolve(toResource.call(this, '/path/save-as-source.txt')));
			source.textEditorModel!.setValue(original);
			const sourceTextModel = source.textEditorModel!;
			const input = untitled ? disposables.add(instantiationService.createInstance(UntitledTextEditorInput, untitled)) : undefined;
			await input?.resolve();

			let untitledSaveEvents = 0;
			disposables.add(accessor.textFileService.untitled.onDidSave(() => untitledSaveEvents++));
			const participantStarted = new DeferredPromise<void>();
			const releaseParticipant = new DeferredPromise<void>();
			const participant = disposables.add(accessor.textFileService.files.addSaveParticipant({
				participate: async model => {
					if (model.resource.toString() === target.toString()) {
						participantStarted.complete();
						await releaseParticipant.p;
					}
				}
			}));

			if (sourceKind === 'associated untitled') {
				accessor.dialogService.setConfirmResult({ confirmed: true });
			}
			const saveAs = accessor.textFileService.saveAs(source.resource, target);
			try {
				await Promise.race([participantStarted.p, saveAs.then(() => assert.fail('Save As completed before the target save participant'))]);
				sourceTextModel.setValue(edited);
			} finally {
				releaseParticipant.complete();
			}
			const result = await saveAs;
			participant.dispose();

			assert.deepStrictEqual({
				result: result?.toString(),
				sourceDisposed: source.isDisposed(),
				sourceText: sourceTextModel.isDisposed() ? undefined : sourceTextModel.getValue(),
				sourceDirty: source.isDirty(),
				inputDisposed: input?.isDisposed(),
				hasAssociatedFilePath: untitled?.hasAssociatedFilePath,
				untitledSaveEvents,
				targetWrites: accessor.fileService.writeOperations.filter(operation => operation.resource.toString() === target.toString()).map(operation => operation.content)
			}, {
				result: undefined,
				sourceDisposed: false,
				sourceText: edited,
				sourceDirty: true,
				inputDisposed: input ? false : undefined,
				hasAssociatedFilePath: untitled ? sourceKind === 'associated untitled' : undefined,
				untitledSaveEvents: 0,
				targetWrites: [original]
			});

			if (sourceKind === 'associated untitled') {
				accessor.dialogService.setConfirmResult({ confirmed: true });
			}
			const retry = await accessor.textFileService.saveAs(source.resource, target);
			assert.deepStrictEqual({
				result: retry?.toString(),
				sourceDirty: source.isDirty(),
				inputDisposed: input?.isDisposed(),
				untitledSaveEvents,
				targetWrites: accessor.fileService.writeOperations.filter(operation => operation.resource.toString() === target.toString()).map(operation => operation.content)
			}, {
				result: target.toString(),
				sourceDirty: false,
				inputDisposed: input ? true : undefined,
				untitledSaveEvents: untitled ? 1 : 0,
				targetWrites: [original, edited]
			});
		});

		test(`saveAs - transfers unchanged ${sourceKind} source`, async function () {
			const original = 'content copied to target';
			const target = toResource.call(this, '/path/save-as-target.txt');
			const untitled = sourceKind === 'file' ? undefined : disposables.add(await (sourceKind === 'associated untitled'
				? accessor.textFileService.untitled.resolve({ associatedResource: target, initialValue: original })
				: accessor.textFileService.untitled.resolve({ initialValue: original })));
			const source = untitled ?? disposables.add(await accessor.textFileService.files.resolve(toResource.call(this, '/path/save-as-source.txt')));
			source.textEditorModel!.setValue(original);
			const input = untitled ? disposables.add(instantiationService.createInstance(UntitledTextEditorInput, untitled)) : undefined;
			await input?.resolve();

			if (sourceKind === 'associated untitled') {
				accessor.dialogService.setConfirmResult({ confirmed: true });
			}
			const result = await accessor.textFileService.saveAs(source.resource, target);
			assert.deepStrictEqual({
				result: result?.toString(),
				sourceDirty: source.isDirty(),
				inputDisposed: input?.isDisposed(),
				hasAssociatedFilePath: untitled?.hasAssociatedFilePath,
				targetWrites: accessor.fileService.writeOperations.filter(operation => operation.resource.toString() === target.toString()).map(operation => operation.content)
			}, {
				result: target.toString(),
				sourceDirty: false,
				inputDisposed: input ? true : undefined,
				hasAssociatedFilePath: untitled ? sourceKind === 'associated untitled' : undefined,
				targetWrites: [original]
			});
		});
	}

	test('saveAs - failed target save preserves untitled source', async function () {
		const original = 'content that must remain available';
		const target = toResource.call(this, '/path/save-as-failed-target.txt');
		const source = disposables.add(await accessor.textFileService.untitled.resolve({ initialValue: original }));
		const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, source));
		await input.resolve();
		accessor.fileService.writeShouldThrowError = new Error('expected target write failure');
		try {
			const result = await accessor.textFileService.saveAs(source.resource, target);
			assert.deepStrictEqual({
				result,
				sourceDisposed: source.isDisposed(),
				sourceText: source.textEditorModel?.getValue(),
				sourceDirty: source.isDirty(),
				inputDisposed: input.isDisposed()
			}, {
				result: undefined,
				sourceDisposed: false,
				sourceText: original,
				sourceDirty: true,
				inputDisposed: false
			});
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}
	});

	async function createUntitledSource(value: string) {
		const source = disposables.add(await accessor.textFileService.untitled.resolve({ initialValue: value }));
		const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, source));
		await input.resolve();
		return { source, input, textModel: source.textEditorModel! };
	}

	test('saveAs - includes source edits made before the source snapshot', async function () {
		const { source, input, textModel } = await createUntitledSource('initial');
		const target = toResource.call(this, '/path/save-as-before-snapshot.txt');
		const targetResolved = new DeferredPromise<void>();
		const releaseTarget = new DeferredPromise<void>();
		const resolve = accessor.textFileService.files.resolve.bind(accessor.textFileService.files);
		accessor.textFileService.files.resolve = async (resource, options) => {
			const model = await resolve(resource, options);
			if (resource.toString() === target.toString()) {
				targetResolved.complete();
				await releaseTarget.p;
			}
			return model;
		};
		try {
			const saveAs = accessor.textFileService.saveAs(source.resource, target);
			try {
				await Promise.race([targetResolved.p, saveAs.then(() => assert.fail('Save As completed before resolving the target'))]);
				textModel.setValue('edited while resolving the target');
			} finally {
				releaseTarget.complete();
			}
			const result = await saveAs;
			assert.deepStrictEqual({
				result: result?.toString(),
				inputDisposed: input.isDisposed(),
				targetWrites: accessor.fileService.writeOperations.filter(operation => operation.resource.toString() === target.toString()).map(operation => operation.content)
			}, {
				result: target.toString(),
				inputDisposed: true,
				targetWrites: ['edited while resolving the target']
			});
		} finally {
			accessor.textFileService.files.resolve = resolve;
		}
	});

	test('saveAs - preserves a replacement source created before the snapshot', async function () {
		const { source } = await createUntitledSource('original source');
		const target = toResource.call(this, '/path/save-as-source-replaced-before-snapshot.txt');
		const targetResolved = new DeferredPromise<void>();
		const releaseTarget = new DeferredPromise<void>();
		const resolve = accessor.textFileService.files.resolve.bind(accessor.textFileService.files);
		accessor.textFileService.files.resolve = async (resource, options) => {
			const model = await resolve(resource, options);
			if (resource.toString() === target.toString()) {
				targetResolved.complete();
				await releaseTarget.p;
			}
			return model;
		};
		try {
			const saveAs = accessor.textFileService.saveAs(source.resource, target);
			await Promise.race([targetResolved.p, saveAs.then(() => assert.fail('Save As completed before resolving the target'))]);
			source.dispose();
			const replacement = disposables.add(await accessor.textFileService.untitled.resolve({ untitledResource: source.resource, initialValue: 'replacement before snapshot' }));
			const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, replacement));
			await input.resolve();
			releaseTarget.complete();
			const result = await saveAs;
			assert.deepStrictEqual({
				result: result?.toString(),
				sourceDisposed: replacement.isDisposed(),
				sourceText: replacement.textEditorModel?.getValue(),
				sourceDirty: replacement.isDirty(),
				inputDisposed: input.isDisposed()
			}, {
				result: undefined,
				sourceDisposed: false,
				sourceText: 'replacement before snapshot',
				sourceDirty: true,
				inputDisposed: false
			});
		} finally {
			releaseTarget.complete();
			accessor.textFileService.files.resolve = resolve;
		}
	});

	test('saveAs - allows a save participant to format only the target', async function () {
		const { source, input } = await createUntitledSource('initial');
		const target = toResource.call(this, '/path/save-as-formatted-target.txt');
		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: async model => {
				if (model.resource.toString() === target.toString()) {
					model.textEditorModel!.setValue('formatted target');
				}
			}
		}));
		const result = await accessor.textFileService.saveAs(source.resource, target);
		assert.deepStrictEqual({
			result: result?.toString(),
			inputDisposed: input.isDisposed(),
			targetWrites: accessor.fileService.writeOperations.filter(operation => operation.resource.toString() === target.toString()).map(operation => operation.content)
		}, {
			result: target.toString(),
			inputDisposed: true,
			targetWrites: ['formatted target']
		});
	});

	for (const editSource of [false, true]) {
		test(`saveAs - ${editSource ? 'preserves edits in' : 'allows'} a source resolved during file copy`, async function () {
			const sourceResource = toResource.call(this, '/path/save-as-copy-source.txt');
			const target = toResource.call(this, '/path/save-as-copy-target.txt');
			const copyStarted = new DeferredPromise<void>();
			const releaseCopy = new DeferredPromise<void>();
			const copy = accessor.fileService.copy.bind(accessor.fileService);
			accessor.fileService.copy = async (source, destination, overwrite) => {
				copyStarted.complete();
				await releaseCopy.p;
				return copy(source, destination, overwrite);
			};
			try {
				const saveAs = accessor.textFileService.saveAs(sourceResource, target);
				await Promise.race([copyStarted.p, saveAs.then(() => assert.fail('Save As completed before copying the file'))]);
				const source = await accessor.textFileService.files.resolve(sourceResource);
				const original = source.textEditorModel!.getValue();
				if (editSource) {
					source.textEditorModel!.setValue('source edit during file copy');
				}
				releaseCopy.complete();
				const result = await saveAs;
				assert.deepStrictEqual({
					result: result?.toString(),
					sourceDirty: source.isDirty(),
					sourceText: source.textEditorModel!.getValue()
				}, {
					result: editSource ? undefined : target.toString(),
					sourceDirty: editSource,
					sourceText: editSource ? 'source edit during file copy' : original
				});
			} finally {
				releaseCopy.complete();
				accessor.fileService.copy = copy;
			}
		});
	}

	test('saveAs - preserves source edits made immediately after target save', async function () {
		const { source, input, textModel } = await createUntitledSource('initial');
		const target = toResource.call(this, '/path/save-as-after-target-save.txt');
		const targetModel = await accessor.textFileService.files.resolve(target);
		const targetSave = targetModel.save.bind(targetModel);
		targetModel.save = async options => {
			const result = await targetSave(options);
			// The second microtask runs after the helper returns and before doSaveAs cleans up the source.
			queueMicrotask(() => queueMicrotask(() => textModel.setValue('edited after target save')));
			return result;
		};
		const result = await accessor.textFileService.saveAs(source.resource, target);
		assert.deepStrictEqual({
			result: result?.toString(),
			inputDisposed: input.isDisposed(),
			sourceText: textModel.isDisposed() ? undefined : textModel.getValue(),
			sourceDirty: source.isDirty()
		}, {
			result: undefined,
			inputDisposed: false,
			sourceText: 'edited after target save',
			sourceDirty: true
		});
	});

	test('saveAs - preserves both models when the target changes during its write', async function () {
		const { source, input, textModel } = await createUntitledSource('source contents');
		const target = toResource.call(this, '/path/save-as-target-changes.txt');
		const targetModel = await accessor.textFileService.files.resolve(target);
		const writeStarted = new DeferredPromise<void>();
		const releaseWrite = new DeferredPromise<void>();
		const writeFile = accessor.fileService.writeFile.bind(accessor.fileService);
		accessor.fileService.writeFile = async (resource, value, options) => {
			if (resource.toString() === target.toString()) {
				writeStarted.complete();
				await releaseWrite.p;
			}
			return writeFile(resource, value, options);
		};
		try {
			const saveAs = accessor.textFileService.saveAs(source.resource, target);
			try {
				await Promise.race([writeStarted.p, saveAs.then(() => assert.fail('Save As completed before the target write'))]);
				targetModel.textEditorModel!.setValue('target edit made during write');
			} finally {
				releaseWrite.complete();
			}
			const result = await saveAs;
			assert.deepStrictEqual({
				result: result?.toString(),
				inputDisposed: input.isDisposed(),
				sourceText: textModel.isDisposed() ? undefined : textModel.getValue(),
				sourceDirty: source.isDirty(),
				targetText: targetModel.textEditorModel!.getValue(),
				targetDirty: targetModel.isDirty(),
				targetWrites: accessor.fileService.writeOperations.filter(operation => operation.resource.toString() === target.toString()).map(operation => operation.content)
			}, {
				result: undefined,
				inputDisposed: false,
				sourceText: 'source contents',
				sourceDirty: true,
				targetText: 'target edit made during write',
				targetDirty: true,
				targetWrites: ['source contents']
			});
		} finally {
			accessor.fileService.writeFile = writeFile;
		}
	});

	test('saveAs - does not revert a replacement untitled model with the same resource', async function () {
		const { source } = await createUntitledSource('original source');
		const target = toResource.call(this, '/path/save-as-replaced-source.txt');
		const participantStarted = new DeferredPromise<void>();
		const releaseParticipant = new DeferredPromise<void>();
		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: async model => {
				if (model.resource.toString() === target.toString()) {
					participantStarted.complete();
					await releaseParticipant.p;
				}
			}
		}));
		const saveAs = accessor.textFileService.saveAs(source.resource, target);
		await Promise.race([participantStarted.p, saveAs.then(() => assert.fail('Save As completed before the target save participant'))]);
		source.dispose();
		const replacement = disposables.add(await accessor.textFileService.untitled.resolve({ untitledResource: source.resource, initialValue: 'replacement source contents' }));
		const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, replacement));
		await input.resolve();
		releaseParticipant.complete();
		const result = await saveAs;
		assert.deepStrictEqual({
			result: result?.toString(),
			sameResource: replacement.resource.toString() === source.resource.toString(),
			replacementDisposed: replacement.isDisposed(),
			replacementText: replacement.textEditorModel?.getValue(),
			replacementDirty: replacement.isDirty(),
			inputDisposed: input.isDisposed()
		}, {
			result: undefined,
			sameResource: true,
			replacementDisposed: false,
			replacementText: 'replacement source contents',
			replacementDirty: true,
			inputDisposed: false
		});
	});

	test('revert - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		await accessor.textFileService.revert(model.resource);
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('create does not overwrite existing model', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		let eventCounter = 0;

		disposables.add(accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async files => {
				assert.strictEqual(files[0].target.toString(), model.resource.toString());
				eventCounter++;
			}
		}));

		disposables.add(accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			assert.strictEqual(e.operation, FileOperation.CREATE);
			assert.strictEqual(e.files[0].target.toString(), model.resource.toString());
			eventCounter++;
		}));

		await accessor.textFileService.create([{ resource: model.resource, value: 'Foo' }]);
		assert.ok(!accessor.textFileService.isDirty(model.resource));

		assert.strictEqual(eventCounter, 2);
	});

	test('Filename Suggestion - Suggest prefix only when there are no relevant extensions', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus0',
			extensions: ['.one', '.two']
		}));

		const suggested = accessor.textFileService.suggestFilename('shleem', 'Untitled-1');
		assert.strictEqual(suggested, 'Untitled-1');
	});

	test('Filename Suggestion - Suggest prefix with first extension', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus1',
			extensions: ['.shleem', '.gazorpazorp'],
			filenames: ['plumbus']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus1', 'Untitled-1');
		assert.strictEqual(suggested, 'Untitled-1.shleem');
	});

	test('Filename Suggestion - Preserve extension if it matchers', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			extensions: ['.shleem', '.gazorpazorp'],
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1.gazorpazorp');
		assert.strictEqual(suggested, 'Untitled-1.gazorpazorp');
	});

	test('Filename Suggestion - Rewrite extension according to language', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			extensions: ['.shleem', '.gazorpazorp'],
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1.foobar');
		assert.strictEqual(suggested, 'Untitled-1.shleem');
	});

	test('Filename Suggestion - Suggest filename if there are no extensions', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1');
		assert.strictEqual(suggested, 'plumbus');
	});

	test('Filename Suggestion - Preserve filename if it matches', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'gazorpazorp');
		assert.strictEqual(suggested, 'gazorpazorp');
	});

	test('Filename Suggestion - Rewrites filename according to language', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'foobar');
		assert.strictEqual(suggested, 'plumbus');
	});

	test('getEncoding() - files and untitled', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();

		assert.strictEqual(accessor.textFileService.getEncoding(model.resource), 'utf8');
		await model.setEncoding('utf16', EncodingMode.Encode);
		assert.strictEqual(accessor.textFileService.getEncoding(model.resource), 'utf16');

		const untitled = disposables.add(await accessor.textFileService.untitled.resolve());

		assert.strictEqual(accessor.textFileService.getEncoding(untitled.resource), 'utf8');
		await untitled.setEncoding('utf16');
		assert.strictEqual(accessor.textFileService.getEncoding(untitled.resource), 'utf16');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
