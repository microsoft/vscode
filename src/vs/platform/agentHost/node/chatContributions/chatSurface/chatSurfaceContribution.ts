/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { splitLinesIncludeSeparators } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { IFileService } from '../../../../files/common/files.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { createEditorInlineChatInstruction, createTerminalChatInstruction } from '../../../common/meta/agentChatSurfaceMeta.js';
import { MessageAttachmentKind, type MessageResourceAttachment, type TextRange } from '../../../common/state/protocol/state.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

const MAX_EDITOR_INLINE_CONTEXT_LINES = 16;
const MAX_EDITOR_INLINE_CONTEXT_CHARACTERS = 4096;
const MAX_EDITOR_INLINE_CONTEXT_LINE_CHARACTERS = 220;
const MAX_EDITOR_INLINE_CONTEXT_SOURCE_BYTES = 1024 * 1024;
const EDITOR_INLINE_CONTEXT_LINES_BEFORE_TARGET = 4;

/** Adds guidance tailored to the chat surface that created the session. */
export class ChatSurfaceContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatSurface';
	readonly order = 300;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const surface = this._stateManager.getSessionSurfaceMeta(turn.session);
		const instruction = surface?.surface === 'terminal'
			? createTerminalChatInstruction(surface)
			: surface?.surface === 'editorInline'
				? createEditorInlineChatInstruction(surface)
				: undefined;
		const text = surface?.surface === 'editorInline'
			? await this._withEditorInlineContext(turn, surface.targetUri)
			: undefined;
		return instruction || text
			? {
				...(instruction ? { instructions: [instruction] } : {}),
				...(text ? { text } : {}),
			}
			: undefined;
	}

	private async _withEditorInlineContext(turn: IOutgoingTurn, targetUri: string | undefined): Promise<string | undefined> {
		const attachments = turn.message.attachments?.filter((candidate): candidate is MessageResourceAttachment =>
			candidate.type === MessageAttachmentKind.Resource && candidate.selection !== undefined) ?? [];
		let attachment: MessageResourceAttachment | undefined;
		if (targetUri) {
			try {
				const target = URI.parse(targetUri);
				attachment = attachments.find(candidate => extUriBiasedIgnorePathCase.isEqual(URI.parse(candidate.uri), target));
			} catch (error) {
				this._logService.warn(`[ChatSurfaceContribution] Invalid editor inline target URI '${targetUri}': ${getErrorMessage(error)}`);
			}
		}
		attachment ??= attachments.length === 1 ? attachments[0] : undefined;
		if (!attachment) {
			return undefined;
		}
		const selection = attachment.selection;
		if (!selection) {
			return undefined;
		}
		try {
			const content = await this._fileService.readFile(URI.parse(attachment.uri), { limits: { size: MAX_EDITOR_INLINE_CONTEXT_SOURCE_BYTES } });
			const context = createEditorInlineContext(content.value.toString(), selection.range);
			if (!context) {
				return undefined;
			}
			return `<editor_inline_context>\nFile: ${attachment.label}\n${context}\n</editor_inline_context>\n\n${turn.message.text}`;
		} catch (error) {
			this._logService.warn(`[ChatSurfaceContribution] Failed to read editor inline context for ${attachment.uri}: ${getErrorMessage(error)}`);
			return undefined;
		}
	}
}

function createEditorInlineContext(text: string, range: TextRange): string | undefined {
	const lines = splitLinesIncludeSeparators(text);
	if (range.start.line < 0 || range.start.line >= lines.length) {
		return undefined;
	}
	const targetStartLine = range.start.line;
	const targetEndLine = Math.max(targetStartLine, Math.min(range.end.line, lines.length - 1));
	const startLine = Math.max(0, targetStartLine - EDITOR_INLINE_CONTEXT_LINES_BEFORE_TARGET);
	const endLine = Math.min(lines.length - 1, startLine + MAX_EDITOR_INLINE_CONTEXT_LINES - 1);
	const lineNumberWidth = String(endLine + 1).length;
	let context = `Target ${targetStartLine + 1}:${range.start.character + 1}-${targetEndLine + 1}:${range.end.character + 1}; '>' marks target lines:`;
	for (let line = startLine; line <= endLine; line++) {
		const lineText = lines[line].replace(/\r\n|\r|\n$/, '');
		const displayedText = lineText.length > MAX_EDITOR_INLINE_CONTEXT_LINE_CHARACTERS
			? `${lineText.slice(0, MAX_EDITOR_INLINE_CONTEXT_LINE_CHARACTERS - 3)}...`
			: lineText;
		const marker = line >= targetStartLine && line <= targetEndLine ? '>' : ' ';
		context += `\n${marker} ${String(line + 1).padStart(lineNumberWidth)} | ${displayedText}`;
	}
	return context.slice(0, MAX_EDITOR_INLINE_CONTEXT_CHARACTERS);
}
