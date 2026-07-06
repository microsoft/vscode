/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Command that reveals the full effective enterprise policy. Linked from the
 * read-only policy notice shown at the top of a new chat.
 */
export const SHOW_ENTERPRISE_POLICY_COMMAND_ID = 'github.copilot.chat.showEnterprisePolicy';

/**
 * Maximum number of characters of the effective enterprise policy shown inline
 * before the notice collapses the remainder behind a "Show full policy" link.
 */
const MAX_INLINE_POLICY_LENGTH = 160;

/**
 * Builds the read-only markdown source for the enterprise policy notice shown at
 * the top of a new chat, or `undefined` when no policy applies.
 *
 * The notice is purely informational: it surfaces the already-resolved policy
 * value so the user can see what their administrator has applied to Copilot. It
 * is never treated as a user prompt. Long policies are truncated to a short
 * preview with an interactive link to view the full text.
 *
 * @param policy The effective enterprise policy string, or `undefined`.
 * @returns The markdown source, or `undefined` when there is nothing to show.
 */
export function createEnterprisePolicyNoticeMarkdown(policy: string | undefined): string | undefined {
	const trimmed = policy?.trim();
	if (!trimmed) {
		return undefined;
	}

	const label = vscode.l10n.t('Enterprise policy (set by your administrator):');

	// Collapse whitespace so the notice stays on a compact single line regardless
	// of how the policy text was authored.
	const inline = trimmed.replace(/\s+/g, ' ');
	if (inline.length <= MAX_INLINE_POLICY_LENGTH) {
		return `> **${label}** ${inline}`;
	}

	const preview = inline.slice(0, MAX_INLINE_POLICY_LENGTH).trimEnd();
	const showFull = vscode.l10n.t('Show full policy');
	return `> **${label}** ${preview}… [${showFull}](command:${SHOW_ENTERPRISE_POLICY_COMMAND_ID})`;
}

/**
 * Builds the read-only {@link vscode.MarkdownString} notice shown at the top of
 * a new chat, or `undefined` when no policy applies.
 *
 * @param policy The effective enterprise policy string, or `undefined`.
 */
export function createEnterprisePolicyNotice(policy: string | undefined): vscode.MarkdownString | undefined {
	const content = createEnterprisePolicyNoticeMarkdown(policy);
	if (content === undefined) {
		return undefined;
	}

	const markdown = new vscode.MarkdownString(content);
	// Trust only the single command that reveals the full policy.
	markdown.isTrusted = { enabledCommands: [SHOW_ENTERPRISE_POLICY_COMMAND_ID] };
	return markdown;
}

/**
 * Shows the full effective enterprise policy in a read-only modal dialog. No-op
 * when no policy applies. Shared by the in-chat "Show full policy" command and
 * the startup notice.
 *
 * @param policy The effective enterprise policy string, or `undefined`.
 */
export async function showEnterprisePolicyModal(policy: string | undefined): Promise<void> {
	if (!policy?.trim()) {
		return;
	}
	await vscode.window.showInformationMessage(
		vscode.l10n.t('Enterprise policy (set by your administrator)'),
		{ modal: true, detail: policy },
	);
}
