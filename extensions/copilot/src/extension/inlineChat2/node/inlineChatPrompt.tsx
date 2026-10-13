/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, PromptElement, PromptElementProps, PromptReference, PromptSizing, SystemMessage, ToolMessage, useKeepWith, UserMessage } from '@vscode/prompt-tsx';
import { ChatResponsePart } from '@vscode/prompt-tsx/dist/base/vscodeTypes';
import type { CancellationToken, ExtendedLanguageModelToolResult, Position, Progress } from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { CacheType } from '../../../platform/endpoint/common/endpointTypes';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ChatRequest, ChatRequestEditorData, Range } from '../../../vscodeTypes';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { IToolCall } from '../../prompt/common/intents';
import { CopilotIdentityRules } from '../../prompts/node/base/copilotIdentity';
import { SafetyRules } from '../../prompts/node/base/safetyRules';
import { Tag } from '../../prompts/node/base/tag';
import { ChatVariables, UserQuery } from '../../prompts/node/panel/chatVariables';
import { CodeBlock } from '../../prompts/node/panel/safeElements';
import { ToolResult } from '../../prompts/node/panel/toolCalling';


/**
 * Threshold in lines above which a file is considered "large" and gets cropped in the prompt.
 */
export const LARGE_FILE_LINE_THRESHOLD = 250;

/** How many context lines to show around the cursor/selection in large files. */
const LARGE_FILE_CONTEXT_LINES = 100;

/** Context lines above/below selection in large files. */
const LARGE_FILE_SELECTION_CONTEXT_LINES = 25;

export interface ICompletedToolCallRound {
	readonly calls: readonly [IToolCall, ExtendedLanguageModelToolResult][];
}

export type InlineChat2PromptProps = PromptElementProps<{
	request: ChatRequest;
	snapshotAtRequest: TextDocumentSnapshot;
	data: ChatRequestEditorData;
	exitToolName: string;
	previousRounds: readonly ICompletedToolCallRound[];
	hasFailedEdits: boolean;
	isLargeFile?: boolean;
	readToolName?: string;
}>;

export class InlineChat2Prompt extends PromptElement<InlineChat2PromptProps> {

	constructor(
		props: InlineChat2PromptProps,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}


	override render(state: void, sizing: PromptSizing): Promise<any> {

		const snapshotAtRequest = this.props.snapshotAtRequest;

		const selection = this.props.data.selection;
		const isLargeFile = this.props.isLargeFile ?? false;
		const readToolName = this.props.readToolName;

		const variables = new ChatVariablesCollection(this.props.request.references);
		const filepath = this._promptPathRepresentationService.getFilePath(snapshotAtRequest.uri);

		// TODO@jrieken APPLY_PATCH_INSTRUCTIONS
		return (
			<>
				<SystemMessage priority={1000}>
					<CopilotIdentityRules />
					<SafetyRules />
					<Tag name='instructions'>
						You are an AI coding assistant that is used for quick, inline code changes. Changes are scoped to a single file or to some selected code in that file. You can ONLY edit that file and must use a tool to make these edits.<br />
						The user is interested in code changes grounded in the user's prompt. So, focus on coding, no wordy explanations, and do not ask back for clarifications.<br />
						Make all changes in a single invocation of the edit-tool (there is no tool calling loop).<br />
						{isLargeFile && readToolName && <>
							The file is large and only a portion is shown below. If you need to see more of the file to make the requested change, use the {readToolName} tool to read additional parts of this file before editing. Do NOT use it to read other files.<br />
						</>}
						Do not make code changes that are not directly and logically related to the user's prompt. When you cannot make a code change, reply with just a few words.<br />
					</Tag>
					<cacheBreakpoint type={CacheType} />
				</SystemMessage>
				<UserMessage>
					{isLargeFile
						? <CroppedFileContentElement snapshot={snapshotAtRequest} selection={selection} filepath={filepath} />
						: <>
							<>
								The filepath is `{filepath}` and this is its content:<br />
							</>
							<Tag name='file'>
								<CodeBlock includeFilepath={false} languageId={snapshotAtRequest.languageId} uri={snapshotAtRequest.uri} references={[new PromptReference(snapshotAtRequest.uri, undefined, undefined)]} code={snapshotAtRequest.getText()} />
							</Tag>
						</>
					}
					{selection.isEmpty
						? <FileContextElement snapshot={snapshotAtRequest} position={selection.start} />
						: <FileSelectionElement snapshot={snapshotAtRequest} selection={selection} />
					}
					<ChatVariables flexGrow={3} priority={898} chatVariables={variables} useFixCookbook={true} />
					<Tag name='reminder'>
						{selection.isEmpty
							? <>Make changes or write new code anywhere in the file.<br /></>
							: <>Focus on the selection, and try to make changes to the selected code and its context.<br /></>
						}
						Do not make code changes that are not directly and logically related to the user's prompt.<br />
						ONLY change the `{filepath}` file, make all changes in a single invocation of the edit-tool, and change NO other file.
					</Tag>
					<cacheBreakpoint type={CacheType} />
				</UserMessage>
				<UserMessage>
					<Tag name='prompt'>
						<UserQuery flexGrow={7} priority={900} chatVariables={variables} query={this.props.request.prompt} />
					</Tag>
					<cacheBreakpoint type={CacheType} />
				</UserMessage>
				<ToolCallRoundsElement
					previousRounds={this.props.previousRounds}
					hasFailedEdits={this.props.hasFailedEdits}
					data={this.props.data}
					documentVersionAtRequest={this.props.snapshotAtRequest.version}
					isLargeFile={this.props.isLargeFile ?? false}
					selection={selection}
					filepath={filepath}
				/>
			</>
		);
	}
}


