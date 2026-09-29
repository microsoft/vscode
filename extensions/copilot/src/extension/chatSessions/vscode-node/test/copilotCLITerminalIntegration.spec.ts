/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
import { Emitter } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import * as path from '../../../../util/vs/base/common/path';

// Mock fs operations to avoid real filesystem access during tests
const { mockRm, mockStat } = vi.hoisted(() => ({
	mockRm: vi.fn(async () => { }),
	mockStat: vi.fn(async () => ({ isFile: () => true })),
}));

vi.mock('fs', () => ({
	promises: {
		rm: mockRm,
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
import { CopilotCLITerminalIntegration, getNativeCopilotShimPath } from '../copilotCLITerminalIntegration';

const expectedShimPath = getNativeCopilotShimPath(process.platform, process.execPath, '');

/**
 * Mirrors how the integration quotes a command for POSIX shells.
 */
function escapeForPosixShell(value: string): string {
	return /[\s"'$`\\|&;()<>]/.test(value) ? `"${value.replace(/["\\]/g, '\\$&')}"` : value;
}

interface MockTerminal extends Pick<Terminal, 'show' | 'sendText' | 'dispose'> {
	show: Mock;
	sendText: Mock;
	dispose: Mock;
	shellIntegration: undefined;
}

class TestTerminalService extends NullTerminalService {
	public mockTerminal: MockTerminal;
	public createTerminalSpy: Mock;
	public contributePathSpy: Mock;
	public removePathContributionSpy: Mock;

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
		this.removePathContributionSpy = vi.fn();
	}

	override createTerminal(): Terminal {
		return this.createTerminalSpy(...arguments) as Terminal;
	}

	override contributePath(contributor: unknown, pathLocation: unknown, description?: unknown, prepend?: unknown): void {
		this.contributePathSpy(contributor, pathLocation, description, prepend);
	}

	override removePathContribution(contributor: string): void {
		this.removePathContributionSpy(contributor);
	}
}

/**
 * Provides `chat.copilotCliCommand.enabled`, which is unset unless a test sets it.
 */
class TestConfigurationService {
	private readonly changeEmitter = new Emitter<{ affectsConfiguration(section: string): boolean }>();
	readonly onDidChangeConfiguration = this.changeEmitter.event;
	private commandEnabled: boolean | undefined;

	getConfig() {
		return true;
	}

	getNonExtensionConfig<T>(key: string): T | undefined {
		return (key === 'chat.copilotCliCommand.enabled' ? this.commandEnabled : undefined) as T | undefined;
	}

	setCommandEnabled(value: boolean | undefined): void {
		this.commandEnabled = value;
		this.changeEmitter.fire({ affectsConfiguration: section => section === 'chat.copilotCliCommand.enabled' });
	}

	dispose(): void {
		this.changeEmitter.dispose();
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
	let configurationService: TestConfigurationService;
	let integration: CopilotCLITerminalIntegration;
	let authService: MockAuthenticationService;

	async function createIntegration(): Promise<CopilotCLITerminalIntegration> {
		const result = new CopilotCLITerminalIntegration(
			new TestExtensionContext() as unknown as IVSCodeExtensionContext,
			authService as unknown as IAuthenticationService,
			terminalService as unknown as ITerminalService,
			envService as unknown as IEnvService,
			{ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), createSubLogger: () => ({}) } as unknown as ILogService,
			telemetryService as unknown as ITelemetryService,
			configurationService as unknown as IConfigurationService,
			{ requestResourceTrust: vi.fn().mockResolvedValue(true) } as unknown as IWorkspaceService,
			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })),
		);
		disposables.add(result);
		await (result as any).initialization;
		return result;
	}

	beforeEach(async () => {
		vi.clearAllMocks();

		terminalService = disposables.add(new TestTerminalService());
		telemetryService = new TestTelemetryService();
		envService = new TestEnvService();
		configurationService = disposables.add(new TestConfigurationService());
		authService = new MockAuthenticationService();

		setupTerminalConfig('zsh', {
			zsh: { path: 'zsh' },
		});

		integration = await createIntegration();
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
				configurationService as unknown as IConfigurationService,

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
			expect(mockPythonTerminal.sendText).toHaveBeenCalledWith(` clear && ${escapeForPosixShell(expectedShimPath)}  && exit`);
		});

		it('should use shellArgsTerminal method when python terminal is not available', async () => {
			await integration.openTerminal('Shell Args Terminal');

			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event).toBeDefined();
			expect(event!.properties.terminalCreationMethod).toBe('shellArgsTerminal');
		});

		it('should pass the CLI args to the native shim without --clear', async () => {
			await integration.openTerminal('Test Terminal', ['--resume', 'sess-1']);

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.shellArgs).toEqual(['-ci', `${escapeForPosixShell(expectedShimPath)} --resume sess-1`]);
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

				configurationService as unknown as IConfigurationService,
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

		it('should run the native shim through PowerShell with literal arguments', async () => {
			setupTerminalConfig('PowerShell', { PowerShell: { path: 'pwsh' } });
			envService.shell = 'pwsh';
			const pwshIntegration = await createIntegration();

			await pwshIntegration.openTerminal('PowerShell Terminal', ['--resume', 'it\'s 1']);

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.shellArgs).toEqual(['-Command', `& '${expectedShimPath}' '--resume' 'it''s 1'`]);
		});

		it.runIf(process.platform === 'win32')('should run the native shim through cmd', async () => {
			setupTerminalConfig('Command Prompt', { 'Command Prompt': { path: 'cmd.exe' } });
			envService.shell = 'C:\\Windows\\System32\\cmd.exe';
			const cmdIntegration = await createIntegration();

			await cmdIntegration.openTerminal('Cmd Terminal', ['--resume', 'sess-1']);

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.shellArgs).toEqual(['/c', expectedShimPath, '--resume', 'sess-1']);
		});

		it('should run copilot from PATH when the native shim is missing', async () => {
			mockStat.mockRejectedValueOnce(new Error('ENOENT'));
			const pathIntegration = await createIntegration();

			await pathIntegration.openTerminal('Path Terminal', ['--resume', 'sess-1']);

			const callArgs = terminalService.createTerminalSpy.mock.calls[0][0] as TerminalOptions;
			expect(callArgs.shellArgs).toEqual(['-ci', 'copilot --resume sess-1']);
			const event = telemetryService.events.find(e => e.name === 'copilotcli.terminal.open');
			expect(event!.properties.shim).toBe('path');
		});
	});

	describe('initialize', () => {
		it('should contribute the native shim directory to the terminal PATH', async () => {
			expect(terminalService.contributePathSpy).toHaveBeenCalledWith(
				'copilot-cli',
				path.dirname(expectedShimPath),
				{ command: 'copilot' },
				undefined,
			);
		});

		it('should not contribute to the terminal PATH when the native shim is missing', async () => {
			terminalService.contributePathSpy.mockClear();
			mockStat.mockRejectedValueOnce(new Error('ENOENT'));
			await createIntegration();

			expect(terminalService.contributePathSpy).not.toHaveBeenCalled();
		});

		it('should follow chat.copilotCliCommand.enabled, which the CopilotCliCommand policy controls', async () => {
			terminalService.contributePathSpy.mockClear();
			configurationService.setCommandEnabled(false);
			await integration.openTerminal('Disabled Terminal', ['--resume', 'sess-1']);
			configurationService.setCommandEnabled(true);
			await integration.openTerminal('Enabled Terminal', ['--resume', 'sess-1']);

			expect({
				shellArgs: terminalService.createTerminalSpy.mock.calls.map(call => (call[0] as TerminalOptions).shellArgs),
				removed: terminalService.removePathContributionSpy.mock.calls,
				contributed: terminalService.contributePathSpy.mock.calls,
			}).toEqual({
				shellArgs: [
					['-ci', 'copilot --resume sess-1'],
					['-ci', `${escapeForPosixShell(expectedShimPath)} --resume sess-1`],
				],
				removed: [['copilot-cli']],
				contributed: [['copilot-cli', path.dirname(expectedShimPath), { command: 'copilot' }, undefined]],
			});
		});

		it('should remove the legacy script shims', async () => {
			expect(mockRm).toHaveBeenCalledWith(path.join('/tmp/test-global-storage', 'copilotCli'), { recursive: true, force: true });
		});

		it('should register a terminal profile provider', async () => {
			expect(mockRegisterTerminalProfileProvider).toHaveBeenCalledWith(
				'copilot-cli',
				expect.objectContaining({ provideTerminalProfile: expect.any(Function) }),
			);
		});
	});

	describe('getNativeCopilotShimPath', () => {
		it('should resolve the shim next to the code command on each platform', () => {
			expect({
				win32: getNativeCopilotShimPath('win32', 'C:\\Program Files\\Microsoft VS Code\\Code.exe', 'C:\\Program Files\\Microsoft VS Code\\1a2b3c4d5e\\resources\\app'),
				darwin: getNativeCopilotShimPath('darwin', '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)', '/Applications/Visual Studio Code.app/Contents/Resources/app'),
				linux: getNativeCopilotShimPath('linux', '/usr/share/code/code', '/usr/share/code/resources/app'),
			}).toEqual({
				win32: 'C:\\Program Files\\Microsoft VS Code\\bin\\copilot-shim\\copilot.exe',
				darwin: '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/copilot-shim/copilot',
				linux: '/usr/share/code/bin/copilot-shim/copilot',
			});
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

				configurationService as unknown as IConfigurationService,
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
