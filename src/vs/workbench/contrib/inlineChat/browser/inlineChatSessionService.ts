/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IRange } from 'vs/editor/common/core/range';
import { IValidEditOperation } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { EditMode } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Session, StashedSession } from './inlineChatSession';

export interface ISessionKeyComputer {
	getComparisonKey(editor: ICodeEditor, uri: URI): string;
}

export const IInlineChatSessionService = createDecorator<IInlineChatSessionService>('IInlineChatSessionService');

export interface IInlineChatSessionEvent {
	readonly editor: ICodeEditor;
	readonly session: Session;
}

export interface IInlineChatSessionEndEvent extends IInlineChatSessionEvent {
	readonly endedByExternalCause: boolean;
}

export interface IInlineChatSessionService {
	_serviceBrand: undefined;

	onWillStartSession: Event<IActiveCodeEditor>;
	onDidMoveSession: Event<IInlineChatSessionEvent>;
	onDidStashSession: Event<IInlineChatSessionEvent>;
	onDidEndSession: Event<IInlineChatSessionEndEvent>;

	createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: IRange; session?: Session; headless?: boolean }, token: CancellationToken): Promise<Session | undefined>;

	moveSession(session: Session, newEditor: ICodeEditor): void;

	getCodeEditor(session: Session): ICodeEditor;

	getSession(editor: ICodeEditor, uri: URI): Session | undefined;

	releaseSession(session: Session): void;

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession;

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable;

	dispose(): void;
}
