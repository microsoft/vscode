/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ILifecycleService, BeforeShutdownEvent, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { workbenchInstantiationService, TestLifecycleService, TestTextFileService, TestWindowsService, TestContextService, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ConfirmResult } from 'vs/workbench/common/editor';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { HotExitConfiguration, IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IWorkspaceContextService, Workspace } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { Schemas } from 'vs/base/common/network';

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IUntitledEditorService public untitledEditorService: IUntitledEditorService,
		@IWindowsService public windowsService: TestWindowsService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService
	) {
	}
}

class BeforeShutdownEventImpl implements BeforeShutdownEvent {

	public value: boolean | Promise<boolean>;
	public reason = ShutdownReason.CLOSE;

	veto(value: boolean | Promise<boolean>): void {
		this.value = value;
	}
}

suite('Files - TextFileService', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		model.dispose();
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledEditorService.revertAll();
	});

	test('confirm onWillShutdown - no veto', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		const veto = event.value;
		if (typeof veto === 'boolean') {
			assert.ok(!veto);
		} else {
			veto.then(veto => {
				assert.ok(!veto);
			});
		}
	});

	test('confirm onWillShutdown - veto if user cancels', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.CANCEL);

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new BeforeShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			assert.ok(event.value);
		});
	});

	test('confirm onWillShutdown - no veto and backups cleaned up if user does not want to save (hot.exit: off)', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.DONT_SAVE);
		service.onFilesConfigurationChange({ files: { hotExit: 'off' } });

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new BeforeShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			const veto = event.value;
			if (typeof veto === 'boolean') {
				assert.ok(service.cleanupBackupsBeforeShutdownCalled);
				assert.ok(!veto);

				return undefined;
			} else {
				return veto.then(veto => {
					assert.ok(service.cleanupBackupsBeforeShutdownCalled);
					assert.ok(!veto);
				});
			}
		});
	});

	test('confirm onWillShutdown - save (hot.exit: off)', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.SAVE);
		service.onFilesConfigurationChange({ files: { hotExit: 'off' } });

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new BeforeShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			return (<Promise<boolean>>event.value).then(veto => {
				assert.ok(!veto);
				assert.ok(!model.isDirty());
			});
		});
	});

	test('isDirty/getDirty - files and untitled', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		return model.load().then(() => {
			assert.ok(!service.isDirty(model.getResource()));
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));
			assert.equal(service.getDirty().length, 1);
			assert.equal(service.getDirty([model.getResource()])[0].toString(), model.getResource().toString());

			const untitled = accessor.untitledEditorService.createOrGet();
			return untitled.resolve().then((model: UntitledEditorModel) => {
				assert.ok(!service.isDirty(untitled.getResource()));
				assert.equal(service.getDirty().length, 1);
				model.textEditorModel.setValue('changed');

				assert.ok(service.isDirty(untitled.getResource()));
				assert.equal(service.getDirty().length, 2);
				assert.equal(service.getDirty([untitled.getResource()])[0].toString(), untitled.getResource().toString());
			});
		});
	});

	test('save - file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.save(model.getResource()).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));
			});
		});
	});

	test('save - UNC path', function () {
		const untitledUncUri = URI.from({ scheme: 'untitled', authority: 'server', path: '/share/path/file.txt' });
		model = instantiationService.createInstance(TextFileEditorModel, untitledUncUri, 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const mockedFileUri = untitledUncUri.with({ scheme: Schemas.file });
		const mockedEditorInput = instantiationService.createInstance(TextFileEditorModel, mockedFileUri, 'utf8');
		const loadOrCreateStub = sinon.stub(accessor.textFileService.models, 'loadOrCreate', () => Promise.resolve(mockedEditorInput));

		sinon.stub(accessor.untitledEditorService, 'exists', () => true);
		sinon.stub(accessor.untitledEditorService, 'hasAssociatedFilePath', () => true);
		sinon.stub(accessor.modelService, 'updateModel', () => { });

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			return accessor.textFileService.saveAll(true).then(res => {
				assert.ok(loadOrCreateStub.calledOnce);
				assert.equal(res.results.length, 1);
				assert.ok(res.results[0].success);

				assert.equal(res.results[0].target!.scheme, Schemas.file);
				assert.equal(res.results[0].target!.authority, untitledUncUri.authority);
				assert.equal(res.results[0].target!.path, untitledUncUri.path);
			});
		});
	});

	test('saveAll - file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.saveAll([model.getResource()]).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));
				assert.equal(res.results.length, 1);
				assert.equal(res.results[0].source.toString(), model.getResource().toString());
			});
		});
	});

	test('saveAs - file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setPromptPath(model.getResource());

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.saveAs(model.getResource()).then(res => {
				assert.equal(res.toString(), model.getResource().toString());
				assert.ok(!service.isDirty(model.getResource()));
			});
		});
	});

	test('revert - file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setPromptPath(model.getResource());

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.revert(model.getResource()).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));
			});
		});
	});

	test('delete - dirty file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;

		return model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.delete(model.getResource()).then(() => {
				assert.ok(!service.isDirty(model.getResource()));
			});
		});
	});

	test('move - dirty file', function () {
		let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		let targetModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_target.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(sourceModel.getResource(), sourceModel);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(targetModel.getResource(), targetModel);

		const service = accessor.textFileService;

		return sourceModel.load().then(() => {
			sourceModel.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(sourceModel.getResource()));

			return service.move(sourceModel.getResource(), targetModel.getResource(), true).then(() => {
				assert.ok(!service.isDirty(sourceModel.getResource()));

				sourceModel.dispose();
				targetModel.dispose();
			});
		});
	});

	suite('Hot Exit', () => {
		suite('"onExit" setting', () => {
			test('should hot exit on non-Mac (reason: CLOSE, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, true, !!platform.isMacintosh);
			});
			test('should hot exit on non-Mac (reason: CLOSE, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, false, !!platform.isMacintosh);
			});
			test('should NOT hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, true, true);
			});
			test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, false, true);
			});
			test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, true, false);
			});
			test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, false, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, true, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, false, false);
			});
			test('should NOT hot exit (reason: LOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, true, true);
			});
			test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, false, true);
			});
			test('should NOT hot exit (reason: LOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, true, true);
			});
			test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, false, true);
			});
		});

		suite('"onExitAndWindowClose" setting', () => {
			test('should hot exit (reason: CLOSE, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, true, false);
			});
			test('should hot exit (reason: CLOSE, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, false, !!platform.isMacintosh);
			});
			test('should hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, true, false);
			});
			test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, false, true);
			});
			test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, true, false);
			});
			test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, false, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, true, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, false, false);
			});
			test('should hot exit (reason: LOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, true, false);
			});
			test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, false, true);
			});
			test('should hot exit (reason: LOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, true, false);
			});
			test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, false, true);
			});
		});

		function hotExitTest(this: any, setting: string, shutdownReason: ShutdownReason, multipleWindows: boolean, workspace: true, shouldVeto: boolean): Promise<void> {
			model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
			(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

			const service = accessor.textFileService;
			// Set hot exit config
			service.onFilesConfigurationChange({ files: { hotExit: setting } });
			// Set empty workspace if required
			if (!workspace) {
				accessor.contextService.setWorkspace(new Workspace('empty:1508317022751'));
			}
			// Set multiple windows if required
			if (multipleWindows) {
				accessor.windowsService.windowCount = 2;
			}
			// Set cancel to force a veto if hot exit does not trigger
			service.setConfirmResult(ConfirmResult.CANCEL);

			return model.load().then(() => {
				model.textEditorModel.setValue('foo');

				assert.equal(service.getDirty().length, 1);

				const event = new BeforeShutdownEventImpl();
				event.reason = shutdownReason;
				accessor.lifecycleService.fireWillShutdown(event);

				return (<Promise<boolean>>event.value).then(veto => {
					// When hot exit is set, backups should never be cleaned since the confirm result is cancel
					assert.ok(!service.cleanupBackupsBeforeShutdownCalled);
					assert.equal(veto, shouldVeto);
				});
			});
		}
	});
});
