/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { IChatWidget, showChatView, showEditsView } from '../../../chat.js';
import { IChatAttachPromptActionOptions } from '../chatAttachPromptAction.js';
import { IPromptPath } from '../../../../common/promptSyntax/service/types.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { dirname, extUri } from '../../../../../../../base/common/resources.js';
import { DOCUMENTATION_URL } from '../../../../common/promptSyntax/constants.js';
import { isLinux, isWindows } from '../../../../../../../base/common/platform.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { assertDefined, WithUriValue } from '../../../../../../../base/common/types.js';
import { getCleanPromptName } from '../../../../../../../platform/prompts/common/constants.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Options for the {@link askToSelectPrompt} function.
 */
export interface ISelectPromptOptions {
	/**
	 * Prompt resource `URI` to attach to the chat input, if any.
	 * If provided the resource will be pre-selected in the prompt picker dialog,
	 * otherwise the dialog will show the prompts list without any pre-selection.
	 */
	readonly resource?: URI;

	/**
	 * Target chat widget reference to attach the prompt to. If not provided, the command
	 * attaches the prompt to a `chat panel` widget by default (either the last focused,
	 * or a new one). If the `alt` (`option` on mac) key was pressed when the prompt is
	 * selected, the `edits` widget is used instead (likewise, either the last focused,
	 * or a new one).
	 */
	readonly widget?: IChatWidget;

	/**
	 * List of prompt files to show in the selection dialog.
	 */
	readonly promptFiles: readonly IPromptPath[];

	readonly labelService: ILabelService;
	readonly viewsService: IViewsService;
	readonly openerService: IOpenerService;
	readonly quickInputService: IQuickInputService;
}

/**
 * A special quick pick item that links to the documentation.
 */
const DOCS_OPTION: WithUriValue<IQuickPickItem> = {
	type: 'item',
	label: localize(
		'commands.prompts.use.select-dialog.docs-label',
		'Learn how to create reusable prompts',
	),
	description: DOCUMENTATION_URL,
	tooltip: DOCUMENTATION_URL,
	value: URI.parse(DOCUMENTATION_URL),
};

/**
 * Shows the prompt selection dialog to the user that allows to select a prompt file(s).
 *
 * If {@link ISelectPromptOptions.resource resource} is provided, the dialog will have
 * the resource pre-selected in the prompts list.
 */
export const askToSelectPrompt = async (
	options: ISelectPromptOptions,
): Promise<void> => {
	const { promptFiles, resource, quickInputService, labelService } = options;

	const fileOptions = promptFiles.map((promptFile) => {
		return createPickItem(promptFile, labelService);
	});

	/**
	 * Add a link to the documentation to the end of prompts list.
	 */
	fileOptions.push(DOCS_OPTION);

	// if a resource is provided, create an `activeItem` for it to pre-select
	// it in the UI, and sort the list so the active item appears at the top
	let activeItem: WithUriValue<IQuickPickItem> | undefined;
	if (resource) {
		activeItem = fileOptions.find((file) => {
			return extUri.isEqual(file.value, resource);
		});

		// if no item for the `resource` was found, it means that the resource is not
		// in the list of prompt files, so add a new item for it; this ensures that
		// the currently active prompt file is always available in the selection dialog,
		// even if it is not included in the prompts list otherwise(from location setting)
		if (!activeItem) {
			activeItem = createPickItem({
				uri: resource,
				// "user" prompts are always registered in the prompts list, hence it
				// should be safe to assume that `resource` is not "user" prompt here
				type: 'local',
			}, labelService);
			fileOptions.push(activeItem);
		}

		fileOptions.sort((file1, file2) => {
			if (extUri.isEqual(file1.value, resource)) {
				return -1;
			}

			if (extUri.isEqual(file2.value, resource)) {
				return 1;
			}

			return 0;
		});
	}

	/**
	 * If still no active item present, fall back to the first item in the list.
	 * This can happen only if command was invoked not from a focused prompt file
	 * (hence the `resource` is not provided in the options).
	 *
	 * Fixes the two main cases:
	 *  - when no prompt files found it, pre-selects the documentation link
	 *  - when there is only a single prompt file, pre-selects it
	 */
	if (!activeItem) {
		activeItem = fileOptions[0];
	}

	// otherwise show the prompt file selection dialog
	const { openerService } = options;

	const quickPick = quickInputService.createQuickPick<WithUriValue<IQuickPickItem>>();
	quickPick.activeItems = activeItem ? [activeItem] : [];
	quickPick.placeholder = createPlaceholderText(options);
	quickPick.canAcceptInBackground = true;
	quickPick.matchOnDescription = true;
	quickPick.items = fileOptions;

	return await new Promise<void>(resolve => {
		const disposables = new DisposableStore();

		let lastActiveWidget = options.widget;
		disposables.add({
			dispose() {
				quickPick.dispose();
				resolve();

				// if something was attached, focus on the target chat input
				lastActiveWidget?.focusInput();
			},
		});

		disposables.add(quickPick.onDidAccept(async (event) => {
			const { selectedItems } = quickPick;
			const { alt, ctrlCmd } = quickPick.keyMods;

			// sanity check to confirm our expectations
			assert(
				selectedItems.length === 1,
				`Only one item can be accepted, got '${selectedItems.length}'.`,
			);

			// whether user selected the docs link option
			const docsSelected = (selectedItems[0] === DOCS_OPTION);

			// if `super` key was pressed, open the selected prompt file(s)
			if (ctrlCmd || docsSelected) {
				return await openFiles(selectedItems, openerService);
			}

			// otherwise attach the selected prompt to a chat input
			lastActiveWidget = await attachFiles(selectedItems, options, alt);

			// if user submitted their selection, close the dialog
			if (!event.inBackground) {
				disposables.dispose();
			}
		}));

		disposables.add(quickPick.onDidHide(
			disposables.dispose.bind(disposables),
		));

		quickPick.show();
	});
};

