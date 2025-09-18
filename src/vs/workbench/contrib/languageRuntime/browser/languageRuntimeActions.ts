/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, QuickPickItem, IQuickInputButton } from '../../../../platform/quickinput/common/quickInput.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ERDOS_CONSOLE_VIEW_ID } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService, LanguageRuntimeSessionMode, RuntimeState, RuntimeStartupPhase } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionService, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { ErdosConsoleInstancesExistContext } from '../../../common/contextkeys.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isWindows, isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { tildify, untildify } from '../../../../base/common/labels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';

export const LANGUAGE_RUNTIME_SELECT_SESSION_ID = 'workbench.action.language.runtime.selectSession';
export const LANGUAGE_RUNTIME_START_NEW_SESSION_ID = 'workbench.action.language.runtime.startNewSession';
export const LANGUAGE_RUNTIME_RESTART_ACTIVE_SESSION_ID = 'workbench.action.language.runtime.restartActiveSession';
export const LANGUAGE_RUNTIME_RENAME_SESSION_ID = 'workbench.action.language.runtime.renameSession';
export const LANGUAGE_RUNTIME_RENAME_ACTIVE_SESSION_ID = 'workbench.action.language.runtime.renameActiveSession';
export const LANGUAGE_RUNTIME_DUPLICATE_ACTIVE_SESSION_ID = 'workbench.action.language.runtime.duplicateActiveSession';
export const LANGUAGE_RUNTIME_SELECT_RUNTIME_ID = 'workbench.action.languageRuntime.selectRuntime';
export const LANGUAGE_RUNTIME_DISCOVER_RUNTIMES_ID = 'workbench.action.language.runtime.discoverAllRuntimes';

// The category for language runtime actions.
const category: ILocalizedString = { value: 'Interpreter', original: 'Interpreter' };

/**
 * Helper function that asks the user to select a language runtime session from
 * an array of existing language runtime sessions.
 */
const selectLanguageRuntimeSession = async (
	accessor: ServicesAccessor,
	options?: {
		allowStartSession?: boolean;
		title?: string;
	}): Promise<ILanguageRuntimeSession | undefined> => {

	// Constants
	const startNewRuntimeId = generateUuid();

	// Access services.
	const quickInputService = accessor.get(IQuickInputService);
	const runtimeSessionService = accessor.get(IRuntimeSessionService);
	const commandService = accessor.get(ICommandService);

	// Create quick pick items for active console sessions sorted by creation time, oldest to newest.
	const sortedActiveSessions = runtimeSessionService.activeSessions
		.filter(session => session.metadata.sessionMode === LanguageRuntimeSessionMode.Console)
		.sort((a, b) => a.metadata.createdTimestamp - b.metadata.createdTimestamp);

	const activeRuntimeItems: IQuickPickItem[] = sortedActiveSessions.filter(
		(session) => {
			switch (session.getRuntimeState()) {
				case RuntimeState.Initializing:
				case RuntimeState.Starting:
				case RuntimeState.Ready:
				case RuntimeState.Idle:
				case RuntimeState.Busy:
				case RuntimeState.Restarting:
				case RuntimeState.Exiting:
				case RuntimeState.Offline:
				case RuntimeState.Interrupting:
					return true;
				default:
					return false;
			}
		}
	).map(
		(session) => {
			const isForegroundSession =
				session.sessionId === runtimeSessionService.foregroundSession?.sessionId;
			return {
				id: session.sessionId,
				label: session.dynState.sessionName,
				detail: session.runtimeMetadata.runtimePath,
				description: isForegroundSession ? 'Currently Selected' : undefined,
				picked: isForegroundSession,
			};
		}
	);

	// Show quick pick to select an active runtime or show all runtimes.
	const quickPickItems: QuickPickItem[] = [
		{
			label: localize('activeInterpreterSessions', 'Active Interpreter Sessions'),
			type: 'separator',
		},
		...activeRuntimeItems,
		{
			type: 'separator'
		}
	];

	if (options?.allowStartSession) {
		quickPickItems.push({
			label: localize('newInterpreterSession', 'New Interpreter Session...'),
			id: startNewRuntimeId,
			alwaysShow: true
		});
	}
	const result = await quickInputService.pick(quickPickItems, {
		title: options?.title || localize('selectInterpreterSession', 'Select Interpreter Session'),
		canPickMany: false,
		activeItem: activeRuntimeItems.filter(item => item.picked)[0]
	});

	// Handle the user's selection.
	if (result?.id === startNewRuntimeId) {
		// If the user selected "New Interpreter Session...", execute the command to show all runtimes.
		const sessionId: string | undefined = await commandService.executeCommand(LANGUAGE_RUNTIME_START_NEW_SESSION_ID);
		if (sessionId) {
			return runtimeSessionService.activeSessions.find(session => session.sessionId === sessionId);
		}
	} else if (result?.id) {
		const session = runtimeSessionService.activeSessions
			.find(session => session.sessionId === result.id);
		return session;
	}
	return undefined;
};

