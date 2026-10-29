/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { createPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { resolveMockColor } from './colorGroupsMockupColors.js';
import { collectionAccent, renderCollectionIcon } from './colorGroupsMockupEditors.js';
import { ColorGroupsMockModel, getCollection, getGroup, getSession, getWorkspaceStyle, IMockMessage, IMockSession, IMockState, MockSessionStatus } from './colorGroupsMockupModel.js';

const $ = DOM.$;

/** Where a new session will be created. */
export interface IMockDraftTarget {
	readonly workspace?: string;
	readonly groupId?: string;
}

export interface IMockChatHost {
	readonly activeCollectionId: IObservable<string>;
	readonly selectedSessionId: ISettableObservable<string | undefined>;
	revealSession(sessionId: string): void;
}

/** How long the pretend agent works before replying. */
const TURN_DURATION_MS = 2200;

//#region Lorem ipsum

const LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

function seededRandom(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
}

function loremSentence(random: () => number, min: number, max: number): string {
	const count = min + Math.floor(random() * (max - min + 1));
	const words: string[] = [];
	for (let i = 0; i < count; i++) {
		words.push(LOREM_WORDS[Math.floor(random() * LOREM_WORDS.length)]);
	}
	const text = words.join(' ');
	return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/** A deterministic agent reply: a couple of paragraphs and a short list, as plain text with `- ` bullets. */
export function loremReply(seed: string): string {
	const random = seededRandom(seed);
	const paragraph = () => Array.from({ length: 2 + Math.floor(random() * 2) }, () => loremSentence(random, 6, 14)).join(' ');
	const bullets = Array.from({ length: 2 + Math.floor(random() * 3) }, () => `- ${loremSentence(random, 4, 9)}`);
	return [paragraph(), bullets.join('\n'), paragraph()].join('\n\n');
}

function getTranscript(session: IMockSession): IMockMessage[] {
	if (session.messages) {
		return session.messages;
	}
	return [{ role: 'user', text: session.title }, { role: 'agent', text: loremReply(session.id) }];
}

//#endregion

/**
 * The main area of the mock window: a lorem ipsum transcript for the selected
 * session, or a composer for a new session with workspace and group pickers.
 */
export class ColorGroupsMockChat extends Disposable {

	private readonly _draftTarget = observableValue<IMockDraftTarget>(this, {});
	readonly draftTarget: IObservable<IMockDraftTarget> = this._draftTarget;

	private readonly turns = this._register(new DisposableMap<string>());
	private readonly input: InputBox;
	private turnCounter = 0;

	constructor(
		container: HTMLElement,
		private readonly model: ColorGroupsMockModel,
		private readonly scheme: ColorScheme,
		private readonly host: IMockChatHost,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		const header = DOM.append(container, $('.cg-main-header'));
		const crumbs = DOM.append(header, $('.cg-crumbs'));
		const content = DOM.append(container, $('.cg-main-content'));

		const composer = DOM.append(container, $('.cg-chat-input'));
		this.input = this._register(new InputBox(composer, undefined, {
			inputBoxStyles: { ...defaultInputBoxStyles, inputBackground: 'transparent', inputBorder: 'transparent' },
			placeholder: 'Describe what to build next',
			ariaLabel: 'Chat input',
			flexibleHeight: true,
			flexibleMaxHeight: 160,
		}));
		this.input.element.classList.add('cg-chat-textarea');
		const bar = DOM.append(composer, $('.cg-chat-input-bar'));
		const targets = DOM.append(bar, $('.cg-chat-targets'));
		DOM.append(bar, $('span.cg-chip', undefined, 'Claude Sonnet'));
		const send = DOM.append(bar, $<HTMLButtonElement>(`button.cg-send${ThemeIcon.asCSSSelector(Codicon.arrowUp)}`, { type: 'button', 'aria-label': 'Send' }));
		this._register(this.hoverService.setupDelayedHover(send, { content: 'Send (Enter)' }));

		this._register(DOM.addDisposableListener(send, DOM.EventType.CLICK, () => this.send()));
		this._register(DOM.addStandardDisposableListener(this.input.inputElement, DOM.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter)) {
				e.preventDefault();
				e.stopPropagation();
				this.send();
			}
		}));
		this._register(this.input.onDidChange(value => send.disabled = !value.trim()));
		send.disabled = true;

		const selected = derived(this, reader => {
			const id = this.host.selectedSessionId.read(reader);
			return id ? getSession(this.model.state.read(reader), id) : undefined;
		});

		const contentStore = this._register(new DisposableStore());
		this._register(autorun(reader => {
			const session = selected.read(reader);
			const state = this.model.state.read(reader);
			const collectionId = this.host.activeCollectionId.read(reader);
			const draft = this._draftTarget.read(reader);
			contentStore.clear();
			container.classList.toggle('cg-composing', !session);
			this.renderCrumbs(crumbs, state, session, collectionId);
			DOM.clearNode(content);
			DOM.clearNode(targets);
			if (session) {
				this.renderTranscript(content, session, contentStore);
				this.input.setPlaceHolder('Reply, or ask for a follow-up');
			} else {
				this.renderNewSession(content, state, collectionId);
				this.renderTargets(targets, state, collectionId, draft, contentStore);
				this.input.setPlaceHolder('Describe what to build next');
			}
		}));

		// Keep the latest message in view when switching sessions or when a turn lands.
		let lastSessionId: string | undefined;
		let lastMessageCount = 0;
		this._register(autorun(reader => {
			const session = selected.read(reader);
			const messageCount = session?.messages?.length ?? 0;
			const changed = session?.id !== lastSessionId || messageCount !== lastMessageCount;
			lastSessionId = session?.id;
			lastMessageCount = messageCount;
			if (changed) {
				content.scrollTop = content.scrollHeight;
			}
		}));
	}

	/** Shows the new session composer, optionally preset to a workspace or group. */
	startNewSession(target: IMockDraftTarget = {}): void {
		this._draftTarget.set(target, undefined);
		this.host.selectedSessionId.set(undefined, undefined);
		this.focusInput();
	}

	focusInput(): void {
		this.input.focus();
	}

	/** Types into the composer, for scripted walkthroughs. */
	setInput(value: string): void {
		this.input.value = value;
	}

	send(): void {
		const text = this.input.value.trim();
		if (!text) {
			return;
		}
		const sessionId = this.host.selectedSessionId.get();
		if (sessionId && getSession(this.model.current, sessionId)) {
			this.model.sendMessage(sessionId, text);
			this.scheduleReply(sessionId);
		} else {
			const draft = this._draftTarget.get();
			const id = this.model.newSession(this.host.activeCollectionId.get(), { workspace: draft.workspace, groupId: draft.groupId, prompt: text });
			this.host.selectedSessionId.set(id, undefined);
			this.host.revealSession(id);
			this.scheduleReply(id);
		}
		this.input.value = '';
		this.focusInput();
	}

	private scheduleReply(sessionId: string): void {
		const turn = ++this.turnCounter;
		this.turns.set(sessionId, disposableTimeout(() => {
			const random = seededRandom(`${sessionId}:${turn}`);
			const diff = random() > 0.35 ? { additions: 4 + Math.floor(random() * 120), deletions: Math.floor(random() * 40) } : undefined;
			this.model.completeTurn(sessionId, loremReply(`${sessionId}:${turn}`), this.host.selectedSessionId.get() === sessionId, diff);
			this.turns.deleteAndLeak(sessionId);
		}, TURN_DURATION_MS));
	}

	//#region Rendering

	private renderCrumbs(crumbs: HTMLElement, state: IMockState, session: IMockSession | undefined, activeCollectionId: string): void {
		DOM.clearNode(crumbs);
		const collection = getCollection(state, session?.collectionId ?? activeCollectionId);
		if (collection) {
			const crumb = DOM.append(crumbs, $('span.cg-crumb.cg-crumb-collection'));
			crumb.style.setProperty('--cg-accent', collectionAccent(collection, this.scheme));
			renderCollectionIcon(DOM.append(crumb, $('span.cg-crumb-icon')), collection.icon);
			DOM.append(crumb, $('span', undefined, collection.name));
		}
		if (!session) {
			DOM.append(crumbs, $(`span.cg-crumb-sep${ThemeIcon.asCSSSelector(Codicon.chevronRight)}`));
			DOM.append(crumbs, $('span.cg-crumb.cg-crumb-title', undefined, 'New session'));
			return;
		}
		const group = getGroup(state, session.groupId);
		const workspaceStyle = session.workspace ? getWorkspaceStyle(state, session.workspace) : undefined;
		const pillColor = group?.color ?? workspaceStyle?.color;
		const pillLabel = group?.name ?? session.workspace;
		if (pillLabel) {
			DOM.append(crumbs, $(`span.cg-crumb-sep${ThemeIcon.asCSSSelector(Codicon.chevronRight)}`));
			const pill = DOM.append(crumbs, $('span.cg-crumb.cg-crumb-group'));
			if (pillColor) {
				const resolved = resolveMockColor(pillColor, this.scheme, group?.textMode ?? workspaceStyle?.textMode);
				pill.classList.add('colored');
				pill.style.setProperty('--cg-fill', resolved.fill);
				pill.style.setProperty('--cg-text', resolved.text);
			}
			if (!group) {
				DOM.append(pill, $(`span${ThemeIcon.asCSSSelector(Codicon.folder)}`));
			}
			DOM.append(pill, $('span', undefined, pillLabel));
		}
		DOM.append(crumbs, $(`span.cg-crumb-sep${ThemeIcon.asCSSSelector(Codicon.chevronRight)}`));
		DOM.append(crumbs, $('span.cg-crumb.cg-crumb-title', undefined, session.title));
	}

	private renderTranscript(content: HTMLElement, session: IMockSession, store: DisposableStore): void {
		const transcript = DOM.append(content, $('.cg-transcript'));
		for (const message of getTranscript(session)) {
			if (message.role === 'user') {
				DOM.append(transcript, $('.cg-bubble.cg-bubble-user', undefined, message.text));
				continue;
			}
			const reply = DOM.append(transcript, $('.cg-bubble.cg-bubble-agent'));
			for (const block of message.text.split('\n\n')) {
				if (block.startsWith('- ')) {
					const list = DOM.append(reply, $('ul'));
					for (const line of block.split('\n')) {
						DOM.append(list, $('li', undefined, line.slice(2)));
					}
				} else {
					DOM.append(reply, $('p', undefined, block));
				}
			}
		}

		if (session.status === MockSessionStatus.InProgress) {
			const progress = DOM.append(transcript, $('.cg-bubble-progress'));
			const spinner = store.add(createPixelSpinner(undefined, { variant: 'grid' }));
			progress.appendChild(spinner.element);
			DOM.append(progress, $('span', undefined, session.description ?? 'Working…'));
		} else if (session.status === MockSessionStatus.NeedsInput) {
			const random = seededRandom(`${session.id}:question`);
			const question = DOM.append(transcript, $('.cg-bubble-question'));
			DOM.append(question, $('.cg-question-title', undefined, 'Which way should I go?'));
			DOM.append(question, $('p', undefined, loremSentence(random, 10, 16)));
			const options = DOM.append(question, $('.cg-question-options'));
			for (const label of ['Keep it minimal', 'Refactor first']) {
				const option = DOM.append(options, $<HTMLButtonElement>('button.cg-question-option', { type: 'button' }, label));
				store.add(DOM.addDisposableListener(option, DOM.EventType.CLICK, () => {
					this.model.sendMessage(session.id, label);
					this.scheduleReply(session.id);
				}));
			}
		}
	}

	private renderNewSession(content: HTMLElement, state: IMockState, collectionId: string): void {
		const collection = getCollection(state, collectionId);
		const hero = DOM.append(content, $('.cg-new-session'));
		if (collection) {
			const icon = DOM.append(hero, $('.cg-new-session-icon'));
			icon.style.setProperty('--cg-accent', collectionAccent(collection, this.scheme));
			renderCollectionIcon(icon, collection.icon);
		}
		DOM.append(hero, $('.cg-new-session-title', undefined, 'New session'));
		DOM.append(hero, $('.cg-new-session-subtitle', undefined, `Starts in ${collection?.name ?? 'this collection'}. Pick a workspace and group below, then describe the task.`));
	}

	private renderTargets(targets: HTMLElement, state: IMockState, collectionId: string, draft: IMockDraftTarget, store: DisposableStore): void {
		// Workspace
		const workspaceChip = DOM.append(targets, $<HTMLButtonElement>('button.cg-target-chip', { type: 'button', 'aria-haspopup': 'menu' }));
		const workspaceStyle = draft.workspace ? getWorkspaceStyle(state, draft.workspace) : undefined;
		if (workspaceStyle?.color) {
			const dot = DOM.append(workspaceChip, $('span.cg-target-dot'));
			dot.style.setProperty('--cg-fill', resolveMockColor(workspaceStyle.color, this.scheme).fill);
		}
		DOM.append(workspaceChip, $(`span${ThemeIcon.asCSSSelector(draft.workspace ? Codicon.folder : Codicon.commentDiscussion)}`));
		DOM.append(workspaceChip, $('span.cg-target-label', undefined, draft.workspace ?? 'No workspace'));
		DOM.append(workspaceChip, $(`span.cg-target-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));
		store.add(this.hoverService.setupDelayedHover(workspaceChip, { content: 'Workspace for the new session' }));
		store.add(DOM.addDisposableListener(workspaceChip, DOM.EventType.CLICK, () => this.showMenu(workspaceChip, this.workspaceActions(state, collectionId, draft))));

		// Group
		const group = getGroup(state, draft.groupId);
		const groupChip = DOM.append(targets, $<HTMLButtonElement>('button.cg-target-chip', { type: 'button', 'aria-haspopup': 'menu' }));
		if (group) {
			const resolved = resolveMockColor(group.color, this.scheme, group.textMode);
			groupChip.classList.add('colored');
			groupChip.style.setProperty('--cg-fill', resolved.fill);
			groupChip.style.setProperty('--cg-text', resolved.text);
		} else {
			DOM.append(groupChip, $(`span${ThemeIcon.asCSSSelector(Codicon.folderLibrary)}`));
		}
		DOM.append(groupChip, $('span.cg-target-label', undefined, group?.name ?? 'No group'));
		DOM.append(groupChip, $(`span.cg-target-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));
		store.add(this.hoverService.setupDelayedHover(groupChip, { content: 'Group for the new session' }));
		store.add(DOM.addDisposableListener(groupChip, DOM.EventType.CLICK, () => this.showMenu(groupChip, this.groupActions(state, collectionId, draft))));
	}

	private workspaceActions(state: IMockState, collectionId: string, draft: IMockDraftTarget): IAction[] {
		const inCollection = new Set(state.sessions.filter(s => s.collectionId === collectionId && s.workspace).map(s => s.workspace!));
		const others = new Set([...state.sessions.map(s => s.workspace), ...Object.keys(state.workspaces)].filter((w): w is string => !!w && !inCollection.has(w)));
		const option = (workspace: string | undefined, label: string) => {
			const action = new Action(`cg.target.workspace.${label}`, label, undefined, true, async () => this._draftTarget.set({ ...draft, workspace }, undefined));
			action.checked = draft.workspace === workspace;
			return action;
		};
		return [
			...[...inCollection].sort().map(w => option(w, w)),
			new Separator(),
			...[...others].sort().map(w => option(w, w)),
			new Separator(),
			option(undefined, 'No workspace (quick chat)'),
		];
	}

	private groupActions(state: IMockState, collectionId: string, draft: IMockDraftTarget): IAction[] {
		const option = (groupId: string | undefined, label: string) => {
			const action = new Action(`cg.target.group.${groupId ?? 'none'}`, label, undefined, true, async () => {
				const workspace = draft.workspace ?? state.sessions.find(s => s.groupId === groupId && s.workspace)?.workspace;
				this._draftTarget.set({ groupId, workspace }, undefined);
			});
			action.checked = draft.groupId === groupId;
			return action;
		};
		return [
			...state.groups.filter(g => g.collectionId === collectionId).map(g => option(g.id, g.name)),
			new Separator(),
			option(undefined, 'No group'),
		];
	}

	private showMenu(anchor: HTMLElement, actions: IAction[]): void {
		this.contextMenuService.showContextMenu({ getAnchor: () => anchor, getActions: () => actions, onHide: () => this.focusInput() });
	}

	//#endregion
}
