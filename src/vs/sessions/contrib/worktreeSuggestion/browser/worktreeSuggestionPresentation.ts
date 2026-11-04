/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../../base/common/path.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import type { IWorktreeSuggestion } from './worktreeSuggestionService.js';

/** Describes the uncommitted changes that make a worktree worthwhile, e.g. "main has 3 uncommitted files." */
export function getUncommittedChangesMessage(suggestion: IWorktreeSuggestion): string {
	const { branchName, uncommittedChanges } = suggestion;
	if (branchName) {
		return uncommittedChanges === 1
			? localize('worktreeSuggestion.branchChangesSingular', "{0} has 1 uncommitted file.", branchName)
			: localize('worktreeSuggestion.branchChangesPlural', "{0} has {1} uncommitted files.", branchName, uncommittedChanges);
	}
	return uncommittedChanges === 1
		? localize('worktreeSuggestion.folderChangesSingular', "This folder has 1 uncommitted file.")
		: localize('worktreeSuggestion.folderChangesPlural', "This folder has {0} uncommitted files.", uncommittedChanges);
}

/** The inline hint, split around the number of uncommitted files, which it renders as a link to the changes. */
export interface IInlineHintMessage {
	/** The text before the number of uncommitted files, e.g. "main has ". */
	readonly before: string;
	/** The number of uncommitted files, e.g. "3 uncommitted files", or empty when a translation leaves it out. */
	readonly files: string;
	/** The text after the number of uncommitted files, e.g. ". Worktrees allow agents to run on a separate copy of the files." */
	readonly after: string;
}

/** Stands for the number of uncommitted files while the inline hint is localized. Git rejects control characters in branch names. */
const UNCOMMITTED_FILES_PLACEHOLDER = '\u0000';

/**
 * The inline hint, short enough to fit on one line beside its actions, e.g. "main has 3 uncommitted files.
 * Worktrees allow agents to run on a separate copy of the files." A copy is easier to picture than a worktree.
 */
export function getInlineHintMessage(suggestion: IWorktreeSuggestion): IInlineHintMessage {
	const message = suggestion.branchName
		? localize({ key: 'worktreeSuggestion.inlineHint.branch', comment: ['{0} is a branch name. {1} is the number of uncommitted files, such as "3 uncommitted files", which links to the changes.'] }, "{0} has {1}. Worktrees allow agents to run on a separate copy of the files.", suggestion.branchName, UNCOMMITTED_FILES_PLACEHOLDER)
		: localize({ key: 'worktreeSuggestion.inlineHint.folder', comment: ['{0} is the number of uncommitted files, such as "3 uncommitted files", which links to the changes.'] }, "This folder has {0}. Worktrees allow agents to run on a separate copy of the files.", UNCOMMITTED_FILES_PLACEHOLDER);
	const index = message.indexOf(UNCOMMITTED_FILES_PLACEHOLDER);
	if (index < 0) {
		return { before: message, files: '', after: '' };
	}
	const files = suggestion.uncommittedChanges === 1
		? localize('worktreeSuggestion.inlineHint.fileSingular', "1 uncommitted file")
		: localize('worktreeSuggestion.inlineHint.filesPlural', "{0} uncommitted files", suggestion.uncommittedChanges);
	return { before: message.slice(0, index), files, after: message.slice(index + UNCOMMITTED_FILES_PLACEHOLDER.length) };
}

export function getShowChangesLabel(): string {
	return localize('worktreeSuggestion.showChanges', "Show Changes");
}

export function getUseWorktreeLabel(): string {
	return localize('worktreeSuggestion.useWorktree', "Use Worktree");
}

/** Heads the uncommitted files listed among the options of a picker, e.g. "5 Uncommitted Files". */
export function getUncommittedFilesSectionLabel(count: number): string {
	return count === 1
		? localize('worktreeSuggestion.uncommittedFilesSectionSingular', "1 Uncommitted File")
		: localize('worktreeSuggestion.uncommittedFilesSectionPlural', "{0} Uncommitted Files", count);
}