/**
 * IInterpreterGroup interface.
 */
interface IInterpreterGroup {
	primaryRuntime: ILanguageRuntimeMetadata;
	alternateRuntimes: ILanguageRuntimeMetadata[];
}

/**
 * Creates an IInterpreterGroup array representing the available language runtimes.
 */
const createInterpreterGroups = (
	languageRuntimeService: ILanguageRuntimeService,
	runtimeStartupService: IRuntimeStartupService
) => {
	const preferredRuntimeByLanguageId = new Map<string, ILanguageRuntimeMetadata>();
	const languageRuntimeGroups = new Map<string, IInterpreterGroup>();
	for (const runtime of languageRuntimeService.registeredRuntimes) {
		const languageId = runtime.languageId;

		// Get the preferred runtime for the language.
		let preferredRuntime = preferredRuntimeByLanguageId.get(languageId);
		if (!preferredRuntime) {
			preferredRuntime = runtimeStartupService.getPreferredRuntime(languageId);
			if (preferredRuntime) {
				preferredRuntimeByLanguageId.set(languageId, preferredRuntime);
			}
		}

		// If we didn't find a preferred runtime, skip this one.
		if (!preferredRuntime) {
			continue;
		}

		// Create the language runtime group if it doesn't exist.
		let languageRuntimeGroup = languageRuntimeGroups.get(languageId);
		if (!languageRuntimeGroup) {
			languageRuntimeGroup = { primaryRuntime: preferredRuntime, alternateRuntimes: [] };
			languageRuntimeGroups.set(languageId, languageRuntimeGroup);
		}

		// Add the runtime to the alternateRuntimes array if it's not the preferred runtime.
		if (runtime.runtimeId !== preferredRuntime.runtimeId) {
			languageRuntimeGroup.alternateRuntimes.push(runtime);
		}
	}

	// Sort the runtimes by language name.
	return Array.from(languageRuntimeGroups.values()).sort((a, b) => {
		if (a.primaryRuntime.languageName < b.primaryRuntime.languageName) {
			return -1;
		} else if (a.primaryRuntime.languageName > b.primaryRuntime.languageName) {
			return 1;
		} else {
			return 0;
		}
	});
};


/**
 * Helper function to get installation commands based on OS and language
 */
