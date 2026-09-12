/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../base/common/cancellation.js';
import type { IReference } from '../../../../base/common/lifecycle.js';
import type { IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { InvokeCanvasActionResult, OpenCanvasParams, ResolveCanvasSourceResult } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/commands.js';
import { CanvasSourceKind, type CanvasEntry, type CanvasIdentityKey, type CanvasState, type CanvasTypeDeclaration } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';

export type { CanvasActionDeclaration, CanvasEntry, CanvasIdentityKey, CanvasSource, CanvasState, CanvasTypeDeclaration } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
export { CANVAS_INPUT_MAX_LENGTH, CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
export type { ResolveCanvasSourceResult } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/commands.js';

/** Presentation preference only; the execution host independently owns runtime admission. */
export const SessionCanvasesEnabledSettingId = 'sessions.experimental.canvases.enabled';

export type SessionCanvasOpenOptions = Pick<CanvasIdentityKey, 'source' | 'canvasType' | 'instanceId'> & Pick<OpenCanvasParams, 'title' | 'icon' | 'input'>;

/** Compare logical identity, excluding informational package versions and the live incarnation. */
export function canvasIdentityEquals(left: CanvasIdentityKey, right: CanvasIdentityKey): boolean {
	const sameSource = left.source.kind === CanvasSourceKind.Extension
		? right.source.kind === CanvasSourceKind.Extension && left.source.extensionId === right.source.extensionId
		: right.source.kind === CanvasSourceKind.Package && left.source.sourceId === right.source.sourceId;
	return sameSource && left.chat === right.chat && left.canvasType === right.canvasType && left.instanceId === right.instanceId;
}

/** A live, read-only subscription to one logical canvas. */
export interface ISessionCanvasState {
	readonly state: IObservable<CanvasState | undefined>;
	readonly error: IObservable<Error | undefined>;
}

/** One exact chat's live type catalog and logical membership, independent of editor visibility. */
export interface ISessionCanvases {
	readonly availability: IObservable<'available' | 'unsupported' | 'disconnected'>;
	readonly generation: IObservable<number>;
	readonly catalog: IObservable<readonly CanvasTypeDeclaration[]>;
	readonly entries: IObservable<readonly CanvasEntry[]>;
	/** Whether authoritative logical membership has been received. */
	readonly initialized: IObservable<boolean>;
	/** Whether the current connection supports explicit executable registry initialization. */
	readonly supportsInitialization: IObservable<boolean>;
	readonly initializing: IObservable<boolean>;
	readonly loading: IObservable<boolean>;
	readonly error: IObservable<Error | undefined>;
	refresh(): Promise<void>;
	/** Initializes this chat's registry through normal execution admission, without creating a conversation turn. */
	initialize(token: CancellationToken): Promise<void>;
	observeCanvas(resource: string): IReference<ISessionCanvasState>;
	resolveSource(canvas: CanvasEntry): Promise<ResolveCanvasSourceResult>;
	open(options: SessionCanvasOpenOptions): Promise<CanvasEntry>;
	invokeAction(canvas: CanvasState, actionId: string, input?: unknown): Promise<InvokeCanvasActionResult>;
	close(canvas: CanvasEntry): Promise<void>;
	restart(canvas: CanvasEntry): Promise<void>;
}

/** Provider-neutral editor ownership; no transient connection, source URL, or executable input. */
export interface ISessionCanvasReference {
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
	readonly canvas: URI;
}

export namespace SessionCanvasUri {
	export const scheme = 'vscode-session-canvas';

	export function create(reference: ISessionCanvasReference): URI {
		if (!reference.providerId || reference.canvas.scheme !== 'ahp-canvas' || reference.canvas.authority || !reference.canvas.path
			|| reference.canvas.query || reference.canvas.fragment || [reference.session, reference.chat].some(resource =>
				!resource.scheme || ['http', 'https', 'file'].includes(resource.scheme) || resource.query || resource.authority.includes('@'))) {
			throw new Error('Invalid logical canvas owner.');
		}
		return URI.from({
			scheme,
			path: '/' + [reference.providerId, reference.session.toString(), reference.chat.toString(), reference.canvas.toString()]
				.map(part => encodeURIComponent(part)).join('/'),
		});
	}

	export function parse(resource: URI): ISessionCanvasReference | undefined {
		if (resource.scheme !== scheme || resource.authority || resource.query || resource.fragment) {
			return undefined;
		}
		const parts = resource.path.slice(1).split('/');
		if (parts.length !== 4 || parts.some(part => !part)) {
			return undefined;
		}
		try {
			const [providerId, session, chat, canvas] = parts.map(part => decodeURIComponent(part));
			const reference: ISessionCanvasReference = {
				providerId, session: URI.parse(session, true), chat: URI.parse(chat, true), canvas: URI.parse(canvas, true),
			};
			return isEqual(create(reference), resource) ? reference : undefined;
		} catch {
			return undefined;
		}
	}
}
