/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../../../base/common/jsonc.js';
import { setProperty, applyEdits } from '../../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../../base/common/jsonFormatter.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ChatViewId } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { HOOK_TYPES, HookType, getEffectiveCommandFieldKey } from '../../common/promptSyntax/hookSchema.js';
import { getCopilotCliHookTypeName, resolveCopilotCliHookType } from '../../common/promptSyntax/hookCopilotCliCompat.js';
import { getHookSourceFormat, HookSourceFormat, buildNewHookEntry } from '../../common/promptSyntax/hookCompatibility.js';
import { getClaudeHookTypeName, resolveClaudeHookType } from '../../common/promptSyntax/hookClaudeCompat.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITextEditorSelection } from '../../../../../platform/editor/common/editor.js';
import { findHookCommandSelection, parseAllHookFiles, IParsedHook } from './hookUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { OS } from '../../../../../base/common/platform.js';

/**
 * Action ID for the `Configure Hooks` action.
 */
const CONFIGURE_HOOKS_ACTION_ID = 'workbench.action.chat.configure.hooks';

interface IHookTypeQuickPickItem extends IQuickPickItem {
	readonly hookType: typeof HOOK_TYPES[number];
}

interface IHookQuickPickItem extends IQuickPickItem {
	readonly hookEntry?: IParsedHook;
	readonly isAddNewHook?: boolean;
}

interface IHookFileQuickPickItem extends IQuickPickItem {
	readonly fileUri?: URI;
	readonly isCreateNewFile?: boolean;
}

/**
 * Detects if existing hooks use Copilot CLI naming convention (camelCase).
 * Returns true if any existing key matches the Copilot CLI format.
 */
function usesCopilotCliNaming(hooksObj: Record<string, unknown>): boolean {
	for (const key of Object.keys(hooksObj)) {
		// Check if any key resolves to a Copilot CLI hook type
		if (resolveCopilotCliHookType(key) !== undefined) {
			return true;
		}
	}
	return false;
}

/**
 * Gets the appropriate key name for a hook type based on the naming convention used in the file.
 */
function getHookTypeKeyName(hookTypeId: HookType, useCopilotCliNamingConvention: boolean): string {
	if (useCopilotCliNamingConvention) {
		const copilotCliName = getCopilotCliHookTypeName(hookTypeId);
		if (copilotCliName) {
			return copilotCliName;
		}
	}
	// Fall back to PascalCase (enum value)
	return hookTypeId;
}

/**
 * Adds a hook to an existing hook file.
 */
