/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, GroupIdentifier, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import type { IBrowserViewModel } from '../../browserView/common/browserView.js';

/** Reveals a live canvas beside its owning chat, reopening its closed tab. Takes an {@link ICanvasReference}. */
export const REVEAL_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.revealCanvas';

export interface ICanvas {
	readonly resource: URI;
	readonly instanceId: string | undefined;
	readonly title: string;
	readonly status?: string;
	readonly source: URI | undefined;
}

/** Where a registered canvas definition was contributed from. */
export type CanvasExtensionSource = 'user' | 'project' | 'session' | 'plugin' | 'unknown';

/** One canvas type registered for a live chat. */
export interface ICanvasDefinition {
	readonly canvasId: string;
	readonly extensionId: string;
	readonly extensionSource: CanvasExtensionSource;
	readonly extensionName?: string;
	readonly displayName: string;
	readonly description: string;
	readonly requiresInput: boolean;
}

/** `undefined` is unsettled; an array, including an empty one, is authoritative. */
export type CanvasDefinitionSnapshot = readonly ICanvasDefinition[] | undefined;

/** Lists and opens registered canvas types for one canvas context. */
export interface ICanvasDefinitionProvider {
	readonly onDidChangeDefinitions: Event<void>;
	/** Returns `undefined` while unsettled, then fires {@link onDidChangeDefinitions} when an authoritative snapshot is available. */
	listCanvases(): Promise<CanvasDefinitionSnapshot>;
	openCanvas(canvas: ICanvasDefinition, instanceId: string): Promise<void>;
}

export interface ICanvasOwner {
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
}

export interface ICanvasReference extends ICanvasOwner {
	readonly canvas: URI;
}

export interface ICanvasReopenTarget {
	readonly reference: ICanvasReference;
	readonly canvas: ICanvas;
}

export interface ICanvasContext {
	readonly owner: ICanvasOwner;
	readonly canvases: IObservable<readonly ICanvas[] | undefined>;
	readonly openRequests?: IObservable<ReadonlyMap<string, ICanvasOpenRequest>>;
	/** Present when this chat can list and directly open registered canvas types. */
	readonly definitionProvider?: ICanvasDefinitionProvider;
	/**
	 * Closes a live canvas, which notifies its provider; the canvas then leaves
	 * {@link canvases}. Unlike closing its tab, this ends the canvas. Absent when
	 * the owner's host cannot close canvases.
	 */
	readonly closeCanvas?: (canvas: ICanvas) => Promise<void>;
}

export interface ICanvasOpenRequest {
	readonly id: string;
	readonly succeeded: boolean;
}

export interface ICanvasModelResolution {
	readonly model: IBrowserViewModel;
	readonly reused: boolean;
}

/**
 * The owner of an editor working set: a whole session, or a single chat of it
 * when the window scopes its layout to chats.
 */
export interface ICanvasWorkingSetOwner {
	readonly sessionResource: URI;
	/** The owning chat, or `undefined` when the working set belongs to the whole session. */
	readonly chatResource: URI | undefined;
}

export interface ICanvasWorkingSetState {
	/** The owner whose working set was restored most recently, or `undefined` for an empty working set. */
	readonly owner: ICanvasWorkingSetOwner | undefined;
	/** Whether a restore that replaces every open editor is queued or running. */
	readonly restoring: boolean;
	/** Whether the queued restore is currently replacing the editor working set. */
	readonly applying: boolean;
}

/**
 * Editor working sets of a window that replaces its open editors when the user
 * switches owners. Canvases follow them through opaque live identities.
 */
export interface ICanvasWorkingSets {
	readonly state: IObservable<ICanvasWorkingSetState>;
	/** Keeps a live canvas alive while a presentation-only layout change hides the editor area. */
	registerEditorToRetain(input: CanvasInput): IDisposable;
	/** Prevents reopening a canvas that a restore could not reconstruct from revealing a hidden editor area. */
	suppressEditorPartAutoVisibility(): IDisposable;
}

export const ICanvasContextService = createDecorator<ICanvasContextService>('canvasContextService');

export interface ICanvasContextService {
	readonly _serviceBrand: undefined;
	readonly contexts: IObservable<readonly ICanvasContext[]>;
	readonly onDidRemoveOwner: Event<ICanvasOwner>;
	/** Present only in windows whose editors follow per-owner working sets. */
	readonly workingSets?: ICanvasWorkingSets;
	isOwnerVisible(owner: ICanvasOwner, reader?: IReader): boolean;
	/**
	 * Resolves an owner that this window can still look up, including one that is
	 * not visible. Its canvases are `undefined` while membership is unknown;
	 * `undefined` means the owner is outside this window's live scope.
	 */
	getContext(owner: ICanvasOwner, reader?: IReader): ICanvasContext | undefined;
	/** Resolves the frontend chat-session resource that owns this opaque Canvas context. */
	getFrontendSessionResource(owner: ICanvasOwner, reader?: IReader): URI | undefined;
	/**
	 * Selects the group that presents `input`, or `undefined` to let the editor
	 * service choose. `restore` reopens a canvas that its working set could not
	 * reconstruct. A canvas already open in another group moves to the selected one.
	 */
	getEditorGroup(owner: ICanvasOwner, input: CanvasInput, restore: boolean): IEditorGroup | undefined;
}