const getInstallationCommands = (languageId: 'python' | 'r'): { command: string; args: string[]; description: string } | null => {
	if (isWindows) {
		// Use winget for Windows installation
		if (languageId === 'python') {
			return {
				command: 'winget',
				args: ['install', 'Python.Python.3.12', '--accept-source-agreements', '--accept-package-agreements'],
				description: 'Installing Python via winget...'
			};
		} else {
			return {
				command: 'winget',
				args: ['install', 'RProject.R', '--accept-source-agreements', '--accept-package-agreements'],
				description: 'Installing R via winget...'
			};
		}
	} else if (isMacintosh) {
		// Use Homebrew for macOS installation
		if (languageId === 'python') {
			return {
				command: 'brew',
				args: ['install', 'python@3.12'],
				description: 'Installing Python via Homebrew...'
			};
		} else {
			return {
				command: 'brew',
				args: ['install', 'r'],
				description: 'Installing R via Homebrew...'
			};
		}
	} else if (isLinux) {
		// Try to detect Linux distribution and use appropriate package manager
		if (languageId === 'python') {
			return {
				command: 'sh',
				args: ['-c', 'if command -v apt >/dev/null 2>&1; then sudo apt update && sudo apt install -y python3 python3-pip; elif command -v yum >/dev/null 2>&1; then sudo yum install -y python3 python3-pip; elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y python3 python3-pip; elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --noconfirm python python-pip; else echo "No supported package manager found"; exit 1; fi'],
				description: 'Installing Python via system package manager...'
			};
		} else {
			return {
				command: 'sh',
				args: ['-c', 'if command -v apt >/dev/null 2>&1; then sudo apt update && sudo apt install -y r-base r-base-dev; elif command -v yum >/dev/null 2>&1; then sudo yum install -y R R-devel; elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y R R-devel; elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --noconfirm r; else echo "No supported package manager found"; exit 1; fi'],
				description: 'Installing R via system package manager...'
			};
		}
	}
	return null;
};

/**
 * Helper function to install an interpreter using system package managers
 */
const installInterpreter = async (
	languageId: 'python' | 'r',
	progressService: IProgressService,
	notificationService: INotificationService,
	logService: ILogService,
	terminalService: ITerminalService
): Promise<boolean> => {
	const installCommand = getInstallationCommands(languageId);
	if (!installCommand) {
		notificationService.error(localize('unsupportedOS', 'Automatic installation is not supported on this operating system.'));
		return false;
	}

	return new Promise<boolean>((resolve) => {
		progressService.withProgress({
			location: ProgressLocation.Notification,
			title: installCommand.description,
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 10, message: localize('startingInstallation', 'Starting installation...') });
				
				const fullCommand = `${installCommand.command} ${installCommand.args.join(' ')}`;
				logService.info(`[Interpreter Installation] Executing: ${fullCommand}`);
				
				progress.report({ increment: 20, message: localize('downloadingPackages', 'Downloading packages...') });
				
				// Create a terminal instance for the installation
				const terminal = await terminalService.createTerminal({
					config: {
						name: `${languageId === 'python' ? 'Python' : 'R'} Installation`,
						hideFromUser: false
					}
				});
				
				// Focus the terminal so user can see the progress
				await terminal.focusWhenReady();
				
				progress.report({ increment: 30, message: localize('installingPackages', 'Installing packages...') });
				
				// Run the installation command
				await terminal.runCommand(fullCommand, true);
				
				progress.report({ increment: 30, message: localize('installationComplete', 'Installation complete!') });
				logService.info(`[Interpreter Installation] Installation command sent for ${languageId}`);
				
				// Since we can't easily capture the exit code in browser context,
				// we'll assume success and let the user see the terminal output
				notificationService.info(localize('installationStarted', 
					'{0} installation has been started in the terminal. Please check the terminal output to verify successful installation.',
					languageId === 'python' ? 'Python' : 'R'));
				
				// Give some time for the command to start executing
				setTimeout(() => {
					resolve(true);
				}, 2000);
				
			} catch (error) {
				logService.error(`[Interpreter Installation] Installation failed:`, error);
				const errorMessage = error instanceof Error ? error.message : String(error);
				notificationService.error(localize('installationError', 'Failed to start installation of {0}: {1}', 
					languageId === 'python' ? 'Python' : 'R', errorMessage));
				resolve(false);
			}
		});
	});
};

/**
 * Helper function to remove a runtime from configuration and unregister it
 */
