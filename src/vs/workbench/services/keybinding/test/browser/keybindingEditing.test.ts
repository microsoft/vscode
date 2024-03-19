/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as json from 'vs/base/common/json';
import { KeyCode } from 'vs/base/common/keyCodes';
import { KeyCodeChord } from 'vs/base/common/keybindings';
import { OS } from 'vs/base/common/platform';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { NullLogService } from 'vs/platform/log/common/log';
import { KeybindingsEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TestEnvironmentService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { joinPath } from 'vs/base/common/resources';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

interface Modifiers {
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

suite('KeybindingsEditing', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let fileService: IFileService;
	let environmentService: IEnvironmentService;
	let userDataProfileService: IUserDataProfileService;
	let testObject: KeybindingsEditingService;

	setup(async () => {

		environmentService = TestEnvironmentService;

		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const userFolder = joinPath(ROOT, 'User');
		await fileService.createFolder(userFolder);

		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'eol': '\n' });

		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		userDataProfileService = disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()))));

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => configService,
			environmentService: () => environmentService
		}, disposables);

		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditingService));
	});

	test('errors cases - parse errors', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.keybindingsResource, VSBuffer.fromString(',,,,,,,,,,,,,,'));
		try {
			await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape } }), 'alt+c', undefined);
			assert.fail('Should fail with parse errors');
		} catch (error) {
			assert.strictEqual(error.message, 'Unable to write to the keybindings configuration file. Please open it to correct errors/warnings in the file and try again.');
		}
	});

	test('errors cases - parse errors 2', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.keybindingsResource, VSBuffer.fromString('[{"key": }]'));
		try {
			await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape } }), 'alt+c', undefined);
			assert.fail('Should fail with parse errors');
		} catch (error) {
			assert.strictEqual(error.message, 'Unable to write to the keybindings configuration file. Please open it to correct errors/warnings in the file and try again.');
		}
	});

	test('errors cases - dirty', () => {
		instantiationService.stub(ITextFileService, 'isDirty', true);
		return testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape } }), 'alt+c', undefined)
			.then(() => assert.fail('Should fail with dirty error'),
				error => assert.strictEqual(error.message, 'Unable to write because the keybindings configuration file has unsaved changes. Please save it first and then try again.'));
	});

	test('errors cases - did not find an array', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.keybindingsResource, VSBuffer.fromString('{"key": "alt+c", "command": "hello"}'));
		try {
			await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape } }), 'alt+c', undefined);
			assert.fail('Should fail');
		} catch (error) {
			assert.strictEqual(error.message, 'Unable to write to the keybindings configuration file. It has an object which is not of type Array. Please open the file to clean up and try again.');
		}
	});

	test('edit a default keybinding to an empty file', async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.keybindingsResource, VSBuffer.fromString(''));
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape }, command: 'a' }), 'alt+c', undefined);
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('edit a default keybinding to an empty array', async () => {
		await writeToKeybindingsFile();
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape }, command: 'a' }), 'alt+c', undefined);
		return assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('edit a default keybinding in an existing array', async () => {
		await writeToKeybindingsFile({ command: 'b', key: 'shift+c' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'shift+c', command: 'b' }, { key: 'alt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape }, command: 'a' }), 'alt+c', undefined);
		return assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('add another keybinding', async () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }];
		await testObject.addKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape }, command: 'a' }), 'alt+c', undefined);
		return assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('add a new default keybinding', async () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }];
		await testObject.addKeybinding(aResolvedKeybindingItem({ command: 'a' }), 'alt+c', undefined);
		return assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('add a new default keybinding using edit', async () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'a' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ command: 'a' }), 'alt+c', undefined);
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('edit an user keybinding', async () => {
		await writeToKeybindingsFile({ key: 'escape', command: 'b' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'b' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape }, command: 'b', isDefault: false }), 'alt+c', undefined);
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('edit an user keybinding with more than one element', async () => {
		await writeToKeybindingsFile({ key: 'escape', command: 'b' }, { key: 'alt+shift+g', command: 'c' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: 'b' }, { key: 'alt+shift+g', command: 'c' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ firstChord: { keyCode: KeyCode.Escape }, command: 'b', isDefault: false }), 'alt+c', undefined);
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('remove a default keybinding', async () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a' }];
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } } }));
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('remove a default keybinding should not ad duplicate entries', async () => {
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a' }];
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } } }));
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } } }));
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } } }));
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } } }));
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'a', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } } }));
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('remove a user keybinding', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: 'b' });
		await testObject.removeKeybinding(aResolvedKeybindingItem({ command: 'b', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } }, isDefault: false }));
		assert.deepStrictEqual(await getUserKeybindings(), []);
	});

	test('reset an edited keybinding', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: 'b' });
		await testObject.resetKeybinding(aResolvedKeybindingItem({ command: 'b', firstChord: { keyCode: KeyCode.KeyC, modifiers: { altKey: true } }, isDefault: false }));
		assert.deepStrictEqual(await getUserKeybindings(), []);
	});

	test('reset a removed keybinding', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-b' });
		await testObject.resetKeybinding(aResolvedKeybindingItem({ command: 'b', isDefault: false }));
		assert.deepStrictEqual(await getUserKeybindings(), []);
	});

	test('reset multiple removed keybindings', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-b' });
		await writeToKeybindingsFile({ key: 'alt+shift+c', command: '-b' });
		await writeToKeybindingsFile({ key: 'escape', command: '-b' });
		await testObject.resetKeybinding(aResolvedKeybindingItem({ command: 'b', isDefault: false }));
		assert.deepStrictEqual(await getUserKeybindings(), []);
	});

	test('add a new keybinding to unassigned keybinding', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-a' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a' }, { key: 'shift+alt+c', command: 'a' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ command: 'a', isDefault: false }), 'shift+alt+c', undefined);
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('add when expression', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-a' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a' }, { key: 'shift+alt+c', command: 'a', when: 'editorTextFocus' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ command: 'a', isDefault: false }), 'shift+alt+c', 'editorTextFocus');
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('update command and when expression', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-a', when: 'editorTextFocus && !editorReadonly' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a', when: 'editorTextFocus && !editorReadonly' }, { key: 'shift+alt+c', command: 'a', when: 'editorTextFocus' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ command: 'a', isDefault: false }), 'shift+alt+c', 'editorTextFocus');
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('update when expression', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-a', when: 'editorTextFocus && !editorReadonly' }, { key: 'shift+alt+c', command: 'a', when: 'editorTextFocus && !editorReadonly' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a', when: 'editorTextFocus && !editorReadonly' }, { key: 'shift+alt+c', command: 'a', when: 'editorTextFocus' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ command: 'a', isDefault: false, when: 'editorTextFocus && !editorReadonly' }), 'shift+alt+c', 'editorTextFocus');
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	test('remove when expression', async () => {
		await writeToKeybindingsFile({ key: 'alt+c', command: '-a', when: 'editorTextFocus && !editorReadonly' });
		const expected: IUserFriendlyKeybinding[] = [{ key: 'alt+c', command: '-a', when: 'editorTextFocus && !editorReadonly' }, { key: 'shift+alt+c', command: 'a' }];
		await testObject.editKeybinding(aResolvedKeybindingItem({ command: 'a', isDefault: false }), 'shift+alt+c', undefined);
		assert.deepStrictEqual(await getUserKeybindings(), expected);
	});

	async function writeToKeybindingsFile(...keybindings: IUserFriendlyKeybinding[]): Promise<void> {
		await fileService.writeFile(userDataProfileService.currentProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify(keybindings || [])));
	}

	async function getUserKeybindings(): Promise<IUserFriendlyKeybinding[]> {
		return json.parse((await fileService.readFile(userDataProfileService.currentProfile.keybindingsResource)).value.toString());
	}

	function aResolvedKeybindingItem({ command, when, isDefault, firstChord, secondChord }: { command?: string; when?: string; isDefault?: boolean; firstChord?: { keyCode: KeyCode; modifiers?: Modifiers }; secondChord?: { keyCode: KeyCode; modifiers?: Modifiers } }): ResolvedKeybindingItem {
		const aSimpleKeybinding = function (chord: { keyCode: KeyCode; modifiers?: Modifiers }): KeyCodeChord {
			const { ctrlKey, shiftKey, altKey, metaKey } = chord.modifiers || { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
			return new KeyCodeChord(ctrlKey!, shiftKey!, altKey!, metaKey!, chord.keyCode);
		};
		const chords: KeyCodeChord[] = [];
		if (firstChord) {
			chords.push(aSimpleKeybinding(firstChord));
			if (secondChord) {
				chords.push(aSimpleKeybinding(secondChord));
			}
		}
		const keybinding = chords.length > 0 ? new USLayoutResolvedKeybinding(chords, OS) : undefined;
		return new ResolvedKeybindingItem(keybinding, command || 'some command', null, when ? ContextKeyExpr.deserialize(when) : undefined, isDefault === undefined ? true : isDefault, null, false);
	}
});
