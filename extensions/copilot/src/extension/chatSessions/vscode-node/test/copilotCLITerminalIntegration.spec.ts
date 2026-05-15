/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal, TerminalOptions } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { ILogService } from '../../../../platform/log/common/logService';
import { NoopOTelService, resolveOTelConfig } from '../../../../platform/otel/common/index';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { ITerminalService, NullTerminalService } from '../../../../platform/terminal/common/terminalService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';

// The .ps1 asset cannot be parsed by Vite's transform pipeline,
// so we need to tell Vite to treat .ps1 files as raw text via a mock
vi.mock('../copilotCLIShim.ps1', () => ({ default: '# mock powershell script' }));

// Mock fs operations to avoid real filesystem access during tests
const { mockMkdir, mockWriteFile, mockCopyFile, mockChmod, mockStat } = vi.hoisted(() => ({
	mockMkdir: vi.fn(async () => { }),
	mockWriteFile: vi.fn(async () => { }),
	mockCopyFile: vi.fn(async () => { }),
	mockChmod: vi.fn(async () => { }),
	mockStat: vi.fn(async () => ({ isFile: () => true })),
}));

vi.mock('fs', () => ({
	promises: {
		mkdir: mockMkdir,
		writeFile: mockWriteFile,
		copyFile: mockCopyFile,
		chmod: mockChmod,
		stat: mockStat,
	}
}));

// Mock Python terminal service to avoid extension dependency
vi.mock('../copilotCLIPythonTerminalService', () => ({
	PythonTerminalService: class {
		createTerminal = vi.fn(async () => undefined);
	}
}));

// Mock terminal link provider to avoid pulling in unrelated notebook/proposed API dependencies
vi.mock('../copilotCLITerminalLinkProvider', () => ({
	CopilotCLITerminalLinkProvider: class {
		registerTerminal = vi.fn();
		setSessionDir = vi.fn();
		setSessionDirResolver = vi.fn();
	},
}));

vi.mock('../../../../platform/workspace/common/workspaceService', () => ({
	IWorkspaceService: (() => {
		const identifier = () => { };
		return identifier;
	})(),
}));

