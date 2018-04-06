/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as json from 'vs/base/common/json';
import { OS } from 'vs/base/common/platform';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyCode, SimpleKeybinding, ChordKeybinding } from 'vs/base/common/keyCodes';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import * as extfs from 'vs/base/node/extfs';
import { TestTextFileService, TestEditorGroupService, TestLifecycleService, TestBackupFileService, TestContextService, TestTextResourceConfigurationService, TestHashService, TestEnvironmentService } from 'vs/workbench/test/workbenchTestServices';
import { IWorkspaceContextService, Workspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import * as uuid from 'vs/base/common/uuid';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { mkdirp } from 'vs/base/node/pfs';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';

interface Modifiers {
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}

suite('Keybindings Editing', () => {

	let instantiationService: TestInstantiationService;
	let testObject: KeybindingsEditingService;
	let testDir: string;
	let keybindingsFile: string;

	setup(() => {
		return setUpWorkspace().then(() => {
			keybindingsFile = path.join(testDir, 'keybindings.json');

			instantiationService = new TestInstantiationService();

			instantiationService.stub(IEnvironmentService, { appKeybindingsPath: keybindingsFile });
			instantiationService.stub(IConfigurationService, ConfigurationService);
			instantiationService.stub(IConfigurationService, 'getValue', { 'eol': '\n' });
			instantiationService.stub(IConfigurationService, 'onDidUpdateConfiguration', () => { });
			instantiationService.stub(IConfigurationService, 'onDidChangeConfiguration', () => { });
			instantiationService.stub(IWorkspaceContextService, new TestContextService());
			const lifecycleService = new TestLifecycleService();
			instantiationService.stub(ILifecycleService, lifecycleService);
			instantiationService.stub(IContextKeyService, <IContextKeyService>instantiationService.createInstance(MockContextKeyService));
			instantiationService.stub(IHashService, new TestHashService());
			instantiationService.stub(IEditorGroupService, new TestEditorGroupService());
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IModeService, ModeServiceImpl);
			instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
			instantiationService.stub(IFileService, new FileService(new TestContextService(new Workspace(testDir, testDir, toWorkspaceFolders([{ path: testDir }]))), TestEnvironmentService, new TestTextResourceConfigurationService(), new TestConfigurationService(), lifecycleService, { disableWatcher: true }));
			instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
			instantiationService.stub(ITextFileService, instantiationService.createInstance(TestTextFileService));
			instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
			instantiationService.stub(IBackupFileService, new TestBackupFileService());

			testObject = instantiationService.createInstance(KeybindingsEditingService);
		});
	});

	function setUpWorkspace(): TPromise<boolean> {
		testDir = path.join(os.tmpdir(), 'vsctests', uuid.generateUuid());
		return mkdirp(testDir, 493);
	}

	teardown(() => {
		return new TPromise<void>((c, e) => {
			if (testDir) {
				extfs.del(testDir, os.tmpdir(), () => c(null), () => c(null));
			} else {
				c(null);
			}
		}).then(() => testDir = null);
	});

	test('errors cases - parse errors', () => {
		fs.writeFileSync(keybindingsFile, ',,,,,,,,,,,,,,');
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape } }))
			.then(() => assert.fail('Should fail with parse errors'),
				error => assert.equal(error.message, 'Unable to write to the keybindings configuration file. Please open it to correct errors/warnings in the file and try again.'));
	});

	test('errors cases - parse errors 2', () => {
		fs.writeFileSync(keybindingsFile, '[{"key": }]');
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape } }))
			.then(() => assert.fail('Should fail with parse errors'),
				error => assert.equal(error.message, 'Unable to write to the keybindings configuration file. Please open it to correct errors/warnings in the file and try again.'));
	});

	test('errors cases - dirty', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape } }))
			.then(() => assert.fail('Should fail with dirty error'),
				error => assert.equal(error.message, 'Unable to write because the keybindings configuration file is dirty. Please save it first and then try again.'));
	});

	test('errors cases - did not find an array', () => {
		fs.writeFileSync(keybindingsFile, '{"key": "alt+c", "command": "hello"}');
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape } }))
			.then(() => assert.fail('Should fail with dirty error'),
				error => assert.equal(error.message, 'Unable to write to the keybindings configuration file. It has an object which is not of type Array. Please open the file to clean up and try again.'));
	});

	test('edit a default keybinding to an empty file', () => {
		fs.writeFileSync(keybindingsFile, '');
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape }, command: 'a' }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('edit a default keybinding to a non existing keybindings file', () => {
		keybindingsFile = path.join(testDir, 'nonExistingFile.json');
		instantiationService.get(IEnvironmentService).appKeybindingsPath = keybindingsFile;
		testObject = instantiationService.createInstance(KeybindingsEditingService);

		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape }, command: 'a' }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('edit a default keybinding to an empty array', () => {
		writeToKeybindingsFile();
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape }, command: 'a' }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('edit a default keybinding in an existing array', () => {
		writeToKeybindingsFile({ command: 'b', key: 'shift+c' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'shift+c', command: 'b' }, { key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape }, command: 'a' }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('add a new default keybinding', () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ command: 'a' }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('edit an user keybinding', () => {
		writeToKeybindingsFile({ key: 'escape', command: 'b' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'b' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape }, command: 'b', isDefault: false }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('edit an user keybinding with more than one element', () => {
		writeToKeybindingsFile({ key: 'escape', command: 'b' }, { key: 'alt+shift+g', command: 'c' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'b' }, { key: 'alt+shift+g', command: 'c' }];
		return testObject.editKeybinding('alt+c', aResolvedKeybindingItem({ firstPart: { keyCode: KeyCode.Escape }, command: 'b', isDefault: false }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('remove a default keybinding', () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a' }];
		return testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstPart: { keyCode: KeyCode.KEY_C, modifiers: { altKey: true } } }))
			.then(() => assert.deepEqual(getUserKeybindings(), expected));
	});

	test('remove a user keybinding', () => {
		writeToKeybindingsFile({ key: 'alt+c', command: 'b' });
		return testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'b', firstPart: { keyCode: KeyCode.KEY_C, modifiers: { altKey: true } }, isDefault: false }))
			.then(() => assert.deepEqual(getUserKeybindings(), []));
	});

	test('reset an edited keybinding', () => {
		writeToKeybindingsFile({ key: 'alt+c', command: 'b' });
		return testObject.resetKeybinding(aResolvedKeybindingItem({ command: 'b', firstPart: { keyCode: KeyCode.KEY_C, modifiers: { altKey: true } }, isDefault: false }))
			.then(() => assert.deepEqual(getUserKeybindings(), []));
	});

	test('reset a removed keybinding', () => {
		writeToKeybindingsFile({ key: 'alt+c', command: '-b' });
		return testObject.resetKeybinding(aResolvedKeybindingItem({ command: 'b', isDefault: false }))
			.then(() => assert.deepEqual(getUserKeybindings(), []));
	});

	function writeToKeybindingsFile(...keybindings: IUserFriendlyKeybinding[]) {
		fs.writeFileSync(keybindingsFile, JSON.stringify(keybindings || []));
	}

	function getUserKeybindings(): IUserFriendlyKeybinding[] {
		return json.parse(fs.readFileSync(keybindingsFile).toString('utf8'));
	}

	function aResolvedKeybindingItem({ command, when, isDefault, firstPart, chordPart }: { command?: string, when?: string, isDefault?: boolean, firstPart?: { keyCode: KeyCode, modifiers?: Modifiers }, chordPart?: { keyCode: KeyCode, modifiers?: Modifiers } }): ResolvedKeybindingItem {
		const aSimpleKeybinding = function (part: { keyCode: KeyCode, modifiers?: Modifiers }): SimpleKeybinding {
			const { ctrlKey, shiftKey, altKey, metaKey } = part.modifiers || { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
			return new SimpleKeybinding(ctrlKey, shiftKey, altKey, metaKey, part.keyCode);
		};
		const keybinding = firstPart ? chordPart ? new ChordKeybinding(aSimpleKeybinding(firstPart), aSimpleKeybinding(chordPart)) : aSimpleKeybinding(firstPart) : null;
		return new ResolvedKeybindingItem(keybinding ? new USLayoutResolvedKeybinding(keybinding, OS) : null, command || 'some command', null, when ? ContextKeyExpr.deserialize(when) : null, isDefault === void 0 ? true : isDefault);
	}

});
