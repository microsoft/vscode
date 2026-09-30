/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatPetPage, IChatPetPageHost } from '../../browser/chatPetListPage.js';
import { ChatPetMovePoses, IChatPetMove, parseChatPetMove } from '../../browser/chatPetMoves.js';
import { ChatPetService, IChatPetService } from '../../browser/chatPetService.js';
import { IChatPetWidgetService } from '../../browser/widget/chatPetWidgetService.js';

/** A two-frame move under `name`, for tests of the pet's pages. */
export function createTestChatPetMove(name: string, about = ''): IChatPetMove {
	return parseChatPetMove(`name: ${name}\n${about ? `about: ${about}\n` : ''}loop: no\n\nframe 200\n${ChatPetMovePoses.idle.join('\n')}\n\nframe 300\n${ChatPetMovePoses.crouch.join('\n')}\n`);
}

export interface IChatPetPageHarness {
	readonly parent: HTMLElement;
	readonly instantiationService: TestInstantiationService;
	readonly chatPetService: ChatPetService;
	readonly host: IChatPetPageHost;
	/** Commands the page ran, such as opening pets.md. */
	readonly commands: { readonly id: string; readonly args: unknown }[];
	readonly copied: string[];
	readonly clipboard: { text: string };
	/** What the page asked the pet to play. */
	readonly played: string[];
	/** Pages the host was asked to show, as `page:selection`; a new interaction asked for as `newInteraction:sprite`. */
	readonly shown: string[];
	readonly closed: () => number;
}