async function addHookToFile(
	hookFileUri: URI,
	hookTypeId: HookType,
	fileService: IFileService,
	editorService: IEditorService,
	notificationService: INotificationService,
	bulkEditService: IBulkEditService,
	openEditorOverride?: (resource: URI, options?: { selection?: ITextEditorSelection }) => Promise<void>,
): Promise<void> {
	// Parse existing file
	let hooksContent: { hooks: Record<string, unknown[]> };
	const fileExists = await fileService.exists(hookFileUri);

	if (fileExists) {
		const existingContent = await fileService.readFile(hookFileUri);
		try {
			hooksContent = parseJSONC(existingContent.value.toString());
			// Ensure hooks object exists
			if (!hooksContent.hooks) {
				hooksContent.hooks = {};
			}
		} catch {
			// If parsing fails, show error and open file for user to fix
			notificationService.error(localize('commands.new.hook.parseError', "Failed to parse existing hooks file. Please fix the JSON syntax errors and try again."));
			await editorService.openEditor({ resource: hookFileUri });
			return;
		}
	} else {
		// Create new structure
		hooksContent = { hooks: {} };
	}

	// Detect source format from file URI
	const sourceFormat = getHookSourceFormat(hookFileUri);
	const isClaude = sourceFormat === HookSourceFormat.Claude;

	// Detect naming convention from existing keys
	const useCopilotCliNamingConvention = !isClaude && usesCopilotCliNaming(hooksContent.hooks);
	const hookTypeKeyName = isClaude
		? (getClaudeHookTypeName(hookTypeId) ?? hookTypeId)
		: getHookTypeKeyName(hookTypeId, useCopilotCliNamingConvention);

	// Also check if there's an existing key for this hook type (with either naming)
	// Find existing key that resolves to the same hook type
	let existingKeyForType: string | undefined;
	for (const key of Object.keys(hooksContent.hooks)) {
		const resolvedType = isClaude
			? resolveClaudeHookType(key)
			: resolveCopilotCliHookType(key);
		if (resolvedType === hookTypeId || key === hookTypeId) {
			existingKeyForType = key;
			break;
		}
	}

	// Use existing key if found, otherwise use the detected naming convention
	const keyToUse = existingKeyForType ?? hookTypeKeyName;

	// Determine the new hook index (append if hook type already exists)
	const newHookEntry = buildNewHookEntry(sourceFormat);
	const existingHooks = hooksContent.hooks[keyToUse];
	const newHookIndex = Array.isArray(existingHooks) ? existingHooks.length : 0;

	// Generate the new JSON content using setProperty to preserve comments
	let jsonContent: string;
	if (fileExists) {
		// Use setProperty to make targeted edits that preserve comments
		const originalText = (await fileService.readFile(hookFileUri)).value.toString();
		const detectedEol = originalText.includes('\r\n') ? '\r\n' : '\n';
		const formattingOptions: FormattingOptions = { tabSize: 1, insertSpaces: false, eol: detectedEol };
		const edits = setProperty(originalText, ['hooks', keyToUse, newHookIndex], newHookEntry, formattingOptions);
		jsonContent = applyEdits(originalText, edits);
	} else {
		// New file - use JSON.stringify since there are no comments to preserve
		const newContent = { hooks: { [keyToUse]: [newHookEntry] } };
		jsonContent = JSON.stringify(newContent, null, '\t');
	}

	// Check if the file is already open in an editor
	const existingEditor = editorService.editors.find(e => isEqual(e.resource, hookFileUri));

	if (existingEditor) {
		// File is already open - first focus the editor, then update its model directly
		await editorService.openEditor({
			resource: hookFileUri,
			options: {
				pinned: false
			}
		});

		// Get the code editor and update its content directly
		const editor = getCodeEditor(editorService.activeTextEditorControl);
		if (editor && editor.hasModel() && isEqual(editor.getModel().uri, hookFileUri)) {
			const model = editor.getModel();
			// Apply the full content replacement using executeEdits
			model.pushEditOperations([], [{
				range: model.getFullModelRange(),
				text: jsonContent
			}], () => null);

			// Find and apply the selection
			const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, 'command');
			if (selection && selection.endLineNumber !== undefined && selection.endColumn !== undefined) {
				editor.setSelection({
					startLineNumber: selection.startLineNumber,
					startColumn: selection.startColumn,
					endLineNumber: selection.endLineNumber,
					endColumn: selection.endColumn
				});
				editor.revealLineInCenter(selection.startLineNumber);
			}
		} else {
			// Fallback: active editor/model check failed, apply via bulk edit service
			await bulkEditService.apply([
				new ResourceTextEdit(hookFileUri, { range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1), text: jsonContent })
			], { label: localize('addHook', "Add Hook") });

			// Find the selection for the new hook's command field
			const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, 'command');

			// Re-open editor with selection
			await editorService.openEditor({
				resource: hookFileUri,
				options: {
					selection,
					pinned: false
				}
			});
		}
	} else {
		// File is not currently open in an editor
		if (!fileExists) {
			// File doesn't exist - write new file directly and open
			await fileService.writeFile(hookFileUri, VSBuffer.fromString(jsonContent));
		} else {
			// File exists but isn't open - open it first, then use bulk edit for undo support
			await editorService.openEditor({
				resource: hookFileUri,
				options: { pinned: false }
			});

			// Apply the edit via bulk edit service for proper undo support
			await bulkEditService.apply([
				new ResourceTextEdit(hookFileUri, { range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1), text: jsonContent })
			], { label: localize('addHook', "Add Hook") });
		}

		// Find the selection for the new hook's command field
		const selection = findHookCommandSelection(jsonContent, keyToUse, newHookIndex, 'command');

		// Open editor with selection (or re-focus if already open)
		if (openEditorOverride) {
			await openEditorOverride(hookFileUri, { selection });
		} else {
			await editorService.openEditor({
				resource: hookFileUri,
				options: {
					selection,
					pinned: false
				}
			});
		}
	}
}

