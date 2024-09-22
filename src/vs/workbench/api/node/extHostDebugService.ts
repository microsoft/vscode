/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createCancelablePromise, firstParallel, timeout } from '../../../base/common/async.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import * as platform from '../../../base/common/platform.js';
import * as nls from '../../../nls.js';
import { IExternalTerminalService } from '../../../platform/externalTerminal/common/externalTerminal.js';
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from '../../../platform/externalTerminal/node/externalTerminalService.js';
import { ISignService } from '../../../platform/sign/common/sign.js';
import { SignService } from '../../../platform/sign/node/signService.js';
import { AbstractDebugAdapter } from '../../contrib/debug/common/abstractDebugAdapter.js';
import { ExecutableDebugAdapter, NamedPipeDebugAdapter, SocketDebugAdapter } from '../../contrib/debug/node/debugAdapter.js';
import { hasChildProcesses, prepareCommand } from '../../contrib/debug/node/terminals.js';
import { ExtensionDescriptionRegistry } from '../../services/extensions/common/extensionDescriptionRegistry.js';
import { IExtHostCommands } from '../common/extHostCommands.js';
import { ExtHostConfigProvider, IExtHostConfiguration } from '../common/extHostConfiguration.js';
import { ExtHostDebugServiceBase, ExtHostDebugSession } from '../common/extHostDebugService.js';
import { IExtHostEditorTabs } from '../common/extHostEditorTabs.js';
import { IExtHostExtensionService } from '../common/extHostExtensionService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { IExtHostTerminalService } from '../common/extHostTerminalService.js';
import { IExtHostTesting } from '../common/extHostTesting.js';
import { DebugAdapterExecutable, DebugAdapterNamedPipeServer, DebugAdapterServer, ThemeIcon } from '../common/extHostTypes.js';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../common/extHostWorkspace.js';

export class ExtHostDebugService extends ExtHostDebugServiceBase {

	override readonly _serviceBrand: undefined;

	private _integratedTerminalInstances = new DebugTerminalCollection();
	private _terminalDisposedListener: IDisposable | undefined;

	constructor(
		@IExtHostRpcService extHostRpcService: IExtHostRpcService,
		@IExtHostWorkspace workspaceService: IExtHostWorkspace,
		@IExtHostExtensionService extensionService: IExtHostExtensionService,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostTerminalService private _terminalService: IExtHostTerminalService,
		@IExtHostEditorTabs editorTabs: IExtHostEditorTabs,
		@IExtHostVariableResolverProvider variableResolver: IExtHostVariableResolverProvider,
		@IExtHostCommands commands: IExtHostCommands,
		@IExtHostTesting testing: IExtHostTesting,
	) {
		super(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing);
	}

	protected override createDebugAdapter(adapter: vscode.DebugAdapterDescriptor, session: ExtHostDebugSession): AbstractDebugAdapter | undefined {
		if (adapter instanceof DebugAdapterExecutable) {
			return new ExecutableDebugAdapter(this.convertExecutableToDto(adapter), session.type);
		} else if (adapter instanceof DebugAdapterServer) {
			return new SocketDebugAdapter(this.convertServerToDto(adapter));
		} else if (adapter instanceof DebugAdapterNamedPipeServer) {
			return new NamedPipeDebugAdapter(this.convertPipeServerToDto(adapter));
		} else {
			return super.createDebugAdapter(adapter, session);
		}
	}

	protected override daExecutableFromPackage(session: ExtHostDebugSession, extensionRegistry: ExtensionDescriptionRegistry): DebugAdapterExecutable | undefined {
		const dae = ExecutableDebugAdapter.platformAdapterExecutable(extensionRegistry.getAllExtensionDescriptions(), session.type);
		if (dae) {
			return new DebugAdapterExecutable(dae.command, dae.args, dae.options);
		}
		return undefined;
	}

	protected override createSignService(): ISignService | undefined {
		return new SignService();
	}

