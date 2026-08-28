/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { extUri, extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationUpdateOptions, IConfigurationUpdateOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundConfiguredContext, SessionsChatBackgroundImageConfiguredContext } from '../../../../common/contextkeys.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, chatBackgroundImageLayoutValues, ChatBackgroundImageLayout, ISessionsChatImageBackground, SessionsChatBackgroundService } from '../../browser/chatBackgroundService.js';

class CapturingConfigurationService extends TestConfigurationService {
	readonly updates: { key: string; value: unknown; resource: URI | undefined; target: ConfigurationTarget | undefined }[] = [];
	readonly workspaceFolderValues = new Map<string, unknown>();
	updateError: Error | undefined;

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		return {
			...super.inspect<T>(key, overrides),
			workspaceFolderValue: this.workspaceFolderValues.get(key) as T | undefined,
		};
	}

	override updateValue(key: string, value: unknown): Promise<void>;
	override updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	override updateValue(key: string, value: unknown, arg3?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides, target?: ConfigurationTarget): Promise<void> {
		this.updates.push({
			key,
			value,
			resource: typeof arg3 === 'number' ? undefined : arg3?.resource ?? undefined,
			target: typeof arg3 === 'number' ? arg3 : target,
		});
		return this.updateError ? Promise.reject(this.updateError) : Promise.resolve();
	}
}

function createWorkspaceContextService(folder?: URI): IWorkspaceContextService {
	return upcastPartial<IWorkspaceContextService>({
		onDidChangeWorkspaceFolders: Event.None,
		getWorkspace: () => upcastPartial<IWorkspace>({
			folders: folder ? [upcastPartial<IWorkspaceFolder>({ uri: folder })] : [],
		}),
	});
}

function createUriIdentityService(caseSensitive = false): IUriIdentityService {
	return upcastPartial<IUriIdentityService>({
		extUri: caseSensitive ? extUri : extUriBiasedIgnorePathCase,
	});
}

function createFileService(content?: string): IFileService {
	return upcastPartial<IFileService>({
		readFile: async resource => upcastPartial<IFileContent>({
			resource,
			name: resource.path,
			value: VSBuffer.fromString(content ?? ''),
		}),
	});
}

function createWorkspaceTrustManagementService(trusted = true): IWorkspaceTrustManagementService {
	return upcastPartial<IWorkspaceTrustManagementService>({
		onDidChangeTrust: Event.None,
		isWorkspaceTrusted: () => trusted,
	});
}

function createMutableWorkspaceContextService(initialFolder: URI): {
	readonly service: IWorkspaceContextService;
	readonly onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent>;
	setFolder(folder: URI): void;
} {
	let currentFolder = initialFolder;
	const onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
	return {
		service: upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			getWorkspace: () => upcastPartial<IWorkspace>({
				folders: [upcastPartial<IWorkspaceFolder>({ uri: currentFolder })],
			}),
		}),
		onDidChangeWorkspaceFolders,
		setFolder(folder: URI): void {
			currentFolder = folder;
			onDidChangeWorkspaceFolders.fire(upcastPartial({
				added: [],
				removed: [],
				changed: [],
			}));
		},
	};
}

function fireConfigurationChange(configurationService: TestConfigurationService, setting: string): void {
	configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
		affectsConfiguration: key => key === setting,
	}));
}

