/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asPromise } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import * as extHostTypeConverter from 'vs/workbench/api/node/extHostTypeConverters';
import * as types from 'vs/workbench/api/node/extHostTypes';
import * as vscode from 'vscode';
import { ExtHostCommentsShape, IMainContext, MainContext, MainThreadCommentsShape } from '../common/extHost.protocol';
import { CommandsConverter, ExtHostCommands } from './extHostCommands';
import { IRange } from 'vs/editor/common/core/range';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { debounce } from 'vs/base/common/decorators';

type ProviderHandle = number;

export class ExtHostComments implements ExtHostCommentsShape {
	private static handlePool = 0;

	private _proxy: MainThreadCommentsShape;

	private _commentControllers: Map<ProviderHandle, ExtHostCommentController> = new Map<ProviderHandle, ExtHostCommentController>();

	private _commentControllersByExtension: Map<string, ExtHostCommentController[]> = new Map<string, ExtHostCommentController[]>();

	constructor(
		mainContext: IMainContext,
		private _commands: ExtHostCommands,
		private readonly _documents: ExtHostDocuments,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadComments);

		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 6) {
					const commentController = this._commentControllers.get(arg.handle);

					if (!commentController) {
						return arg;
					}

					return commentController;
				} else if (arg && arg.$mid === 7) {
					const commentController = this._commentControllers.get(arg.commentControlHandle);

					if (!commentController) {
						return arg;
					}

					const commentThread = commentController.getCommentThread(arg.commentThreadHandle);

					if (!commentThread) {
						return arg;
					}

					return commentThread;
				}

				return arg;
			}
		});
	}

	createCommentController(extension: IExtensionDescription, id: string, label: string): vscode.CommentController {
		const handle = ExtHostComments.handlePool++;
		const commentController = new ExtHostCommentController(extension, handle, this._commands.converter, this._proxy, id, label);
		this._commentControllers.set(commentController.handle, commentController);

		const commentControllers = this._commentControllersByExtension.get(ExtensionIdentifier.toKey(extension.identifier)) || [];
		commentControllers.push(commentController);
		this._commentControllersByExtension.set(ExtensionIdentifier.toKey(extension.identifier), commentControllers);

		return commentController;
	}

	$onCommentWidgetInputChange(commentControllerHandle: number, input: string): Promise<number | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve(undefined);
		}

		commentController.$onCommentWidgetInputChange(input);
		return Promise.resolve(commentControllerHandle);
	}

	$provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: CancellationToken): Promise<IRange[] | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.commentingRangeProvider) {
			return Promise.resolve(undefined);
		}

		const document = this._documents.getDocument(URI.revive(uriComponents));
		return asPromise(() => {
			return commentController.commentingRangeProvider!.provideCommentingRanges(document, token);
		}).then(ranges => ranges ? ranges.map(x => extHostTypeConverter.Range.from(x)) : undefined);
	}

	$provideReactionGroup(commentControllerHandle: number): Promise<modes.CommentReaction[] | undefined> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.reactionProvider) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => {
			return commentController!.reactionProvider!.availableReactions;
		}).then(reactions => reactions.map(reaction => convertToReaction(commentController.reactionProvider, reaction)));
	}

	$toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: modes.Comment, reaction: modes.CommentReaction): Promise<void> {
		const document = this._documents.getDocument(URI.revive(uri));
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController || !commentController.reactionProvider || !commentController.reactionProvider.toggleReaction) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => {
			const commentThread = commentController.getCommentThread(threadHandle);
			if (commentThread) {
				const vscodeComment = commentThread.getComment(comment.commentId);

				if (commentController !== undefined && commentController.reactionProvider && commentController.reactionProvider.toggleReaction && vscodeComment) {
					return commentController.reactionProvider.toggleReaction(document, vscodeComment, convertFromReaction(reaction));
				}
			}

			return Promise.resolve(undefined);
		});
	}

	$createNewCommentWidgetCallback(commentControllerHandle: number, uriComponents: UriComponents, range: IRange, token: CancellationToken): Promise<void> {
		const commentController = this._commentControllers.get(commentControllerHandle);

		if (!commentController) {
			return Promise.resolve();
		}

		if (!(commentController as any).emptyCommentThreadFactory && !(commentController.commentingRangeProvider && commentController.commentingRangeProvider.createEmptyCommentThread)) {
			return Promise.resolve();
		}

		const document = this._documents.getDocument(URI.revive(uriComponents));
		return asPromise(() => {
			// TODO, remove this once GH PR stable deprecates `emptyCommentThreadFactory`.
			if ((commentController as any).emptyCommentThreadFactory) {
				return (commentController as any).emptyCommentThreadFactory!.createEmptyCommentThread(document, extHostTypeConverter.Range.to(range));
			}

			if (commentController.commentingRangeProvider && commentController.commentingRangeProvider.createEmptyCommentThread) {
				return commentController.commentingRangeProvider.createEmptyCommentThread(document, extHostTypeConverter.Range.to(range));
			}
		}).then(() => Promise.resolve());
	}
}

