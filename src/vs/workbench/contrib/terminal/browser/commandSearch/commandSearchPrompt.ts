/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

export interface ICommandSearchResult {
	/**
	 * The command result.
	 */
	command: string;
	/**
	 * Whether the command should be executed, as opposed to just entered.
	 */
	execute: boolean;
}

export interface ICommandSearchProvider {
	getPromptResults(request: ICommandSearchPromptRequest): Promise<string[]>;
	refineResults(request: ICommandSearchRefineRequest): Promise<string[]>;
}

export interface IBaseCommandSearchRequest {
	/**
	 * An ID unique to the current search, this is shared between the initial prompt request and all
	 * subsequent refine requests.
	 */
	id: number;
	/**
	 * The terminal instance the request is for.
	 */
	instance: ITerminalInstance;
}

export interface ICommandSearchPromptRequest extends IBaseCommandSearchRequest {
	/**
	 * The user's prompt text.
	 */
	prompt: string;
}

export interface ICommandSearchRefineRequest extends IBaseCommandSearchRequest {
	/**
	 * The user's refinement text.
	 */
	refineRequest: string;
}

let nextRequestId = 1;

export async function showCommandSearchPrompt(
	accessor: ServicesAccessor,
	instance: ITerminalInstance,
	commandSearchProvider: ICommandSearchProvider,
): Promise<ICommandSearchResult | undefined> {
	const quickInputService = accessor.get(IQuickInputService);

	// Get initial prompt
	const inputBox = quickInputService.createInputBox();
	inputBox.title = localize('commandSearchTitle', 'Command Search');
	inputBox.prompt = localize('commandSearchPrompt', 'Describe the command your want to run');
	inputBox.show();
	const prompt = await new Promise<string | undefined>(r => {
		inputBox.onDidAccept(() => r(inputBox.value));
		inputBox.onDidHide(() => r(undefined));
	});
	if (!prompt) {
		return undefined;
	}

	// Get prompt results
	const id = nextRequestId++;
	let results = await commandSearchProvider.getPromptResults({ id, instance, prompt });

	// Refine or accept
	while (true) {
		const refineOrAcceptPick = quickInputService.createQuickPick();
		const refineItem: IQuickPickItem = { label: 'Refine suggestion' };
		const allItems = results.map(e => ({ label: e })) as IQuickPickItem[];
		refineOrAcceptPick.items = allItems;
		refineOrAcceptPick.placeholder = 'Select a command to run or type to refine';
		refineOrAcceptPick.matchOnDescription = false;
		refineOrAcceptPick.matchOnLabel = false;
		refineOrAcceptPick.matchOnDetail = false;
		refineOrAcceptPick.onDidChangeValue(e => {
			refineOrAcceptPick.items = e.length ? [refineItem] : allItems;
		});
		refineOrAcceptPick.show();
		const value = await new Promise<ICommandSearchResult | { refineText: string } | undefined>(r => {
			refineOrAcceptPick.onDidAccept(() => {
				if (refineOrAcceptPick.value) {
					r({ refineText: refineOrAcceptPick.value });
				} else {
					r({
						command: refineOrAcceptPick.selectedItems[0].label,
						execute: !refineOrAcceptPick.keyMods.alt
					});
				}
			});
			refineOrAcceptPick.onDidHide(() => r(undefined));
		});
		// Cancel
		if (!value) {
			refineOrAcceptPick.hide();
			refineOrAcceptPick.dispose();
			return;
		}
		// Accept
		if ('command' in value) {
			refineOrAcceptPick.hide();
			refineOrAcceptPick.dispose();
			return value;
		}
		// Refine
		results = await commandSearchProvider.refineResults({ id, instance, refineRequest: value.refineText });
	}
}
