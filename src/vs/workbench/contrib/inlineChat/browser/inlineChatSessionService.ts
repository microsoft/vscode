/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { EditMode, IInlineChatSession, IInlineChatResponse } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IRange } from 'vs/editor/common/core/range';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Session } from './inlineChatSession';


export type Recording = {
	when: Date;
	session: IInlineChatSession;
	exchanges: { prompt: string; res: IInlineChatResponse }[];
};

export interface ISessionKeyComputer {
	getComparisonKey(editor: ICodeEditor, uri: URI): string;
}

export const IInlineChatSessionService = createDecorator<IInlineChatSessionService>('IInlineChatSessionService');

export interface IInlineChatSessionService {
	_serviceBrand: undefined;

	onWillStartSession: Event<IActiveCodeEditor>;

	onDidMoveSession: Event<{ editor: ICodeEditor; session: Session }>;

	onDidEndSession: Event<{ editor: ICodeEditor; session: Session }>;

	createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: IRange }, token: CancellationToken): Promise<Session | undefined>;

	moveSession(session: Session, newEditor: ICodeEditor): void;

	getCodeEditor(session: Session): ICodeEditor;

	getSession(editor: ICodeEditor, uri: URI): Session | undefined;

	releaseSession(session: Session): void;

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable;

	//
	recordings(): readonly Recording[];

	dispose(): void;
}
