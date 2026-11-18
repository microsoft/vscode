/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// What the user does in this window, as it happens: where they click, what they select, type,
	// copy and paste, which editor, chat session, browser page or terminal they work in. Local to
	// this machine; recorded only while an extension listens. https://github.com/juliagongms/vscode (nap/seams)

	/**
	 * The kind of a {@link UserActivityEvent}.
	 */
	export enum UserActivityKind {
		/** Keyboard focus moved to a part of the window: an editor, a view, the chat input, a terminal, a page. */
		Focus = 1,
		/** A click on an element of the window. `target.label` is what was clicked (the item it is in speaks for it: a row, a button); `context` the text of what frames it (a confirmation, a dialog, a row, a chat turn), when that says more. */
		Click = 2,
		/** Text selected in an editor, the chat input or a transcript. `text` is the selection, `context` the lines around it. */
		Selection = 3,
		/** Text typed into an editor, the chat input, a terminal or an input box, coalesced until a pause. `text` is what was typed, `context` the line or field as it now reads. In a document, when the edit stayed within the lines around where it began, `context` is those lines after it, `detail.before` the same lines before it and `detail.startLine` their first line; a deletion alone is recorded too. */
		Type = 4,
		/** Text copied. `text` is what was copied, `target` where from. */
		Copy = 5,
		/** Text cut. `text` is what was cut, `target` where from. */
		Cut = 6,
		/** Text pasted. `text` is what was pasted, `target` where to. */
		Paste = 7,
		/** A command ran, from a keybinding, a menu or the command palette. `text` is its id, `target.label` its title. */
		Command = 8,
		/** The active editor changed. `target` is the editor (a file, a diff, a browser page, a chat session). */
		OpenEditor = 9,
		/** The chat session the user works in changed. `target` is the session, `context` its latest exchange. */
		SessionSwitch = 10,
		/** The integrated browser navigated, changed title or got focus. `target.url` and `target.title`; `context` the page's visible text when it can be read. */
		Browser = 11,
		/** A terminal command finished. `text` is the command line, `context` the head and tail of its output, `detail.exitCode`. */
		Terminal = 12,
		/** The window gained or lost focus. `detail.focused`. */
		WindowFocus = 13,
		/** A search ran, in the search view or a find widget. `text` is the query. */
		Search = 14,
		/** Part of a document stayed in view in a focused editor for 15 seconds or more. `target.line` is its first line, `detail.endLine` its last and `detail.seconds` how long; `context` the text in view, head and tail. */
		Read = 15
	}

	/**
	 * Where an activity happened.
	 */
	export interface UserActivityTarget {
		/**
		 * The part of the window: `editor`, `chat`, `chatInput`, `sessions`, `terminal`, `browser`, `explorer`,
		 * `scm`, `search`, `panel`, `sidebar`, `auxiliarybar`, `statusbar`, `titlebar`, `quickInput`,
		 * `notifications`, `dialog` or `other`.
		 */
		readonly area: string;
		/** The view's id, when it happened in a view (`workbench.view.explorer`, `workbench.panel.chat`). */
		readonly view?: string;
		/** What the element says: its accessible name, title, or visible text, shortened. */
		readonly label?: string;
		/** The element's ARIA role. */
		readonly role?: string;
		/** The document, chat session or other resource it happened in. */
		readonly uri?: Uri;
		/** That resource's title: an editor's name, a chat session's title, a page's title. */
		readonly title?: string;
		/** The integrated browser's address. */
		readonly url?: string;
		/** The 1-based line in a document. */
		readonly line?: number;
	}

	/**
	 * One thing the user did.
	 */
	export interface UserActivityEvent {
		readonly kind: UserActivityKind;
		/** When, in milliseconds since the epoch. */
		readonly time: number;
		readonly target: UserActivityTarget;
		/** The text involved: typed, selected, copied, pasted, a command's id, a terminal command line, a query. At most 2000 characters. */
		readonly text?: string;
		/** Text around it, to read it in place: lines around a selection or an edit, a chat session's latest exchange, a page's visible text, a command's output. At most 4000 characters. */
		readonly context?: string;
		/** Kind-specific facts: `exitCode`, `focused`, `source` (`keybinding`, `menu`, `palette`), `window` (`editor`, `agents`), `before` and `startLine` (an edit), `seconds` and `endLine` (reading). */
		readonly detail?: { readonly [key: string]: string | number | boolean };
	}

	export namespace window {
		/**
		 * Fires with what the user did since the last batch, about once a second while they work.
		 * Nothing is recorded while no extension listens. Password fields are never recorded.
		 */
		export const onDidRecordUserActivity: Event<readonly UserActivityEvent[]>;
	}
}