/**
 * Creates a quick pick item for a prompt.
 */
const createPickItem = (
	promptFile: IPromptPath,
	labelService: ILabelService,
): WithUriValue<IQuickPickItem> => {
	const { uri, type } = promptFile;
	const fileWithoutExtension = getCleanPromptName(uri);

	// if a "user" prompt, don't show its filesystem path in
	// the user interface, but do that for all the "local" ones
	const description = (type === 'user')
		? localize(
			'user-prompt.capitalized',
			'User prompt',
		)
		: labelService.getUriLabel(dirname(uri), { relative: true });

	const tooltip = (type === 'user')
		? description
		: uri.fsPath;

	return {
		type: 'item',
		label: fileWithoutExtension,
		description,
		tooltip,
		value: uri,
		id: uri.toString(),
	};
};

/**
 * Creates a placeholder text to show in the prompt selection dialog.
 */
const createPlaceholderText = (options: ISelectPromptOptions): string => {
	const { widget } = options;

	let text = localize(
		'commands.prompts.use.select-dialog.placeholder',
		'Select a prompt to use',
	);

	// if no widget reference is provided, add the note about `options`
	// and `cmd` modifiers users can use to alter the command behavior
	if (!widget) {
		const altOptionkey = (isWindows || isLinux) ? 'Alt' : 'Option';

		const altOptionModifierNote = localize(
			'commands.prompts.use.select-dialog.alt-modifier-note',
			'{0}-key to use in Edits',
			altOptionkey,
		);

		const cmdCtrlkey = (isWindows || isLinux) ? 'Ctrl' : 'Cmd';
		const superModifierNote = localize(
			'commands.prompts.use.select-dialog.super-modifier-note',
			'{0}-key to open in editor',
			cmdCtrlkey,
		);

		text += localize(
			'commands.prompts.use.select-dialog.modifier-notes',
			' (hold {0} or {1})',
			altOptionModifierNote,
			superModifierNote,
		);
	}

	return text;
};

/**
 * Opens provided files in the editor.
 */
const openFiles = async (
	files: readonly WithUriValue<IQuickPickItem>[],
	openerService: IOpenerService,
) => {
	for (const file of files) {
		await openerService.open(file.value);
	}
};

/**
 * Attaches provided files to a chat input.
 */
const attachFiles = async (
	files: readonly WithUriValue<IQuickPickItem>[],
	options: ISelectPromptOptions,
	altOption: boolean,
): Promise<IChatWidget> => {
	const widget = await getChatWidgetObject(options, altOption);

	for (const file of files) {
		widget
			.attachmentModel
			.promptInstructions
			.add(file.value);
	}

	return widget;
};

/**
 * Gets a chat widget based on the provided {@link IChatAttachPromptActionOptions.widget widget}
 * reference. If no widget reference is provided, the function will reveal a `chat panel` by default
 * (either a last focused, or a new one), but if the {@link altOption} is set to `true`, a `chat edits`
 * panel will be revealed instead (likewise either a last focused, or a new one).
 *
 * @throws if failed to reveal a chat widget.
 */
const getChatWidgetObject = async (
	options: IChatAttachPromptActionOptions,
	altOption: boolean,
): Promise<IChatWidget> => {
	const { widget, viewsService } = options;

	// if no widget reference is present, the command was triggered from outside of
	// an active chat input, so we reveal a chat widget window based on the `alt`
	// key modifier state when a prompt was selected from the picker UI dialog
	if (!widget) {
		const widget = (altOption)
			? await showEditsView(viewsService)
			: await showChatView(viewsService);

		assertDefined(
			widget,
			'Revealed chat widget must be defined.',
		);

		return widget;
	}

	return widget;
};
