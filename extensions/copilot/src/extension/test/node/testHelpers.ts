/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatContext, ChatPromptReference, ChatRequest, ChatRequestTurn, ChatResponseTurn, ExtendedChatResponsePart, Uri } from 'vscode';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { MarkdownString } from '../../../util/vs/base/common/htmlContent';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import * as vscodeTypes from '../../../vscodeTypes';

export class TestChatRequest implements ChatRequest {
	public command: string | undefined;
	public references: readonly ChatPromptReference[];
	public location: vscodeTypes.ChatLocation;
	public location2 = undefined;
	public attempt: number;
	public enableCommandDetection: boolean;
	public isParticipantDetected: boolean;
	public toolReferences = [];
	public toolInvocationToken: never = undefined as never;
	public model = null!;
	public tools = new Map();
	public id = generateUuid();
	public sessionId = generateUuid();
	public sessionResource = vscodeTypes.Uri.parse(`test://session/${this.sessionId}`);
	public hasHooksEnabled = false;

	constructor(
		public prompt: string,
		references?: ChatPromptReference[]
	) {
		this.references = references ?? [];
		this.location = vscodeTypes.ChatLocation.Panel;
		this.attempt = 0;
		this.enableCommandDetection = false;
		this.isParticipantDetected = false;
	}
}

export class TestChatContext implements ChatContext {
	readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
	readonly yieldRequested: boolean;

	constructor(history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn> = [], yieldRequested = false) {
		this.history = history;
		this.yieldRequested = yieldRequested;
	}
}

export class MockChatResponseStream extends ChatResponseStreamImpl {

	public output: string[] = [];
	public uris: string[] = [];
	public externalEditUris: Uri[] = [];
	constructor(push: ((part: ExtendedChatResponsePart) => void) = () => { }) {
		super(push, () => { }, undefined, undefined, undefined, () => Promise.resolve(undefined));
	}
	override markdown(content: string | MarkdownString): void {
		this.output.push(typeof content === 'string' ? content : content.value);
	}
	override warning(content: string | MarkdownString): void {
		super.warning(content);
		this.output.push(typeof content === 'string' ? content : content.value);
	}
	override codeblockUri(uri: URI): void {
		this.uris.push(uri.toString());
	}

	override async externalEdit(target: Uri | Uri[], callback: () => Thenable<void>): Promise<string> {
		if (Array.isArray(target)) {
			this.externalEditUris.push(...target);
		} else {
			this.externalEditUris.push(target);
		}
		await callback();
		return '';
	}
}