export const ICanvasService = createDecorator<ICanvasService>('sessionCanvasService');

export interface ICanvasService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly reopenableCanvases: IObservable<readonly ICanvasReopenTarget[]>;
	isOwnerPresentable(reference: ICanvasReference, reader?: IReader): boolean;
	revealCanvas(reference: ICanvasReference): Promise<void>;
	reopenCanvas(reference: ICanvasReference): Promise<void>;
	/** Restores a canvas admitted by this live service instance from its opaque working-set identifier. */
	restoreCanvasInput(serializationId: string): CanvasInput | undefined;
	/** Resolves the live browser model retained for this presentation, creating it once when needed. */
	resolveCanvasModel(reference: ICanvasReference, source: URI): Promise<ICanvasModelResolution>;
}

export function canvasOwnerKey(owner: ICanvasOwner): string {
	return `${owner.providerId}\u0000${owner.session.toString()}\u0000${owner.chat.toString()}`;
}

export function getCanvasReferenceKey(reference: ICanvasReference): string {
	return `${canvasOwnerKey(reference)}\u0000${reference.canvas.toString()}`;
}

export function isCanvasOwner(first: ICanvasOwner, second: ICanvasOwner): boolean {
	return first.providerId === second.providerId && isEqual(first.session, second.session) && isEqual(first.chat, second.chat);
}

/** Labels canvases by title, disambiguating repeated titles by their instance identifiers or positions. */
export function getCanvasInstanceLabels(canvases: readonly ICanvas[]): readonly string[] {
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

/** Labels registered canvas types while disambiguating extension and identifier collisions. */
export function getCanvasDefinitionLabels(canvases: readonly ICanvasDefinition[]): readonly string[] {
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

/** Produces the stable instance identifier used when directly opening a registered canvas type. */
export function getCanvasDefinitionInstanceId(canvas: ICanvasDefinition): string {
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

/** Returns whether a registered extension canvas can be opened without another input flow. */
export function isOpenableExtensionCanvasDefinition(canvas: ICanvasDefinition): boolean {
	return !canvas.requiresInput && (
		canvas.extensionSource !== 'unknown'
		|| canvas.extensionId.startsWith('user:')
		|| canvas.extensionId.startsWith('project:')
		|| canvas.extensionId.startsWith('session:')
		|| canvas.extensionId.startsWith('plugin:')
	);
}

/** Orders registered canvas types by extension and display name. */
export function compareCanvasDefinitions(first: ICanvasDefinition, second: ICanvasDefinition): number {
	return (first.extensionName || first.extensionId).localeCompare(second.extensionName || second.extensionId)
		|| (first.displayName || first.canvasId).localeCompare(second.displayName || second.canvasId)
		|| first.canvasId.localeCompare(second.canvasId);
}

function createInputResource(reference: ICanvasReference): URI {
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

export class CanvasInput extends EditorInput {

	static readonly ID = 'sessions.editorInput.canvas';
	static readonly EDITOR_ID = 'sessions.editor.canvas';

	readonly resource: URI;
	readonly canvas = observableValue<ICanvas | undefined>(this, undefined);
	readonly membershipPending = observableValue(this, false);
	private _serializationId: string | undefined;

	constructor(
		readonly reference: ICanvasReference,
		canvas: ICanvas | undefined,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.resource = createInputResource(reference);
		this.canvas.set(canvas, undefined);
	}

	override get typeId(): string { return CanvasInput.ID; }
	override get editorId(): string { return CanvasInput.EDITOR_ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal; }
	override getName(): string { return this.canvas.get()?.title ?? localize('canvas.editorName', "Canvas"); }
	override getDescription(): string {
		// Only the Agents window offers an Add Tab menu.
		return this.environmentService.isSessionsWindow
			? localize('canvas.editorDescription', "Closing this tab hides the canvas. Reopen it from the Canvas submenu in Add Tab, use its canvas pill, or ask the agent to open it again.")
			: localize('canvas.editorDescriptionEditorWindow', "Closing this tab hides the canvas. Reopen it from its canvas pill or ask the agent to open it again.");
	}
	override getIcon(): ThemeIcon { return Codicon.preview; }
	override getTitle(_verbosity?: Verbosity): string { return this.getName(); }
	override canReopen(): boolean { return false; }

	override canMove(_sourceGroup: GroupIdentifier, targetGroup: GroupIdentifier): true | string {
		return this.editorGroupsService.getGroup(targetGroup)?.windowId === this.editorGroupsService.mainPart.windowId
			? true
			: localize('canvas.mainWindowOnly', "Canvases can only be shown in the main window beside their owning conversation.");
	}

	get serializationId(): string | undefined {
		return this._serializationId;
	}

	setSerializationId(serializationId: string): void {
		this._serializationId = serializationId;
	}

	setCanvas(canvas: ICanvas | undefined, membershipPending = false): void {
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
		return other instanceof CanvasInput ? isEqual(this.resource, other.resource) : super.matches(other);
	}
}
