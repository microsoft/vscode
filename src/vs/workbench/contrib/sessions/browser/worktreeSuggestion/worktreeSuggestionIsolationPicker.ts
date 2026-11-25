/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/worktreeSuggestion.css';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ISession, ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { FOCUS_NEW_SESSION_WORKTREE_PICKER_COMMAND_ID } from '../../common/sessionCommands.js';
import { WorktreeSuggestionVariant } from '../../common/worktreeSuggestion.js';
import { IConfigPickerItem, IIsolationPickerRecommendation, IIsolationPickerTriggerContext, ISessionIsolationPickerPresentation } from '../newSessionInputPresentation.js';
import { getChangedFileUri, getModifiedFilesSectionLabel, getUncommittedFilesDescription } from './worktreeSuggestionPresentation.js';
import { IUncommittedChangesListItem, IWorktreeSuggestion, IWorktreeSuggestionService } from './worktreeSuggestionService.js';

const LISTED_FILES_MAX = 3;
const LISTED_FILES_CLASS = 'sessions-chat-isolation-listed-changes';
const LISTED_FILE_VALUE_PREFIX = '\0worktreeSuggestion:';

function withWorktreeSuggestion(item: IConfigPickerItem, suggestion: IWorktreeSuggestion, hasCreatedWorktreeSession: boolean): IConfigPickerItem {
	if (item.value === 'worktree') {
		return item.disabled ? item : { ...item, badge: localize('agentHostSessionConfig.isolation.recommended', "Recommended"), secondaryBadge: hasCreatedWorktreeSession };
	}
	if (item.value === 'folder' || item.value === 'workspace') {
		return {
			...item,
			description: suggestion.uncommittedChanges === 1
				? localize('agentHostSessionConfig.isolation.branchWithChangesSingular', "Works alongside your uncommitted file")
				: localize('agentHostSessionConfig.isolation.branchWithChangesPlural', "Works alongside your {0} uncommitted files", suggestion.uncommittedChanges),
		};
	}
	return item;
}

function getListedFilesKey(changes: readonly ISessionFileChange[] | undefined): string {
	return changes?.map(change => `${getChangedFileUri(change).toString()}\t${change.insertions}\t${change.deletions}`).join('\n') ?? '';
}

function toConfigPickerItems(items: readonly IActionListItem<IUncommittedChangesListItem>[]): IActionListItem<IConfigPickerItem>[] {
	return items.map((row, index): IActionListItem<IConfigPickerItem> => {
		// The rows replace no items when filtered.
		const { item, filterItems: _, ...rest } = row;
		return item ? { ...rest, item: { value: `${LISTED_FILE_VALUE_PREFIX}${index}`, label: row.label ?? '', run: item.run } } : rest;
	});
}

/** Optional hints and file previews; the shared picker still owns configuration writes and navigation. */
export class WorktreeSuggestionIsolationPicker implements ISessionIsolationPickerPresentation {
	constructor(
		private readonly _session: IObservable<ISession | undefined>,
		@IWorktreeSuggestionService private readonly _service: IWorktreeSuggestionService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) { }

	renderTrigger({ trigger, sessionId, title, label, ariaLabel, tooltip, hoverDelegate }: IIsolationPickerTriggerContext): IDisposable {
		const store = new DisposableStore();
		const element = dom.append(trigger, dom.$('span.sessions-chat-uncommitted-count', { 'aria-hidden': 'true' }));
		store.add(toDisposable(() => element.remove()));
		let counted: IWorktreeSuggestion | undefined;
		// Hidden and icon-only triggers do not count as an exposure until the count is laid out.
		const reportShown = () => {
			if (counted && element.isConnected && element.offsetWidth > 0) {
				this._service.markShown(WorktreeSuggestionVariant.UncommittedFilesCount, counted);
			}
		};
		const resizeObserver = store.add(new dom.DisposableResizeObserver('AgentHostSessionConfigPicker.uncommittedFilesCount', reportShown, dom.getWindow(trigger)));
		store.add(resizeObserver.observe(element));
		store.add(autorun(reader => {
			counted = this._getCountedSuggestion(sessionId, reader);
			if (counted) {
				this._service.getUncommittedChanges(counted, reader);
			}
			element.classList.toggle('visible', !!counted);
			element.textContent = counted ? String(counted.uncommittedChanges) : '';
			trigger.setAttribute('aria-label', counted
				? localize('agentHostSessionConfig.isolation.uncommittedCountAria', "{0}: {1}. {2}", title, label, getUncommittedFilesDescription(counted))
				: ariaLabel);
			reportShown();
		}));
		if (tooltip) {
			store.add(this._hoverService.setupManagedHover(hoverDelegate, trigger, () => {
				const current = this._getCountedSuggestion(sessionId, undefined);
				return this._keybindingService.appendKeybinding(current ? getUncommittedFilesDescription(current) : tooltip, FOCUS_NEW_SESSION_WORKTREE_PICKER_COMMAND_ID);
			}));
		}
		return store;
	}

