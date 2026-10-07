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

export interface ISessionCanvasReference {
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
	readonly canvas: URI;
}

export const REVEAL_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.revealCanvas';

export function createSessionCanvasReference(session: ISession, chat: IChat, canvas: ISessionCanvas): ISessionCanvasReference {
	return {
		providerId: session.providerId,
		session: session.resource,
		chat: chat.resource,
		canvas: canvas.resource,
	};
}

export function getSessionCanvasReferenceKey(reference: ISessionCanvasReference): string {
	return `${reference.providerId}\u0000${reference.session.toString()}\u0000${reference.chat.toString()}\u0000${reference.canvas.toString()}`;
}

export function getSessionCanvasInstanceLabels(canvases: readonly ISessionCanvas[]): readonly string[] {
	const titleCounts = new Map<string, number>();
	const instanceIdCounts = new Map<string, number>();
	for (const canvas of canvases) {
		titleCounts.set(canvas.title, (titleCounts.get(canvas.title) ?? 0) + 1);
		if (canvas.instanceId) {
			instanceIdCounts.set(canvas.instanceId, (instanceIdCounts.get(canvas.instanceId) ?? 0) + 1);
		}
	}

	const labels = new Array<string>(canvases.length);
	const usedLabels = new Set<string>();
	for (let index = 0; index < canvases.length; index++) {
		const canvas = canvases[index];
		if (titleCounts.get(canvas.title) === 1) {
			labels[index] = canvas.title;
			usedLabels.add(canvas.title);
		}
	}

	const titleIndexes = new Map<string, number>();
	for (let index = 0; index < canvases.length; index++) {
		const canvas = canvases[index];
		if (titleCounts.get(canvas.title) === 1) {
			continue;
		}

		const titleIndex = (titleIndexes.get(canvas.title) ?? 0) + 1;
		titleIndexes.set(canvas.title, titleIndex);
		const instanceLabel = canvas.instanceId && instanceIdCounts.get(canvas.instanceId) === 1
			? canvas.instanceId
			: String(titleIndex);
		let label = localize('canvas.instanceTitle', "{0} ({1})", canvas.title, instanceLabel);
		let collisionIndex = 2;
		while (usedLabels.has(label)) {
			label = localize('canvas.instanceTitleCollision', "{0} ({1}, {2})", canvas.title, instanceLabel, String(collisionIndex++));
		}
		labels[index] = label;
		usedLabels.add(label);
	}
	return labels;
}

export interface ISessionCanvasTarget {
	readonly session: ISession;
	readonly chat: IChat;
	readonly canvas: ISessionCanvas;
}

export interface ISessionCanvasReopenTarget {
	readonly reference: ISessionCanvasReference;
	readonly canvas: ISessionCanvas;
}

export const ISessionCanvasService = createDecorator<ISessionCanvasService>('sessionCanvasService');

export interface ISessionCanvasService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly reopenableCanvases: IObservable<readonly ISessionCanvasReopenTarget[]>;
	getTarget(reference: ISessionCanvasReference, reader?: IReader): ISessionCanvasTarget | undefined;
	isActiveOwner(reference: ISessionCanvasReference, reader?: IReader): boolean;
	revealCanvas(reference: ISessionCanvasReference): Promise<void>;
	reopenCanvas(reference: ISessionCanvasReference): Promise<void>;
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
	override getDescription(): string { return localize('canvas.editorDescription', "Closing this tab hides the canvas. Reopen it from the Add Tab menu while it remains available."); }
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