export class ExtHostCommentThread implements vscode.CommentThread {
	private static _handlePool: number = 0;
	readonly handle = ExtHostCommentThread._handlePool++;
	get threadId(): string {
		return this._threadId;
	}

	get resource(): vscode.Uri {
		return this._resource;
	}

	private _onDidUpdateCommentThread = new Emitter<void>();
	readonly onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;

	set range(range: vscode.Range) {
		if (range.isEqual(this._range)) {
			this._range = range;
			this._onDidUpdateCommentThread.fire();
		}
	}

	get range(): vscode.Range {
		return this._range;
	}

	private _label: string;

	get label(): string {
		return this._label;
	}

	set label(label: string) {
		this._label = label;
		this._onDidUpdateCommentThread.fire();
	}

	get comments(): vscode.Comment[] {
		return this._comments;
	}

	set comments(newComments: vscode.Comment[]) {
		this._comments = newComments;
		this._onDidUpdateCommentThread.fire();
	}

	private _acceptInputCommand: vscode.Command;
	get acceptInputCommand(): vscode.Command {
		return this._acceptInputCommand;
	}

	set acceptInputCommand(acceptInputCommand: vscode.Command) {
		this._acceptInputCommand = acceptInputCommand;
		this._onDidUpdateCommentThread.fire();
	}

	private _additionalCommands: vscode.Command[] = [];
	get additionalCommands(): vscode.Command[] {
		return this._additionalCommands;
	}

	set additionalCommands(additionalCommands: vscode.Command[]) {
		this._additionalCommands = additionalCommands;
		this._onDidUpdateCommentThread.fire();
	}

	private _deleteCommand?: vscode.Command;
	get deleteComand(): vscode.Command | undefined {
		return this._deleteCommand;
	}

	set deleteCommand(deleteCommand: vscode.Command) {
		this._deleteCommand = deleteCommand;
		this._onDidUpdateCommentThread.fire();
	}

	private _collapseState?: vscode.CommentThreadCollapsibleState;

	get collapsibleState(): vscode.CommentThreadCollapsibleState {
		return this._collapseState!;
	}

	set collapsibleState(newState: vscode.CommentThreadCollapsibleState) {
		this._collapseState = newState;
		this._onDidUpdateCommentThread.fire();
	}

	private _localDisposables: types.Disposable[];

	constructor(
		private _proxy: MainThreadCommentsShape,
		private readonly _commandsConverter: CommandsConverter,
		private _commentController: ExtHostCommentController,
		private _threadId: string,
		private _resource: vscode.Uri,
		private _range: vscode.Range,
		private _comments: vscode.Comment[]
	) {
		this._proxy.$createCommentThread(
			this._commentController.handle,
			this.handle,
			this._threadId,
			this._resource,
			extHostTypeConverter.Range.from(this._range)
		);

		this._localDisposables = [];

		this._localDisposables.push(this.onDidUpdateCommentThread(() => {
			this.eventuallyUpdateCommentThread();
		}));

		// set up comments after ctor to batch update events.
		this.comments = _comments;
	}

	@debounce(100)
	eventuallyUpdateCommentThread(): void {
		const commentThreadRange = extHostTypeConverter.Range.from(this._range);
		const label = this.label;
		const comments = this._comments.map(cmt => { return convertToModeComment(this._commentController, cmt, this._commandsConverter); });
		const acceptInputCommand = this._acceptInputCommand ? this._commandsConverter.toInternal(this._acceptInputCommand) : undefined;
		const additionalCommands = this._additionalCommands ? this._additionalCommands.map(x => this._commandsConverter.toInternal(x)) : [];
		const deleteCommand = this._deleteCommand ? this._commandsConverter.toInternal(this._deleteCommand) : undefined;
		const collapsibleState = convertToCollapsibleState(this._collapseState);

		this._proxy.$updateCommentThread(
			this._commentController.handle,
			this.handle,
			this._threadId,
			this._resource,
			commentThreadRange,
			label,
			comments,
			acceptInputCommand,
			additionalCommands,
			deleteCommand,
			collapsibleState
		);
	}

	getComment(commentId: string): vscode.Comment | undefined {
		const comments = this._comments.filter(comment => comment.commentId === commentId);

		if (comments && comments.length) {
			return comments[0];
		}

		return undefined;
	}

	dispose() {
		this._localDisposables.forEach(disposable => disposable.dispose());
		this._proxy.$deleteCommentThread(
			this._commentController.handle,
			this.handle
		);
	}

}