const removeRuntime = async (runtime: ILanguageRuntimeMetadata, configurationService: IConfigurationService, languageRuntimeService: ILanguageRuntimeService, pathService: IPathService): Promise<void> => {
	const userHome = pathService.userHome({ preferLocal: true }).fsPath;
	const runtimePath = runtime.runtimePath;
	
	// Remove from python.interpreters.include if it's a Python runtime and exists there
	if (runtime.languageId === 'python') {
		const pythonIncludePaths = configurationService.getValue<string[]>('python.interpreters.include') || [];
		const updatedPaths = pythonIncludePaths.filter(includePath => {
			return !(runtimePath === includePath ||
					 untildify(runtimePath, userHome) === untildify(includePath, userHome) ||
					 tildify(includePath, userHome) === runtimePath);
		});
		
		if (updatedPaths.length !== pythonIncludePaths.length) {
			await configurationService.updateValue('python.interpreters.include', updatedPaths);
		}
	}
	
	// Remove from erdos.r.customBinaries if it's an R runtime and exists there
	if (runtime.languageId === 'r') {
		const customBinaries = configurationService.getValue<string[]>('erdos.r.customBinaries') || [];
		const updatedBinaries = customBinaries.filter(binaryPath => {
			return !(runtimePath === binaryPath ||
					 untildify(runtimePath, userHome) === untildify(binaryPath, userHome) ||
					 tildify(binaryPath, userHome) === runtimePath);
		});
		
		if (updatedBinaries.length !== customBinaries.length) {
			await configurationService.updateValue('erdos.r.customBinaries', updatedBinaries);
		}
	}
	
	// Always unregister the runtime regardless of whether it was in configuration
	languageRuntimeService.unregisterRuntime(runtime.runtimeId);
};

/**
 * Helper function that asks the user to select a language runtime from
 * the list of registered language runtimes.
 */
