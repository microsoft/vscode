/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/worktreeSuggestion.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISessionInputPickerVisibility } from '../../../services/sessions/common/sessionPickerVisibility.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { NewSessionBannerPriority, NewSessionBanners } from '../../chat/common/newSessionBanners.js';
import { WorktreeSuggestionVariant } from '../common/worktreeSuggestion.js';
import { getInlineHintMessage, getShowChangesLabel, getUseWorktreeLabel } from './worktreeSuggestionPresentation.js';
import { IWorktreeSuggestion, IWorktreeSuggestionService, worktreeSuggestionEquals, WorktreeSpotlightChoice } from './worktreeSuggestionService.js';

/** The parts of a new-session composer that the worktree suggestion reads. */
export interface IWorktreeSuggestionComposer {
	/** The new session the composer configures. */
	readonly session: IObservable<IActiveSession | undefined>;
	/** The composer's pickers. A session needs an interactive isolation picker to be offered a worktree. */
	readonly pickerVisibility: ISessionInputPickerVisibility;
	/** Whether the composer is shown. */
	readonly visible: IObservable<boolean>;
	readonly getInputValue: () => string;
	readonly onDidChangeInput: Event<void>;
	readonly focusInput: () => void;
	/** Shows the isolation picker when the session options are collapsed. */
	readonly revealIsolationPicker: () => void;
	/** Opens the isolation picker with New Worktree focused, showing it first when the session options are collapsed. */
	readonly openIsolationPicker: () => void;
	/** The banners below the input, which show one at a time. The inline hint is one of them. */
	readonly banners: NewSessionBanners;
}

let messageIdPool = 0;

/**
 * Suggests a new worktree when Branch isolation is selected for a new session in a folder with uncommitted
 * changes, using the presentation selected by the worktree suggestion experiment. It owns the spotlight on
 * send and the inline hint; the isolation picker owns the number of uncommitted files.
 */
export class WorktreeSuggestionController extends Disposable {

	private readonly _suggestion: IObservable<IWorktreeSuggestion | undefined>;
	private readonly _hasInput: IObservable<boolean>;
	/**
	 * Sessions whose isolation picker was interactive at least once, so New Worktree is offered for them.
	 * The picker briefly unregisters whenever it re-renders or resolves configuration, which must not
	 * withdraw a suggestion that is showing.
	 */
	private readonly _sessionsWithIsolationPicker = observableValue<ReadonlySet<string>>(this, new Set());
	private _inlineSuggestion: IWorktreeSuggestion | undefined;
	private _announcedSessionId: string | undefined;

	constructor(
		container: HTMLElement,
		private readonly _composer: IWorktreeSuggestionComposer,
		@IWorktreeSuggestionService private readonly _service: IWorktreeSuggestionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(autorun(reader => {
			const session = _composer.session.read(reader);
			const sessions = this._sessionsWithIsolationPicker.read(undefined);
			if (session && _composer.pickerVisibility.visibility.read(reader).worktree && !sessions.has(session.sessionId)) {
				this._sessionsWithIsolationPicker.set(new Set([...sessions, session.sessionId]), undefined);
			}
		}));
		this._suggestion = derivedOpts<IWorktreeSuggestion | undefined>({ owner: this, equalsFn: worktreeSuggestionEquals }, reader => {
			const session = _composer.session.read(reader);
			if (!session || !_composer.visible.read(reader) || !this._sessionsWithIsolationPicker.read(reader).has(session.sessionId)) {
				return undefined;
			}
			return _service.getSuggestion(session, reader);
		});
		const inputChanged = observableSignalFromEvent(this, _composer.onDidChangeInput);
		this._hasInput = derived(this, reader => {
			inputChanged.read(reader);
			return _composer.getInputValue().trim().length > 0;
		});

		// Every arm, including the control, reaches this moment before any of them shows something: the
		// isolation picker shows Branch, and the folder has uncommitted changes.
		this._register(autorun(reader => {
			if (this._suggestion.read(reader)) {
				_service.reportWouldShow();
			}
		}));

		this._renderInlineSuggestion(container);
	}

	/**
	 * Before the composer sends `query`, spotlights the isolation picker once to offer sending it in a new
	 * worktree, when that presentation applies. Returns `false` when switching to a new worktree failed,
	 * which leaves the request unsent.
	 */
	async confirmBeforeSend(query: string): Promise<boolean> {
		const suggestion = this._suggestion.get();
		// Commands can apply settings without starting a task, which a worktree question would interrupt.
		if (this._service.variant.get() !== WorktreeSuggestionVariant.SpotlightOnSend || !suggestion
			|| query.trimStart().startsWith('/') || !this._service.canShowSpotlight()) {
			return true;
		}
		const choice = await this._service.showSendSpotlight(suggestion, { reveal: () => this._composer.revealIsolationPicker() });
		// The request only waits for the isolation to switch, as it would after picking New Worktree.
		return choice === WorktreeSpotlightChoice.Worktree
			? this._service.useWorktree(WorktreeSuggestionVariant.SpotlightOnSend, suggestion)
			: true;
	}

