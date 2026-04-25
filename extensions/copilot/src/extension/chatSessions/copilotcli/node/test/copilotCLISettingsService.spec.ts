/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { Emitter, Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { CopilotCLISettingsLocationType } from '../../common/copilotCLISettingsService';
import { CopilotCLISettingsService } from '../copilotCLISettingsService';
import type { FileSystemWatcher, RelativePattern } from 'vscode';

class MockWorkspaceService extends mock<IWorkspaceService>() {
	private _folders: URI[] = [];
	private readonly _onDidChange = new Emitter<void>();
	override readonly onDidChangeWorkspaceFolders: Event<any> = this._onDidChange.event;
	setFolders(folders: URI[]) { this._folders = folders; }
	override getWorkspaceFolders(): URI[] { return this._folders; }
	dispose() { this._onDidChange.dispose(); }
}

class MockFileSystemService extends mock<IFileSystemService>() {
	private readonly _files = new Map<string, Uint8Array>();
	readonly writtenFiles = new Map<string, Uint8Array>();

	setFile(uri: URI, content: string) {
		this._files.set(uri.toString(), new TextEncoder().encode(content));
	}

	override async readFile(uri: URI): Promise<Uint8Array> {
		const content = this._files.get(uri.toString());
		if (!content) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return content;
	}

	override async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		this._files.set(uri.toString(), content);
		this.writtenFiles.set(uri.toString(), content);
	}

	override createFileSystemWatcher(_glob: string | RelativePattern): FileSystemWatcher {
		return {
			ignoreCreateEvents: false,
			ignoreChangeEvents: false,
			ignoreDeleteEvents: false,
			onDidCreate: Event.None,
			onDidChange: Event.None,
			onDidDelete: Event.None,
			dispose() { },
		};
	}
}

class MockEnvService extends mock<INativeEnvService>() {
	override userHome = URI.file('/home/user');
}