type CroppedFileContentElementProps = PromptElementProps<{
	snapshot: TextDocumentSnapshot;
	selection: Range;
	filepath: string;
}>;

/**
 * Renders a cropped view of a large file, centered around the cursor/selection.
 */
class CroppedFileContentElement extends PromptElement<CroppedFileContentElementProps> {

	override render() {
		const { snapshot, selection, filepath } = this.props;
		const totalLines = snapshot.lineCount;

		let cropStart: number;
		let cropEnd: number;

		if (selection.isEmpty) {
			// Cursor only: show LARGE_FILE_CONTEXT_LINES centered on cursor, biased downward
			const cursorLine = selection.start.line;
			const linesAbove = Math.floor(LARGE_FILE_CONTEXT_LINES * 0.4);
			const linesBelow = LARGE_FILE_CONTEXT_LINES - linesAbove;
			cropStart = Math.max(0, cursorLine - linesAbove);
			cropEnd = Math.min(totalLines - 1, cursorLine + linesBelow);
		} else {
			// Selection: always include the full selection, plus context around it
			const selStart = selection.start.line;
			const selEnd = selection.end.line;
			cropStart = Math.max(0, selStart - LARGE_FILE_SELECTION_CONTEXT_LINES);
			cropEnd = Math.min(totalLines - 1, selEnd + LARGE_FILE_SELECTION_CONTEXT_LINES);
		}

		const croppedText = snapshot.getText(new Range(
			selection.start.with({ line: cropStart, character: 0 }),
			selection.start.with({ line: cropEnd, character: Number.MAX_SAFE_INTEGER }),
		));

		// 1-based line numbers for the hint
		const shownFrom = cropStart + 1;
		const shownTo = cropEnd + 1;

		return <>
			<>
				The filepath is `{filepath}` ({totalLines} lines total). Showing lines {shownFrom}-{shownTo}:<br />
			</>
			<Tag name='file'>
				<CodeBlock includeFilepath={false} languageId={snapshot.languageId} uri={snapshot.uri} references={[new PromptReference(snapshot.uri, undefined, undefined)]} code={croppedText} />
			</Tag>
		</>;
	}
}


export type FileContextElementProps = PromptElementProps<{
	snapshot: TextDocumentSnapshot;
	position: Position;
}>;

export class FileContextElement extends PromptElement<FileContextElementProps> {

