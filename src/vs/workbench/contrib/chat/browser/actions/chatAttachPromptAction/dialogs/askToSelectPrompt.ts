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
import { isLinux, isWindows } from '../../../../../../../base/common/platform.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
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
	readonly quickInputService: IQuickInputService;
}

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

	// a sanity check - this function must be used only if there are prompt files to show
	assert(
		promptFiles.length > 0,
		'Prompt files list must not be empty.',
	);

	const fileOptions = promptFiles.map((promptFile) => {
		return createPickItem(promptFile, labelService);
	});


	// if a resource is provided, create an `activeItem` for it to pre-select
	// it in the UI, and sort the list so the active item appears at the top
	let activeItem: WithUriValue<IQuickPickItem> | undefined;
	if (resource) {
		activeItem = fileOptions.find((file) => {
			return extUri.isEqual(file.value, resource);
		});

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

	// otherwise show the prompt file selection dialog
	const { viewsService } = options;

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
			lastActiveWidget = await getChatWidgetObject(
				options,
				quickPick.keyMods.alt,
				viewsService,
			);

			for (const selectedItem of quickPick.selectedItems) {
				lastActiveWidget
					.attachmentModel
					.promptInstructions
					.add(selectedItem.value);
			}

			// if user submitted their selection, close the dialog
			if (!event.inBackground) {
				return disposables.dispose();
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
	{ uri }: IPromptPath,
	labelService: ILabelService,
): WithUriValue<IQuickPickItem> => {
	const fileWithoutExtension = getCleanPromptName(uri);

	return {
		type: 'item',
		label: fileWithoutExtension,
		description: labelService.getUriLabel(dirname(uri), { relative: true }),
		tooltip: uri.fsPath,
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

	// if no widget reference is provided, add the note about
	// the `alt`/`option` key modifier users can use
	if (!widget) {
		const key = (isWindows || isLinux) ? 'alt' : 'option';

		text += ' ' + localize(
			'commands.prompts.use.select-dialog.alt-modifier-note',
			'(hold `{0}` to use in Edits)',
			key,
		);
	}

	return text;
};

/**
 * Gets a chat widget based on the provided {@link IChatAttachPromptActionOptions.widget widget}
 * reference. If no widget reference is provided, the function will reveal a `chat panel` by default
 * (either a last focused, or a new one), but if the {@link altOption} is set to `true`, a `chat edits`
 * panel will be revealed instead (likewise either a last focused, or a new one).
 */
const getChatWidgetObject = async (
	options: IChatAttachPromptActionOptions,
	altOption: boolean,
	viewsService: IViewsService,
): Promise<IChatWidget> => {
	const { widget } = options;

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