describe('CopilotCLISettingsService', () => {
	let disposables: DisposableStore;
	let mockWorkspaceService: MockWorkspaceService;
	let mockFileSystemService: MockFileSystemService;
	let service: CopilotCLISettingsService;

	const userHome = URI.file('/home/user');
	const settingsUri = URI.joinPath(userHome, '.copilot', 'settings.json');

	beforeEach(() => {
		disposables = new DisposableStore();
		mockWorkspaceService = disposables.add(new MockWorkspaceService());
		mockFileSystemService = new MockFileSystemService();
		service = disposables.add(new CopilotCLISettingsService(
			mockWorkspaceService,
			mockFileSystemService,
			new MockEnvService(),
		));
	});

	afterEach(() => {
		disposables.dispose();
	});

	describe('getUris', () => {
		it('returns user settings URI', () => {
			const uris = service.getUris(CopilotCLISettingsLocationType.User);
			expect(uris).toHaveLength(1);
			expect(uris[0].path).toBe('/home/user/.copilot/settings.json');
		});

		it('returns all URIs when no location specified', () => {
			const uris = service.getUris();
			expect(uris).toHaveLength(1);
			expect(uris[0].path).toBe('/home/user/.copilot/settings.json');
		});
	});

	describe('getUri', () => {
		it('returns user settings URI regardless of input URI', () => {
			const uri = service.getUri(CopilotCLISettingsLocationType.User, URI.file('/workspace/src/file.ts'));
			expect(uri.path).toBe('/home/user/.copilot/settings.json');
		});
	});

	describe('readSettingsFile', () => {
		it('returns parsed JSON from a settings file', async () => {
			mockFileSystemService.setFile(settingsUri, JSON.stringify({ disabledSkills: ['my-skill'] }));

			const result = await service.readSettingsFile(settingsUri);
			expect(result).toEqual({ disabledSkills: ['my-skill'] });
		});

		it('returns empty object when file does not exist', async () => {
			const result = await service.readSettingsFile(settingsUri);
			expect(result).toEqual({});
		});

		it('returns empty object for invalid JSON', async () => {
			mockFileSystemService.setFile(settingsUri, 'not valid json');

			const result = await service.readSettingsFile(settingsUri);
			expect(result).toEqual({});
		});

		it('returns empty object for JSON arrays', async () => {
			mockFileSystemService.setFile(settingsUri, '[1, 2, 3]');

			const result = await service.readSettingsFile(settingsUri);
			expect(result).toEqual({});
		});
	});

	describe('readAllSettings', () => {
		it('reads settings file and returns it with User type', async () => {
			mockFileSystemService.setFile(settingsUri, JSON.stringify({ disabledSkills: ['lint'] }));

			const results = await service.readAllSettings();
			expect(results).toHaveLength(1);
			expect(results[0].type).toBe(CopilotCLISettingsLocationType.User);
			expect(results[0].settings).toEqual({ disabledSkills: ['lint'] });
			expect(results[0].uri.path).toBe('/home/user/.copilot/settings.json');
		});

		it('returns empty settings when file does not exist', async () => {
			const results = await service.readAllSettings();
			expect(results).toHaveLength(1);
			expect(results[0].settings).toEqual({});
		});

		it('caches results across calls', async () => {
			mockFileSystemService.setFile(settingsUri, JSON.stringify({ cached: true }));

			const first = await service.readAllSettings();
			mockFileSystemService.setFile(settingsUri, JSON.stringify({ cached: false }));
			const second = await service.readAllSettings();

			expect(first).toBe(second);
		});
	});

	describe('writeSettingsFile', () => {
		it('writes settings as formatted JSON', async () => {
			const settings = { disabledSkills: ['my-skill'], enabledPlugins: { 'my-plugin': false } };

			await service.writeSettingsFile(settingsUri, settings);

			const written = mockFileSystemService.writtenFiles.get(settingsUri.toString());
			expect(written).toBeDefined();
			const parsed = JSON.parse(new TextDecoder().decode(written!));
			expect(parsed).toEqual(settings);
		});

		it('uses 4-space indentation', async () => {
			await service.writeSettingsFile(settingsUri, { key: 'value' } as any);

			const written = new TextDecoder().decode(mockFileSystemService.writtenFiles.get(settingsUri.toString())!);
			expect(written).toBe(JSON.stringify({ key: 'value' }, null, 4));
		});
	});

	describe('onDidChange', () => {
		it('fires when a watched file changes', () => {
			const changeEmitters: Emitter<URI>[] = [];
			const fsService = new class extends MockFileSystemService {
				override createFileSystemWatcher(): FileSystemWatcher {
					const changeEmitter = new Emitter<URI>();
					changeEmitters.push(changeEmitter);
					return {
						ignoreCreateEvents: false,
						ignoreChangeEvents: false,
						ignoreDeleteEvents: false,
						onDidCreate: Event.None,
						onDidChange: changeEmitter.event,
						onDidDelete: Event.None,
						dispose() { },
					};
				}
			}();

			const svc = disposables.add(new CopilotCLISettingsService(
				mockWorkspaceService,
				fsService,
				new MockEnvService(),
			));

			let fired = false;
			disposables.add(svc.onDidChange(() => { fired = true; }));

			expect(changeEmitters.length).toBeGreaterThan(0);
			changeEmitters[0].fire(settingsUri);
			expect(fired).toBe(true);
		});

		it('invalidates cache when a file changes', async () => {
			const changeEmitters: Emitter<URI>[] = [];
			const fsService = new class extends MockFileSystemService {
				override createFileSystemWatcher(): FileSystemWatcher {
					const changeEmitter = new Emitter<URI>();
					changeEmitters.push(changeEmitter);
					return {
						ignoreCreateEvents: false,
						ignoreChangeEvents: false,
						ignoreDeleteEvents: false,
						onDidCreate: Event.None,
						onDidChange: changeEmitter.event,
						onDidDelete: Event.None,
						dispose() { },
					};
				}
			}();

			const svc = disposables.add(new CopilotCLISettingsService(
				mockWorkspaceService,
				fsService,
				new MockEnvService(),
			));

			fsService.setFile(settingsUri, JSON.stringify({ original: true }));
			const first = await svc.readAllSettings();
			expect(first[0].settings).toEqual({ original: true });

			fsService.setFile(settingsUri, JSON.stringify({ updated: true }));
			changeEmitters[0].fire(settingsUri);

			const second = await svc.readAllSettings();
			expect(second[0].settings).toEqual({ updated: true });
		});
	});
});