	// --- Inline hint ---

	private _renderInlineSuggestion(container: HTMLElement): void {
		const element = dom.append(container, dom.$('.new-session-worktree-suggestion', {
			role: 'group',
			'aria-label': localize('worktreeSuggestion.inline.ariaLabel', "Worktree suggestion"),
		}));
		this._register(toDisposable(() => element.remove()));
		dom.setVisibility(false, element);

		dom.append(element, renderIcon(Codicon.worktree)).setAttribute('aria-hidden', 'true');
		const message = dom.append(element, dom.$('span.new-session-worktree-suggestion-message'));
		message.id = `new-session-worktree-suggestion-message-${++messageIdPool}`;
		const messageBefore = dom.append(message, dom.$('span'));
		// The number of uncommitted files shows them, so the user can see which changes a worktree keeps apart.
		const filesLink = this._register(this._instantiationService.createInstance(Link, message, { label: '', href: '#' }, {
			opener: () => {
				const suggestion = this._inlineSuggestion;
				if (suggestion) {
					void this._service.reviewChanges(WorktreeSuggestionVariant.InlineHint, suggestion);
				}
			},
		}));
		const messageAfter = dom.append(message, dom.$('span'));

		const useWorktreeButton = this._register(new Button(element, { ...defaultButtonStyles, secondary: true, small: true }));
		useWorktreeButton.label = getUseWorktreeLabel();
		useWorktreeButton.element.setAttribute('aria-describedby', message.id);
		// The isolation picker lets the user make the choice, with New Worktree focused.
		this._register(useWorktreeButton.onDidClick(() => {
			const suggestion = this._inlineSuggestion;
			if (suggestion) {
				this._service.markOpened(WorktreeSuggestionVariant.InlineHint, suggestion);
				this._composer.openIsolationPicker();
			}
		}));

		const actions = this._register(new ActionBar(element));
		actions.push(this._register(new Action(
			'worktreeSuggestion.closeInline',
			localize('worktreeSuggestion.inline.closeForGood', "Close and Don't Show Again"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			async () => this._hideInlineSuggestion(true),
		)), { icon: true, label: false });

		// Escape only hides it for the session, as keeping Branch in the isolation picker does. The button
		// handles Escape itself.
		this._register(useWorktreeButton.onDidEscape(() => this._hideInlineSuggestion(false)));
		this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				dom.EventHelper.stop(e, true);
				this._hideInlineSuggestion(false);
			}
		}));

		// Appears once the user starts describing a task, the moment the choice of isolation matters.
		const hintSuggestion = derived(this, reader => {
			if (this._service.variant.read(reader) !== WorktreeSuggestionVariant.InlineHint || this._service.isHintClosed(reader)) {
				return undefined;
			}
			const suggestion = this._suggestion.read(reader);
			if (!suggestion || !this._hasInput.read(reader) || this._service.hasDeclined(WorktreeSuggestionVariant.InlineHint, suggestion, reader)) {
				return undefined;
			}
			return suggestion;
		});
		// A developer preview shows the hint even before the user started enough sessions for banners.
		const banner = this._register(this._composer.banners.register(NewSessionBannerPriority.WorktreeSuggestion, derived(this, reader => !!hintSuggestion.read(reader)), { isDeveloperPreview: this._service.isPreviewing }));
		this._register(autorun(reader => {
			const suggestion = banner.isShowing.read(reader) ? hintSuggestion.read(reader) : undefined;
			this._inlineSuggestion = suggestion;
			if (!suggestion && dom.isAncestorOfActiveElement(element)) {
				this._composer.focusInput();
			}
			dom.setVisibility(!!suggestion, element);
			if (!suggestion) {
				return;
			}
			const { before, files, after } = getInlineHintMessage(suggestion);
			messageBefore.textContent = before;
			filesLink.link = { label: files, href: '#', title: getShowChangesLabel() };
			filesLink.enabled = !!files;
			messageAfter.textContent = after;
			this._service.markShown(WorktreeSuggestionVariant.InlineHint, suggestion);
			if (this._announcedSessionId !== suggestion.session.sessionId) {
				this._announcedSessionId = suggestion.session.sessionId;
				status(before + files + after);
			}
		}));
	}

	/** Hides the inline hint for good, or for the session only. Focus inside it returns to the input. */
	private _hideInlineSuggestion(forGood: boolean): void {
		const suggestion = this._inlineSuggestion;
		if (!suggestion) {
			return;
		}
		if (forGood) {
			this._service.closeHint(suggestion);
		} else {
			this._service.decline(WorktreeSuggestionVariant.InlineHint, suggestion);
		}
	}
}