	public override async $runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, sessionId: string): Promise<number | undefined> {

		if (args.kind === 'integrated') {

			if (!this._terminalDisposedListener) {
				// React on terminal disposed and check if that is the debug terminal #12956
				this._terminalDisposedListener = this._register(this._terminalService.onDidCloseTerminal(terminal => {
					this._integratedTerminalInstances.onTerminalClosed(terminal);
				}));
			}

			const configProvider = await this._configurationService.getConfigProvider();
			const shell = this._terminalService.getDefaultShell(true);
			const shellArgs = this._terminalService.getDefaultShellArgs(true);

			const terminalName = args.title || nls.localize('debug.terminal.title', "Debug Process");

			const shellConfig = JSON.stringify({ shell, shellArgs });
			let terminal = await this._integratedTerminalInstances.checkout(shellConfig, terminalName);

			let cwdForPrepareCommand: string | undefined;
			let giveShellTimeToInitialize = false;

			if (!terminal) {
				const options: vscode.TerminalOptions = {
					shellPath: shell,
					shellArgs: shellArgs,
					cwd: args.cwd,
					name: terminalName,
					iconPath: new ThemeIcon('debug'),
				};
				giveShellTimeToInitialize = true;
				terminal = this._terminalService.createTerminalFromOptions(options, {
					isFeatureTerminal: true,
					// Since debug termnials are REPLs, we want shell integration to be enabled.
					// Ignore isFeatureTerminal when evaluating shell integration enablement.
					forceShellIntegration: true,
					useShellEnvironment: true
				});
				this._integratedTerminalInstances.insert(terminal, shellConfig);

			} else {
				cwdForPrepareCommand = args.cwd;
			}

			terminal.show(true);

			const shellProcessId = await terminal.processId;

			if (giveShellTimeToInitialize) {
				// give a new terminal some time to initialize the shell
				await new Promise(resolve => setTimeout(resolve, 1000));
			} else {
				if (terminal.state.isInteractedWith) {
					terminal.sendText('\u0003'); // Ctrl+C for #106743. Not part of the same command for #107969
					await timeout(200); // mirroring https://github.com/microsoft/vscode/blob/c67ccc70ece5f472ec25464d3eeb874cfccee9f1/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts#L852-L857
				}

				if (configProvider.getConfiguration('debug.terminal').get<boolean>('clearBeforeReusing')) {
					// clear terminal before reusing it
					if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0 || shell.indexOf('cmd.exe') >= 0) {
						terminal.sendText('cls');
					} else if (shell.indexOf('bash') >= 0) {
						terminal.sendText('clear');
					} else if (platform.isWindows) {
						terminal.sendText('cls');
					} else {
						terminal.sendText('clear');
					}
				}
			}

			const command = prepareCommand(shell, args.args, !!args.argsCanBeInterpretedByShell, cwdForPrepareCommand, args.env);
			terminal.sendText(command);

			// Mark terminal as unused when its session ends, see #112055
			const sessionListener = this.onDidTerminateDebugSession(s => {
				if (s.id === sessionId) {
					this._integratedTerminalInstances.free(terminal);
					sessionListener.dispose();
				}
			});

			return shellProcessId;

		} else if (args.kind === 'external') {
			return runInExternalTerminal(args, await this._configurationService.getConfigProvider());
		}
		return super.$runInTerminal(args, sessionId);
	}
}

let externalTerminalService: IExternalTerminalService | undefined = undefined;

function runInExternalTerminal(args: DebugProtocol.RunInTerminalRequestArguments, configProvider: ExtHostConfigProvider): Promise<number | undefined> {
	if (!externalTerminalService) {
		if (platform.isWindows) {
			externalTerminalService = new WindowsExternalTerminalService();
		} else if (platform.isMacintosh) {
			externalTerminalService = new MacExternalTerminalService();
		} else if (platform.isLinux) {
			externalTerminalService = new LinuxExternalTerminalService();
		} else {
			throw new Error('external terminals not supported on this platform');
		}
	}
	const config = configProvider.getConfiguration('terminal');
	return externalTerminalService.runInTerminal(args.title!, args.cwd, args.args, args.env || {}, config.external || {});
}

class DebugTerminalCollection {
	/**
	 * Delay before a new terminal is a candidate for reuse. See #71850
	 */
	private static minUseDelay = 1000;

	private _terminalInstances = new Map<vscode.Terminal, { lastUsedAt: number; config: string }>();

	public async checkout(config: string, name: string, cleanupOthersByName = false) {
		const entries = [...this._terminalInstances.entries()];
		const promises = entries.map(([terminal, termInfo]) => createCancelablePromise(async ct => {

			// Only allow terminals that match the title.  See #123189
			if (terminal.name !== name) {
				return null;
			}

			if (termInfo.lastUsedAt !== -1 && await hasChildProcesses(await terminal.processId)) {
				return null;
			}

			// important: date check and map operations must be synchronous
			const now = Date.now();
			if (termInfo.lastUsedAt + DebugTerminalCollection.minUseDelay > now || ct.isCancellationRequested) {
				return null;
			}

			if (termInfo.config !== config) {
				if (cleanupOthersByName) {
					terminal.dispose();
				}
				return null;
			}

			termInfo.lastUsedAt = now;
			return terminal;
		}));

		return await firstParallel(promises, (t): t is vscode.Terminal => !!t);
	}

	public insert(terminal: vscode.Terminal, termConfig: string) {
		this._terminalInstances.set(terminal, { lastUsedAt: Date.now(), config: termConfig });
	}

	public free(terminal: vscode.Terminal) {
		const info = this._terminalInstances.get(terminal);
		if (info) {
			info.lastUsedAt = -1;
		}
	}

	public onTerminalClosed(terminal: vscode.Terminal) {
		this._terminalInstances.delete(terminal);
	}
}
