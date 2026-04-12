/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { hash } from '../../../../../base/common/hash.js';
import { NativeWorkingCopyBackupTracker } from '../../electron-browser/workingCopyBackupTracker.js';
import { IEditorService } from '../../../editor/common/editorService.js';
import { IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { EditorService } from '../../../editor/browser/editorService.js';
import { IWorkingCopyBackupService } from '../../common/workingCopyBackup.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IFilesConfigurationService } from '../../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyService } from '../../common/workingCopyService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { HotExitConfiguration } from '../../../../../platform/files/common/files.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { IFileDialogService, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createEditorPart, registerTestFileEditor, TestBeforeShutdownEvent, TestEnvironmentService, TestFilesConfigurationService, TestFileService, TestTextResourceConfigurationService, workbenchTeardown } from '../../../../test/browser/workbenchTestServices.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestWorkspace, Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IWorkingCopyEditorService } from '../../common/workingCopyEditorService.js';
import { TestContextService, TestMarkerService, TestWorkingCopy } from '../../../../test/common/workbenchTestServices.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
suite('WorkingCopyBackupTracker (native)', function () {
    let TestWorkingCopyBackupTracker = class TestWorkingCopyBackupTracker extends NativeWorkingCopyBackupTracker {
        constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, editorService, environmentService, progressService, workingCopyEditorService) {
            super(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, environmentService, progressService, workingCopyEditorService, editorService);
            this._onDidResume = this._register(new Emitter());
            this.onDidResume = this._onDidResume.event;
            this._onDidSuspend = this._register(new Emitter());
            this.onDidSuspend = this._onDidSuspend.event;
        }
        getBackupScheduleDelay() {
            return 10; // Reduce timeout for tests
        }
        waitForReady() {
            return this.whenReady;
        }
        get pendingBackupOperationCount() { return this.pendingBackupOperations.size; }
        dispose() {
            super.dispose();
            for (const [_, pending] of this.pendingBackupOperations) {
                pending.cancel();
                pending.disposable.dispose();
            }
        }
        suspendBackupOperations() {
            const { resume } = super.suspendBackupOperations();
            this._onDidSuspend.fire();
            return {
                resume: () => {
                    resume();
                    this._onDidResume.fire();
                }
            };
        }
    };
    TestWorkingCopyBackupTracker = __decorate([
        __param(0, IWorkingCopyBackupService),
        __param(1, IFilesConfigurationService),
        __param(2, IWorkingCopyService),
        __param(3, ILifecycleService),
        __param(4, IFileDialogService),
        __param(5, IDialogService),
        __param(6, IWorkspaceContextService),
        __param(7, INativeHostService),
        __param(8, ILogService),
        __param(9, IEditorService),
        __param(10, IEnvironmentService),
        __param(11, IProgressService),
        __param(12, IWorkingCopyEditorService)
    ], TestWorkingCopyBackupTracker);
    let testDir;
    let backupHome;
    let workspaceBackupPath;
    let accessor;
    const disposables = new DisposableStore();
    setup(async () => {
        testDir = URI.file(join(generateUuid(), 'vsctests', 'workingcopybackuptracker')).with({ scheme: Schemas.inMemory });
        backupHome = joinPath(testDir, 'Backups');
        const workspacesJsonPath = joinPath(backupHome, 'workspaces.json');
        const workspaceResource = URI.file(isWindows ? 'c:\\workspace' : '/workspace').with({ scheme: Schemas.inMemory });
        workspaceBackupPath = joinPath(backupHome, hash(workspaceResource.toString()).toString(16));
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        accessor = instantiationService.createInstance(TestServiceAccessor);
        disposables.add(accessor.textFileService.files);
        disposables.add(registerTestFileEditor());
        await accessor.fileService.createFolder(backupHome);
        await accessor.fileService.createFolder(workspaceBackupPath);
        return accessor.fileService.writeFile(workspacesJsonPath, VSBuffer.fromString(''));
    });
    teardown(() => {
        disposables.clear();
    });
    async function createTracker(autoSaveEnabled = false) {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const configurationService = new TestConfigurationService();
        if (autoSaveEnabled) {
            configurationService.setUserConfiguration('files', { autoSave: 'afterDelay', autoSaveDelay: 1 });
        }
        else {
            configurationService.setUserConfiguration('files', { autoSave: 'off', autoSaveDelay: 1 });
        }
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IFilesConfigurationService, disposables.add(new TestFilesConfigurationService(instantiationService.createInstance(MockContextKeyService), configurationService, new TestContextService(TestWorkspace), TestEnvironmentService, disposables.add(new UriIdentityService(disposables.add(new TestFileService()))), disposables.add(new TestFileService()), new TestMarkerService(), new TestTextResourceConfigurationService(configurationService))));
        const part = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, part);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        accessor = instantiationService.createInstance(TestServiceAccessor);
        const tracker = instantiationService.createInstance(TestWorkingCopyBackupTracker);
        const cleanup = async () => {
            await accessor.workingCopyBackupService.waitForAllBackups(); // File changes could also schedule some backup operations so we need to wait for them before finishing the test
            await workbenchTeardown(instantiationService);
            part.dispose();
            tracker.dispose();
        };
        return { accessor, part, tracker, instantiationService, cleanup };
    }
    test('Track backups (file, auto save off)', function () {
        return trackBackupsTest(toResource.call(this, '/path/index.txt'), false);
    });
    test('Track backups (file, auto save on)', function () {
        return trackBackupsTest(toResource.call(this, '/path/index.txt'), true);
    });
    async function trackBackupsTest(resource, autoSave) {
        const { accessor, cleanup } = await createTracker(autoSave);
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const fileModel = accessor.textFileService.files.get(resource);
        assert.ok(fileModel);
        fileModel.textEditorModel?.setValue('Super Good');
        await accessor.workingCopyBackupService.joinBackupResource();
        assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(fileModel), true);
        fileModel.dispose();
        await accessor.workingCopyBackupService.joinDiscardBackup();
        assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(fileModel), false);
        await cleanup();
    }
    test('onWillShutdown - no veto if no dirty files', async function () {
        const { accessor, cleanup } = await createTracker();
        const resource = toResource.call(this, '/path/index.txt');
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(!veto);
        await cleanup();
    });
    test('onWillShutdown - veto if user cancels (hot.exit: off)', async function () {
        const { accessor, cleanup } = await createTracker();
        const resource = toResource.call(this, '/path/index.txt');
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const model = accessor.textFileService.files.get(resource);
        accessor.fileDialogService.setConfirmResult(2 /* ConfirmResult.CANCEL */);
        accessor.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: 'off' } });
        await model?.resolve();
        model?.textEditorModel?.setValue('foo');
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(veto);
        await cleanup();
    });
    test('onWillShutdown - no veto if auto save is on', async function () {
        const { accessor, cleanup } = await createTracker(true /* auto save enabled */);
        const resource = toResource.call(this, '/path/index.txt');
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const model = accessor.textFileService.files.get(resource);
        await model?.resolve();
        model?.textEditorModel?.setValue('foo');
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(!veto);
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
        await cleanup();
    });
    test('onWillShutdown - no veto and backups cleaned up if user does not want to save (hot.exit: off)', async function () {
        const { accessor, cleanup } = await createTracker();
        const resource = toResource.call(this, '/path/index.txt');
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const model = accessor.textFileService.files.get(resource);
        accessor.fileDialogService.setConfirmResult(1 /* ConfirmResult.DONT_SAVE */);
        accessor.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: 'off' } });
        await model?.resolve();
        model?.textEditorModel?.setValue('foo');
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(!veto);
        assert.ok(accessor.workingCopyBackupService.discardedBackups.length > 0);
        await cleanup();
    });
    test('onWillShutdown - no backups discarded when shutdown without dirty but tracker not ready', async function () {
        const { accessor, cleanup } = await createTracker();
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(!veto);
        assert.ok(!accessor.workingCopyBackupService.discardedAllBackups);
        await cleanup();
    });
    test('onWillShutdown - backups discarded when shutdown without dirty', async function () {
        const { accessor, tracker, cleanup } = await createTracker();
        await tracker.waitForReady();
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(!veto);
        assert.ok(accessor.workingCopyBackupService.discardedAllBackups);
        await cleanup();
    });
    test('onWillShutdown - save (hot.exit: off)', async function () {
        const { accessor, cleanup } = await createTracker();
        const resource = toResource.call(this, '/path/index.txt');
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const model = accessor.textFileService.files.get(resource);
        accessor.fileDialogService.setConfirmResult(0 /* ConfirmResult.SAVE */);
        accessor.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: 'off' } });
        await model?.resolve();
        model?.textEditorModel?.setValue('foo');
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
        const event = new TestBeforeShutdownEvent();
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(!veto);
        assert.ok(!model?.isDirty());
        await cleanup();
    });
    test('onWillShutdown - veto if backup fails', async function () {
        const { accessor, cleanup } = await createTracker();
        class TestBackupWorkingCopy extends TestWorkingCopy {
            constructor(resource) {
                super(resource);
                this._register(accessor.workingCopyService.registerWorkingCopy(this));
            }
            async backup(token) {
                throw new Error('unable to backup');
            }
        }
        const resource = toResource.call(this, '/path/custom.txt');
        const customWorkingCopy = disposables.add(new TestBackupWorkingCopy(resource));
        customWorkingCopy.setDirty(true);
        const event = new TestBeforeShutdownEvent();
        event.reason = 2 /* ShutdownReason.QUIT */;
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(veto);
        const finalVeto = await event.finalValue?.();
        assert.ok(finalVeto); // assert the tracker uses the internal finalVeto API
        await cleanup();
    });
    test('onWillShutdown - scratchpads - veto if backup fails', async function () {
        const { accessor, cleanup } = await createTracker();
        class TestBackupWorkingCopy extends TestWorkingCopy {
            constructor(resource) {
                super(resource);
                this.capabilities = 2 /* WorkingCopyCapabilities.Untitled */ | 4 /* WorkingCopyCapabilities.Scratchpad */;
                this._register(accessor.workingCopyService.registerWorkingCopy(this));
            }
            async backup(token) {
                throw new Error('unable to backup');
            }
            isDirty() {
                return false;
            }
            isModified() {
                return true;
            }
        }
        const resource = toResource.call(this, '/path/custom.txt');
        disposables.add(new TestBackupWorkingCopy(resource));
        const event = new TestBeforeShutdownEvent();
        event.reason = 2 /* ShutdownReason.QUIT */;
        accessor.lifecycleService.fireBeforeShutdown(event);
        const veto = await event.value;
        assert.ok(veto);
        const finalVeto = await event.finalValue?.();
        assert.ok(finalVeto); // assert the tracker uses the internal finalVeto API
        await cleanup();
    });
    test('onWillShutdown - pending backup operations canceled and tracker suspended/resumsed', async function () {
        const { accessor, tracker, cleanup } = await createTracker();
        const resource = toResource.call(this, '/path/index.txt');
        await accessor.editorService.openEditor({ resource, options: { pinned: true } });
        const model = accessor.textFileService.files.get(resource);
        await model?.resolve();
        model?.textEditorModel?.setValue('foo');
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
        assert.strictEqual(tracker.pendingBackupOperationCount, 1);
        const onSuspend = Event.toPromise(tracker.onDidSuspend);
        const event = new TestBeforeShutdownEvent();
        event.reason = 2 /* ShutdownReason.QUIT */;
        accessor.lifecycleService.fireBeforeShutdown(event);
        await onSuspend;
        assert.strictEqual(tracker.pendingBackupOperationCount, 0);
        // Ops are suspended during shutdown!
        model?.textEditorModel?.setValue('bar');
        assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
        assert.strictEqual(tracker.pendingBackupOperationCount, 0);
        const onResume = Event.toPromise(tracker.onDidResume);
        await event.value;
        // Ops are resumed after shutdown!
        model?.textEditorModel?.setValue('foo');
        await onResume;
        assert.strictEqual(tracker.pendingBackupOperationCount, 1);
        await cleanup();
    });
    suite('Hot Exit', () => {
        suite('"onExit" setting', () => {
            test('should hot exit on non-Mac (reason: CLOSE, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, false, true, !!isMacintosh);
            });
            test('should hot exit on non-Mac (reason: CLOSE, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, false, false, !!isMacintosh);
            });
            test('should NOT hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, true, true, true);
            });
            test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, true, false, true);
            });
            test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, false, true, false);
            });
            test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, false, false, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, true, true, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, true, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, false, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, false, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, true, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, true, false, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, false, true, true);
            });
            test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, false, false, true);
            });
            test('should NOT hot exit (reason: LOAD, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, true, true, true);
            });
            test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, true, false, true);
            });
        });
        suite('"onExitAndWindowClose" setting', () => {
            test('should hot exit (reason: CLOSE, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, false, true, false);
            });
            test('should hot exit (reason: CLOSE, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, false, false, !!isMacintosh);
            });
            test('should hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, true, true, false);
            });
            test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, true, false, true);
            });
            test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, false, true, false);
            });
            test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, false, false, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, true, true, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, true, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, false, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, false, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, true, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, true, false, false);
            });
            test('should hot exit (reason: LOAD, windows: single, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, false, true, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, false, false, true);
            });
            test('should hot exit (reason: LOAD, windows: multiple, workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, true, true, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
                return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, true, false, true);
            });
        });
        suite('"onExit" setting - scratchpad', () => {
            test('should hot exit (reason: CLOSE, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, false, true, false);
            });
            test('should hot exit (reason: CLOSE, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, false, false, !!isMacintosh);
            });
            test('should hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, true, true, false);
            });
            test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 1 /* ShutdownReason.CLOSE */, true, false, true);
            });
            test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, false, true, false);
            });
            test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, false, false, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, true, true, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 2 /* ShutdownReason.QUIT */, true, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, false, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, false, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, true, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 3 /* ShutdownReason.RELOAD */, true, false, false);
            });
            test('should hot exit (reason: LOAD, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, false, true, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, false, false, true);
            });
            test('should hot exit (reason: LOAD, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, true, true, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, 4 /* ShutdownReason.LOAD */, true, false, true);
            });
        });
        suite('"onExitAndWindowClose" setting - scratchpad', () => {
            test('should hot exit (reason: CLOSE, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, false, true, false);
            });
            test('should hot exit (reason: CLOSE, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, false, false, !!isMacintosh);
            });
            test('should hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, true, true, false);
            });
            test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 1 /* ShutdownReason.CLOSE */, true, false, true);
            });
            test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, false, true, false);
            });
            test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, false, false, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, true, true, false);
            });
            test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 2 /* ShutdownReason.QUIT */, true, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, false, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, false, false, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, true, true, false);
            });
            test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 3 /* ShutdownReason.RELOAD */, true, false, false);
            });
            test('should hot exit (reason: LOAD, windows: single, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, false, true, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, false, false, true);
            });
            test('should hot exit (reason: LOAD, windows: multiple, workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, true, true, false);
            });
            test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
                return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, 4 /* ShutdownReason.LOAD */, true, false, true);
            });
        });
        async function hotExitTest(setting, shutdownReason, multipleWindows, workspace, shouldVeto) {
            const { accessor, cleanup } = await createTracker();
            const resource = toResource.call(this, '/path/index.txt');
            await accessor.editorService.openEditor({ resource, options: { pinned: true } });
            const model = accessor.textFileService.files.get(resource);
            // Set hot exit config
            accessor.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: setting } });
            // Set empty workspace if required
            if (!workspace) {
                accessor.contextService.setWorkspace(new Workspace('empty:1508317022751'));
            }
            // Set multiple windows if required
            if (multipleWindows) {
                accessor.nativeHostService.windowCount = Promise.resolve(2);
            }
            // Set cancel to force a veto if hot exit does not trigger
            accessor.fileDialogService.setConfirmResult(2 /* ConfirmResult.CANCEL */);
            await model?.resolve();
            model?.textEditorModel?.setValue('foo');
            assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
            const event = new TestBeforeShutdownEvent();
            event.reason = shutdownReason;
            accessor.lifecycleService.fireBeforeShutdown(event);
            const veto = await event.value;
            assert.ok(typeof event.finalValue === 'function'); // assert the tracker uses the internal finalVeto API
            assert.strictEqual(accessor.workingCopyBackupService.discardedBackups.length, 0); // When hot exit is set, backups should never be cleaned since the confirm result is cancel
            assert.strictEqual(veto, shouldVeto);
            await cleanup();
        }
        async function scratchpadHotExitTest(setting, shutdownReason, multipleWindows, workspace, shouldVeto) {
            const { accessor, cleanup } = await createTracker();
            class TestBackupWorkingCopy extends TestWorkingCopy {
                constructor(resource) {
                    super(resource);
                    this.capabilities = 2 /* WorkingCopyCapabilities.Untitled */ | 4 /* WorkingCopyCapabilities.Scratchpad */;
                    this._register(accessor.workingCopyService.registerWorkingCopy(this));
                }
                isDirty() {
                    return false;
                }
                isModified() {
                    return true;
                }
            }
            // Set hot exit config
            accessor.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: setting } });
            // Set empty workspace if required
            if (!workspace) {
                accessor.contextService.setWorkspace(new Workspace('empty:1508317022751'));
            }
            // Set multiple windows if required
            if (multipleWindows) {
                accessor.nativeHostService.windowCount = Promise.resolve(2);
            }
            // Set cancel to force a veto if hot exit does not trigger
            accessor.fileDialogService.setConfirmResult(2 /* ConfirmResult.CANCEL */);
            const resource = toResource.call(this, '/path/custom.txt');
            disposables.add(new TestBackupWorkingCopy(resource));
            const event = new TestBeforeShutdownEvent();
            event.reason = shutdownReason;
            accessor.lifecycleService.fireBeforeShutdown(event);
            const veto = await event.value;
            assert.ok(typeof event.finalValue === 'function'); // assert the tracker uses the internal finalVeto API
            assert.strictEqual(accessor.workingCopyBackupService.discardedBackups.length, 0); // When hot exit is set, backups should never be cleaned since the confirm result is cancel
            assert.strictEqual(veto, shouldVeto);
            await cleanup();
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya2luZ0NvcHkvdGVzdC9lbGVjdHJvbi1icm93c2VyL3dvcmtpbmdDb3B5QmFja3VwVHJhY2tlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRXBHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDekUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMvRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsV0FB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