export class ExtHostCommentInputBox implements vscode.CommentInputBox {
	private _onDidChangeValue = new Emitter<string>();

	get onDidChangeValue(): Event<string> {
		return this._onDidChangeValue.event;
	}
	private _value: string = '';
	get value(): string {
		return this._value;
	}

	set value(newInput: string) {
		this._value = newInput;
		this._onDidChangeValue.fire(this._value);
		this._proxy.$setInputValue(this.commentControllerHandle, newInput);
	}

	constructor(
		private _proxy: MainThreadCommentsShape,

		public commentControllerHandle: number,
		input: string
	) {
		this._value = input;
	}

	setInput(input: string) {
		this._value = input;
	}
}
class ExtHostCommentController implements vscode.CommentController {
	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	public inputBox?: ExtHostCommentInputBox;
	public activeCommentingRange?: vscode.Range;

	public get handle(): number {
		return this._handle;
	}

	private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();
	commentingRangeProvider?: vscode.CommentingRangeProvider;

	private _commentReactionProvider?: vscode.CommentReactionProvider;

	get reactionProvider(): vscode.CommentReactionProvider | undefined {
		return this._commentReactionProvider;
	}

	set reactionProvider(provider: vscode.CommentReactionProvider | undefined) {
		this._commentReactionProvider = provider;
		if (provider) {
			this._proxy.$updateCommentControllerFeatures(this.handle, { reactionGroup: provider.availableReactions.map(reaction => convertToReaction(provider, reaction)) });
		}
	}

	constructor(
		_extension: IExtensionDescription,
		private _handle: number,
		private readonly _commandsConverter: CommandsConverter,
		private _proxy: MainThreadCommentsShape,
		private _id: string,
		private _label: string
	) {
		this._proxy.$registerCommentController(this.handle, _id, _label);
	}

	createCommentThread(id: string, resource: vscode.Uri, range: vscode.Range, comments: vscode.Comment[]): vscode.CommentThread {
		const commentThread = new ExtHostCommentThread(this._proxy, this._commandsConverter, this, id, resource, range, comments);
		this._threads.set(commentThread.handle, commentThread);
		return commentThread;
	}

	$onCommentWidgetInputChange(input: string) {
		if (!this.inputBox) {
			this.inputBox = new ExtHostCommentInputBox(this._proxy, this.handle, input);
		} else {
			this.inputBox.setInput(input);
		}
	}

	getCommentThread(handle: number) {
		return this._threads.get(handle);
	}

	dispose(): void {
		this._threads.forEach(value => {
			value.dispose();
		});

		this._proxy.$unregisterCommentController(this.handle);
	}
}

function convertToModeComment(commentController: ExtHostCommentController, vscodeComment: vscode.Comment, commandsConverter: CommandsConverter): modes.Comment {
	const iconPath = vscodeComment.userIconPath.toString();

	return {
		commentId: vscodeComment.commentId,
		body: extHostTypeConverter.MarkdownString.from(vscodeComment.body),
		userName: vscodeComment.userName,
		userIconPath: iconPath,
		selectCommand: vscodeComment.selectCommand ? commandsConverter.toInternal(vscodeComment.selectCommand) : undefined,
		editCommand: vscodeComment.editCommand ? commandsConverter.toInternal(vscodeComment.editCommand) : undefined,
		deleteCommand: vscodeComment.deleteCommand ? commandsConverter.toInternal(vscodeComment.deleteCommand) : undefined,
		label: vscodeComment.label,
		commentReactions: vscodeComment.commentReactions ? vscodeComment.commentReactions.map(reaction => convertToReaction(commentController.reactionProvider, reaction)) : undefined
	};
}

function convertToReaction(provider: vscode.CommentReactionProvider | undefined, reaction: vscode.CommentReaction): modes.CommentReaction {
	return {
		label: reaction.label,
		iconPath: reaction.iconPath ? extHostTypeConverter.pathOrURIToURI(reaction.iconPath) : undefined,
		count: reaction.count,
		hasReacted: reaction.hasReacted,
		canEdit: provider !== undefined ? !!provider.toggleReaction : false
	};
}

function convertFromReaction(reaction: modes.CommentReaction): vscode.CommentReaction {
	return {
		label: reaction.label,
		count: reaction.count,
		hasReacted: reaction.hasReacted
	};
}

function convertToCollapsibleState(kind: vscode.CommentThreadCollapsibleState | undefined): modes.CommentThreadCollapsibleState {
	if (kind !== undefined) {
		switch (kind) {
			case types.CommentThreadCollapsibleState.Expanded:
				return modes.CommentThreadCollapsibleState.Expanded;
			case types.CommentThreadCollapsibleState.Collapsed:
				return modes.CommentThreadCollapsibleState.Collapsed;
		}
	}
	return modes.CommentThreadCollapsibleState.Collapsed;
}