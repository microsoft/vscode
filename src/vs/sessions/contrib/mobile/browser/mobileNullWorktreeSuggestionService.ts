/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IReader } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-translation-remind -- The mobile entry has its own localization bundle.
import { localize } from '../../../../nls.js';
import { IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IUncommittedChangesListItem, IWorktreeSuggestion, IWorktreeSuggestionService, WorktreeSpotlightChoice } from '../../../../workbench/contrib/sessions/browser/worktreeSuggestion/worktreeSuggestionService.js';
import { WorktreeSuggestionVariant } from '../../../../workbench/contrib/sessions/common/worktreeSuggestion.js';
import { ISession, ISessionFileChange } from '../../../../workbench/services/sessions/common/session.js';

const unavailableMessage = localize('mobile.worktreeSuggestionsUnavailable', "Worktree suggestions are not available on this device.");

/** Shared composers require this service, but worktree suggestion presentations do not support the phone. */
export class MobileNullWorktreeSuggestionService implements IWorktreeSuggestionService {
	declare readonly _serviceBrand: undefined;

	readonly variant = constObservable(WorktreeSuggestionVariant.Off);
	readonly isPreviewing = constObservable(false);

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	getSuggestion(_session: ISession | undefined, _reader: IReader | undefined): IWorktreeSuggestion | undefined {
		return undefined;
	}

	reportWouldShow(): void { }
	markShown(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion): void { }
	markOpened(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion): void { }
	markAccepted(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion): void { }
	decline(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion): void { }

	hasDeclined(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion, _reader: IReader | undefined): boolean {
		return false;
	}

	async useWorktree(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion): Promise<boolean> {
		this.notificationService.error(unavailableMessage);
		return false;
	}

	getUncommittedChanges(_suggestion: IWorktreeSuggestion, _reader: IReader | undefined): readonly ISessionFileChange[] | undefined {
		return undefined;
	}

	async reviewChanges(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion, _change?: ISessionFileChange): Promise<void> {
		throw new Error(unavailableMessage);
	}

	getUncommittedChangesListItems(_variant: WorktreeSuggestionVariant, _suggestion: IWorktreeSuggestion, _maxFiles: number): IActionListItem<IUncommittedChangesListItem>[] {
		return [];
	}

	isHintClosed(_reader: IReader | undefined): boolean {
		return false;
	}

	hasCreatedWorktreeSession(_reader: IReader | undefined): boolean {
		return false;
	}

	closeHint(_suggestion: IWorktreeSuggestion): void { }

	canShowSpotlight(): boolean {
		return false;
	}

	async showSendSpotlight(_suggestion: IWorktreeSuggestion, _options: { readonly reveal: () => void }): Promise<WorktreeSpotlightChoice | undefined> {
		return undefined;
	}

	setPreview(_variant: WorktreeSuggestionVariant | undefined): void {
		throw new Error(unavailableMessage);
	}

	reset(): void { }
}