	override render(state: void, sizing: PromptSizing, _progress?: Progress<ChatResponsePart>, _token?: CancellationToken) {

		let startLine = this.props.position.line;
		let endLine = this.props.position.line;
		let n = 0;
		let seenNonEmpty = false;
		while (startLine > 0) {
			seenNonEmpty = seenNonEmpty || !this.props.snapshot.lineAt(startLine).isEmptyOrWhitespace;
			startLine--;
			n++;
			if (n >= 3 && seenNonEmpty) {
				break;
			}
		}
		n = 0;
		seenNonEmpty = false;
		while (endLine < this.props.snapshot.lineCount - 1) {
			seenNonEmpty = seenNonEmpty || !this.props.snapshot.lineAt(endLine).isEmptyOrWhitespace;
			endLine++;
			n++;
			if (n >= 3 && seenNonEmpty) {
				break;
			}
		}

		const textBefore = this.props.snapshot.getText(new Range(this.props.position.with({ line: startLine, character: 0 }), this.props.position));
		const textAfter = this.props.snapshot.getText(new Range(this.props.position, this.props.position.with({ line: endLine, character: Number.MAX_SAFE_INTEGER })));

		const code = `${textBefore}$CURSOR$${textAfter}`;

		return <>
			<Tag name='file-cursor-context'>
				<CodeBlock includeFilepath={false} languageId={this.props.snapshot.languageId} uri={this.props.snapshot.uri} references={[new PromptReference(this.props.snapshot.uri, undefined, undefined)]} code={code} />
			</Tag>
		</>;
	}
}


export type FileSelectionElementProps = PromptElementProps<{
	snapshot: TextDocumentSnapshot;
	selection: Range;
}>;

export class FileSelectionElement extends PromptElement<FileSelectionElementProps> {

	override render(state: void, sizing: PromptSizing, progress?: Progress<ChatResponsePart>, token?: CancellationToken) {

		// the full lines of the selection
		// TODO@jrieken
		// * use the true selected text (now we extend to full lines)

		const selectedLines = this.props.snapshot.getText(this.props.selection.with({
			start: this.props.selection.start.with({ character: 0 }),
			end: this.props.selection.end.with({ character: Number.MAX_SAFE_INTEGER }),
		}));

		return <>
			<Tag name='file-selection'>
				<CodeBlock includeFilepath={false} languageId={this.props.snapshot.languageId} uri={this.props.snapshot.uri} references={[new PromptReference(this.props.snapshot.uri, undefined, undefined)]} code={selectedLines} />
			</Tag>
		</>;
	}
}


type ToolCallRoundsElementProps = PromptElementProps<{
	previousRounds: readonly ICompletedToolCallRound[];
	hasFailedEdits: boolean;
	data: ChatRequestEditorData;
	documentVersionAtRequest: number;
	isLargeFile: boolean;
	selection: Range;
	filepath: string;
}>;

/**
 * Renders all previous tool call rounds in order, each as an AssistantMessage/ToolMessage pair.
 * If any edits failed, appends a single feedback UserMessage at the end.
 */
export class ToolCallRoundsElement extends PromptElement<ToolCallRoundsElementProps> {

	override render() {
		if (this.props.previousRounds.length === 0) {
			return;
		}

		const documentNow = this.props.data.document;

		return <>
			{this.props.previousRounds.map(round => {
				const KeepWith = useKeepWith();
				return <>
					<AssistantMessage toolCalls={round.calls.map(([toolCall]) => ({
						type: 'function' as const,
						id: toolCall.id,
						function: { name: toolCall.name, arguments: toolCall.arguments },
						keepWith: KeepWith
					}))} />
					{round.calls.map(([toolCall, result]) => (
						<KeepWith>
							<ToolMessage toolCallId={toolCall.id}>
								<ToolResult content={result.content} toolCallId={toolCall.id} />
							</ToolMessage>
						</KeepWith>
					))}
				</>;
			})}
			{this.props.hasFailedEdits && <UserMessage>
				{documentNow.version === this.props.documentVersionAtRequest && <>
					<Tag name='feedback'>
						Editing this file did not produce the desired result. No changes were made. Understand the previous edit attempts and the original file content, and <br />
						produce a better edit.<br />
					</Tag>
				</>}
				{documentNow.version !== this.props.documentVersionAtRequest && <>
					<Tag name='feedback'>
						Editing this file did not produce the desired result. Understand the previous edit attempts and the current file content, and <br />
						produce a better edit. This is the current file content:<br />
					</Tag>
					{this.props.isLargeFile
						? <CroppedFileContentElement snapshot={TextDocumentSnapshot.create(documentNow)} selection={this.props.selection} filepath={this.props.filepath} />
						: <Tag name='file'>
							<CodeBlock includeFilepath={false} languageId={documentNow.languageId} uri={documentNow.uri} references={[new PromptReference(documentNow.uri, undefined, undefined)]} code={documentNow.getText()} />
						</Tag>
					}
				</>}
			</UserMessage>}
		</>;
	}
}
