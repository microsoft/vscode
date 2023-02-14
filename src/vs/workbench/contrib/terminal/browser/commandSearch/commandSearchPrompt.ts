/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
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
	query(request: ICommandSearchRequest): Promise<string[]>;
}

export interface ICommandSearchRequest {
	/**
	 * An ID unique to the current search, this is shared between the initial prompt request and all
	 * subsequent refine requests.
	 */
	threadId: number;
	/**
	 * The terminal instance the request is for.
	 */
	instance: ITerminalInstance;
	/**
	 * The user's prompt text.
	 */
	prompt: string;
}

let nextRequestId = 1;

export async function showCommandSearchPrompt(
	accessor: ServicesAccessor,
	instance: ITerminalInstance,
	commandSearchProvider: ICommandSearchProvider,
): Promise<ICommandSearchResult | undefined> {
	const xterm = instance.xterm;
	if (!xterm) {
		return undefined;
	}

	const store = new DisposableStore();
	const viewZone = await xterm.viewZoneAddon.insert();
	const result = await new Promise<ICommandSearchResult | undefined>(r => {
		// Keep the view zone around unless xterm.js is focused
		store.add(Event.once(instance.onDidFocus)(() => r(undefined)));
		store.add(Event.once(viewZone.onRender)(e => {
			e.style.background = '#3C3D3B';
			e.style.fontFamily = 'Hack';
			e.classList.add('xterm-view-zone');
			const message = document.createElement('div');
			message.style.fontFamily = 'Hack';
			const input = document.createElement('input');
			input.type = 'text';
			input.placeholder = localize('prompt', 'Ask me anything...');
			input.style.background = 'transparent';
			const threadId = nextRequestId++;
			e.addEventListener('keydown', async (e: KeyboardEvent) => {
				switch (e.key) {
					case 'Enter': {
						const prompt = input.value;
						input.value = '';

						if (prompt === '') {
							if (message.textContent === null) {
								r(undefined);
							} else {
								r({
									command: message.textContent,
									execute: !e.altKey
								});
							}
							return;
						}

						const results = await commandSearchProvider.query({ threadId, instance, prompt });
						if (results.length === 0) {
							// TODO: How to handle no results?
							message.textContent = '';
						} else {
							// TODO: Handle multiple results
							message.textContent = results[0];
						}
						input.placeholder = localize('refine', 'Press enter to run or type to clarify...');
						break;
					}
					case 'Escape':
						r(undefined);
						break;
				}
			});

			e.append(message, input);
			input.focus();
		}));
	});

	// Clean up, focus and return
	store.dispose();
	viewZone.dispose();
	instance.focus();
	return result;
}
