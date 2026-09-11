/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import type { AgentHostCanvasJson, IAgentHostCanvasActionParams, IAgentHostCanvasInstance, IAgentHostCanvasOpenParams, IAgentHostCanvasState } from '../../../../platform/agentHost/common/agentHostCanvases.js';
import type { ICanvasContextReference } from '../../../../platform/agentHost/common/agentHostCanvasContext.js';

/** A reviewed package revision whose canvas declarations have not necessarily been loaded. */
export interface ISessionCanvasPackage {
	readonly extensionId: string;
	readonly name: string;
	readonly revision: string;
}

/** A chat's live canvas catalog and logical instances. Closing an editor does not close an instance. */
export interface ISessionCanvases {
	readonly hostId: string;
	readonly connectionGeneration: IObservable<number>;
	readonly state: IObservable<IAgentHostCanvasState>;
	readonly loading: IObservable<boolean>;
	readonly error: IObservable<Error | undefined>;
	refresh(): Promise<IAgentHostCanvasState>;
	getOpenPackages?(workspace?: URI): Promise<readonly ISessionCanvasPackage[]>;
	open(params: IAgentHostCanvasOpenParams): Promise<IAgentHostCanvasInstance>;
	invokeAction(params: IAgentHostCanvasActionParams): Promise<AgentHostCanvasJson>;
	close(instanceId: string): Promise<void>;
	reload(): Promise<void>;
	/** Opaque context reference for an explicit, visible composer attachment. */
	getContextReference?(instanceId: string): ICanvasContextReference | undefined;
}

export interface ISessionCanvasIdentity {
	readonly hostId: string;
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
	readonly extensionId: string;
	readonly canvasId: string;
	readonly instanceId: string;
}

/** Stable source identity contains no endpoint, authorization token, or canvas input. */
export namespace SessionCanvasSource {
	export const scheme = 'vscode-session-canvas';

	export function create(identity: ISessionCanvasIdentity): URI {
		return URI.from({
			scheme,
			authority: identity.hostId,
			path: '/' + [
				identity.providerId,
				identity.session.toString(),
				identity.chat.toString(),
				identity.extensionId,
				identity.canvasId,
				identity.instanceId,
			].map(part => encodeURIComponent(part)).join('/'),
		});
	}

	export function parse(source: URI): ISessionCanvasIdentity | undefined {
		if (source.scheme !== scheme || !source.authority || source.query || source.fragment) {
			return undefined;
		}
		const parts = source.path.slice(1).split('/');
		if (parts.length !== 6 || parts.some(part => !part)) {
			return undefined;
		}
		try {
			const [providerId, session, chat, extensionId, canvasId, instanceId] = parts.map(part => decodeURIComponent(part));
			return {
				hostId: source.authority,
				providerId,
				session: URI.parse(session, true),
				chat: URI.parse(chat, true),
				extensionId,
				canvasId,
				instanceId,
			};
		} catch {
			return undefined;
		}
	}
}

export function unavailableSessionCanvasState(state: IAgentHostCanvasState): IAgentHostCanvasState {
	return {
		supported: state.supported,
		...(state.loaded === undefined ? {} : { loaded: state.loaded }),
		catalog: state.catalog,
		instances: state.instances.map(({ instanceId, extensionId, canvasId, title, input }) => ({
			instanceId, extensionId, canvasId, title, input, availability: 'unavailable',
		})),
	};
}

export function isLoopbackCanvasUrl(value: string): boolean {
	if (!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:[/?#]|$)/.test(value)) {
		return false;
	}
	const url = URL.parse(value);
	return !!url && !url.username && !url.password
		&& (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
}