import type { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { PythonTerminalService } from '../copilotCLIPythonTerminalService';
import { CopilotCLITerminalIntegration } from '../copilotCLITerminalIntegration';

interface MockTerminal extends Pick<Terminal, 'show' | 'sendText' | 'dispose'> {
	show: ReturnType<typeof vi.fn>;
	sendText: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
	shellIntegration: undefined;
}

class TestTerminalService extends NullTerminalService {
	public mockTerminal: MockTerminal;
	public createTerminalSpy: ReturnType<typeof vi.fn>;
	public contributePathSpy: ReturnType<typeof vi.fn>;

	constructor() {
		super();
		this.mockTerminal = {
			show: vi.fn(),
			sendText: vi.fn(),
			dispose: vi.fn(),
			shellIntegration: undefined,
		};
		this.createTerminalSpy = vi.fn().mockReturnValue(this.mockTerminal);
		this.contributePathSpy = vi.fn();
	}

	override createTerminal(): Terminal {
		return this.createTerminalSpy(...arguments) as Terminal;
	}

	override contributePath(contributor: unknown, pathLocation: unknown, description?: unknown, prepend?: unknown): void {
		this.contributePathSpy(contributor, pathLocation, description, prepend);
	}
}

class TestEnvService {
	declare readonly _serviceBrand: undefined;
	shell = 'zsh';
	userHome = { fsPath: '/Users/testuser' };
	OS = 2; // OperatingSystem.Macintosh
	appRoot = '';
	language = 'en';
	uiKind = 1;
	clipboard = { readText: async () => '', writeText: async () => { } };
	getAppSpecificStorageUri() { return undefined; }
	getEditorInfo() { return { name: 'test-editor', version: '1.0' }; }
}

class TestExtensionContext {
	declare readonly _serviceBrand: undefined;
	globalStorageUri = { fsPath: '/tmp/test-global-storage' };
	extension = { id: 'GitHub.copilot-chat' };
	extensionUri = { fsPath: '/tmp/extensions/copilot-chat' };
	extensionMode = 3; // ExtensionMode.Test
}

class TestTelemetryService extends NullTelemetryService {
	public readonly events: Array<{ name: string; properties: Record<string, string> }> = [];
	override sendMSFTTelemetryEvent(name: string, properties: Record<string, string>): void {
		this.events.push({ name, properties });
	}
}

const { mockWorkspaceGetConfiguration, mockRegisterTerminalProfileProvider, mockRegisterTerminalLinkProvider } = vi.hoisted(() => ({
	mockWorkspaceGetConfiguration: vi.fn(),
	mockRegisterTerminalProfileProvider: vi.fn(() => ({ dispose: () => { } })),
	mockRegisterTerminalLinkProvider: vi.fn(() => ({ dispose: () => { } })),
}));

vi.mock('vscode', async (importOriginal) => {
	const actual = await importOriginal() as Record<string, unknown>;
	return {
		...actual,
		workspace: {
			getConfiguration: mockWorkspaceGetConfiguration,
		},
		window: {
			registerTerminalProfileProvider: mockRegisterTerminalProfileProvider,
			registerTerminalLinkProvider: mockRegisterTerminalLinkProvider,
		},
		TerminalLocation: { Panel: 1, Editor: 2 },
		ViewColumn: { Active: -1, Beside: -2 },
		ThemeIcon: class ThemeIcon {
			constructor(public readonly id: string) { }
		},
		TerminalProfile: class TerminalProfile {
			constructor(public readonly options: TerminalOptions) { }
		},
		Range: class Range {
			constructor(public startLine: number, public startCharacter: number, public endLine: number, public endCharacter: number) { }
		},
		Uri: {
			joinPath: (base: { fsPath: string; scheme: string }, ...segments: string[]) => ({ fsPath: [base.fsPath, ...segments].join('/'), scheme: base.scheme }),
			file: (path: string) => ({ fsPath: path, scheme: 'file' }),
		},
	};
});

function setupTerminalConfig(defaultProfile: string | undefined, profiles: Record<string, { path: string | string[]; args?: string[] }> | undefined) {
	mockWorkspaceGetConfiguration.mockImplementation((section: string) => ({
		get: (key: string) => {
			if (key.startsWith('integrated.defaultProfile.')) {
				return defaultProfile;
			}
			if (key.startsWith('integrated.profiles.')) {
				return profiles;
			}
			return undefined;
		}
	}));
}

describe('CopilotCLITerminalIntegration', () => {
	const disposables = new DisposableStore();
	let terminalService: TestTerminalService;
	let telemetryService: TestTelemetryService;
	let envService: TestEnvService;
	let integration: CopilotCLITerminalIntegration;
	let authService: MockAuthenticationService;

	beforeEach(async () => {
		vi.clearAllMocks();

		terminalService = disposables.add(new TestTerminalService());
		telemetryService = new TestTelemetryService();
		envService = new TestEnvService();
		authService = new MockAuthenticationService();

		setupTerminalConfig('zsh', {
			zsh: { path: 'zsh' },
		});

		integration = new CopilotCLITerminalIntegration(
			new TestExtensionContext() as unknown as IVSCodeExtensionContext,
			authService as unknown as IAuthenticationService,
			terminalService as unknown as ITerminalService,
			envService as unknown as IEnvService,
			{ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), createSubLogger: () => ({}) } as unknown as ILogService,
			telemetryService as unknown as ITelemetryService,
			{ getConfig: () => true } as unknown as IConfigurationService,

			{ requestResourceTrust: vi.fn().mockResolvedValue(true) } as unknown as IWorkspaceService,

			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })),
		);
		disposables.add(integration);

		// Wait for initialization to complete
		await (integration as any).initialization;
	});

	afterEach(() => {
		disposables.clear();
	});

	describe('openTerminal', () => {
		it('should create a terminal via terminalService when no python terminal available', async () => {
			await integration.openTerminal('Test Terminal');

			// Since pythonTerminalService.createTerminal returns undefined by default,
			// and getShellInfo returns shell info for zsh, it falls through to the
			// shell args terminal creation path
			expect(terminalService.createTerminalSpy).toHaveBeenCalled();
		});

		it('should set sessionType to "new" when no cliArgs provided', async () => {
			await integration.openTerminal('Test Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.sessionType).toBe('new');
		});

		it('should set sessionType to "resume" when cliArgs has --resume', async () => {
			await integration.openTerminal('Test Terminal', ['--resume', 'session-123']);

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.sessionType).toBe('resume');
		});

		it('should send telemetry with shell type', async () => {
			await integration.openTerminal('Test Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.shell).toBe('zsh');
		});

		it('should pass cwd to terminal options', async () => {
			await integration.openTerminal('Test Terminal', [], '/my/working/dir');

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.cwd).toBe('/my/working/dir');
		});

		it('should show the terminal after creation in shellArgs path', async () => {
			await integration.openTerminal('Test Terminal');

			expect(terminalService.mockTerminal.show).toHaveBeenCalled();
		});

		it('should fall back to terminalService when getShellInfo returns undefined', async () => {
			// Setup config to return no matching profile
			setupTerminalConfig(undefined, undefined);

			// Re-create the integration to pick up the new config
			envService.shell = '/bin/unknownshell';
			const freshIntegration = new CopilotCLITerminalIntegration(
				new TestExtensionContext() as unknown as IVSCodeExtensionContext,
				authService as unknown as IAuthenticationService,
				terminalService as unknown as ITerminalService,
				envService as unknown as IEnvService,
				{ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), createSubLogger: () => ({}) } as unknown as ILogService,
				telemetryService as unknown as ITelemetryService,
				{ getConfig: () => true } as unknown as IConfigurationService,

				{ requestResourceTrust: vi.fn().mockResolvedValue(true) } as unknown as IWorkspaceService,

				new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })),
			);
			disposables.add(freshIntegration);
			await (freshIntegration as any).initialization;

			await freshIntegration.openTerminal('Fallback Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.shell).toBe('unknown');
			expect(event!.properties.terminalCreationMethod).toBe('fallbackTerminal');
		});

		it('should use pythonTerminal method when python terminal is available and shell is not powershell', async () => {
			const mockPythonTerminal: MockTerminal = {
				show: vi.fn(),
				sendText: vi.fn(),
				dispose: vi.fn(),
				shellIntegration: undefined,
			};

			// Access the internal pythonTerminalService and mock createTerminal to return a terminal
			const pythonService = (integration as any).pythonTerminalService as PythonTerminalService;
			(pythonService.createTerminal as ReturnType<typeof vi.fn>).mockResolvedValue(mockPythonTerminal);

			await integration.openTerminal('Python Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.terminalCreationMethod).toBe('pythonTerminal');
			expect(event!.properties.shell).toBe('zsh');
		});

		it('should use shellArgsTerminal method when python terminal is not available', async () => {
			await integration.openTerminal('Shell Args Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.terminalCreationMethod).toBe('shellArgsTerminal');
		});

		it('should prepend --clear to cliArgs', async () => {
			await integration.openTerminal('Test Terminal', ['--resume', 'sess-1']);

			// For shellArgs terminal path, --clear gets removed before getShellInfo,
			// but the final shell args should contain the original CLI args
			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			const shellArgs = callArgs.shellArgs as string[];
			// Shell args should contain the cli args (--resume, sess-1) but not --clear
			const joinedArgs = shellArgs.join(' ');
			expect(joinedArgs).toContain('--resume');
			expect(joinedArgs).toContain('sess-1');
		});

		it('should use editor location by default', async () => {
			await integration.openTerminal('Test Terminal');

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			// Default location is 'editor' which maps to ViewColumn.Active
			expect(callArgs.location).toEqual({ viewColumn: -1 }); // ViewColumn.Active
		});

		it('should set bash shell info when default profile is bash', async () => {
			setupTerminalConfig('bash', {
				bash: { path: 'bash' },
			});
			envService.shell = 'bash';

			const freshIntegration = new CopilotCLITerminalIntegration(
				new TestExtensionContext() as unknown as IVSCodeExtensionContext,
				authService as unknown as IAuthenticationService,
				terminalService as unknown as ITerminalService,
				envService as unknown as IEnvService,
				{ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), createSubLogger: () => ({}) } as unknown as ILogService,
				telemetryService as unknown as ITelemetryService,

				{ getConfig: () => true } as unknown as IConfigurationService,
				{ requestResourceTrust: vi.fn().mockResolvedValue(true) } as unknown as IWorkspaceService,
				new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })),
			);
			disposables.add(freshIntegration);
			await (freshIntegration as any).initialization;

			await freshIntegration.openTerminal('Bash Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.shell).toBe('bash');
		});
	});

	describe('initialize', () => {
		it('should contribute path to terminal service', async () => {
			expect(terminalService.contributePathSpy).toHaveBeenCalledWith(
				'copilot-cli',
				expect.stringContaining('copilotCli'),
				expect.objectContaining({ command: 'copilot' }),
				true,
			);
		});

		it('should register a terminal profile provider', async () => {
			expect(mockRegisterTerminalProfileProvider).toHaveBeenCalledWith(
				'copilot-cli',
				expect.objectContaining({ provideTerminalProfile: expect.any(Function) }),
			);
		});
	});

	describe('telemetry', () => {
		it('should include location in telemetry', async () => {
			await integration.openTerminal('Test', [], undefined, 'panel');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.location).toBe('panel');
		});

		it('should report editorBeside location', async () => {
			await integration.openTerminal('Test', [], undefined, 'editorBeside');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event!.properties.location).toBe('editorBeside');
		});
	});

	describe('getCommonTerminalOptions (via openTerminal)', () => {
		it('should set terminal name from parameter', async () => {
			await integration.openTerminal('My Custom Name');

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.name).toBe('My Custom Name');
		});

		it('should not include auth env vars when no session available', async () => {
			await integration.openTerminal('No Auth Terminal');

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.env).toBeUndefined();
		});

		it('should include auth env vars when session is available', async () => {
			const authServiceWithSession = new class extends MockAuthenticationService {
				override async getGitHubSession() {
					return { accessToken: 'test-token-123' } as any;
				}
			}();

			const freshIntegration = new CopilotCLITerminalIntegration(
				new TestExtensionContext() as unknown as IVSCodeExtensionContext,
				authServiceWithSession as unknown as IAuthenticationService,
				terminalService as unknown as ITerminalService,
				envService as unknown as IEnvService,
				{ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), createSubLogger: () => ({}) } as unknown as ILogService,
				telemetryService as unknown as ITelemetryService,

				{ getConfig: () => true } as unknown as IConfigurationService,
				{ requestResourceTrust: vi.fn().mockResolvedValue(true) } as unknown as IWorkspaceService,
				new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })),
			);
			disposables.add(freshIntegration);
			await (freshIntegration as any).initialization;

			await freshIntegration.openTerminal('Auth Terminal');

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.env).toEqual({
				GH_TOKEN: 'test-token-123',
				COPILOT_GITHUB_TOKEN: 'test-token-123',
			});
		});
	});
});
