/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParseError, parse as parseJSONC } from '../../../../../base/common/json.js';
import { setProperty, applyEdits } from '../../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../../base/common/jsonFormatter.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { getAgentHookMetadata, getValidAgentHookNames, HookType } from '../../common/promptSyntax/hookTypes.js';
import { toHookType } from '../../common/promptSyntax/hookSchema.js';
import { resolveCopilotCliHookType } from '../../common/promptSyntax/hookCopilotCliCompat.js';
import { buildNewCopilotHookFile, buildNewHookEntry, HookSourceFormat } from '../../common/promptSyntax/hookCompatibility.js';
import { ITextEditorSelection } from '../../../../../platform/editor/common/editor.js';
import { findHookCommandSelection, listHookFiles } from './hookUtils.js';
import { findRepositoryRoot } from '../../common/promptSyntax/utils/repositoryRoot.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ICopilotHomeService } from '../../../../services/environment/common/copilotHomeService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { isPromptTypeBlocked, StrictPluginOnlyCustomization } from '../../common/customizationLockdown.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { HOOKS_SOURCE_FOLDER } from '../../common/promptSyntax/config/promptFileLocations.js';

/**
 * Action ID for the `Configure Hooks` action.
 */
const CONFIGURE_HOOKS_ACTION_ID = 'workbench.action.chat.configure.hooks';

/**
 * Folder under the Copilot home (`COPILOT_HOME`, or `~/.copilot` by default) that the Copilot runtime loads user hooks from.
 */
const USER_HOOKS_FOLDER = 'hooks';

