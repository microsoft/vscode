/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
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
import { isWindows } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { tildify, untildify } from '../../../../base/common/labels.js';

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
			runtimeItems.push({
				id: runtime.runtimeId,
				label: runtime.runtimeName,
				detail: runtime.runtimePath,
				neverShowWhenFiltered: true
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
					runtimeItems.push({
						id: runtime.runtimeId,
						label: runtime.runtimeName,
						detail: runtime.runtimePath,
						picked: (runtime.runtimeId === runtimeSessionService.foregroundSession?.runtimeMetadata.runtimeId),
						neverShowWhenFiltered: false
					});
				});
		});
	});

	// Add file browser options at the bottom
	const browsePythonId = generateUuid();
	const browseRId = generateUuid();
	
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
		}
	);

	// Prompt the user to select a runtime to start
	const selectedRuntime = await quickInputService.pick(
		runtimeItems,
		{
			title: localize('startNewInterpreterSession', 'Start New Interpreter Session'),
			canPickMany: false
		}
	);

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
