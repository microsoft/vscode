/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from './chatActions.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { assert } from '../../../../../base/common/assert.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { isLinux, isWindows } from '../../../../../base/common/platform.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { basename, dirname, extUri } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IChatWidget, IChatWidgetService, showChatView, showEditsView } from '../chat.js';
import { DOCUMENTATION_URL, PROMPT_FILE_EXTENSION } from '../../common/promptSyntax/constants.js';
import { ChatInstructionsFileLocator } from '../chatAttachmentModel/chatInstructionsFileLocator.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';

/**
 * Action ID for the `Attach Prompt` action.
 */
export const ATTACH_PROMPT_ACTION_ID = 'workbench.action.chat.attach.prompt';

/**
 * Options for the {@link showSelectPromptPicker} function.
 */
interface ISelectPromptOptions extends IChatAttachPromptActionOptions {
	labelService: ILabelService;
	openerService: IOpenerService;
	initService: IInstantiationService;
	quickInputService: IQuickInputService;
}

/**
 * Type for an object with its `value` property being a `URI`.
 */
type WithUriValue<T> = T & { value: URI };

/**
 * TODO: @legomushroom
 */
interface IPromptSelectionResult {
	/**
	 * TODO: @legomushroom
	 */
	selected: WithUriValue<IQuickPickItem>;
	/**
	 * TODO: @legomushroom
	 */
	altOption: boolean;
}

/**
 * TODO: @legomushroom
 */
const createPickItem = (
	file: URI,
	labelService: ILabelService,
): WithUriValue<IQuickPickItem> => {
	const fileBasename = basename(file);
	const fileWithoutExtension = fileBasename.replace(PROMPT_FILE_EXTENSION, '');

	return {
		type: 'item',
		label: fileWithoutExtension,
		description: labelService.getUriLabel(dirname(file), { relative: true }),
		tooltip: file.fsPath,
		value: file,
	};
};

/**
 * TODO: @legomushroom
 */
const createPickerPlaceholder = (location?: ChatAgentLocation): string => {
	let result = localize('selectPromptPlaceholder', 'Select a prompt to use');

	// if target chat location is the `EditingSession`, add a note to the placeholder
	if (location === ChatAgentLocation.EditingSession) {
		result += ' ' + localize('selectPromptPlaceholder.inEdits', 'in Edits');
	}

	// if no location is provided, add the `alt/option` key modifier note
	if (!location) {
		const key = (isWindows || isLinux) ? 'alt' : 'option';

		result += ' ' + localize('selectPromptPlaceholder.holdAltOption', '(hold `{0}` to use in Edits)', key);
	}

	return result;
};

/**
 * TODO: @legomushroom
 */
const showSelectPromptPicker = async (options: ISelectPromptOptions): Promise<IPromptSelectionResult | null> => {
	const { resource, initService, labelService } = options;
	const promptsLocator = initService.createInstance(ChatInstructionsFileLocator);

	// find all prompt instruction files in the user workspace
	// and present them to the user so they can select one
	const files = await promptsLocator.listFiles([])
		.then((files) => {
			return files.map((file) => {
				return createPickItem(file, labelService);
			});
		});

	const { quickInputService, openerService } = options;

	// if not prompt files found, render the "how to add" message
	// to the user with a link to the documentation
	if (files.length === 0) {
		const docsQuickPick: WithUriValue<IQuickPickItem> = {
			type: 'item',
			label: localize('noPromptFilesFoundTooltipLabel', 'Learn how to create reusable prompts'),
			description: DOCUMENTATION_URL,
			tooltip: DOCUMENTATION_URL,
			value: URI.parse(DOCUMENTATION_URL),
		};

		const result = await quickInputService.pick(
			[docsQuickPick],
			{
				placeHolder: localize('noPromptFilesFoundLabel', 'No prompts found.'),
				canPickMany: false,
			});

		if (!result) {
			return null;
		}

		await openerService.open(result.value);

		return null;
	}

	let activeItem: WithUriValue<IQuickPickItem> | undefined;
	if (resource) {
		files.sort((file1, file2) => {
			if (extUri.isEqual(file1.value, resource)) {
				return -1;
			}

			if (extUri.isEqual(file2.value, resource)) {
				return 1;
			}

			return 0;
		});

		activeItem = files.find((file) => {
			return extUri.isEqual(file.value, resource);
		});
	}

	// otherwise show the prompt file selection dialog
	const { location } = options;
	const pickOptions: IPickOptions<WithUriValue<IQuickPickItem>> = {
		placeHolder: createPickerPlaceholder(location),
		activeItem,
		canPickMany: false,
		matchOnDescription: true,
	};

	let altOption = false;
	if (!location) {
		pickOptions.onKeyMods = (keyMods) => {
			if (keyMods.alt) {
				altOption = true;
			}
		};
	}

	const maybeSelectedFile = await quickInputService.pick(files, pickOptions);

	if (!maybeSelectedFile) {
		return null;
	}

	return {
		selected: maybeSelectedFile,
		altOption,
	};
};

/**
 * TODO: @legomushroom
 */
const revealChatWidget = async (
	options: IChatAttachPromptActionOptions,
	altOption: boolean,
	viewsService: IViewsService,
	chatWidgetService: IChatWidgetService,
): Promise<IChatWidget | undefined> => {
	const { location } = options;

	// if no location is present, the command was triggered from outside of any
	// chat input, so we reveal a chat widget window based on the `alt/option`
	// key modifier state when a prompt was selected from the picker UI dialog
	if (!location) {
		return (altOption)
			? await showEditsView(viewsService)
			: await showChatView(viewsService);
	}

	const { lastFocusedWidget } = chatWidgetService;

	// if location is set, the last focused widged must always be set
	assertDefined(
		lastFocusedWidget,
		'Expected last focused chat widget reference to be present.',
	);

	// when location is set, the last focused widget must have the same one
	assert(
		lastFocusedWidget.location === location,
		`Last forcused chat widget location must be '${location}', got '${lastFocusedWidget.location}'.`,
	);

	return lastFocusedWidget;
};

/**
 * Options for the {@link AttachPromptAction} action.
 */
export interface IChatAttachPromptActionOptions {
	/**
	 * TODO: @legomushroom
	 */
	resource?: URI;
	/**
	 * TODO: @legomushroom
	 */
	location?: ChatAgentLocation;
}

/**
 * Action to attach a prompt to a chat widget input.
 */
export class AttachPromptAction extends Action2 {
	constructor() {
		super({
			id: ATTACH_PROMPT_ACTION_ID,
			title: localize2('workbench.action.chat.attach.prompt.label', "Use Prompt"),
			f1: false,
			category: CHAT_CATEGORY,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		options: IChatAttachPromptActionOptions,
	): Promise<void> {
		const labelService = accessor.get(ILabelService);
		const viewsService = accessor.get(IViewsService);
		const openerService = accessor.get(IOpenerService);
		const initService = accessor.get(IInstantiationService);
		const quickInputService = accessor.get(IQuickInputService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		const selectionResult = await showSelectPromptPicker({
			resource: options.resource,
			location: options.location,
			initService,
			labelService,
			quickInputService,
			openerService,
		});

		// no prompt selected, nothing to do
		if (!selectionResult) {
			return;
		}

		const { selected, altOption } = selectionResult;

		// reveal appropriate chat widget
		const widget = await revealChatWidget(options, altOption, viewsService, chatWidgetService);
		if (!widget || !widget.viewModel) {
			// TODO: @legomushroom - log an error here?
			return;
		}

		widget
			.attachmentModel
			.promptInstructions
			.add(selected.value);

		widget.focusInput();
	}
}