const selectNewLanguageRuntime = async (
	accessor: ServicesAccessor
): Promise<ILanguageRuntimeMetadata | undefined> => {
	// Access services upfront to avoid scope issues after async operations.
	const quickInputService = accessor.get(IQuickInputService);
	const runtimeSessionService = accessor.get(IRuntimeSessionService);
	const runtimeStartupService = accessor.get(IRuntimeStartupService);
	const languageRuntimeService = accessor.get(ILanguageRuntimeService);
	const fileDialogService = accessor.get(IFileDialogService);
	const fileService = accessor.get(IFileService);
	const configurationService = accessor.get(IConfigurationService);
	const logService = accessor.get(ILogService);
	const pathService = accessor.get(IPathService);
	const progressService = accessor.get(IProgressService);
	const notificationService = accessor.get(INotificationService);
	const terminalService = accessor.get(ITerminalService);


	// Group runtimes by language.
	const interpreterGroups = createInterpreterGroups(languageRuntimeService, runtimeStartupService);

	// Grab the current runtime.
	const currentRuntime = runtimeSessionService.foregroundSession?.runtimeMetadata;

	// Grab the active runtimes.
	const activeRuntimes = runtimeSessionService.activeSessions
		// Sort by last used, descending.
		.sort((a, b) => b.lastUsed - a.lastUsed)
		// Map from session to runtime metadata.
		.map(session => session.runtimeMetadata)
		// Remove duplicates, and current runtime.
		.filter((runtime, index, runtimes) =>
			runtime.runtimeId !== currentRuntime?.runtimeId && runtimes.findIndex(r => r.runtimeId === runtime.runtimeId) === index
		);

	// Add current runtime first, if present.
	// Allows for "plus" + enter behavior to clone session.
	if (currentRuntime) {
		activeRuntimes.unshift(currentRuntime);
	}

	// Generate quick pick items for runtimes.
	const runtimeItems: QuickPickItem[] = [];

	// Add separator for suggested runtimes
	const suggestedRuntimes = interpreterGroups
		.map(group => group.primaryRuntime);

	if (suggestedRuntimes.length > 0) {
		runtimeItems.push({
			type: 'separator',
			label: localize('suggestedRuntimes', 'Suggested')
		});

		suggestedRuntimes.forEach(runtime => {
			// Add trash button to all runtimes
			const trashButton = {
				iconClass: ThemeIcon.asClassName(Codicon.trash),
				tooltip: localize('removeInterpreter', 'Remove interpreter from list')
			};
			const buttons: IQuickInputButton[] = [trashButton];
			
			runtimeItems.push({
				id: runtime.runtimeId,
				label: runtime.runtimeName,
				detail: runtime.runtimePath,
				neverShowWhenFiltered: true,
				buttons: buttons
			});
		});
	}

	// Add all runtime groups
	interpreterGroups.forEach(group => {
		// Group runtimes by environment type
		const runtimesByEnvType = new Map<string, ILanguageRuntimeMetadata[]>();
		const allRuntimes = [group.primaryRuntime, ...group.alternateRuntimes];

		allRuntimes.forEach(runtime => {
			const envType = `${runtime.runtimeSource}`;
			if (!runtimesByEnvType.has(envType)) {
				runtimesByEnvType.set(envType, []);
			}
			runtimesByEnvType.get(envType)!.push(runtime);
		});

		const envTypes = Array.from(runtimesByEnvType.keys());

		// Sort runtimes by version (decreasing), then alphabetically
		envTypes.forEach(envType => {
			runtimeItems.push({ type: 'separator', label: envType });
			runtimesByEnvType.get(envType)!
				.sort((a, b) => {
					// If both have version numbers, compare them
					if (a.languageVersion && b.languageVersion) {
						const aVersion = a.languageVersion.split('.').map(Number);
						const bVersion = b.languageVersion.split('.').map(Number);

						// Always list unsupported versions last
						if (!a.extraRuntimeData?.supported) {
							return 1;
						}
						if (!b.extraRuntimeData?.supported) {
							return -1;
						}
						// Compare major version
						if (aVersion[0] !== bVersion[0]) {
							return bVersion[0] - aVersion[0];
						}

						// Compare minor version
						if (aVersion[1] !== bVersion[1]) {
							return bVersion[1] - aVersion[1];
						}

						// Compare patch version
						if (aVersion[2] !== bVersion[2]) {
							return bVersion[2] - aVersion[2];
						}
					}

					// If versions are equal or not found, sort alphabetically
					return a.runtimeName.localeCompare(b.runtimeName);
				})
				.forEach(runtime => {
					// Add trash button to all runtimes
					const trashButton = {
						iconClass: ThemeIcon.asClassName(Codicon.trash),
						tooltip: localize('removeInterpreter', 'Remove interpreter from list')
					};
					const buttons: IQuickInputButton[] = [trashButton];
					
					runtimeItems.push({
						id: runtime.runtimeId,
						label: runtime.runtimeName,
						detail: runtime.runtimePath,
						picked: (runtime.runtimeId === runtimeSessionService.foregroundSession?.runtimeMetadata.runtimeId),
						neverShowWhenFiltered: false,
						buttons: buttons
					});
				});
		});
	});

	// Add file browser options at the bottom
	const browsePythonId = generateUuid();
	const browseRId = generateUuid();
	const installPythonId = generateUuid();
	const installRId = generateUuid();
	
	runtimeItems.push(
		{
			type: 'separator',
			label: localize('browseForInterpreter', 'Browse for Interpreter')
		},
		{
			id: browsePythonId,
			label: `$(search) ${localize('findPythonInterpreter', 'Find Python Interpreter...')}`,
			detail: localize('browsePythonDetail', 'Browse your file system to find a Python interpreter')
		},
		{
			id: browseRId,
			label: `$(search) ${localize('findRInterpreter', 'Find R Interpreter...')}`,
			detail: localize('browseRDetail', 'Browse your file system to find an R interpreter')
		},
		{
			type: 'separator',
			label: localize('installInterpreter', 'Install Interpreter')
		},
		{
			id: installPythonId,
			label: `$(cloud-download) ${localize('installPython', 'Install Python...')}`,
			detail: localize('installPythonDetail', 'Install Python using your system package manager')
		},
		{
			id: installRId,
			label: `$(cloud-download) ${localize('installR', 'Install R...')}`,
			detail: localize('installRDetail', 'Install R using your system package manager')
		}
	);

	// Create a quick pick with button handling
	const quickPick = quickInputService.createQuickPick();
	quickPick.title = localize('startNewInterpreterSession', 'Start New Interpreter Session');
	quickPick.canSelectMany = false;
	quickPick.items = runtimeItems as any;
	
	// Handle button clicks to remove interpreters
	const buttonDisposable = quickPick.onDidTriggerItemButton(async (e) => {
		const runtime = languageRuntimeService.getRegisteredRuntime(e.item.id!);
		if (runtime) {
			try {
				await removeRuntime(runtime, configurationService, languageRuntimeService, pathService);
				// Update the items list to remove the deleted runtime
				quickPick.items = quickPick.items.filter(item => item.id !== runtime.runtimeId) as any;
			} catch (error) {
				logService.error('Failed to remove runtime:', error);
			}
		}
	});
	
	quickPick.show();
	
	// Wait for selection or hide
	let selectedItem: QuickPickItem | undefined = undefined;
	
	const selectedRuntime = await new Promise<QuickPickItem | undefined>((resolve) => {
		const acceptDisposable = quickPick.onDidAccept(() => {
			selectedItem = quickPick.selectedItems[0];
			quickPick.hide();
		});
		
		const hideDisposable = quickPick.onDidHide(() => {
			acceptDisposable.dispose();
			hideDisposable.dispose();
			buttonDisposable.dispose();
			quickPick.dispose();
			resolve(selectedItem);
		});
	});

	// Handle file browser selections
	if (selectedRuntime?.id === browsePythonId || selectedRuntime?.id === browseRId) {
		const isPython = selectedRuntime.id === browsePythonId;
		const languageId = isPython ? 'python' : 'r';
	const configKey = isPython ? 'python.interpreters.include' : 'erdos.r.customBinaries';
	
	const dialogFilters = isWindows ? [{ name: 'Executables', extensions: ['exe'] }] : undefined;
	
	const result = await fileDialogService.showOpenDialog({
		title: isPython ? localize('selectPythonInterpreter', 'Select Python Interpreter') : localize('selectRInterpreter', 'Select R Interpreter'),
			filters: dialogFilters,
			canSelectMany: false,
			canSelectFiles: true,
			canSelectFolders: false
		});

		if (result && result.length > 0) {
			const interpreterPath = result[0];
			
			try {
				const stat = await fileService.stat(interpreterPath);
				if (stat.isFile) {
					try {
						// Add the interpreter to the appropriate extension's configuration
						const currentPaths = configurationService.getValue<string[]>(configKey) || [];
						if (!currentPaths.includes(interpreterPath.fsPath)) {
							await configurationService.updateValue(configKey, 
								[...currentPaths, interpreterPath.fsPath]
							);
						}
						
						// Trigger runtime discovery and wait for completion
						await runtimeStartupService.rediscoverAllRuntimes();
						
						await new Promise<void>((resolve) => {
							const disposable = languageRuntimeService.onDidChangeRuntimeStartupPhase((phase) => {
								if (phase === RuntimeStartupPhase.Complete) {
									disposable.dispose();
									resolve();
								}
							});
							
							setTimeout(() => {
								disposable.dispose();
								resolve();
							}, 5000);
						});
						
						// Find the newly registered runtime
						const registeredRuntimes = languageRuntimeService.registeredRuntimes;
						const userHome = pathService.userHome({ preferLocal: true }).fsPath;
						const targetPath = interpreterPath.fsPath;
						
						const runtime = registeredRuntimes.find(runtime => {
							if (runtime.languageId !== languageId) {
								return false;
							}
							
							const runtimePath = runtime.runtimePath;
							
							// Try multiple path matching approaches
							return runtimePath === targetPath ||
								   untildify(runtimePath, userHome) === untildify(targetPath, userHome) ||
								   tildify(targetPath, userHome) === runtimePath;
						});
						
						if (runtime) {
							return runtime;
						}
					} catch (error) {
						logService.error(`[Runtime Browser] Error during ${languageId} registration process:`, error);
					}
				}
			} catch (error) {
				logService.error(`[Runtime Browser] File validation failed:`, error);
			}
		}
		return undefined;
	}

	// Handle installation selections
	if (selectedRuntime?.id === installPythonId || selectedRuntime?.id === installRId) {
		const isPython = selectedRuntime.id === installPythonId;
		const languageId: 'python' | 'r' = isPython ? 'python' : 'r';
		
		// Install the interpreter
		const installSuccess = await installInterpreter(languageId, progressService, notificationService, logService, terminalService);
		
		if (installSuccess) {
			// Trigger runtime discovery and wait for completion
			await runtimeStartupService.rediscoverAllRuntimes();
			
			await new Promise<void>((resolve) => {
				const disposable = languageRuntimeService.onDidChangeRuntimeStartupPhase((phase) => {
					if (phase === RuntimeStartupPhase.Complete) {
						disposable.dispose();
						resolve();
					}
				});
				
				setTimeout(() => {
					disposable.dispose();
					resolve();
				}, 10000); // Longer timeout for installation discovery
			});
			
			// Find the newly installed runtime - look for the preferred runtime for this language
			const preferredRuntime = runtimeStartupService.getPreferredRuntime(languageId);
			if (preferredRuntime) {
				logService.info(`[Interpreter Installation] Found newly installed ${languageId} runtime: ${preferredRuntime.runtimePath}`);
				return preferredRuntime;
			} else {
				// If no preferred runtime found, try to find any runtime for this language
				const availableRuntimes = languageRuntimeService.registeredRuntimes.filter(runtime => runtime.languageId === languageId);
				if (availableRuntimes.length > 0) {
					const newestRuntime = availableRuntimes.sort((a, b) => {
						// Sort by version if available, otherwise by runtime name
						if (a.languageVersion && b.languageVersion) {
							return b.languageVersion.localeCompare(a.languageVersion, undefined, { numeric: true });
						}
						return b.runtimeName.localeCompare(a.runtimeName);
					})[0];
					logService.info(`[Interpreter Installation] Found newly installed ${languageId} runtime: ${newestRuntime.runtimePath}`);
					return newestRuntime;
				}
			}
			
			logService.warn(`[Interpreter Installation] Could not find newly installed ${languageId} runtime`);
			notificationService.warn(localize('installationNotDetected', 
				'Installation completed but the new {0} interpreter was not automatically detected. You may need to restart the application or manually browse for the interpreter.',
				languageId === 'python' ? 'Python' : 'R'));
		}
		
		return undefined;
	}

	// If the user selected a runtime, return the runtime metadata.
	if (selectedRuntime?.id) {
		return languageRuntimeService.getRegisteredRuntime(selectedRuntime.id);
	}

	return undefined;
};