/** Stands for the uncommitted files a list leaves out, e.g. "2 more". */
export function getMoreFilesLabel(count: number): string {
	return localize('worktreeSuggestion.moreFiles', "{0} more", count);
}

export function getSendInWorktreeLabel(): string {
	return localize('worktreeSuggestion.sendInWorktree', "Send in Worktree");
}

export function getSendLabel(): string {
	return localize('worktreeSuggestion.send', "Send");
}

/** The file a change describes. Like the Changes view, a deleted file is identified by its former path. */
export function getChangedFileUri(change: ISessionFileChange): URI {
	return isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
}

export interface IChangedFileLabel {
	readonly name: string;
	/** The file's folder relative to the session's folder, or `undefined` at its root. */
	readonly directory: string | undefined;
	/** The file's path relative to the session's folder. */
	readonly path: string;
}

/**
 * Labels a changed file relative to `folder`. A remote agent host reports changes with its own URI
 * scheme, so only paths are compared, as the agent host provider does for working directories.
 */
export function getChangedFileLabel(change: ISessionFileChange, folder: URI | undefined): IChangedFileLabel {
	const uri = getChangedFileUri(change);
	const candidate = folder?.with({ path: uri.path });
	const path = folder && candidate && extUriBiasedIgnorePathCase.isEqualOrParent(candidate, folder)
		? extUriBiasedIgnorePathCase.relativePath(folder, candidate)
		: undefined;
	if (path === undefined) {
		return { name: basename(uri), directory: posix.dirname(uri.path), path: uri.path };
	}
	const directory = posix.dirname(path);
	return { name: basename(uri), directory: directory === '.' ? undefined : directory, path };
}

/** The folder that changed files are labeled relative to: the repository of the suggestion's folder. */
export function getChangedFilesRoot(suggestion: IWorktreeSuggestion): URI | undefined {
	const folder = suggestion.session.workspace.get()?.folders[0];
	return folder?.gitRepository?.uri ?? folder?.workingDirectory;
}

/** The lines a change adds and removes, formatted like the Changes view, e.g. "+4 -1". */
export function formatChangeStats(change: ISessionFileChange): { readonly insertions: string; readonly deletions: string } {
	return { insertions: `+${change.insertions}`, deletions: `-${change.deletions}` };
}

/** Describes a changed file's folder and lines added and removed for screen readers, e.g. "src, +3 -3". */
export function getChangedFileAriaDescription(change: ISessionFileChange, label: IChangedFileLabel): string {
	const { insertions, deletions } = formatChangeStats(change);
	return label.directory
		? localize('worktreeSuggestion.changedFileAria', "{0}, {1} {2}", label.directory, insertions, deletions)
		: localize('worktreeSuggestion.changedFileAriaAtRoot', "{0} {1}", insertions, deletions);
}

/** Describes the number of uncommitted files shown after Branch, which the isolation picker lists. */
export function getUncommittedFilesDescription(suggestion: IWorktreeSuggestion): string {
	return localize('worktreeSuggestion.changedFiles.description', "{0} On Branch, the agent works alongside them.", getUncommittedChangesMessage(suggestion));
}

/**
 * Describes the worktree suggestion for the Agents window accessibility help. The text is the same in
 * every arm of the experiment, so reading it never exposes someone to a single presentation.
 */
export function getWorktreeSuggestionAccessibilityHelp(): string {
	return localize('worktreeSuggestion.copyHelp', "When Branch is selected for a new session in a folder with uncommitted changes, the Agents window may suggest New Worktree, in which the agent works on a separate copy of the files, so it does not change your uncommitted files. Depending on the suggestion, it appears as a spotlight on the isolation picker when you send the request, whose Send in Worktree button switches to New Worktree before sending, and whose Send button or Escape sends on Branch; as a hint below the input once you start typing, whose number of uncommitted files is a link that shows the changes, whose Use Worktree button opens the isolation picker, whose close button hides it for good, and which Escape hides for the session; or as the number of uncommitted files after Branch in the isolation picker, which lists them when opened. Use Tab or Shift+Tab to reach the actions.");
}
