/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IReader, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { WorktreeSuggestionVariant } from '../../common/worktreeSuggestion.js';
import { getChangedFileUri } from '../../browser/worktreeSuggestionPresentation.js';
import { IUncommittedChangesListItem, IWorktreeSuggestion, IWorktreeSuggestionService, WorktreeSpotlightChoice } from '../../browser/worktreeSuggestionService.js';

/** A worktree suggestion service that never suggests, for tests of the surfaces that host suggestions. */
export class NullWorktreeSuggestionService extends mock<IWorktreeSuggestionService>() {
	override readonly variant = constObservable(WorktreeSuggestionVariant.Off);
	override readonly isPreviewing = constObservable(false);
	override getSuggestion(): undefined {
		return undefined;
	}
	override reportWouldShow(): void { }
}

/**
 * A worktree suggestion service that suggests a worktree for every session, presented as `variant`,
 * and records how the surfaces that host it use the suggestion.
 */
export class TestWorktreeSuggestionService extends mock<IWorktreeSuggestionService>() {
	override readonly variant: ISettableObservable<WorktreeSuggestionVariant>;
	override readonly isPreviewing = observableValue('isPreviewing', false);
	readonly calls: string[] = [];
	/** Number of times a surface reported that a suggestion would appear, which logs the experiment trigger. */
	wouldShowReports = 0;
	/** Whether the spotlight may still run. */
	spotlightAvailable = true;
	/** What the user chooses in the next spotlight, or `undefined` when it cannot show. */
	spotlightChoice: WorktreeSpotlightChoice | undefined;
	private readonly _hintClosed = observableValue('hintClosed', false);
	private readonly _declined = observableValue<ReadonlySet<string>>('declined', new Set());
	private readonly _changes: ISettableObservable<readonly ISessionFileChange[] | undefined>;

	constructor(variant: WorktreeSuggestionVariant, changes?: readonly ISessionFileChange[], private readonly _uncommittedChanges = 3) {
		super();
		this.variant = observableValue('variant', variant);
		this._changes = observableValue('changes', changes);
	}

	/** Reports the uncommitted changes, as the provider does once they load or change. */
	setChanges(changes: readonly ISessionFileChange[] | undefined): void {
		this._changes.set(changes, undefined);
	}

	override getSuggestion(session: IActiveSession | undefined): IWorktreeSuggestion | undefined {
		return session && { session, uncommittedChanges: this._uncommittedChanges, branchName: 'main' };
	}
	override reportWouldShow(): void {
		this.wouldShowReports++;
	}
	/** Like the service, records each presentation once. */
	override markShown(variant: WorktreeSuggestionVariant): void {
		if (!this.calls.includes(`shown:${variant}`)) {
			this.calls.push(`shown:${variant}`);
		}
	}
	override markOpened(variant: WorktreeSuggestionVariant): void {
		this.calls.push(`opened:${variant}`);
	}
	override markAccepted(variant: WorktreeSuggestionVariant): void {
		this.calls.push(`accepted:${variant}`);
	}
	override decline(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void {
		this.calls.push(`declined:${variant}`);
		this._declined.set(new Set([...this._declined.get(), `${variant}:${suggestion.session.sessionId}`]), undefined);
	}
	override hasDeclined(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, reader: IReader | undefined): boolean {
		return this._declined.read(reader).has(`${variant}:${suggestion.session.sessionId}`);
	}
	override async useWorktree(variant: WorktreeSuggestionVariant): Promise<boolean> {
		this.calls.push(`useWorktree:${variant}`);
		return true;
	}
	override getUncommittedChanges(_suggestion: IWorktreeSuggestion, reader: IReader | undefined): readonly ISessionFileChange[] | undefined {
		return this._changes.read(reader);
	}
	override async reviewChanges(variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion, change?: ISessionFileChange): Promise<void> {
		this.calls.push(`reviewChanges:${variant}${change ? ':file' : ''}`);
	}
	/** Lists up to `maxFiles` changes by their file names, then a row that counts the rest, like the service. */
	override getUncommittedChangesListItems(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, maxFiles: number): IActionListItem<IUncommittedChangesListItem>[] {
		const row = (label: string, run: () => unknown): IActionListItem<IUncommittedChangesListItem> => ({ kind: ActionListItemKind.Action, label, item: { run: () => void run() } });
		const changes = this._changes.get() ?? [];
		const listed = changes.length <= maxFiles + 1 ? changes : changes.slice(0, maxFiles);
		const rows = listed.map(change => row(basename(getChangedFileUri(change)), () => this.reviewChanges(variant, suggestion, change)));
		if (listed.length < changes.length) {
			rows.push(row(`${changes.length - listed.length} more`, () => this.reviewChanges(variant, suggestion)));
		}
		return rows;
	}
	override isHintClosed(reader: IReader | undefined): boolean {
		return this._hintClosed.read(reader);
	}
	override closeHint(): void {
		this.calls.push('hintClosed');
		this._hintClosed.set(true, undefined);
	}
	override canShowSpotlight(): boolean {
		return this.spotlightAvailable;
	}
	override async showSendSpotlight(_suggestion: IWorktreeSuggestion, options: { readonly reveal: () => void }): Promise<WorktreeSpotlightChoice | undefined> {
		this.calls.push(`spotlight:${this.spotlightChoice ?? 'notShown'}`);
		options.reveal();
		return this.spotlightChoice;
	}
}
