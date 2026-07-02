/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { chatLinesAddedForeground, chatLinesRemovedForeground } from '../../../../workbench/contrib/chat/common/widget/chatColors.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getUntitledSessionTitle, ISession } from '../../../services/sessions/common/session.js';

/**
 * Aggregated insertions/deletions across all of a session's changes,
 * or `undefined` when the session has no pending changes.
 */
export function getSessionDiffStats(session: ISession): { files: number; insertions: number; deletions: number } | undefined {
	const changes = session.changes.get();
	if (changes.length === 0) {
		return undefined;
	}
	let insertions = 0;
	let deletions = 0;
	for (const change of changes) {
		insertions += change.insertions;
		deletions += change.deletions;
	}
	if (insertions === 0 && deletions === 0) {
		return undefined;
	}
	return { files: changes.length, insertions, deletions };
}

/**
 * Build a compact, reusable hover markdown describing a session.
 *
 * Layout:
 *   Line 1: **session icon + title**
 *   Line 2: folder icon + folder path · git branch
 *   Line 3: "N files changed" · colored diff stats
 *   Line 4: provider label
 */
export function buildSessionHoverContent(
	session: ISession,
	sessionsProvidersService: ISessionsProvidersService,
): IMarkdownString {
	// Note: `isTrusted` is intentionally left undefined. The hover renders
	// untrusted, workspace-derived values (folder paths, branch names, session
	// titles), so it must not enable command-link execution. User-controlled
	// text is always appended via `appendText` so markdown characters are escaped.
	const md = new MarkdownString('', { supportThemeIcons: true, supportHtml: true });

	// Line 1: session icon + bold title
	const title = session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false);
	if (session.icon) {
		md.appendMarkdown(`$(${session.icon.id}) `);
	}
	md.appendMarkdown(`**`);
	md.appendText(title);
	md.appendMarkdown(`**`);
	md.appendText('\n');

	// Line 2: folder icon + folder path · git branch
	const workspace = session.workspace.get();
	const folder = workspace?.folders[0];
	const branch = folder?.gitRepository?.branchName?.trim();
	let appendedDetails = false;

	if (folder && workspace) {
		const isWorkspaceSession = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === undefined;
		const folderIcon = workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceSession ? Codicon.folder : Codicon.worktree;
		md.appendMarkdown(`$(${folderIcon.id}) `);
		md.appendText(folder.root.fsPath);
		appendedDetails = true;
	}

	if (branch) {
		if (appendedDetails) {
			md.appendMarkdown(' · ');
		}
		md.appendMarkdown('$(git-branch) ');
		md.appendText(branch);
		appendedDetails = true;
	}

	if (appendedDetails) {
		md.appendText('\n');
	}

	// Line 3: file count · diff stats
	const diffStats = getSessionDiffStats(session);
	if (diffStats) {
		const fileText = diffStats.files === 1
			? localize('agentSessions.fileChanged', "1 file changed")
			: localize('agentSessions.filesChanged', "{0} files changed", diffStats.files);
		md.appendMarkdown(`${fileText} · <span style="color:${asCssVariable(chatLinesAddedForeground)};">+${diffStats.insertions}</span> <span style="color:${asCssVariable(chatLinesRemovedForeground)};">-${diffStats.deletions}</span>`);
		md.appendText('\n');
	}

	// Line 4: provider name
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (provider) {
		md.appendText(provider.label);
	}

	return md;
}