	getRecommendation(sessionId: string): IIsolationPickerRecommendation | undefined {
		const variant = this._service.variant.get();
		if (variant !== WorktreeSuggestionVariant.InlineHint && variant !== WorktreeSuggestionVariant.UncommittedFilesCount) {
			return undefined;
		}
		const suggestion = this._getSuggestion(sessionId, undefined);
		if (!suggestion || variant === WorktreeSuggestionVariant.InlineHint
			&& (this._service.isHintClosed(undefined) || this._service.hasDeclined(variant, suggestion, undefined))) {
			return undefined;
		}
		const hasCreatedWorktreeSession = this._service.hasCreatedWorktreeSession(undefined);
		const listedFiles = variant === WorktreeSuggestionVariant.UncommittedFilesCount ? suggestion : undefined;
		return {
			className: listedFiles ? LISTED_FILES_CLASS : undefined,
			minWidth: listedFiles ? 300 : undefined,
			decorateOptions: items => items.map(item => withWorktreeSuggestion(item, suggestion, hasCreatedWorktreeSession)),
			appendItems: options => this._withListedFiles(listedFiles, options),
			onSelect: value => {
				if (value === 'worktree') {
					this._service.markAccepted(variant, suggestion);
				} else {
					this._service.decline(variant, suggestion);
				}
			},
			onDidShow: listedFiles ? (options, updateItems) => {
				// Listing the files can be the first exposure when the chip is icon-only.
				this._service.markShown(WorktreeSuggestionVariant.UncommittedFilesCount, listedFiles);
				this._service.markOpened(WorktreeSuggestionVariant.UncommittedFilesCount, listedFiles);
				let listedKey = getListedFilesKey(this._service.getUncommittedChanges(listedFiles, undefined));
				return autorun(reader => {
					const key = getListedFilesKey(this._service.getUncommittedChanges(listedFiles, reader));
					if (key !== listedKey) {
						listedKey = key;
						updateItems(this._withListedFiles(listedFiles, options));
					}
				});
			} : undefined,
		};
	}

	private _getSuggestion(sessionId: string, reader: IReader | undefined): IWorktreeSuggestion | undefined {
		const session = this._session.read(reader);
		return session?.sessionId === sessionId ? this._service.getSuggestion(session, reader) : undefined;
	}

	private _getCountedSuggestion(sessionId: string, reader: IReader | undefined): IWorktreeSuggestion | undefined {
		return this._service.variant.read(reader) === WorktreeSuggestionVariant.UncommittedFilesCount
			? this._getSuggestion(sessionId, reader)
			: undefined;
	}

	private _withListedFiles(suggestion: IWorktreeSuggestion | undefined, options: IActionListItem<IConfigPickerItem>[]): IActionListItem<IConfigPickerItem>[] {
		if (!suggestion) {
			return options;
		}
		const total = this._service.getUncommittedChanges(suggestion, undefined)?.length ?? suggestion.uncommittedChanges;
		const sectionLabel = getModifiedFilesSectionLabel(total);
		const files = toConfigPickerItems(this._service.getUncommittedChangesListItems(WorktreeSuggestionVariant.UncommittedFilesCount, suggestion, LISTED_FILES_MAX))
			// Screen readers skip separators, so each row carries the section in its group title.
			.map(row => ({ ...row, group: { ...row.group, title: sectionLabel } }));
		return files.length ? [...options, { kind: ActionListItemKind.Separator, label: sectionLabel }, ...files] : options;
	}
}
