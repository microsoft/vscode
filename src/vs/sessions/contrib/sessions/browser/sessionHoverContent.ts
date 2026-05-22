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
import { ISession } from '../../../services/sessions/common/session.js';

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
	const md = new MarkdownString('', { isTrusted: true, supportThemeIcons: true, supportHtml: true });

	// Line 1: session icon + bold title
	const title = session.title.get() || localize('agentSessions.newSession', "New Session");
	if (session.icon) {
		md.appendMarkdown(`$(${session.icon.id}) `);
	}
	md.appendMarkdown(`**`);
	md.appendText(title);
	md.appendMarkdown(`**`);
	md.appendText('\n');

	// Line 2: folder path · branch
	const workspace = session.workspace.get();
	const folder = workspace?.folders[0];
	const detailParts: string[] = [];

	if (folder && workspace) {
		const isWorkspaceSession = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === undefined;
		const folderIcon = workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceSession ? Codicon.folder : Codicon.worktree;
		detailParts.push(`$(${folderIcon.id}) ${folder.root.fsPath}`);
	}

	const branch = folder?.gitRepository?.branchName?.trim();
	if (branch) {
		detailParts.push(`$(git-branch) ${branch}`);
	}

	if (detailParts.length > 0) {
		md.appendMarkdown(detailParts.join(' · '));
		md.appendText('\n');
	}

	// Line 3: file count · diff stats
	const changes = session.changes.get();
	if (changes.length > 0) {
		let insertions = 0;
		let deletions = 0;
		for (const change of changes) {
			insertions += change.insertions;
			deletions += change.deletions;
		}
		if (insertions > 0 || deletions > 0) {
			const fileText = changes.length === 1
				? localize('agentSessions.fileChanged', "1 file changed")
				: localize('agentSessions.filesChanged', "{0} files changed", changes.length);
			md.appendMarkdown(`${fileText} · <span style="color:${asCssVariable(chatLinesAddedForeground)};">+${insertions}</span> <span style="color:${asCssVariable(chatLinesRemovedForeground)};">-${deletions}</span>`);
			md.appendText('\n');
		}
	}

	// Line 4: provider name
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (provider) {
		md.appendText(provider.label);
	}

	return md;
}