/**
 * Awaits a single pick interaction on the given picker.
 * Returns the selected item, 'back' if the back button was pressed, or undefined if cancelled.
 */
function awaitPick<T extends IQuickPickItem>(
	picker: IQuickPick<IQuickPickItem, { useSeparators: true }>,
	backButton: IQuickInputButton,
): Promise<T | 'back' | undefined> {
	return new Promise<T | 'back' | undefined>(resolve => {
		let resolved = false;
		const done = (value: T | 'back' | undefined) => {
			if (!resolved) {
				resolved = true;
				disposables.dispose();
				resolve(value);
			}
		};
		const disposables = new DisposableStore();
		disposables.add(picker.onDidAccept(() => {
			done(picker.activeItems[0] as T | undefined);
		}));
		disposables.add(picker.onDidTriggerButton(button => {
			if (button === backButton) {
				done('back');
			}
		}));
		disposables.add(picker.onDidHide(() => {
			done(undefined);
		}));
	});
}

const enum Step {
	SelectHookType = 1,
	SelectHook = 2,
	SelectFile = 3,
	SelectFolder = 4,
	EnterFilename = 5,
}

/**
 * Optional callbacks for customizing the hook creation and opening behaviour.
 * The agentic editor passes these to open hooks in the embedded editor and
 * track worktree files for auto-commit.
 */
export interface IHookQuickPickCallbacks {
	/** Override how the hook file is opened. If not provided, uses editorService.openEditor. */
	readonly openEditor?: (resource: URI, options?: { selection?: ITextEditorSelection }) => Promise<void>;
	/** Called after a new hook file is created on disk. */
	readonly onHookFileCreated?: (uri: URI) => void;
}

/**
 * Shows the Configure Hooks quick pick UI, allowing the user to view,
 * open, or create hooks. Can be called from the action or slash command.
 */