const INVALID_FILE_NAME_CHARACTERS = /[/\\:*?"<>|]/;

/**
 * Why hook files can't be created, when an organization's policy blocks them.
 * - `organizationOnly`: only hooks the organization provides load.
 * - `pluginOnly`: only hooks supplied by plugins load.
 */
export type HookFilesPolicyBlock = 'organizationOnly' | 'pluginOnly';

/**
 * Returns whether policy blocks hook files, using the same settings that stop hook files from loading.
 */
export function getHookFilesPolicyBlock(configurationService: Pick<IConfigurationService, 'getValue'>): HookFilesPolicyBlock | undefined {
	if (configurationService.getValue<boolean>(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true) {
		return 'organizationOnly';
	}
	if (isPromptTypeBlocked(configurationService.getValue<StrictPluginOnlyCustomization>(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG), PromptsType.hook)) {
		return 'pluginOnly';
	}
	return undefined;
}

/**
 * The folder the Copilot runtime loads hooks from for the given storage: `.github/hooks` at the
 * root of the git repository that contains `projectRoot` (or `projectRoot` itself when it isn't in
 * one, as found by {@link findRepositoryRoot}), or the `hooks` folder of the Copilot home for user hooks.
 */
export async function getCopilotHooksFolder(fileService: Pick<IFileService, 'stat'>, userHome: URI, copilotHome: URI, storage: PromptsStorage.local | PromptsStorage.user, projectRoot: URI | undefined): Promise<URI | undefined> {
	if (storage === PromptsStorage.user) {
		return joinPath(copilotHome, USER_HOOKS_FOLDER);
	}
	if (!projectRoot) {
		return undefined;
	}
	const repositoryRoot = await findRepositoryRoot(fileService, projectRoot, userHome) ?? projectRoot;
	return joinPath(repositoryRoot, HOOKS_SOURCE_FOLDER);
}

/**
 * Result of {@link addCopilotHookToText}:
 * - `added`: the new hook's file content, and the index of its command for selection.
 * - `invalid`: the content isn't a hook file that can be edited safely.
 * - `conflictingEventName`: the file already has hooks for the same event under another name, such as
 *   `PreToolUse` for `preToolUse`. VS Code reads only one of the two, so adding would hide existing hooks.
 */
export type AddCopilotHookResult =
	| { readonly kind: 'added'; readonly text: string; readonly commandIndex: number }
	| { readonly kind: 'invalid' }
	| { readonly kind: 'conflictingEventName'; readonly existingEventName: string };

/**
 * Adds an empty command hook for the Copilot event `eventName` to the hook file content `text`,
 * keeping its comments and formatting.
 */
export function addCopilotHookToText(text: string, eventName: string): AddCopilotHookResult {
	const errors: ParseError[] = [];
	const json: unknown = parseJSONC(text, errors, { allowTrailingComma: true });
	if (errors.length || !isObject(json)) {
		return { kind: 'invalid' };
	}
	const hooks = json.hooks;
	if (hooks !== undefined && !isObject(hooks)) {
		return { kind: 'invalid' };
	}
	const existing = hooks?.[eventName];
	if (existing !== undefined && !Array.isArray(existing)) {
		return { kind: 'invalid' };
	}
	const hookType = toKnownHookType(eventName);
	const existingEventName = hookType && Object.keys(hooks ?? {}).find(key => key !== eventName && toKnownHookType(key) === hookType);
	if (existingEventName) {
		return { kind: 'conflictingEventName', existingEventName };
	}
	const entries: unknown[] = existing ?? [];
	// Count commands the way `findHookCommandSelection` does, so the new command can be selected.
	let commandIndex = 0;
	for (const entry of entries) {
		if (isObject(entry)) {
			commandIndex += Array.isArray(entry.hooks) ? entry.hooks.length : 1;
		}
	}
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const formattingOptions: FormattingOptions = { tabSize: 1, insertSpaces: false, eol };
	const edits = setProperty(text, ['hooks', eventName, entries.length], buildNewHookEntry(HookSourceFormat.Copilot), formattingOptions);
	return { kind: 'added', text: applyEdits(text, edits), commandIndex };
}

/** Maps an event name to the event VS Code reads it as, the same way `parseCopilotHooks` does. */
function toKnownHookType(eventName: string): HookType | undefined {
	return resolveCopilotCliHookType(eventName) ?? toHookType(eventName);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Options for {@link createCopilotHook}.
 */
export interface ICreateCopilotHookOptions {
	/** Whether to create a workspace hook or a user hook. */
	readonly storage: PromptsStorage.local | PromptsStorage.user;
	/** The workspace folder a workspace hook is for. */
	readonly projectRoot: URI | undefined;
	/** Opens the hook file, selecting the new hook's command. */
	readonly openEditor: (resource: URI, selection: ITextEditorSelection | undefined) => Promise<void>;
}

interface IHookEventQuickPickItem extends IQuickPickItem {
	readonly eventName: string;
}

interface IHookFileQuickPickItem extends IQuickPickItem {
	readonly resource: URI | undefined;
}

/**
 * Creates a hook in the Copilot format, in a folder the Copilot runtime loads hooks from.
 * The user chooses the event, then an existing hook file in that folder or the name of a new one.
 */
export async function createCopilotHook(accessor: ServicesAccessor, options: ICreateCopilotHookOptions): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const notificationService = accessor.get(INotificationService);
	const quickInputService = accessor.get(IQuickInputService);
	const fileService = accessor.get(IFileService);
	const pathService = accessor.get(IPathService);
	const copilotHomeService = accessor.get(ICopilotHomeService);
	const textModelService = accessor.get(ITextModelService);
	const textFileService = accessor.get(ITextFileService);
	const labelService = accessor.get(ILabelService);

	if (notifyIfHookFilesBlocked(configurationService, notificationService)) {
		return;
	}

	const eventName = await pickHookEvent(quickInputService);
	if (!eventName) {
		return;
	}

	const folder = await getCopilotHooksFolder(fileService, await pathService.userHome(), copilotHomeService.home, options.storage, options.projectRoot);
	if (!folder) {
		notificationService.info(localize('newHook.noFolder', "Open a folder to create a workspace hook."));
		return;
	}

	let resource = await pickHookFile(quickInputService, fileService, labelService, folder);
	if (!resource) {
		return;
	}

	if (await fileService.exists(resource)) {
		const result = await addHookToExistingFile(textModelService, textFileService, resource, eventName);
		if (result.kind === 'added') {
			return options.openEditor(resource, findHookCommandSelection(result.text, eventName, result.commandIndex, 'command'));
		}
		if (result.kind === 'invalid') {
			notificationService.error(localize('newHook.parseError', "Couldn't add a hook to {0}. Fix the errors in the file and try again.", basename(resource)));
			return options.openEditor(resource, undefined);
		}
		notificationService.info(localize('newHook.conflictingEventName', "{0} already has {1} hooks in an older format. Add the {2} hook to a new file instead.", basename(resource), result.existingEventName, eventName));
		resource = await pickNewHookFileName(quickInputService, labelService, folder, await listHookFiles(fileService, folder));
		if (!resource) {
			return;
		}
	}
	await options.openEditor(resource, await createHookFile(fileService, resource, eventName));
}

/**
 * Tells the user when policy blocks hook files, and returns whether it does.
 */
function notifyIfHookFilesBlocked(configurationService: IConfigurationService, notificationService: INotificationService): boolean {
	const policyBlock = getHookFilesPolicyBlock(configurationService);
	if (policyBlock) {
		notificationService.info(policyBlock === 'organizationOnly'
			? localize('newHook.organizationOnly', "Your organization only allows hooks it provides, so you can't create a hook file.")
			: localize('newHook.pluginOnly', "Your organization only allows hooks from plugins, so you can't create a hook file."));
	}
	return policyBlock !== undefined;
}

/**
 * Asks the user which Copilot event the hook runs on.
 */
async function pickHookEvent(quickInputService: IQuickInputService): Promise<string | undefined> {
	const eventItems: IHookEventQuickPickItem[] = getValidAgentHookNames(Target.GitHubCopilot, false).map(eventName => {
		const metadata = getAgentHookMetadata(Target.GitHubCopilot, eventName);
		return { eventName, label: metadata?.label ?? eventName, description: eventName, detail: metadata?.description };
	});
	const eventItem = await quickInputService.pick(eventItems, {
		title: localize('newHook.event.title', "New Hook"),
		placeHolder: localize('newHook.event.placeholder', "Select when the hook runs"),
		matchOnDescription: true,
	});
	return eventItem?.eventName;
}

/**
 * Adds an empty command hook for `eventName` to an existing hook file through its text model, so
 * unsaved changes in an open editor are kept. A file without unsaved changes is saved afterwards.
 */
async function addHookToExistingFile(textModelService: ITextModelService, textFileService: ITextFileService, resource: URI, eventName: string): Promise<AddCopilotHookResult> {
	const reference = await textModelService.createModelReference(resource);
	try {
		const model = reference.object.textEditorModel;
		const wasDirty = textFileService.isDirty(resource);
		const result = addCopilotHookToText(model.getValue(), eventName);
		if (result.kind !== 'added') {
			return result;
		}
		model.pushEditOperations([], [{ range: model.getFullModelRange(), text: result.text }], () => null);
		if (!wasDirty) {
			await textFileService.save(resource);
		}
		return result;
	} finally {
		reference.dispose();
	}
}

/**
 * Creates a Copilot-format hook file with an empty command hook for `eventName`, and returns the
 * selection of that command.
 */
async function createHookFile(fileService: IFileService, resource: URI, eventName: string): Promise<ITextEditorSelection | undefined> {
	const text = JSON.stringify(buildNewCopilotHookFile(eventName), null, '\t');
	await fileService.createFile(resource, VSBuffer.fromString(text));
	return findHookCommandSelection(text, eventName, 0, 'command');
}

async function pickHookFile(quickInputService: IQuickInputService, fileService: IFileService, labelService: ILabelService, folder: URI): Promise<URI | undefined> {
	const existingFiles = await listHookFiles(fileService, folder);
	if (existingFiles.length) {
		const items: IHookFileQuickPickItem[] = [
			{ resource: undefined, label: localize('newHook.file.new', "New Hook File...") },
			...existingFiles.map(resource => ({ resource, label: basename(resource), description: localize('newHook.file.existing', "Add to this file") })),
		];
		const item = await quickInputService.pick(items, {
			title: localize('newHook.file.title', "New Hook"),
			placeHolder: localize('newHook.file.placeholder', "Select a hook file in {0}", labelService.getUriLabel(folder)),
		});
		if (!item) {
			return undefined;
		}
		if (item.resource) {
			return item.resource;
		}
	}
	return pickNewHookFileName(quickInputService, labelService, folder, existingFiles);
}

async function pickNewHookFileName(quickInputService: IQuickInputService, labelService: ILabelService, folder: URI, existingFiles: readonly URI[]): Promise<URI | undefined> {
	const defaultName = existingFiles.some(resource => basename(resource).toLowerCase() === 'hooks.json') ? '' : 'hooks';
	const name = await quickInputService.input({
		title: localize('newHook.name.title', "New Hook"),
		prompt: localize('newHook.name.prompt', "Name of the new hook file in {0}", labelService.getUriLabel(folder)),
		value: defaultName,
		validateInput: async value => {
			const fileName = toHookFileName(value);
			if (!fileName) {
				return localize('newHook.name.empty', "Enter a file name.");
			}
			if (INVALID_FILE_NAME_CHARACTERS.test(fileName)) {
				return localize('newHook.name.invalid', "The file name can't contain any of these characters: / \\ : * ? \" < > |");
			}
			if (existingFiles.some(resource => basename(resource).toLowerCase() === fileName.toLowerCase())) {
				return localize('newHook.name.exists', "A hook file named {0} already exists.", fileName);
			}
			return undefined;
		},
	});
	const fileName = name === undefined ? undefined : toHookFileName(name);
	return fileName ? joinPath(folder, fileName) : undefined;
}

function toHookFileName(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}
	return trimmed.toLowerCase().endsWith('.json') ? trimmed : `${trimmed}.json`;
}

/**
 * Opens the Hooks section of Chat Customizations, which is where hooks are managed.
 */
class ManageHooksAction extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_HOOKS_ACTION_ID,
			title: localize2('configure-hooks', "Configure Hooks..."),
			shortTitle: localize2('configure-hooks.short', "Hooks"),
			icon: Codicon.zap,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsPhoneLayoutContext.negate()),
			category: CHAT_CATEGORY
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		await accessor.get(ICommandService).executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Hooks);
	}
}

/**
 * Helper to register the `Manage Hooks` action.
 */
export function registerHookActions(): DisposableStore {
	const store = new DisposableStore();
	store.add(registerAction2(ManageHooksAction));

	return store;
}
