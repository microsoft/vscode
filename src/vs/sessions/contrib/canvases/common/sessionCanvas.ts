/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { IObservable, IReader, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import type { IBrowserViewModel } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IChat, ISession, ISessionCanvas, ISessionCanvasDefinition } from '../../../services/sessions/common/session.js';

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

export function getSessionCanvasDefinitionLabels(canvases: readonly ISessionCanvasDefinition[]): readonly string[] {
	const displayNameCounts = new Map<string, number>();
	for (const canvas of canvases) {
		const displayName = canvas.displayName || canvas.canvasId;
		displayNameCounts.set(displayName, (displayNameCounts.get(displayName) ?? 0) + 1);
	}

	const labels: string[] = [];
	const usedLabels = new Set<string>();
	for (const canvas of canvases) {
		const displayName = canvas.displayName || canvas.canvasId;
		let label = displayNameCounts.get(displayName) === 1
			? displayName
			: localize('canvas.definitionTitle', "{0} ({1})", displayName, canvas.extensionName || canvas.extensionId);
		if (usedLabels.has(label)) {
			label = localize('canvas.definitionTitleWithId', "{0} ({1}, {2})", displayName, canvas.extensionName || canvas.extensionId, canvas.canvasId);
		}
		let collisionIndex = 2;
		const baseLabel = label;
		while (usedLabels.has(label)) {
			label = localize('canvas.definitionTitleCollision', "{0} ({1})", baseLabel, String(collisionIndex++));
		}
		labels.push(label);
		usedLabels.add(label);
	}
	return labels;
}

const CANVAS_INSTANCE_ID_MAX_LENGTH = 128;

export function getSessionCanvasDefinitionInstanceId(canvas: ISessionCanvasDefinition): string {
	const raw = `${canvas.extensionId}-${canvas.canvasId}`;
	const normalized = raw
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^[._-]+/, '')
		.replace(/[._-]+$/, '');
	if (normalized === raw && normalized.length <= CANVAS_INSTANCE_ID_MAX_LENGTH) {
		return normalized;
	}

	const hashSuffix = `-${(hash(raw) >>> 0).toString(16).padStart(8, '0')}`;
	const base = normalized
		.slice(0, CANVAS_INSTANCE_ID_MAX_LENGTH - hashSuffix.length)
		.replace(/[._-]+$/, '')
		|| 'canvas';
	return `${base}${hashSuffix}`;
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

export interface ISessionCanvasModelResolution {
	readonly model: IBrowserViewModel;
	readonly reused: boolean;
}

export const ISessionCanvasService = createDecorator<ISessionCanvasService>('sessionCanvasService');

export interface ISessionCanvasService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly availableCanvases: IObservable<readonly ISessionCanvasDefinition[]>;
	readonly reopenableCanvases: IObservable<readonly ISessionCanvasReopenTarget[]>;
	getTarget(reference: ISessionCanvasReference, reader?: IReader): ISessionCanvasTarget | undefined;
	isActiveOwner(reference: ISessionCanvasReference, reader?: IReader): boolean;
	refreshAvailableCanvases(): Promise<void>;
	openCanvas(canvas: ISessionCanvasDefinition): Promise<void>;
	revealCanvas(reference: ISessionCanvasReference): Promise<void>;
	reopenCanvas(reference: ISessionCanvasReference): Promise<void>;
	/** Restores a canvas admitted by this live service instance from its opaque working-set identifier. */
	restoreCanvasInput(serializationId: string): SessionCanvasInput | undefined;
	/** Resolves the live browser model retained for this presentation, creating it once when needed. */
	resolveCanvasModel(reference: ISessionCanvasReference, source: URI): Promise<ISessionCanvasModelResolution>;
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
	readonly membershipPending = observableValue(this, false);
	private _serializationId: string | undefined;

	constructor(readonly reference: ISessionCanvasReference, canvas: ISessionCanvas | undefined, membershipPending = false) {
		super();
		this.resource = createInputResource(reference);
		this.setCanvas(canvas, membershipPending);
	}

	override get typeId(): string { return SessionCanvasInput.ID; }
	override get editorId(): string { return SessionCanvasInput.EDITOR_ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal; }
	override getName(): string { return this.canvas.get()?.title ?? localize('canvas.editorName', "Canvas"); }
	override getDescription(): string { return localize('canvas.editorDescription', "Closing this tab hides the canvas. Reopen it from the Canvas submenu in Add Tab while it remains available."); }
	override getIcon(): ThemeIcon { return Codicon.preview; }
	override getTitle(_verbosity?: Verbosity): string { return this.getName(); }
	override canReopen(): boolean { return false; }

	get serializationId(): string | undefined {
		return this._serializationId;
	}

	setSerializationId(serializationId: string): void {
		this._serializationId = serializationId;
	}

	setCanvas(canvas: ISessionCanvas | undefined, membershipPending = false): void {
		const previous = this.canvas.get();
		transaction(tx => {
			this.canvas.set(canvas, tx);
			this.membershipPending.set(membershipPending, tx);
		});
		if (previous?.title !== canvas?.title) {
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof SessionCanvasInput ? isEqual(this.resource, other.resource) : super.matches(other);
	}
}
