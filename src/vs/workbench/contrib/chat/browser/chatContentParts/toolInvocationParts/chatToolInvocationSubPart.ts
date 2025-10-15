/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService.js';
import { IChatCodeBlockInfo } from '../../chat.js';

export abstract class BaseChatToolInvocationSubPart extends Disposable {
	protected static idPool = 0;
	public abstract readonly domNode: HTMLElement;

	protected _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	protected _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public abstract codeblocks: IChatCodeBlockInfo[];

	public readonly codeblocksPartId = 'tool-' + (BaseChatToolInvocationSubPart.idPool++);

	constructor(
		protected readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
	) {
		super();

		if (toolInvocation.kind === 'toolInvocation' && !toolInvocation.isComplete) {
			toolInvocation.isCompletePromise.then(() => this._onNeedsRerender.fire());
		}
	}

	protected getIcon() {
		const toolInvocation = this.toolInvocation;
		const isSkipped = typeof toolInvocation.isConfirmed !== 'boolean' && toolInvocation.isConfirmed?.type === ToolConfirmKind.Skipped;
		if (isSkipped) {
			return Codicon.circleSlash;
		}
		const isConfirmed = typeof toolInvocation.isConfirmed === 'boolean'
			? toolInvocation.isConfirmed
			: toolInvocation.isConfirmed?.type !== ToolConfirmKind.Denied;
		return !isConfirmed ?
			Codicon.error :
			toolInvocation.isComplete ?
				Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
	}
}
