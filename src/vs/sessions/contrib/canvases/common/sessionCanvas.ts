/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IChat, ISession, ISessionCanvas } from '../../../services/sessions/common/session.js';

/** Presentation preference only; runtime admission remains provider-owned. */
export const SessionCanvasesEnabledSettingId = 'sessions.experimental.canvases.enabled';

export interface ISessionCanvasReference {
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
	readonly canvas: URI;
}

export interface ISessionCanvasTarget {
	readonly session: ISession;
	readonly chat: IChat;
	readonly canvas: ISessionCanvas;
}

export const ISessionCanvasService = createDecorator<ISessionCanvasService>('sessionCanvasService');

export interface ISessionCanvasService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	getTarget(reference: ISessionCanvasReference, reader?: IReader): ISessionCanvasTarget | undefined;
	isActiveOwner(reference: ISessionCanvasReference, reader?: IReader): boolean;
}

function createInputResource(reference: ISessionCanvasReference): URI {
	return URI.from({
		scheme: 'session-canvas',
		path: '/canvas',
		query: encodeURIComponent(JSON.stringify({
			providerId: reference.providerId,
			session: reference.session.toString(),
			chat: reference.chat.toString(),
			canvas: reference.canvas.toString(),
		})),
	});
}

export class SessionCanvasInput extends EditorInput {

	static readonly ID = 'sessions.editorInput.canvas';
	static readonly EDITOR_ID = 'sessions.editor.canvas';

	readonly resource: URI;
	readonly canvas = observableValue<ISessionCanvas | undefined>(this, undefined);

	constructor(readonly reference: ISessionCanvasReference, canvas: ISessionCanvas) {
		super();
		this.resource = createInputResource(reference);
		this.canvas.set(canvas, undefined);
	}

	override get typeId(): string { return SessionCanvasInput.ID; }
	override get editorId(): string { return SessionCanvasInput.EDITOR_ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal; }
	override getName(): string { return this.canvas.get()?.title ?? localize('canvas.editorName', "Canvas"); }
	override getDescription(): string { return localize('canvas.editorDescription', "Closing this tab hides the canvas until the agent opens it again."); }
	override getIcon(): ThemeIcon { return Codicon.preview; }
	override getTitle(_verbosity?: Verbosity): string { return this.getName(); }
	override canReopen(): boolean { return false; }

	setCanvas(canvas: ISessionCanvas): void {
		const previous = this.canvas.get();
		this.canvas.set(canvas, undefined);
		if (previous?.title !== canvas.title) {
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof SessionCanvasInput ? isEqual(this.resource, other.resource) : super.matches(other);
	}
}