/** The services a page of the pet's modal needs, with the pet, the clipboard and pets.md stood in for. */
export function createChatPetPageHarness(store: DisposableStore): IChatPetPageHarness {
	const parent = mainWindow.document.createElement('div');
	parent.style.width = '900px';
	parent.style.height = '600px';
	mainWindow.document.body.appendChild(parent);
	store.add(toDisposable(() => parent.remove()));
	const instantiationService = workbenchInstantiationService({}, store);
	const chatPetService = store.add(new ChatPetService(store.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
	instantiationService.stub(IChatPetService, chatPetService);
	const commands: { readonly id: string; readonly args: unknown }[] = [];
	instantiationService.stub(ICommandService, {
		executeCommand: async (id: string, args: unknown) => { commands.push({ id, args }); return undefined; },
		onWillExecuteCommand: Event.None,
		onDidExecuteCommand: Event.None,
	});
	const copied: string[] = [];
	const clipboard = { text: '' };
	instantiationService.stub(IClipboardService, new class extends mock<IClipboardService>() {
		override async writeText(text: string): Promise<void> {
			copied.push(text);
		}
		override async readText(): Promise<string> {
			return clipboard.text;
		}
	}());
	const played: string[] = [];
	instantiationService.stub(IChatPetWidgetService, new class extends mock<IChatPetWidgetService>() {
		override playReaction(name: string): boolean {
			played.push(name);
			return name !== 'unplayable';
		}
	}());
	instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() { }());
	const shown: string[] = [];
	let closed = 0;
	const host: IChatPetPageHost = {
		showPage: (page: ChatPetPage, selection?: string) => shown.push(selection ? `${page}:${selection}` : page),
		newInteraction: (play: string) => shown.push(`newInteraction:${play}`),
		close: () => closed++,
	};
	return { parent, instantiationService, chatPetService, host, commands, copied, clipboard, played, shown, closed: () => closed };
}

export const CHAT_PET_PAGE_TEST_DIMENSION = new Dimension(900, 600);

/** The list's rows as `title: summary`, headers as `# label`; off rows end in `(off)`. */
export function getChatPetPageRows(parent: HTMLElement): string[] {
	return Array.from(parent.querySelectorAll<HTMLElement>('.monaco-list-row')).map(row => {
		const header = row.querySelector('.chat-pet-interaction-header');
		if (header) {
			return `# ${header.textContent}`;
		}
		const item = row.querySelector('.chat-pet-interaction-row');
		return `${row.querySelector('.chat-pet-interaction-name')?.textContent}: ${row.querySelector('.chat-pet-interaction-row-summary')?.textContent}${item?.classList.contains('off') ? ' (off)' : ''}${item?.classList.contains('placeholder') ? ' (placeholder)' : ''}`;
	});
}

export function getChatPetPageSelectedRow(parent: HTMLElement): string | undefined {
	return parent.querySelector('.monaco-list-row.selected .chat-pet-interaction-name')?.textContent ?? undefined;
}

/** What the detail pane offers: its buttons, the entries of its list, `(off)` when turned off, and whether its stage shows a sprite. */
export function getChatPetPageDetail(parent: HTMLElement) {
	return {
		actions: Array.from(parent.querySelectorAll('.chat-pet-interaction-actions .monaco-button')).map(button => button.textContent),
		entries: Array.from(parent.querySelectorAll('.chat-pet-interaction-pool-entry')).map(entry => `${entry.querySelector('.chat-pet-interaction-pool-label .monaco-link')?.textContent}${entry.classList.contains('off') ? ' (off)' : ''}${entry.querySelector(':scope > .monaco-button') ? ` [${entry.querySelector(':scope > .monaco-button')?.textContent}]` : ''}`),
		listButtons: Array.from(parent.querySelectorAll('.chat-pet-interaction-pool > .monaco-button')).map(button => button.textContent),
		stage: parent.querySelector('.chat-pet-interaction-stage canvas') ? 'canvas' : parent.querySelector('.chat-pet-interaction-stage.empty') ? 'empty' : undefined,
	};
}

/** The reaction form, if one is open: its title, the fields shown, what its choices and fixed fields say, and its buttons. */
export function getChatPetPageForm(parent: HTMLElement) {
	const element = parent.querySelector<HTMLElement>('.chat-pet-trigger-form');
	return element ? {
		title: element.querySelector('h4')?.textContent,
		fields: Array.from(element.querySelectorAll<HTMLElement>('.chat-pet-trigger-field:not(.hidden) .chat-pet-trigger-field-label')).map(label => label.textContent),
		values: Array.from(element.querySelectorAll<HTMLElement>('.chat-pet-trigger-field:not(.hidden) .chat-pet-trigger-field-control')).map(control => control.querySelector('.chat-pet-choice') ? getChatPetChoice(control)?.value : control.querySelector('.chat-pet-trigger-field-value')?.textContent ?? control.querySelector<HTMLInputElement>('input')?.value),
		/** How many options each choice offers, in order. */
		options: Array.from(element.querySelectorAll<HTMLElement>('.chat-pet-choice')).map(choice => choice.querySelectorAll('.chat-pet-choice-option').length),
		error: element.querySelector('.chat-pet-trigger-form-error:not(.hidden)')?.textContent,
		buttons: Array.from(element.querySelectorAll('.chat-pet-trigger-form-actions .monaco-button')).map(button => button.textContent),
	} : undefined;
}

/** A choice of tiles or chips under `container`: what is chosen, and everything offered, by label. */
function getChatPetChoice(container: ParentNode): { readonly value: string | undefined; readonly options: string[]; readonly groups: string[] } | undefined {
	const choice = container.querySelector<HTMLElement>('.chat-pet-choice');
	return choice ? {
		value: choice.querySelector('.chat-pet-choice-option[aria-selected="true"] .chat-pet-choice-label')?.textContent ?? undefined,
		options: Array.from(choice.querySelectorAll('.chat-pet-choice-option .chat-pet-choice-label')).map(label => label.textContent ?? ''),
		groups: Array.from(choice.querySelectorAll('.chat-pet-choice-group-label')).map(label => label.textContent ?? ''),
	} : undefined;
}

/** Chooses the option labelled `text` in the choice under `container`, as a click does. */
function clickChatPetChoiceOption(container: ParentNode | null | undefined, name: string, text: string): void {
	const option = Array.from(container?.querySelectorAll<HTMLElement>('.chat-pet-choice-option') ?? []).find(candidate => candidate.querySelector('.chat-pet-choice-label')?.textContent === text);
	assert.ok(option, `${text} in ${name}`);
	option.click();
}

export function clickChatPetPageButton(parent: HTMLElement, selector: string, label: string): void {
	const found = Array.from(parent.querySelectorAll<HTMLElement>(`${selector} .monaco-button`)).find(candidate => candidate.textContent === label);
	assert.ok(found, `${label} button`);
	found.click();
}

export function clickChatPetPageRow(parent: HTMLElement, title: string): void {
	const row = Array.from(parent.querySelectorAll<HTMLElement>('.monaco-list-row')).find(candidate => candidate.querySelector('.chat-pet-interaction-name')?.textContent === title);
	assert.ok(row, `${title} row`);
	row.click();
}

/** Clicks the checkbox of the detail list's entry labelled `label`. */
export function toggleChatPetPageEntry(parent: HTMLElement, label: string): void {
	const entry = Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-interaction-pool-entry')).find(candidate => candidate.querySelector('.chat-pet-interaction-pool-label .monaco-link')?.textContent === label);
	const toggle = entry?.querySelector<HTMLElement>('.monaco-custom-toggle');
	assert.ok(toggle, `${label} toggle`);
	toggle.click();
}

export function clickChatPetPageEntryAction(parent: HTMLElement, label: string): void {
	const entry = Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-interaction-pool-entry')).find(candidate => candidate.querySelector('.chat-pet-interaction-pool-label .monaco-link')?.textContent === label);
	const button = entry?.querySelector<HTMLElement>(':scope > .monaco-button');
	assert.ok(button, `${label} action`);
	button.click();
}

export function clickChatPetPageLink(parent: HTMLElement, label: string): void {
	const link = Array.from(parent.querySelectorAll<HTMLElement>('.monaco-link')).find(candidate => candidate.textContent === label);
	assert.ok(link, `${label} link`);
	link.click();
}

export function typeChatPetPagePhrases(parent: HTMLElement, value: string): void {
	const input = parent.querySelector<HTMLInputElement>('.chat-pet-trigger-form .monaco-inputbox input');
	assert.ok(input, 'phrases input');
	input.value = value;
	input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
}

/** Chooses the option labelled `text` in the form's choice for `field`. */
export function chooseChatPetPageOption(parent: HTMLElement, field: string, text: string): void {
	const row = Array.from(parent.querySelectorAll<HTMLElement>('.chat-pet-trigger-field')).find(candidate => candidate.querySelector('.chat-pet-trigger-field-label')?.textContent === field);
	clickChatPetChoiceOption(row, `${field} choice`, text);
}

/** The tiles of an event that plays one sprite: what is chosen, everything offered, and the groups they come in. */
export function getChatPetPageSprite(parent: HTMLElement): { readonly value: string | undefined; readonly options: string[]; readonly groups: string[] } | undefined {
	const field = parent.querySelector<HTMLElement>('.chat-pet-interaction-sprite-field');
	return field ? getChatPetChoice(field) : undefined;
}

/** Chooses the tile labelled `text` for an event that plays one sprite. */
export function chooseChatPetPageSprite(parent: HTMLElement, text: string): void {
	clickChatPetChoiceOption(parent.querySelector<HTMLElement>('.chat-pet-interaction-sprite-field'), 'sprite tiles', text);
}

export function getChatPetPageNotice(parent: HTMLElement): string | undefined {
	return parent.querySelector('.chat-pet-interactions-notice:not(.hidden)')?.textContent ?? undefined;
}
