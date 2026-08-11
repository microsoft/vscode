/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { isMacintosh, isWeb, isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IJSONEditingService, IJSONValue } from '../../../../services/configuration/common/jsonEditing.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ExternalEditorImportService } from '../../browser/externalEditorImportService.js';
import { IExternalEditorSource } from '../../common/externalEditorImport.js';
import { ExternalEditorImportEnvironmentService, IExternalEditorImportEnvironmentService } from '../../common/externalEditorImportEnvironment.js';

function applicationDataHome(home: URI): URI {
	if (isWindows) {
		return URI.joinPath(home, 'AppData', 'Roaming');
	}
	if (isMacintosh) {
		return URI.joinPath(home, 'Library', 'Application Support');
	}
	return URI.joinPath(home, '.config');
}

suite('ExternalEditorImportService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const home = URI.file('/home/tester');
	const nativeTest = isWeb ? test.skip : test;
	const webTest = isWeb ? test : test.skip;

	function createService(existingPaths: Set<string>, remoteAuthority?: string, fileContents?: Map<string, string>, importEnvironmentService?: IExternalEditorImportEnvironmentService): ExternalEditorImportService {
		const fileService = {
			exists: async (resource: URI) => existingPaths.has(resource.toString()),
			readFile: async (resource: URI) => {
				const content = fileContents?.get(resource.toString());
				if (content === undefined) {
					throw new Error('not found');
				}
				return { value: VSBuffer.fromString(content) };
			},
			resolve: async (resource: URI) => {
				if (!existingPaths.has(resource.toString())) {
					throw new Error('not found');
				}
				return { children: [{ name: 'a.code-snippets', isDirectory: false, resource: URI.joinPath(resource, 'a.code-snippets') }] };
			},
		} as unknown as IFileService;

		const pathService = {
			userHome: async () => home,
		} as unknown as IPathService;

		return store.add(new ExternalEditorImportService(
			fileService,
			pathService,
			{} as unknown as IJSONEditingService,
			{} as unknown as IUserDataProfileService,
			{} as unknown as IExtensionGalleryService,
			{} as unknown as IExtensionManagementService,
			{} as unknown as IWorkbenchExtensionManagementService,
			{ getColorThemes: async () => [{ settingsId: 'Monokai' }] } as unknown as IWorkbenchThemeService,
			{ remoteAuthority } as unknown as IWorkbenchEnvironmentService,
			importEnvironmentService ?? new ExternalEditorImportEnvironmentService(),
			new NullLogService(),
		));
	}

	/**
	 * A minimal in-memory file system backing the reads and writes an import performs.
	 */
	class InMemoryFiles {
		constructor(private readonly contents: Map<string, string>) { }

		readonly service = {
			exists: async (resource: URI) => this.contents.has(resource.toString()),
			readFile: async (resource: URI) => {
				const content = this.contents.get(resource.toString());
				if (content === undefined) {
					throw new Error('not found');
				}
				return { value: VSBuffer.fromString(content) };
			},
			writeFile: async (resource: URI, value: VSBuffer) => {
				this.contents.set(resource.toString(), value.toString());
			},
			resolve: async (resource: URI) => {
				if (!this.contents.has(resource.toString())) {
					throw new Error('not found');
				}
				return { children: [] };
			},
		} as unknown as IFileService;

		get(resource: URI): string | undefined {
			return this.contents.get(resource.toString());
		}
	}

	const cursorUserData = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
	const keybindingsTarget = URI.file('/profile/keybindings.json');

	function cursorSource(overrides: Partial<IExternalEditorSource> = {}): IExternalEditorSource {
		return {
			id: 'cursor',
			label: 'Cursor',
			userDataUri: cursorUserData,
			extensionsManifestUri: URI.joinPath(home, '.cursor', 'extensions', 'extensions.json'),
			hasSettings: false,
			hasKeybindings: false,
			hasSnippets: false,
			hasExtensions: false,
			colorThemeId: undefined,
			...overrides,
		};
	}

	nativeTest('detects Cursor and reports available categories', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const existing = new Set<string>([
			URI.joinPath(cursorUser, 'settings.json').toString(),
			URI.joinPath(home, '.cursor', 'extensions', 'extensions.json').toString(),
		]);

		const service = createService(existing);
		const sources = await service.detectSources();

		assert.deepStrictEqual(sources.map(s => ({
			id: s.id,
			hasSettings: s.hasSettings,
			hasKeybindings: s.hasKeybindings,
			hasSnippets: s.hasSnippets,
			hasExtensions: s.hasExtensions,
			userData: s.userDataUri.toString(),
		})), [{
			id: 'cursor',
			hasSettings: true,
			hasKeybindings: false,
			hasSnippets: false,
			hasExtensions: true,
			userData: cursorUser.toString(),
		}]);
	});

	nativeTest('resolves an explicit color theme to itself', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const settingsUri = URI.joinPath(cursorUser, 'settings.json');
		const existing = new Set<string>([settingsUri.toString()]);
		const contents = new Map<string, string>([
			[settingsUri.toString(), JSON.stringify({ 'workbench.colorTheme': 'Monokai', 'editor.fontSize': 14 })],
		]);

		const service = createService(existing, undefined, contents);
		const sources = await service.detectSources();

		assert.strictEqual(sources[0]?.colorThemeId, 'Monokai');
	});

	nativeTest('maps the selected theme from state storage to the closest VS Code theme', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const settingsUri = URI.joinPath(cursorUser, 'settings.json');
		const storageUri = URI.joinPath(cursorUser, 'globalStorage', 'storage.json');
		const existing = new Set<string>([settingsUri.toString()]);
		// settings.json only follows the OS; the real selection ("Cursor Light") lives in state.
		const contents = new Map<string, string>([
			[settingsUri.toString(), JSON.stringify({ 'window.autoDetectColorScheme': true })],
			[storageUri.toString(), JSON.stringify({ 'glass.theme.settingsId': 'Cursor Light', 'theme': 'vs-dark' })],
		]);

		const service = createService(existing, undefined, contents);
		const sources = await service.detectSources();

		assert.strictEqual(sources[0]?.colorThemeId, 'Light Modern');
	});

	nativeTest('maps a high-contrast base theme from state storage', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const settingsUri = URI.joinPath(cursorUser, 'settings.json');
		const storageUri = URI.joinPath(cursorUser, 'globalStorage', 'storage.json');
		const existing = new Set<string>([settingsUri.toString()]);
		const contents = new Map<string, string>([
			[settingsUri.toString(), JSON.stringify({ 'editor.fontSize': 14 })],
			[storageUri.toString(), JSON.stringify({ 'theme': 'hc-black' })],
		]);

		const service = createService(existing, undefined, contents);
		const sources = await service.detectSources();

		assert.strictEqual(sources[0]?.colorThemeId, 'Dark High Contrast');
	});

	nativeTest('does not infer the active theme from preferred themes', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const settingsUri = URI.joinPath(cursorUser, 'settings.json');
		const existing = new Set<string>([settingsUri.toString()]);
		const contents = new Map<string, string>([
			[settingsUri.toString(), JSON.stringify({
				'window.autoDetectColorScheme': true,
				'workbench.preferredDarkColorTheme': 'Cursor Dark',
				'workbench.preferredLightColorTheme': 'Cursor Light',
			})],
		]);

		const service = createService(existing, undefined, contents);
		const sources = await service.detectSources();

		assert.strictEqual(sources[0]?.colorThemeId, undefined);
	});

	nativeTest('reports no theme preference when the source settings set none', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const settingsUri = URI.joinPath(cursorUser, 'settings.json');
		const existing = new Set<string>([settingsUri.toString()]);
		const contents = new Map<string, string>([
			[settingsUri.toString(), JSON.stringify({ 'editor.fontSize': 14 })],
		]);

		const service = createService(existing, undefined, contents);
		const sources = await service.detectSources();

		assert.strictEqual(sources[0]?.colorThemeId, undefined);
	});

	nativeTest('returns no sources when nothing is installed', async () => {
		const service = createService(new Set<string>());
		const sources = await service.detectSources();
		assert.strictEqual(sources.length, 0);
	});

	nativeTest('returns no sources in a remote window', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const existing = new Set<string>([URI.joinPath(cursorUser, 'settings.json').toString()]);
		const service = createService(existing, 'ssh-remote+host');
		const sources = await service.detectSources();
		assert.strictEqual(sources.length, 0);
	});

	nativeTest('detects Cursor under a redirected application-data root', async () => {
		const redirectedHome = URI.file('/redirected/config');
		const cursorUser = URI.joinPath(redirectedHome, 'Cursor', 'User');
		const existing = new Set<string>([URI.joinPath(cursorUser, 'settings.json').toString()]);
		const importEnvironmentService = {
			_serviceBrand: undefined,
			getApplicationDataHome: async () => redirectedHome,
		};

		const sources = await createService(existing, undefined, undefined, importEnvironmentService).detectSources();

		assert.deepStrictEqual(sources.map(source => source.userDataUri.toString()), [cursorUser.toString()]);
	});

	webTest('returns no sources in web', async () => {
		const cursorUser = URI.joinPath(applicationDataHome(home), 'Cursor', 'User');
		const existing = new Set<string>([URI.joinPath(cursorUser, 'settings.json').toString()]);

		const sources = await createService(existing).detectSources();

		assert.deepStrictEqual(sources, []);
	});

	function createImportService(options: {
		files: InMemoryFiles;
		jsonEditingService?: IJSONEditingService;
		extensionGalleryService?: IExtensionGalleryService;
		extensionManagementService?: IExtensionManagementService;
		workbenchExtensionManagementService?: IWorkbenchExtensionManagementService;
		importEnvironmentService?: IExternalEditorImportEnvironmentService;
	}): ExternalEditorImportService {
		const pathService = { userHome: async () => home } as unknown as IPathService;
		const userDataProfileService = {
			currentProfile: {
				settingsResource: URI.file('/profile/settings.json'),
				keybindingsResource: keybindingsTarget,
				snippetsHome: URI.file('/profile/snippets'),
				extensionsResource: URI.file('/profile/extensions.json'),
			},
		} as unknown as IUserDataProfileService;
		const workbenchExtensionManagementService = {
			canInstall: async () => true,
			requestPublisherTrust: async () => true,
			installFromGallery: async () => undefined,
		} as unknown as IWorkbenchExtensionManagementService;

		return store.add(new ExternalEditorImportService(
			options.files.service,
			pathService,
			options.jsonEditingService ?? ({ write: async () => { } } as unknown as IJSONEditingService),
			userDataProfileService,
			options.extensionGalleryService ?? ({} as unknown as IExtensionGalleryService),
			options.extensionManagementService ?? ({} as unknown as IExtensionManagementService),
			options.workbenchExtensionManagementService ?? workbenchExtensionManagementService,
			{ getColorThemes: async () => [] } as unknown as IWorkbenchThemeService,
			{ remoteAuthority: undefined } as unknown as IWorkbenchEnvironmentService,
			options.importEnvironmentService ?? new ExternalEditorImportEnvironmentService(),
			new NullLogService(),
		));
	}

	test('imports settings, skips theme/source keys, and pins the resolved color theme', async () => {
		const sourceSettings = URI.joinPath(cursorUserData, 'settings.json');
		const targetSettings = URI.file('/profile/settings.json');
		const files = new InMemoryFiles(new Map([
			[sourceSettings.toString(), JSON.stringify({
				'editor.fontSize': 14,
				'window.autoDetectColorScheme': true, // theme key: skipped in favour of the resolved theme
				'cursor.internal': true,              // source-specific: blocked
			})],
		]));

		const writes: { resource: URI; values: IJSONValue[] }[] = [];
		const jsonEditingService = {
			write: async (resource: URI, values: IJSONValue[]) => { writes.push({ resource, values }); },
		} as unknown as IJSONEditingService;

		const service = createImportService({ files, jsonEditingService });
		const result = await service.import(cursorSource({ hasSettings: true, colorThemeId: 'Light Modern' }), { settings: true });

		assert.strictEqual(result.settingsImported, 2);
		assert.deepStrictEqual(writes.map(w => ({ resource: w.resource.toString(), values: w.values })), [{
			resource: targetSettings.toString(),
			values: [
				{ path: ['editor.fontSize'], value: 14 },
				{ path: ['workbench.colorTheme'], value: 'Light Modern' },
			],
		}]);
	});

	test('reports settings write failures without importing anything', async () => {
		const sourceSettings = URI.joinPath(cursorUserData, 'settings.json');
		const files = new InMemoryFiles(new Map([
			[sourceSettings.toString(), JSON.stringify({ 'editor.fontSize': 14 })],
		]));
		const jsonEditingService = { write: async () => { throw new Error('write failed'); } } as unknown as IJSONEditingService;
		const service = createImportService({ files, jsonEditingService });

		const result = await service.import(cursorSource({ hasSettings: true }), { settings: true });

		assert.deepStrictEqual({ imported: result.settingsImported, failed: result.settingsFailed }, { imported: 0, failed: true });
	});

	test('imports keybindings by appending through the JSON editing service to preserve the existing file', async () => {
		const sourceKeybindings = URI.joinPath(cursorUserData, 'keybindings.json');
		const files = new InMemoryFiles(new Map([
			[sourceKeybindings.toString(), JSON.stringify([{ key: 'ctrl+a', command: 'a' }, { key: 'ctrl+b', command: 'b' }])],
			// Existing file contains a comment and one of the source entries already.
			[keybindingsTarget.toString(), '// user keybindings\n[\n\t{ "key": "ctrl+a", "command": "a" }\n]'],
		]));

		const writes: { resource: URI; values: IJSONValue[] }[] = [];
		const jsonEditingService = {
			write: async (resource: URI, values: IJSONValue[]) => { writes.push({ resource, values }); },
		} as unknown as IJSONEditingService;

		const service = createImportService({ files, jsonEditingService });
		const result = await service.import(cursorSource({ hasKeybindings: true }), { keybindings: true });

		assert.strictEqual(result.keybindingsImported, true);
		// Only the new (ctrl+b) entry is appended, via the JSON editing service (not a raw rewrite).
		assert.deepStrictEqual(writes, [{
			resource: keybindingsTarget,
			values: [{ path: [-1], value: { key: 'ctrl+b', command: 'b' } }],
		}]);
		// The existing file (with its comment) is left untouched by a direct write.
		assert.strictEqual(files.get(keybindingsTarget), '// user keybindings\n[\n\t{ "key": "ctrl+a", "command": "a" }\n]');
	});

	test('does not overwrite a corrupt (non-array) keybindings file', async () => {
		const sourceKeybindings = URI.joinPath(cursorUserData, 'keybindings.json');
		const files = new InMemoryFiles(new Map([
			[sourceKeybindings.toString(), JSON.stringify([{ key: 'ctrl+b', command: 'b' }])],
			[keybindingsTarget.toString(), '{ "not": "an array" }'],
		]));

		let jsonWriteCalled = false;
		const jsonEditingService = { write: async () => { jsonWriteCalled = true; } } as unknown as IJSONEditingService;

		const service = createImportService({ files, jsonEditingService });
		const result = await service.import(cursorSource({ hasKeybindings: true }), { keybindings: true });

		assert.strictEqual(result.keybindingsImported, false);
		assert.strictEqual(jsonWriteCalled, false);
		// The original content is preserved rather than clobbered.
		assert.strictEqual(files.get(keybindingsTarget), '{ "not": "an array" }');
	});

	test('compares keybindings structurally regardless of property order', async () => {
		const sourceKeybindings = URI.joinPath(cursorUserData, 'keybindings.json');
		const files = new InMemoryFiles(new Map([
			[sourceKeybindings.toString(), JSON.stringify([{ command: 'a', key: 'ctrl+a' }])],
			[keybindingsTarget.toString(), JSON.stringify([{ key: 'ctrl+a', command: 'a' }])],
		]));

		const service = createImportService({ files });
		const preview = await service.preview(cursorSource({ hasKeybindings: true }));
		const result = await service.import(cursorSource({ hasKeybindings: true }), { keybindings: true });

		assert.deepStrictEqual({ preview: preview.keybindings, imported: result.keybindingsImported }, { preview: [], imported: false });
	});

	test('ignores invalid keybinding entries consistently', async () => {
		const sourceKeybindings = URI.joinPath(cursorUserData, 'keybindings.json');
		const files = new InMemoryFiles(new Map([
			[sourceKeybindings.toString(), JSON.stringify([null, 42, 'invalid', { key: 'ctrl+a' }, { key: 'ctrl+b', command: 'b' }])],
		]));
		const writes: IJSONValue[][] = [];
		const jsonEditingService = {
			write: async (_resource: URI, values: IJSONValue[]) => { writes.push(values); },
		} as unknown as IJSONEditingService;
		const service = createImportService({ files, jsonEditingService });
		const source = cursorSource({ hasKeybindings: true });

		const preview = await service.preview(source);
		const result = await service.import(source, { keybindings: true });

		assert.deepStrictEqual({ preview: preview.keybindings, imported: result.keybindingsImported, writes }, {
			preview: ['ctrl+b → b'],
			imported: true,
			writes: [],
		});
		assert.strictEqual(files.get(keybindingsTarget), JSON.stringify([{ key: 'ctrl+b', command: 'b' }], null, '\t'));
	});

	test('previews and imports only supported snippet files', async () => {
		const snippetsHome = URI.joinPath(cursorUserData, 'snippets');
		const files = new InMemoryFiles(new Map([
			[snippetsHome.toString(), 'directory'],
			[URI.joinPath(snippetsHome, 'valid.code-snippets').toString(), '{}'],
			[URI.joinPath(snippetsHome, 'notes.txt').toString(), 'not a snippet'],
		]));
		files.service.resolve = async resource => ({
			children: [
				{ name: 'valid.code-snippets', isDirectory: false, resource: URI.joinPath(resource, 'valid.code-snippets') },
				{ name: 'notes.txt', isDirectory: false, resource: URI.joinPath(resource, 'notes.txt') },
			],
		}) as never;

		const service = createImportService({ files });
		const source = cursorSource({ hasSnippets: true });
		const preview = await service.preview(source);
		const result = await service.import(source, { snippets: true });

		assert.deepStrictEqual({ preview: preview.snippets, imported: result.snippetsImported }, { preview: ['valid.code-snippets'], imported: 1 });
	});

	test('previews no changes when every source customization already exists', async () => {
		const sourceSettings = URI.joinPath(cursorUserData, 'settings.json');
		const sourceKeybindings = URI.joinPath(cursorUserData, 'keybindings.json');
		const sourceSnippets = URI.joinPath(cursorUserData, 'snippets');
		const sourceSnippet = URI.joinPath(sourceSnippets, 'existing.code-snippets');
		const targetSnippet = URI.file('/profile/snippets/existing.code-snippets');
		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const files = new InMemoryFiles(new Map([
			[sourceSettings.toString(), JSON.stringify({ 'editor.fontSize': 14 })],
			[URI.file('/profile/settings.json').toString(), JSON.stringify({ 'editor.fontSize': 14 })],
			[sourceKeybindings.toString(), JSON.stringify([{ key: 'ctrl+a', command: 'a' }])],
			[keybindingsTarget.toString(), JSON.stringify([{ command: 'a', key: 'ctrl+a' }])],
			[sourceSnippets.toString(), 'directory'],
			[sourceSnippet.toString(), '{}'],
			[targetSnippet.toString(), '{}'],
			[manifest.toString(), JSON.stringify([{ identifier: { id: 'pub.existing' } }])],
		]));
		files.service.resolve = async resource => ({
			children: resource.toString() === sourceSnippets.toString()
				? [{ name: 'existing.code-snippets', isDirectory: false, resource: sourceSnippet }]
				: [],
		}) as never;
		const extensionManagementService = {
			getInstalled: async () => [{ identifier: { id: 'pub.existing' } }],
		} as unknown as IExtensionManagementService;
		const service = createImportService({ files, extensionManagementService });

		const preview = await service.preview(cursorSource({ hasSettings: true, hasKeybindings: true, hasSnippets: true, hasExtensions: true }));

		assert.deepStrictEqual(preview, { settings: [], keybindings: [], snippets: [], extensions: [] });
	});

	test('previews each independently available customization category', async () => {
		const settingsFiles = new InMemoryFiles(new Map([
			[URI.joinPath(cursorUserData, 'settings.json').toString(), JSON.stringify({ 'editor.fontSize': 14 })],
		]));
		const settings = await createImportService({ files: settingsFiles }).preview(cursorSource({ hasSettings: true }));

		const keybindingsFiles = new InMemoryFiles(new Map([
			[URI.joinPath(cursorUserData, 'keybindings.json').toString(), JSON.stringify([{ key: 'ctrl+a', command: 'a' }])],
		]));
		const keybindings = await createImportService({ files: keybindingsFiles }).preview(cursorSource({ hasKeybindings: true }));

		const snippetsHome = URI.joinPath(cursorUserData, 'snippets');
		const snippet = URI.joinPath(snippetsHome, 'new.code-snippets');
		const snippetFiles = new InMemoryFiles(new Map([
			[snippetsHome.toString(), 'directory'],
			[snippet.toString(), '{}'],
		]));
		snippetFiles.service.resolve = async () => ({
			children: [{ name: 'new.code-snippets', isDirectory: false, resource: snippet }],
		}) as never;
		const snippets = await createImportService({ files: snippetFiles }).preview(cursorSource({ hasSnippets: true }));

		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const extensionFiles = new InMemoryFiles(new Map([
			[manifest.toString(), JSON.stringify([{ identifier: { id: 'pub.new' } }])],
		]));
		const extensionManagementService = { getInstalled: async () => [] } as unknown as IExtensionManagementService;
		const extensionGalleryService = {
			getExtensions: async () => [{ identifier: { id: 'pub.new' }, displayName: 'New Extension' }],
		} as unknown as IExtensionGalleryService;
		const extensions = await createImportService({ files: extensionFiles, extensionManagementService, extensionGalleryService }).preview(cursorSource({ hasExtensions: true }));

		assert.deepStrictEqual({ settings, keybindings, snippets, extensions }, {
			settings: { settings: ['editor.fontSize'], keybindings: [], snippets: [], extensions: [] },
			keybindings: { settings: [], keybindings: ['ctrl+a → a'], snippets: [], extensions: [] },
			snippets: { settings: [], keybindings: [], snippets: ['new.code-snippets'], extensions: [] },
			extensions: { settings: [], keybindings: [], snippets: [], extensions: ['New Extension'] },
		});
	});

	test('counts snippet write failures', async () => {
		const snippetsHome = URI.joinPath(cursorUserData, 'snippets');
		const sourceSnippet = URI.joinPath(snippetsHome, 'valid.code-snippets');
		const files = new InMemoryFiles(new Map([
			[snippetsHome.toString(), 'directory'],
			[sourceSnippet.toString(), '{}'],
		]));
		files.service.resolve = async resource => ({
			children: [{ name: 'valid.code-snippets', isDirectory: false, resource: URI.joinPath(resource, 'valid.code-snippets') }],
		}) as never;
		files.service.writeFile = async () => { throw new Error('write failed'); };
		const service = createImportService({ files });

		const result = await service.import(cursorSource({ hasSnippets: true }), { snippets: true });

		assert.deepStrictEqual({ imported: result.snippetsImported, failed: result.snippetsFailed }, { imported: 0, failed: 1 });
	});

	test('stops importing snippets when cancelled', async () => {
		const snippetsHome = URI.joinPath(cursorUserData, 'snippets');
		const firstSnippet = URI.joinPath(snippetsHome, 'first.code-snippets');
		const secondSnippet = URI.joinPath(snippetsHome, 'second.code-snippets');
		const files = new InMemoryFiles(new Map([
			[snippetsHome.toString(), 'directory'],
			[firstSnippet.toString(), '{}'],
			[secondSnippet.toString(), '{}'],
		]));
		files.service.resolve = async () => ({
			children: [
				{ name: 'first.code-snippets', isDirectory: false, resource: firstSnippet },
				{ name: 'second.code-snippets', isDirectory: false, resource: secondSnippet },
			],
		}) as never;
		const cancellation = store.add(new CancellationTokenSource());
		const writeFile = files.service.writeFile;
		files.service.writeFile = async (resource, value) => {
			await writeFile(resource, value);
			cancellation.cancel();
		};
		const service = createImportService({ files });

		const result = await service.import(cursorSource({ hasSnippets: true }), { snippets: true }, cancellation.token);

		assert.deepStrictEqual({ imported: result.snippetsImported, failed: result.snippetsFailed }, { imported: 1, failed: 0 });
		assert.strictEqual(files.get(URI.file('/profile/snippets/second.code-snippets')), undefined);
	});

	test('counts extensions missing from the gallery as failed', async () => {
		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const files = new InMemoryFiles(new Map([
			[manifest.toString(), JSON.stringify([{ identifier: { id: 'pub.a' } }, { identifier: { id: 'pub.b' } }])],
		]));

		const extensionManagementService = {
			getInstalled: async () => [],
		} as unknown as IExtensionManagementService;

		// Only one of the two requested extensions resolves in the gallery.
		const extensionGalleryService = {
			getExtensions: async () => [{ identifier: { id: 'pub.a' }, displayName: 'A' }],
		} as unknown as IExtensionGalleryService;

		const service = createImportService({ files, extensionGalleryService, extensionManagementService });
		const result = await service.import(cursorSource({ hasExtensions: true }), { extensions: true });

		assert.deepStrictEqual(
			{ installed: result.extensionsInstalled, failed: result.extensionsFailed },
			{ installed: 1, failed: 1 },
		);
	});

	test('remaps known source-editor forks to their Marketplace equivalents', async () => {
		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const files = new InMemoryFiles(new Map([
			[manifest.toString(), JSON.stringify([{ identifier: { id: 'anysphere.remote-ssh', uuid: 'anysphere-uuid' } }])],
		]));

		const extensionManagementService = {
			getInstalled: async () => [],
		} as unknown as IExtensionManagementService;

		let queriedIds: string[] = [];
		const extensionGalleryService = {
			getExtensions: async (infos: { id: string }[]) => {
				queriedIds = infos.map(info => info.id);
				return infos.map(info => ({ identifier: { id: info.id }, displayName: info.id }));
			},
		} as unknown as IExtensionGalleryService;

		const service = createImportService({ files, extensionGalleryService, extensionManagementService });
		const result = await service.import(cursorSource({ hasExtensions: true }), { extensions: true });

		assert.deepStrictEqual(
			{ queriedIds, installed: result.extensionsInstalled, failed: result.extensionsFailed },
			{ queriedIds: ['ms-vscode-remote.remote-ssh'], installed: 1, failed: 0 },
		);
	});

	test('checks and installs extensions in the current profile', async () => {
		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const profileLocation = URI.file('/profile/extensions.json');
		const files = new InMemoryFiles(new Map([
			[manifest.toString(), JSON.stringify([{ identifier: { id: 'pub.a' } }])],
		]));
		const getInstalledLocations: (URI | undefined)[] = [];
		const extensionManagementService = {
			getInstalled: async (_type: undefined, location: URI | undefined) => {
				getInstalledLocations.push(location);
				return [];
			},
		} as unknown as IExtensionManagementService;
		const extensionGalleryService = {
			getExtensions: async () => [{ identifier: { id: 'pub.a' }, displayName: 'A' }],
		} as unknown as IExtensionGalleryService;
		const installLocations: (URI | undefined)[] = [];
		const workbenchExtensionManagementService = {
			canInstall: async () => true,
			requestPublisherTrust: async () => true,
			installFromGallery: async (_extension: object, options: { profileLocation?: URI }) => { installLocations.push(options.profileLocation); },
		} as unknown as IWorkbenchExtensionManagementService;
		const service = createImportService({ files, extensionGalleryService, extensionManagementService, workbenchExtensionManagementService });
		const source = cursorSource({ hasExtensions: true });

		await service.preview(source);
		await service.import(source, { extensions: true });

		assert.deepStrictEqual({ getInstalledLocations, installLocations }, {
			getInstalledLocations: [profileLocation, profileLocation],
			installLocations: [profileLocation],
		});
	});

	test('counts unsupported and untrusted extensions as failed', async () => {
		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const files = new InMemoryFiles(new Map([
			[manifest.toString(), JSON.stringify([
				{ identifier: { id: 'pub.unsupported' } },
				{ identifier: { id: 'pub.untrusted' } },
			])],
		]));
		const extensionManagementService = { getInstalled: async () => [] } as unknown as IExtensionManagementService;
		const extensionGalleryService = {
			getExtensions: async () => [
				{ identifier: { id: 'pub.unsupported' } },
				{ identifier: { id: 'pub.untrusted' } },
			],
		} as unknown as IExtensionGalleryService;
		const workbenchExtensionManagementService = {
			canInstall: async (extension: { identifier: { id: string } }) => extension.identifier.id !== 'pub.unsupported',
			requestPublisherTrust: async () => { throw new Error('denied'); },
			installFromGallery: async () => undefined,
		} as unknown as IWorkbenchExtensionManagementService;
		const service = createImportService({ files, extensionGalleryService, extensionManagementService, workbenchExtensionManagementService });

		const result = await service.import(cursorSource({ hasExtensions: true }), { extensions: true });

		assert.deepStrictEqual({ installed: result.extensionsInstalled, failed: result.extensionsFailed }, { installed: 0, failed: 2 });
	});

	test('counts only remaining extensions as failed when installation is cancelled', async () => {
		const manifest = URI.joinPath(home, '.cursor', 'extensions', 'extensions.json');
		const files = new InMemoryFiles(new Map([
			[manifest.toString(), JSON.stringify([
				{ identifier: { id: 'pub.installed' } },
				{ identifier: { id: 'pub.cancelled-a' } },
				{ identifier: { id: 'pub.cancelled-b' } },
			])],
		]));
		const extensionManagementService = { getInstalled: async () => [] } as unknown as IExtensionManagementService;
		const extensionGalleryService = {
			getExtensions: async () => [
				{ identifier: { id: 'pub.installed' } },
				{ identifier: { id: 'pub.cancelled-a' } },
				{ identifier: { id: 'pub.cancelled-b' } },
			],
		} as unknown as IExtensionGalleryService;
		const cancellation = store.add(new CancellationTokenSource());
		const workbenchExtensionManagementService = {
			canInstall: async () => true,
			requestPublisherTrust: async () => true,
			installFromGallery: async () => { cancellation.cancel(); },
		} as unknown as IWorkbenchExtensionManagementService;
		const service = createImportService({ files, extensionGalleryService, extensionManagementService, workbenchExtensionManagementService });

		const result = await service.import(cursorSource({ hasExtensions: true }), { extensions: true }, cancellation.token);

		assert.deepStrictEqual({ installed: result.extensionsInstalled, failed: result.extensionsFailed }, { installed: 1, failed: 2 });
	});
});