suite('Sessions Chat Background Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not return a background without a configured image', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new SessionsChatBackgroundService(new TestConfigurationService(), new TestThemeService(), contextKeyService, disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));

		assert.deepStrictEqual({
			background: service.getBackground(),
			image: service.getConfiguredBackgroundImage(),
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		}, {
			background: undefined,
			image: undefined,
			backgroundConfigured: false,
			imageConfigured: false,
		});
	});

	test('resolves the background for the active color theme and emits changes', async () => {
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/dark.png').fsPath,
			[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/light.png').fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'center',
		});
		const themeService = new TestThemeService();
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, themeService, contextKeyService, disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));
		let changes = 0;
		disposables.add(service.onDidChangeBackground(() => changes++));

		const darkBackground = service.getBackground();
		const dark = {
			kind: darkBackground?.kind,
			image: service.getConfiguredBackgroundImage()?.path.endsWith('dark.png'),
			cssImage: darkBackground?.kind === 'image' && !!darkBackground.backgroundImage,
			repeat: darkBackground?.kind === 'image' ? darkBackground.backgroundRepeat : undefined,
			size: darkBackground?.kind === 'image' ? darkBackground.backgroundSize : undefined,
			position: darkBackground?.kind === 'image' ? darkBackground.backgroundPosition : undefined,
			available: contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key),
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		};
		themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		const lightBackground = service.getBackground();
		const light = {
			kind: lightBackground?.kind,
			image: service.getConfiguredBackgroundImage()?.path.endsWith('light.png'),
			cssImage: lightBackground?.kind === 'image' && !!lightBackground.backgroundImage,
			repeat: lightBackground?.kind === 'image' ? lightBackground.backgroundRepeat : undefined,
			size: lightBackground?.kind === 'image' ? lightBackground.backgroundSize : undefined,
			position: lightBackground?.kind === 'image' ? lightBackground.backgroundPosition : undefined,
			available: contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key),
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		};
		themeService.setTheme(new TestColorTheme({}, ColorScheme.HIGH_CONTRAST_DARK));
		const highContrast = {
			background: service.getBackground(),
			available: contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key),
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		};
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK));
		const restoredAvailability = contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, 'https://example.com/texture.png');
		fireConfigurationChange(configurationService, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING);

		assert.deepStrictEqual({
			dark,
			light,
			highContrast,
			unsupportedUri: service.getBackground(),
			unsupportedBackgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			unsupportedImageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
			restoredAvailability,
			changes,
		}, {
			dark: { kind: 'image', image: true, cssImage: true, repeat: 'no-repeat', size: 'auto', position: 'center center', available: true, backgroundConfigured: true, imageConfigured: true },
			light: { kind: 'image', image: true, cssImage: true, repeat: 'no-repeat', size: 'auto', position: 'center center', available: true, backgroundConfigured: true, imageConfigured: true },
			highContrast: { background: undefined, available: false, backgroundConfigured: true, imageConfigured: true },
			unsupportedUri: undefined,
			unsupportedBackgroundConfigured: false,
			unsupportedImageConfigured: false,
			restoredAvailability: true,
			changes: 4,
		});
	});

	test('resolves workspace-relative images and layouts over user values', async () => {
		const workspace = URI.file('/workspace');
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/user.png').fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'repeat',
		});
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '.vscode/chat-background.png', workspace);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, 'bottom-right', workspace);
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		const background = service.getBackground();
		assert.deepStrictEqual({
			image: service.getConfiguredBackgroundImage()?.toString(),
			position: background?.kind === 'image' ? background.backgroundPosition : undefined,
		}, {
			image: URI.file('/workspace/.vscode/chat-background.png').toString(),
			position: 'right bottom',
		});
	});

	test('ignores workspace background settings when the workspace is untrusted', async () => {
		const workspace = URI.file('/workspace');
		const userImage = URI.file('/textures/user.png');
		const selectedImage = URI.file('/textures/selected.png');
		const configurationService = new CapturingConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: userImage.fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'repeat',
		});
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '.vscode/workspace.png', workspace);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, 'bottom-right', workspace);
		configurationService.workspaceFolderValues.set(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '.vscode/workspace.png');
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService(false)
		));
		const background = service.getBackground();
		await service.setBackground(selectedImage);

		assert.deepStrictEqual({
			image: service.getConfiguredBackgroundImage()?.toString(),
			position: background?.kind === 'image' ? background.backgroundPosition : undefined,
			update: configurationService.updates[0],
		}, {
			image: userImage.toString(),
			position: 'left top',
			update: {
				key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
				value: selectedImage.fsPath,
				resource: workspace,
				target: ConfigurationTarget.USER,
			},
		});
	});

	test('rejects relative background images that escape the workspace', async () => {
		const workspace = URI.file('/workspace');
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '../outside.png', workspace);
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			contextKeyService,
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		assert.deepStrictEqual({
			background: service.getBackground(),
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		}, {
			background: undefined,
			backgroundConfigured: false,
			imageConfigured: false,
		});
	});

	test('rejects encoded relative background paths that escape the workspace', async () => {
		const workspace = URI.file('/workspace');
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '%2e%2e/outside.png', workspace);
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		assert.strictEqual(service.getBackground(), undefined);
	});

	test('resolves relative images in remote workspaces', async () => {
		const workspace = URI.parse('vscode-remote://ssh-remote+example/home/project');
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, 'images/background.png', workspace);
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(true),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		assert.strictEqual(
			service.getConfiguredBackgroundImage()?.toString(),
			'vscode-remote://ssh-remote%2Bexample/home/project/images/background.png'
		);
	});

	test('respects case-sensitive remote workspace boundaries', async () => {
		const workspace = URI.parse('vscode-remote://ssh-remote+example/home/project');
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '../Project/outside.png', workspace);
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(true),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		assert.strictEqual(service.getBackground(), undefined);
	});

	test('loads relative images from Agent Host workspaces', async () => {
		const workspace = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'remote', path: '/workspace' });
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, 'images/background.svg', workspace);
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(true),
			createFileService('<svg xmlns="http://www.w3.org/2000/svg"/>'),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));
		const loaded = Event.toPromise(service.onDidChangeBackground);
		const initialBackground = service.getBackground();
		await loaded;
		const loadedBackground = service.getBackground();

		assert.deepStrictEqual({
			initialImage: initialBackground?.kind === 'image' ? initialBackground.backgroundImage : undefined,
			loadedImageUsesBlob: loadedBackground?.kind === 'image' && loadedBackground.backgroundImage.includes('blob'),
		}, {
			initialImage: 'url(\'\')',
			loadedImageUsesBlob: true,
		});
	});

	test('retries an Agent Host image after it is cleared and reselected', async () => {
		const workspace = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'remote', path: '/workspace' });
		const settingValue = 'images/background.svg';
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, settingValue, workspace);
		let readAttempts = 0;
		const fileService = upcastPartial<IFileService>({
			readFile: async resource => {
				readAttempts++;
				if (readAttempts === 1) {
					throw new Error('Initial read failed');
				}
				return upcastPartial<IFileContent>({
					resource,
					name: resource.path,
					value: VSBuffer.fromString('<svg xmlns="http://www.w3.org/2000/svg"/>'),
				});
			},
		});
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(true),
			fileService,
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		service.getBackground();
		await Promise.resolve();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, undefined, workspace);
		fireConfigurationChange(configurationService, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, settingValue, workspace);
		fireConfigurationChange(configurationService, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING);
		const loaded = Event.toPromise(service.onDidChangeBackground);
		service.getBackground();
		await loaded;
		const background = service.getBackground();

		assert.deepStrictEqual({
			readAttempts,
			backgroundUsesBlob: background?.kind === 'image' && background.backgroundImage.includes('blob'),
		}, {
			readAttempts: 2,
			backgroundUsesBlob: true,
		});
	});

	test('updates relative backgrounds when the active workspace changes', async () => {
		const workspaceA = URI.file('/workspace-a');
		const workspaceB = URI.file('/workspace-b');
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, 'images/a.png', workspaceA);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, 'images/b.png', workspaceB);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, 'center', workspaceA);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, 'top-right', workspaceB);
		const workspaceContext = createMutableWorkspaceContextService(workspaceA);
		disposables.add(workspaceContext.onDidChangeWorkspaceFolders);
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			contextKeyService,
			disposables.add(new InMemoryStorageService()),
			workspaceContext.service,
			createUriIdentityService(),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));
		const backgroundA = service.getBackground();
		const imageA = service.getConfiguredBackgroundImage();
		workspaceContext.setFolder(workspaceB);
		const backgroundB = service.getBackground();
		const imageB = service.getConfiguredBackgroundImage();

		assert.deepStrictEqual({
			first: {
				image: imageA?.toString(),
				position: backgroundA?.kind === 'image' ? backgroundA.backgroundPosition : undefined,
			},
			second: {
				image: imageB?.toString(),
				position: backgroundB?.kind === 'image' ? backgroundB.backgroundPosition : undefined,
			},
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		}, {
			first: {
				image: URI.file('/workspace-a/images/a.png').toString(),
				position: 'center center',
			},
			second: {
				image: URI.file('/workspace-b/images/b.png').toString(),
				position: 'right top',
			},
			backgroundConfigured: true,
			imageConfigured: true,
		});
	});

	test('returns the codicons preset without resolving an image', () => {
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET,
		});
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, new TestThemeService(), contextKeyService, disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));

		assert.deepStrictEqual({
			background: service.getBackground(),
			image: service.getConfiguredBackgroundImage(),
			backgroundConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundConfiguredContext.key),
			imageConfigured: contextKeyService.getContextKeyValue(SessionsChatBackgroundImageConfiguredContext.key),
		}, {
			background: { kind: 'codicons' },
			image: undefined,
			backgroundConfigured: true,
			imageConfigured: false,
		});
	});

	test('returns every configured image layout', async () => {
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/kirby.png').fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'repeat',
		});
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, new TestThemeService(), disposables.add(new MockContextKeyService()), disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));
		const actual: Partial<Record<ChatBackgroundImageLayout, Omit<ISessionsChatImageBackground, 'kind' | 'backgroundImage'> | undefined>> = {};

		for (const layout of chatBackgroundImageLayoutValues) {
			await configurationService.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, layout);
			fireConfigurationChange(configurationService, AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING);
			const background = service.getBackground();
			if (background?.kind === 'image') {
				actual[layout] = {
					backgroundRepeat: background.backgroundRepeat,
					backgroundSize: background.backgroundSize,
					backgroundPosition: background.backgroundPosition,
				};
			}
		}

		assert.deepStrictEqual(actual, {
			repeat: { backgroundRepeat: 'repeat', backgroundSize: 'auto', backgroundPosition: 'left top' },
			stretch: { backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'center center' },
			center: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center center' },
			top: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center top' },
			'top-right': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right top' },
			'top-left': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left top' },
			bottom: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center bottom' },
			'bottom-right': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right bottom' },
			'bottom-left': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left bottom' },
			left: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left center' },
			right: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right center' },
		});
	});

	test('updates the image layout without persisting until the final value is committed', async () => {
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/kirby.png').fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'center',
		});
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, new TestThemeService(), disposables.add(new MockContextKeyService()), disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));
		let changes = 0;
		disposables.add(service.onDidChangeBackground(() => changes++));
		const getPosition = () => {
			const background = service.getBackground();
			return background?.kind === 'image' ? background.backgroundPosition : undefined;
		};

		const configuredPosition = getPosition();
		await service.setBackgroundImageLayout('bottom-right', false);
		const previewPosition = getPosition();
		const persistedDuringPreview = configurationService.getValue(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING);
		await service.setBackgroundImageLayout('center', true);

		assert.deepStrictEqual({
			configuredPosition,
			previewPosition,
			persistedDuringPreview,
			restoredPosition: getPosition(),
			persistedLayout: configurationService.getValue(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING),
			changes,
		}, {
			configuredPosition: 'center center',
			previewPosition: 'right bottom',
			persistedDuringPreview: 'center',
			restoredPosition: 'center center',
			persistedLayout: 'center',
			changes: 2,
		});
	});

	test('restores the configured image layout when persistence fails', async () => {
		const configurationService = new CapturingConfigurationService();
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, new TestThemeService(), disposables.add(new MockContextKeyService()), disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));
		let changes = 0;
		disposables.add(service.onDidChangeBackground(() => changes++));
		await service.setBackgroundImageLayout('bottom-right', false);
		configurationService.updateError = new Error('Unable to save layout');

		await assert.rejects(service.setBackgroundImageLayout('bottom-right', true), /Unable to save layout/);

		assert.deepStrictEqual({
			layout: service.getBackgroundImageLayout(),
			changes,
		}, {
			layout: 'repeat',
			changes: 2,
		});
	});

	test('keeps the five most recently selected background images', async () => {
		const initialImage = URI.file('/textures/initial.png');
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: initialImage.toString(),
		});
		const storageService = disposables.add(new InMemoryStorageService());
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, new TestThemeService(), disposables.add(new MockContextKeyService()), storageService, createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));
		const selectedImages = Array.from({ length: 6 }, (_, index) => URI.file(`/textures/recent-${index + 1}.png`));
		const initialRecents = service.getRecentBackgroundImages();
		for (const image of selectedImages) {
			await service.setBackground(image);
		}
		await service.setBackground(selectedImages[2]);
		const restoredService = disposables.add(new SessionsChatBackgroundService(new TestConfigurationService(), new TestThemeService(), disposables.add(new MockContextKeyService()), storageService, createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));

		assert.deepStrictEqual({
			initialRecents: initialRecents.map(image => image.path),
			persistedRecents: restoredService.getRecentBackgroundImages().map(image => image.path),
		}, {
			initialRecents: ['/textures/initial.png'],
			persistedRecents: [
				'/textures/recent-3.png',
				'/textures/recent-6.png',
				'/textures/recent-5.png',
				'/textures/recent-4.png',
				'/textures/recent-2.png',
			],
		});
	});

	test('updates and clears the most specific workspace background settings', async () => {
		const workspace = URI.file('/workspace');
		const image = URI.file('/workspace/images/background.png');
		const outsideImage = URI.file('/outside/background.png');
		const configurationService = new CapturingConfigurationService();
		configurationService.workspaceFolderValues.set(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '.vscode/old.png');
		configurationService.workspaceFolderValues.set(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, 'center');
		const service = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			new TestThemeService(),
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
			createWorkspaceContextService(workspace),
			createUriIdentityService(),
			createFileService(),
			disposables.add(new NullLogService()),
			createWorkspaceTrustManagementService()
		));

		await service.setBackground(image);
		await service.setBackground(outsideImage);
		await service.setBackgroundImageLayout('bottom-right');
		await service.clearBackground();

		assert.deepStrictEqual(configurationService.updates, [{
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: 'images/background.png',
			resource: workspace,
			target: ConfigurationTarget.WORKSPACE_FOLDER,
		}, {
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: outsideImage.fsPath,
			resource: workspace,
			target: ConfigurationTarget.WORKSPACE_FOLDER,
		}, {
			key: AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING,
			value: 'bottom-right',
			resource: workspace,
			target: ConfigurationTarget.WORKSPACE_FOLDER,
		}, {
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: undefined,
			resource: workspace,
			target: ConfigurationTarget.WORKSPACE_FOLDER,
		}]);
	});

	test('updates the background for the active color theme and the shared layout', async () => {
		const image = URI.file('/textures/kirby.png');
		const configurationService = new CapturingConfigurationService();
		const themeService = new TestThemeService();
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, themeService, disposables.add(new MockContextKeyService()), disposables.add(new InMemoryStorageService()), createWorkspaceContextService(), createUriIdentityService(), createFileService(), disposables.add(new NullLogService()), createWorkspaceTrustManagementService()));

		await service.setBackground(image);
		await service.setBackground(AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET);
		await service.clearBackground();
		themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		await service.setBackground(image);
		await service.setBackgroundImageLayout('bottom-right');

		assert.deepStrictEqual(configurationService.updates, [{
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: image.fsPath,
			resource: undefined,
			target: ConfigurationTarget.USER,
		}, {
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET,
			resource: undefined,
			target: ConfigurationTarget.USER,
		}, {
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: undefined,
			resource: undefined,
			target: ConfigurationTarget.USER,
		}, {
			key: AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING,
			value: image.fsPath,
			resource: undefined,
			target: ConfigurationTarget.USER,
		}, {
			key: AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING,
			value: 'bottom-right',
			resource: undefined,
			target: ConfigurationTarget.USER,
		}]);
	});
});
