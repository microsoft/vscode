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
import { ClaudeSettingsLocationType } from '../../common/claudeSettingsService';
import { ClaudeSettingsService } from '../claudeSettingsService';
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

describe('ClaudeSettingsService', () => {
	let disposables: DisposableStore;
	let mockWorkspaceService: MockWorkspaceService;
	let mockFileSystemService: MockFileSystemService;
	let service: ClaudeSettingsService;

	const workspaceFolder = URI.file('/workspace');

	beforeEach(() => {
		disposables = new DisposableStore();
		mockWorkspaceService = disposables.add(new MockWorkspaceService());
		mockWorkspaceService.setFolders([workspaceFolder]);
		mockFileSystemService = new MockFileSystemService();
		service = disposables.add(new ClaudeSettingsService(
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
			const uris = service.getUris(ClaudeSettingsLocationType.User);
			expect(uris).toHaveLength(1);
			expect(uris[0].path).toBe('/home/user/.claude/settings.json');
		});

		it('returns workspace settings URI for each folder', () => {
			const uris = service.getUris(ClaudeSettingsLocationType.Workspace);
			expect(uris).toHaveLength(1);
			expect(uris[0].path).toBe('/workspace/.claude/settings.json');
		});

		it('returns workspace local settings URI for each folder', () => {
			const uris = service.getUris(ClaudeSettingsLocationType.WorkspaceLocal);
			expect(uris).toHaveLength(1);
			expect(uris[0].path).toBe('/workspace/.claude/settings.local.json');
		});

		it('returns all URIs when no location specified', () => {
			const uris = service.getUris();
			expect(uris).toHaveLength(3);
		});

		it('returns URIs for multiple workspace folders', () => {
			const folder2 = URI.file('/workspace2');
			mockWorkspaceService.setFolders([workspaceFolder, folder2]);
			// Re-create service to pick up new folders
			service.dispose();
			service = disposables.add(new ClaudeSettingsService(
				mockWorkspaceService,
				mockFileSystemService,
				new MockEnvService(),
			));

			const workspaceUris = service.getUris(ClaudeSettingsLocationType.Workspace);
			expect(workspaceUris).toHaveLength(2);
			expect(workspaceUris[0].path).toBe('/workspace/.claude/settings.json');
			expect(workspaceUris[1].path).toBe('/workspace2/.claude/settings.json');
		});
	});

	describe('readSettingsFile', () => {
		it('returns parsed JSON from a settings file', async () => {
			const uri = URI.file('/home/user/.claude/settings.json');
			mockFileSystemService.setFile(uri, JSON.stringify({ permissions: { allow: ['Read'] } }));

			const result = await service.readSettingsFile(uri);
			expect(result).toEqual({ permissions: { allow: ['Read'] } });
		});

		it('returns empty object when file does not exist', async () => {
			const uri = URI.file('/home/user/.claude/settings.json');
			const result = await service.readSettingsFile(uri);
			expect(result).toEqual({});
		});

		it('returns empty object for invalid JSON', async () => {
			const uri = URI.file('/home/user/.claude/settings.json');
			mockFileSystemService.setFile(uri, 'not valid json');

			const result = await service.readSettingsFile(uri);
			expect(result).toEqual({});
		});

		it('returns empty object for JSON arrays', async () => {
			const uri = URI.file('/home/user/.claude/settings.json');
			mockFileSystemService.setFile(uri, '[1, 2, 3]');

			const result = await service.readSettingsFile(uri);
			expect(result).toEqual({});
		});
	});

	describe('readAllSettings', () => {
		it('reads all settings files and returns them with metadata', async () => {
			const userUri = URI.file('/home/user/.claude/settings.json');
			const wsUri = URI.file('/workspace/.claude/settings.json');
			const wsLocalUri = URI.file('/workspace/.claude/settings.local.json');

			mockFileSystemService.setFile(userUri, JSON.stringify({ permissions: { allow: ['Read'] } }));
			mockFileSystemService.setFile(wsUri, JSON.stringify({ permissions: { deny: ['Write'] } }));
			mockFileSystemService.setFile(wsLocalUri, JSON.stringify({ env: { DEBUG: '1' } }));

			const results = await service.readAllSettings();
			expect(results).toHaveLength(3);
			expect(results[0].settings).toEqual({ env: { DEBUG: '1' } });
			expect(results[1].settings).toEqual({ permissions: { deny: ['Write'] } });
			expect(results[2].settings).toEqual({ permissions: { allow: ['Read'] } });
		});

		it('returns in priority order: workspaceLocal > workspace > user', async () => {
			const userUri = URI.file('/home/user/.claude/settings.json');
			const wsUri = URI.file('/workspace/.claude/settings.json');
			const wsLocalUri = URI.file('/workspace/.claude/settings.local.json');

			mockFileSystemService.setFile(userUri, JSON.stringify({ source: 'user' }));
			mockFileSystemService.setFile(wsUri, JSON.stringify({ source: 'workspace' }));
			mockFileSystemService.setFile(wsLocalUri, JSON.stringify({ source: 'workspaceLocal' }));

			const results = await service.readAllSettings();
			expect(results.map(r => r.type)).toEqual([
				ClaudeSettingsLocationType.WorkspaceLocal,
				ClaudeSettingsLocationType.Workspace,
				ClaudeSettingsLocationType.User,
			]);
		});

		it('returns empty objects for missing files', async () => {
			const results = await service.readAllSettings();
			expect(results).toHaveLength(3);
			for (const result of results) {
				expect(result.settings).toEqual({});
			}
		});

		it('caches results across calls', async () => {
			const userUri = URI.file('/home/user/.claude/settings.json');
			mockFileSystemService.setFile(userUri, JSON.stringify({ cached: true }));

			const first = await service.readAllSettings();
			// Mutate the file — cache should return stale data
			mockFileSystemService.setFile(userUri, JSON.stringify({ cached: false }));
			const second = await service.readAllSettings();

			expect(first).toBe(second);
		});
	});

	describe('getUri', () => {
		it('returns User settings URI regardless of input URI', () => {
			const uri = service.getUri(ClaudeSettingsLocationType.User, workspaceFolder);
			expect(uri.path).toBe('/home/user/.claude/settings.json');
		});

		it('returns Workspace settings URI for single folder', () => {
			const itemUri = URI.file('/workspace/src/file.ts');
			const uri = service.getUri(ClaudeSettingsLocationType.Workspace, itemUri);
			expect(uri.path).toBe('/workspace/.claude/settings.json');
		});

		it('returns WorkspaceLocal settings URI for single folder', () => {
			const itemUri = URI.file('/workspace/src/file.ts');
			const uri = service.getUri(ClaudeSettingsLocationType.WorkspaceLocal, itemUri);
			expect(uri.path).toBe('/workspace/.claude/settings.local.json');
		});
	});

	describe('writeSettingsFile', () => {
		it('writes settings as formatted JSON', async () => {
			const uri = URI.file('/home/user/.claude/settings.json');
			const settings = { permissions: { allow: ['Read', 'Write'] } };

			await service.writeSettingsFile(uri, settings);

			const written = mockFileSystemService.writtenFiles.get(uri.toString());
			expect(written).toBeDefined();
			const parsed = JSON.parse(new TextDecoder().decode(written!));
			expect(parsed).toEqual(settings);
		});

		it('uses 4-space indentation', async () => {
			const uri = URI.file('/home/user/.claude/settings.json');
			await service.writeSettingsFile(uri, { key: 'value' });

			const written = new TextDecoder().decode(mockFileSystemService.writtenFiles.get(uri.toString())!);
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

			const svc = disposables.add(new ClaudeSettingsService(
				mockWorkspaceService,
				fsService,
				new MockEnvService(),
			));

			let fired = false;
			disposables.add(svc.onDidChange(() => { fired = true; }));

			// Fire one of the watcher change events
			changeEmitters[0].fire(URI.file('/some/path'));
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

			const svc = disposables.add(new ClaudeSettingsService(
				mockWorkspaceService,
				fsService,
				new MockEnvService(),
			));

			const userUri = URI.file('/home/user/.claude/settings.json');
			fsService.setFile(userUri, JSON.stringify({ original: true }));
			const first = await svc.readAllSettings();

			// Update file and fire change
			fsService.setFile(userUri, JSON.stringify({ updated: true }));
			changeEmitters[0].fire(userUri);

			const second = await svc.readAllSettings();
			expect(first).not.toBe(second);
			const userSettings = second.find(f => f.uri.toString() === userUri.toString());
			expect(userSettings?.settings).toEqual({ updated: true });
		});
	});
});