export function registerLanguageRuntimeActions() {

	/**
	 * Action that allows the user to change the foreground session.
	 */
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: LANGUAGE_RUNTIME_SELECT_SESSION_ID,
				title: { value: 'Select Interpreter Session', original: 'Select Interpreter Session' },
				f1: true,
				category,
			});
		}

		async run(accessor: ServicesAccessor) {
			// Access services.
			const commandService = accessor.get(ICommandService);
			const runtimeSessionService = accessor.get(IRuntimeSessionService);

			// Prompt the user to select a runtime to use.
			const newActiveSession = await selectLanguageRuntimeSession(accessor, { allowStartSession: true });

			// If the user selected a specific session, set it as the active session if it still exists
			if (newActiveSession) {
				// Drive focus into the Erdos console.
				commandService.executeCommand('workbench.panel.erdosConsole.focus');
				runtimeSessionService.foregroundSession = newActiveSession;
			}
		}
	});

	/**
	 * Action that allows the user to create a new session from a list of registered runtimes.
	 */
	registerAction2(class extends Action2 {
		/**
		 * Constructor.
		 */
		constructor() {
			super({
				icon: Codicon.plus,
				id: LANGUAGE_RUNTIME_START_NEW_SESSION_ID,
				title: {
					value: localize('startNewInterpreterSession', 'Start New Interpreter Session'),
					original: 'Start New Interpreter Session'
				},
				category,
				f1: true,
				menu: [{
					group: 'navigation',
					id: MenuId.ViewTitle,
					order: 1,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID),
						ErdosConsoleInstancesExistContext.negate()
					),
				}],
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
					mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Slash },
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
		}

		async run(accessor: ServicesAccessor) {
			// Access services.
			const commandService = accessor.get(ICommandService);
			const runtimeSessionService = accessor.get(IRuntimeSessionService);

			// Prompt the user to select a runtime to start
			const selectedRuntime = await selectNewLanguageRuntime(accessor);

			// If the user selected a runtime, set it as the active runtime
			if (selectedRuntime?.runtimeId) {
				// Drive focus into the Erdos console.
				commandService.executeCommand('workbench.panel.erdosConsole.focus');

				return await runtimeSessionService.startNewRuntimeSession(
					selectedRuntime.runtimeId,
					selectedRuntime.runtimeName,
					LanguageRuntimeSessionMode.Console,
					undefined,
					'User selected runtime',
					RuntimeStartMode.Starting,
					true
				);
			}
			return undefined;
		}
	});

	/**
	 * Action that allows the user to create a new session based off the current active session.
	 * This utilizes the runtime data from the current session to create a new session.
	 */
	registerAction2(class extends Action2 {
		constructor() {
			super({
				icon: Codicon.plus,
				id: LANGUAGE_RUNTIME_DUPLICATE_ACTIVE_SESSION_ID,
				title: {
					value: localize('duplicateActiveInterpreterSession', 'Duplicate Active Interpreter Session'),
					original: 'Duplicate Session'
				},
				category,
				f1: true,
				menu: [{
					group: 'navigation',
					id: MenuId.ViewTitle,
					order: 1,
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID),
						ErdosConsoleInstancesExistContext
					),
				}],
			});
		}

		async run(accessor: ServicesAccessor) {
			// Access services
			const commandService = accessor.get(ICommandService);
			const runtimeSessionService = accessor.get(IRuntimeSessionService);
			const notificationService = accessor.get(INotificationService);

			// Get the current foreground session.
			const currentSession = runtimeSessionService.foregroundSession;
			if (!currentSession) {
				return;
			}

			if (currentSession.metadata.sessionMode !== LanguageRuntimeSessionMode.Console) {
				notificationService.error(localize('duplicateNotConsole', 'Cannot duplicate session. The current session is not a console session.'));
				return;
			}

			// Drive focus into the Erdos console.
			commandService.executeCommand('workbench.panel.erdosConsole.focus');

			// Duplicate the current session with the `startNewRuntimeSession` method.
			await runtimeSessionService.startNewRuntimeSession(
				currentSession.runtimeMetadata.runtimeId,
				currentSession.dynState.sessionName,
				currentSession.metadata.sessionMode,
				undefined,
				`Duplicated session: ${currentSession.dynState.sessionName}`,
				RuntimeStartMode.Starting,
				true
			);
		}
	});

	/**
	 * Action that allows the user to restart an active session.
	 */
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: LANGUAGE_RUNTIME_RESTART_ACTIVE_SESSION_ID,
				title: { value: 'Restart Active Interpreter Session', original: 'Restart Active Interpreter Session' },
				category,
				f1: true,
				keybinding: [
					{
						weight: KeybindingWeight.WorkbenchContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Numpad0,
						secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10]
					},
					{
						weight: KeybindingWeight.WorkbenchContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit0
					},
				]
			});
		}

		async run(accessor: ServicesAccessor) {
			const sessionService = accessor.get(IRuntimeSessionService);

			// Get the active session
			const session = sessionService.foregroundSession;
			if (!session) {
				return;
			}

			// Restart the session
			sessionService.restartSession(session.sessionId,
				`'Restart Active Interpreter Session' command invoked`);
		}
	});
}
