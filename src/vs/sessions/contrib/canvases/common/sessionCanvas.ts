/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import type { IReference } from '../../../../base/common/lifecycle.js';
import type { IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator, type IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, type IEditorSerializer, type IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { SessionCanvasUri, type CanvasEntry, type ISessionCanvasReference, type ISessionCanvases, type SessionCanvasOpenOptions } from '../../../services/sessions/common/sessionCanvases.js';
import type { IChat, ISession } from '../../../services/sessions/common/session.js';
import type { SessionCanvasPresentation } from './sessionCanvasPresentation.js';

export interface ISessionCanvasTarget {
	readonly session: ISession;
	readonly chat: IChat;
	readonly canvases: ISessionCanvases;
}

export const ISessionCanvasService = createDecorator<ISessionCanvasService>('sessionCanvasService');

export interface ISessionCanvasService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	getTarget(session: URI, chat: URI, reader?: IReader): ISessionCanvasTarget | undefined;
	getInput(resource: URI): SessionCanvasInput;
	isVisibleOwner(reference: ISessionCanvasReference, reader?: IReader): boolean;
	isClosing(reference: ISessionCanvasReference, reader?: IReader): boolean;
	acquirePresentation(input: SessionCanvasInput, windowId: number): IReference<SessionCanvasPresentation> | undefined;
	open(target: ISessionCanvasTarget, options: SessionCanvasOpenOptions): Promise<URI>;
	reveal(target: ISessionCanvasTarget, canvas: CanvasEntry, preserveFocus?: boolean): Promise<URI>;
	close(reference: ISessionCanvasReference): Promise<void>;
	restart(reference: ISessionCanvasReference): Promise<void>;
	reload(reference: ISessionCanvasReference): void;
}

export class SessionCanvasInput extends EditorInput {
	static readonly ID = 'sessions.editorInput.canvas';
	static readonly EDITOR_ID = 'sessions.editor.canvas';
	readonly reference: ISessionCanvasReference;
	private title = localize('canvas.editorName', "Canvas");

	constructor(override readonly resource: URI) {
		super();
		const reference = SessionCanvasUri.parse(resource);
		if (!reference) {
			throw new Error('Invalid logical canvas reference.');
		}
		this.reference = reference;
	}

	override get typeId(): string { return SessionCanvasInput.ID; }
	override get editorId(): string { return SessionCanvasInput.EDITOR_ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal; }
	override getName(): string { return this.title; }
	setTitle(title: string): void {
		if (this.title !== title) {
			this.title = title;
			this._onDidChangeLabel.fire();
		}
	}
	override getDescription(): string { return localize('canvas.editorDescription', "Closing this tab hides the view. Use Close Canvas to remove it from the chat."); }
	override getIcon() { return Codicon.preview; }
	override canMove(): string { return localize('canvas.cannotMove', "Canvas views cannot be moved between editor groups or windows. Reopen the view beside its owning conversation."); }
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof SessionCanvasInput ? isEqual(this.resource, other.resource) : super.matches(other);
	}
	override toUntyped(): IUntypedEditorInput {
		return { resource: this.resource, options: { override: SessionCanvasInput.EDITOR_ID } };
	}
}

export class SessionCanvasSerializer implements IEditorSerializer {
	constructor(@ISessionCanvasService private readonly canvasService: ISessionCanvasService) { }
	canSerialize(input: EditorInput): boolean { return input instanceof SessionCanvasInput; }
	serialize(input: EditorInput): string | undefined {
		return input instanceof SessionCanvasInput ? JSON.stringify({ version: 1, resource: input.resource.toString() }) : undefined;
	}
	deserialize(_instantiationService: IInstantiationService, serialized: string): EditorInput | undefined {
		try {
			const value: unknown = JSON.parse(serialized);
			const descriptor: { version?: unknown; resource?: unknown } = value && typeof value === 'object' ? value : {};
			if (descriptor.version === 1 && typeof descriptor.resource === 'string' && SessionCanvasUri.parse(URI.parse(descriptor.resource, true))) {
				return this.canvasService.getInput(URI.parse(descriptor.resource, true));
			}
		} catch {
			// Invalid logical references are not executable restoration requests.
		}
		return undefined;
	}
}