export async function showConfigureHooksQuickPick(
	accessor: ServicesAccessor,
	callbacks?: IHookQuickPickCallbacks,
): Promise<void> {
	const promptsService = accessor.get(IPromptsService);
	const quickInputService = accessor.get(IQuickInputService);
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);
	const editorService = accessor.get(IEditorService);
	const workspaceService = accessor.get(IWorkspaceContextService);
	const pathService = accessor.get(IPathService);
	const notificationService = accessor.get(INotificationService);
	const bulkEditService = accessor.get(IBulkEditService);
	const remoteAgentService = accessor.get(IRemoteAgentService);

	// Get the remote OS (or fall back to local OS)
	const remoteEnv = await remoteAgentService.getEnvironment();
	const targetOS = remoteEnv?.os ?? OS;

	// Get workspace root and user home for path resolution
	const workspaceFolder = workspaceService.getWorkspace().folders[0];
	const workspaceRootUri = workspaceFolder?.uri;
	const userHomeUri = await pathService.userHome();
	const userHome = userHomeUri.fsPath ?? userHomeUri.path;

	// Parse all hook files upfront to count hooks per type
	const hookEntries = await parseAllHookFiles(
		promptsService,
		fileService,
		labelService,
		workspaceRootUri,
		userHome,
		targetOS,
		CancellationToken.None
	);

	// Count hooks per type
	const hookCountByType = new Map<HookType, number>();
	for (const entry of hookEntries) {
		hookCountByType.set(entry.hookType, (hookCountByType.get(entry.hookType) ?? 0) + 1);
	}

	// Create a single picker instance reused across all steps
	const store = new DisposableStore();
	const picker = store.add(quickInputService.createQuickPick<IQuickPickItem>({ useSeparators: true }));
	const backButton = quickInputService.backButton;
	let suppressHideDispose = false;
	store.add(picker.onDidHide(() => {
		if (!suppressHideDispose) {
			store.dispose();
		}
	}));
	picker.show();

	let step = Step.SelectHookType;
	let selectedHookType: IHookTypeQuickPickItem | undefined;
	let selectedHook: IHookQuickPickItem | undefined;
	let selectedFile: IHookFileQuickPickItem | undefined;
	let selectedFolder: { uri: URI } | undefined;

	// Track steps that were actually shown to the user, so Back
	// skips over auto-executed steps and returns to the last visible one.
	const stepHistory: Step[] = [];
	const goBack = (): Step | undefined => stepHistory.pop();

	while (true) {
		switch (step) {
			case Step.SelectHookType: {
				// Step 1: Show all lifecycle events with hook counts
				const hookTypeItems: IHookTypeQuickPickItem[] = HOOK_TYPES.map(hookType => {
					const count = hookCountByType.get(hookType.id) ?? 0;
					const countLabel = count > 0 ? ` (${count})` : '';
					return {
						label: `${hookType.label}${countLabel}`,
						description: hookType.description,
						hookType
					};
				});

				picker.items = hookTypeItems;
				picker.value = '';
				picker.placeholder = localize('commands.hooks.selectEvent.placeholder', 'Select a lifecycle event');
				picker.title = localize('commands.hooks.title', 'Hooks');
				picker.buttons = [];

				const result = await awaitPick<IHookTypeQuickPickItem>(picker, backButton);

				if (!result || result === 'back') {
					picker.hide();
					return;
				}

				selectedHookType = result;
				stepHistory.push(Step.SelectHookType);
				step = Step.SelectHook;
				break;
			}

			case Step.SelectHook: {
				// Filter hooks by the selected type
				const hooksOfType = hookEntries.filter(h => h.hookType === selectedHookType!.hookType.id);

				// Step 2: Show "Add new hook" + existing hooks of this type
				const hookItems: (IHookQuickPickItem | IQuickPickSeparator)[] = [];

				// Add "Add new hook" option at the top
				hookItems.push({
					label: `$(plus) ${localize('commands.addNewHook.label', 'Add new hook...')}`,
					isAddNewHook: true,
					alwaysShow: true
				});

				// Add existing hooks
				if (hooksOfType.length > 0) {
					hookItems.push({
						type: 'separator',
						label: localize('existingHooks', "Existing Hooks")
					});

					for (const entry of hooksOfType) {
						const description = labelService.getUriLabel(entry.fileUri, { relative: true });
						hookItems.push({
							label: entry.commandLabel,
							description,
							hookEntry: entry
						});
					}
				}

				// Auto-execute if only "Add new hook" is available (no existing hooks)
				if (hooksOfType.length === 0) {
					selectedHook = hookItems[0] as IHookQuickPickItem;
				} else {
					picker.items = hookItems;
					picker.value = '';
					picker.placeholder = localize('commands.hooks.selectHook.placeholder', 'Select a hook to open or add a new one');
					picker.title = selectedHookType!.hookType.label;
					picker.buttons = [backButton];

					const result = await awaitPick<IHookQuickPickItem>(picker, backButton);

					if (result === 'back') {
						step = goBack() ?? Step.SelectHookType;
						break;
					}
					if (!result) {
						picker.hide();
						return;
					}
					selectedHook = result;
					stepHistory.push(Step.SelectHook);
				}

				// Handle clicking on existing hook (focus into command)
				if (selectedHook.hookEntry) {
					const entry = selectedHook.hookEntry;
					let selection: ITextEditorSelection | undefined;

					// Determine the command field name to highlight based on target platform
					const commandFieldName = getEffectiveCommandFieldKey(entry.command, targetOS);

					// Try to find the command field to highlight
					if (commandFieldName) {
						try {
							const content = await fileService.readFile(entry.fileUri);
							selection = findHookCommandSelection(
								content.value.toString(),
								entry.originalHookTypeId,
								entry.index,
								commandFieldName
							);
						} catch {
							// Ignore errors and just open without selection
						}
					}

					picker.hide();
					if (callbacks?.openEditor) {
						await callbacks.openEditor(entry.fileUri, { selection });
					} else {
						await editorService.openEditor({
							resource: entry.fileUri,
							options: {
								selection,
								pinned: false
							}
						});
					}
					return;
				}

				// "Add new hook" was selected
				step = Step.SelectFile;
				break;
			}

			case Step.SelectFile: {
				// Step 3: Handle "Add new hook" - show create new file + existing hook files
				// Get existing hook files (local storage only, not User Data)
				const hookFiles = await promptsService.listPromptFilesForStorage(PromptsType.hook, PromptsStorage.local, CancellationToken.None);

				const fileItems: (IHookFileQuickPickItem | IQuickPickSeparator)[] = [];

				// Add "Create new hook config file" option at the top
				fileItems.push({
					label: `$(new-file) ${localize('commands.createNewHookFile.label', 'Create new hook config file...')}`,
					isCreateNewFile: true,
					alwaysShow: true
				});

				// Add existing hook files
				if (hookFiles.length > 0) {
					fileItems.push({
						type: 'separator',
						label: localize('existingHookFiles', "Existing Hook Files")
					});

					for (const hookFile of hookFiles) {
						const relativePath = labelService.getUriLabel(hookFile.uri, { relative: true });
						fileItems.push({
							label: relativePath,
							fileUri: hookFile.uri
						});
					}
				}

				// Auto-execute if no existing hook files
				if (hookFiles.length === 0) {
					selectedFile = fileItems[0] as IHookFileQuickPickItem;
				} else {
					picker.items = fileItems;
					picker.value = '';
					picker.placeholder = localize('commands.hooks.selectFile.placeholder', 'Select a hook file or create a new one');
					picker.title = localize('commands.hooks.addHook.title', 'Add Hook');
					picker.buttons = [backButton];

					const result = await awaitPick<IHookFileQuickPickItem>(picker, backButton);

					if (result === 'back') {
						step = goBack() ?? Step.SelectHook;
						break;
					}
					if (!result) {
						picker.hide();
						return;
					}
					selectedFile = result;
					stepHistory.push(Step.SelectFile);
				}

				// Handle adding hook to existing file
				if (selectedFile.fileUri) {
					picker.hide();
					await addHookToFile(
						selectedFile.fileUri,
						selectedHookType!.hookType.id as HookType,
						fileService,
						editorService,
						notificationService,
						bulkEditService,
						callbacks?.openEditor,
					);
					return;
				}

				// "Create new hook config file" was selected
				step = Step.SelectFolder;
				break;
			}

			case Step.SelectFolder: {
				// Get source folders for hooks
				const allFolders = await promptsService.getSourceFolders(PromptsType.hook);
				const localFolders = allFolders.filter(f => f.storage === PromptsStorage.local);

				if (localFolders.length === 0) {
					picker.hide();
					notificationService.error(localize('commands.hook.noLocalFolders', "Please open a workspace folder to configure hooks."));
					return;
				}

				// Auto-select if only one folder, otherwise show picker
				selectedFolder = localFolders[0];
				if (localFolders.length > 1) {
					const folderItems = localFolders.map(folder => ({
						label: labelService.getUriLabel(folder.uri, { relative: true }),
						folder
					}));

					picker.items = folderItems;
					picker.value = '';
					picker.placeholder = localize('commands.hook.selectFolder.placeholder', 'Select a location for the hook file');
					picker.title = localize('commands.hook.selectFolder.title', 'Hook File Location');
					picker.buttons = [backButton];

					const result = await awaitPick<typeof folderItems[0]>(picker, backButton);

					if (result === 'back') {
						step = goBack() ?? Step.SelectFile;
						break;
					}
					if (!result) {
						picker.hide();
						return;
					}
					selectedFolder = result.folder;
					stepHistory.push(Step.SelectFolder);
				}

				step = Step.EnterFilename;
				break;
			}

			case Step.EnterFilename: {
				// Hide the picker and show an input box for the filename
				suppressHideDispose = true;
				picker.hide();
				suppressHideDispose = false;

				const fileNameResult = await new Promise<string | 'back' | undefined>(resolve => {
					let resolved = false;
					const done = (value: string | 'back' | undefined) => {
						if (!resolved) {
							resolved = true;
							inputDisposables.dispose();
							resolve(value);
						}
					};
					const inputDisposables = new DisposableStore();
					const inputBox = inputDisposables.add(quickInputService.createInputBox());
					inputBox.prompt = localize('commands.hook.filename.prompt', "Enter hook file name");
					inputBox.placeholder = localize('commands.hook.filename.placeholder', "e.g., hooks, diagnostics, security");
					inputBox.title = localize('commands.hook.filename.title', "Hook File Name");
					inputBox.buttons = [backButton];
					inputBox.ignoreFocusOut = true;

					inputDisposables.add(inputBox.onDidAccept(async () => {
						const value = inputBox.value;
						if (!value || !value.trim()) {
							inputBox.validationMessage = localize('commands.hook.filename.required', "File name is required");
							return;
						}
						const name = value.trim();
						if (/[/\\:*?"<>|]/.test(name)) {
							inputBox.validationMessage = localize('commands.hook.filename.invalidChars', "File name contains invalid characters");
							return;
						}
						done(name);
					}));
					inputDisposables.add(inputBox.onDidChangeValue(() => {
						inputBox.validationMessage = undefined;
					}));
					inputDisposables.add(inputBox.onDidTriggerButton(button => {
						if (button === backButton) {
							done('back');
						}
					}));
					inputDisposables.add(inputBox.onDidHide(() => {
						done(undefined);
					}));
					inputBox.show();
				});

				if (fileNameResult === 'back') {
					// Re-show the picker for the previous step
					picker.show();
					step = goBack() ?? Step.SelectFolder;
					break;
				}
				if (!fileNameResult) {
					store.dispose();
					return;
				}

				// Create the hooks folder if it doesn't exist
				await fileService.createFolder(selectedFolder!.uri);

				// Use user-provided filename with .json extension
				const hookFileName = fileNameResult.endsWith('.json') ? fileNameResult : `${fileNameResult}.json`;
				const hookFileUri = URI.joinPath(selectedFolder!.uri, hookFileName);

				// Check if file already exists
				if (await fileService.exists(hookFileUri)) {
					// File exists - add hook to it instead of creating new
					store.dispose();
					await addHookToFile(
						hookFileUri,
						selectedHookType!.hookType.id as HookType,
						fileService,
						editorService,
						notificationService,
						bulkEditService,
						callbacks?.openEditor,
					);
					return;
				}

				// Detect if new file is a Claude hooks file based on its path
				const newFileFormat = getHookSourceFormat(hookFileUri);
				const isClaudeNewFile = newFileFormat === HookSourceFormat.Claude;
				const hookTypeKey = isClaudeNewFile
					? (getClaudeHookTypeName(selectedHookType!.hookType.id as HookType) ?? selectedHookType!.hookType.id)
					: selectedHookType!.hookType.id;
				const newFileHookEntry = buildNewHookEntry(newFileFormat);

				// Create new hook file with the selected hook type
				const hooksContent = {
					hooks: {
						[hookTypeKey]: [
							newFileHookEntry
						]
					}
				};

				const jsonContent = JSON.stringify(hooksContent, null, '\t');
				await fileService.writeFile(hookFileUri, VSBuffer.fromString(jsonContent));

				callbacks?.onHookFileCreated?.(hookFileUri);

				// Find the selection for the new hook's command field
				const selection = findHookCommandSelection(jsonContent, hookTypeKey, 0, 'command');

				// Open editor with selection
				store.dispose();
				if (callbacks?.openEditor) {
					await callbacks.openEditor(hookFileUri, { selection });
				} else {
					await editorService.openEditor({
						resource: hookFileUri,
						options: {
							selection,
							pinned: false
						}
					});
				}
				return;
			}
		}
	}
}

class ManageHooksAction extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_HOOKS_ACTION_ID,
			title: localize2('configure-hooks', "Configure Hooks..."),
			shortTitle: localize2('configure-hooks.short', "Hooks"),
			icon: Codicon.zap,
			f1: true,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			menu: {
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
				order: 12,
				group: '1_level'
			}
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		return showConfigureHooksQuickPick(accessor);
	}
}

/**
 * Helper to register the `Manage Hooks` action.
 */
export function registerHookActions(): void {
	registerAction2(ManageHooksAction);
}
