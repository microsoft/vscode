/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, RuntimeConnection, type CopilotSession, type ExtensionLaunchProvider, type SessionEvent } from 'vscode-canvas-development-sdk';
import type { SessionEvent as HostSessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType, TypedSessionEventHandler } from '@github/copilot-sdk';
import type { CopilotCanvasClientOptions, CopilotCanvasLaunchProvider, ICopilotCanvasClientBridge, ICopilotCanvasSdkModule } from '../src/vs/platform/agentHost/node/copilot/copilotCanvasSdk.js';
import type { ICopilotClient, ICopilotResumeSessionConfig, ICopilotSession } from '../src/vs/platform/agentHost/node/copilot/copilotSdkTypes.js';

declare const CANVAS_SDK_ENTRY: string;
declare const CANVAS_RUNTIME_ENVIRONMENT: Readonly<Record<string, string>>;
export const sdkEntry = CANVAS_SDK_ENTRY;

function legacyAutoTier(tier: Extract<SessionEvent, { type: 'session.start' }>['data']['autoTier']): SessionEventPayload<'session.start'>['data']['autoTier'] {
	return tier === 'efficiency' || tier === 'balance' || tier === 'intelligence' ? tier : undefined;
}

function toHostEvent(event: SessionEvent): HostSessionEvent | undefined {
	switch (event.type) {
		case 'session.retained':
		case 'session.auto_tier_recommendation':
		case 'skill.context_delivered':
		case 'permission.carriedForward':
		case 'permission.messageAuthorization':
		case 'permission.messageAuthorizationRead':
		case 'permission.messageAuthorizationDegraded':
			return undefined;
		case 'factory.run_settled':
			return event.data.status === 'paused' ? undefined : { ...event, data: { ...event.data, status: event.data.status } };
		case 'session.permissions_changed':
			return event.data.mode === undefined || event.data.previousMode === undefined ? undefined
				: { ...event, data: { ...event.data, mode: event.data.mode, previousMode: event.data.previousMode } };
		case 'session.start':
			return { ...event, data: { ...event.data, autoTier: legacyAutoTier(event.data.autoTier) } };
		case 'session.resume':
			return { ...event, data: { ...event.data, autoTier: legacyAutoTier(event.data.autoTier) } };
		case 'session.model_change':
			return {
				...event,
				data: {
					...event.data,
					autoTier: event.data.autoTier === null ? null : legacyAutoTier(event.data.autoTier),
					previousAutoTier: legacyAutoTier(event.data.previousAutoTier),
				},
			};
		case 'session.auto_tier_switch_failed': {
			const requestedAutoTier = event.data.requestedAutoTier === null ? null : legacyAutoTier(event.data.requestedAutoTier);
			return requestedAutoTier === undefined ? undefined : {
				...event,
				data: { ...event.data, requestedAutoTier, effectiveAutoTier: legacyAutoTier(event.data.effectiveAutoTier) },
			};
		}
		case 'system.notification': {
			const kind = event.data.kind;
			if (kind.type === 'factory_completed') {
				return kind.status === 'paused' ? undefined : { ...event, data: { ...event.data, kind: { ...kind, status: kind.status } } };
			}
			return { ...event, data: { ...event.data, kind } };
		}
		default:
			return event;
	}
}

function isEventType<K extends SessionEventType>(event: HostSessionEvent, type: K): event is SessionEventPayload<K> {
	return event.type === type;
}

export function adaptSessionConfig<T extends ICopilotResumeSessionConfig>(config: T) {
	const onEvent = config.onEvent;
	return {
		...config,
		onEvent: onEvent ? (rawEvent: SessionEvent) => {
			const event = toHostEvent(rawEvent);
			if (event) {
				onEvent(event);
			}
		} : undefined,
	};
}

export function adaptSession(session: CopilotSession): ICopilotSession {
	function on<K extends SessionEventType>(type: K, handler: TypedSessionEventHandler<K>): () => void;
	function on(handler: SessionEventHandler): () => void;
	function on<K extends SessionEventType>(typeOrHandler: K | SessionEventHandler, handler?: TypedSessionEventHandler<K>): () => void {
		if (typeof typeOrHandler === 'function') {
			return session.on(rawEvent => {
				const event = toHostEvent(rawEvent);
				if (event) {
					typeOrHandler(event);
				}
			});
		}
		return session.on(typeOrHandler, rawEvent => {
			const event = toHostEvent(rawEvent);
			if (event && handler && isEventType(event, typeOrHandler)) {
				handler(event);
			}
		});
	}
	return {
		sessionId: session.sessionId,
		on,
		rpc: {
			...session.rpc,
			tasks: {
				...session.rpc.tasks,
				list: async () => {
					const result = await session.rpc.tasks.list();
					return { ...result, tasks: result.tasks.filter(task => task.type !== 'client') };
				},
			},
		},
		getEvents: async () => (await session.getEvents()).map(toHostEvent).filter(event => event !== undefined),
		send: options => typeof options === 'string' ? session.send(options) : session.send(options),
		abort: () => session.abort(),
		setModel: (model, options) => session.setModel(model, options),
		disconnect: () => session.disconnect(),
	};
}

export function createClient(runtimeCli: string, options: CopilotCanvasClientOptions, resolve: CopilotCanvasLaunchProvider): ICopilotCanvasClientBridge {
	const extensionLaunchProvider: ExtensionLaunchProvider = resolve;
	// Isolate the SDK child without changing Electron's home used for OS Keychain access.
	const env = { ...options.env, ...CANVAS_RUNTIME_ENVIRONMENT };
	const raw = new CopilotClient({ ...options, env, connection: RuntimeConnection.forStdio({ path: runtimeCli }), extensionLaunchProvider });
	const sessions = new WeakMap<ICopilotSession, CopilotSession>();
	let started = false;
	const remember = (session: CopilotSession): ICopilotSession => {
		const adapter = adaptSession(session);
		sessions.set(adapter, session);
		return adapter;
	};
	const start = async () => {
		try {
			// Public start() verifies the live v1 acknowledgement before exposing sessions.
			await raw.start();
			started = true;
		} catch (error) {
			await raw.stop().catch(() => { });
			throw error;
		}
	};
	const client: ICopilotClient = {
		get rpc() { return raw.rpc; },
		start,
		stop: async () => { started = false; return raw.stop(); },
		listSessions: filter => raw.listSessions(filter),
		getSessionMetadata: id => raw.getSessionMetadata(id),
		deleteSession: id => raw.deleteSession(id),
		createSession: async config => { await start(); return remember(await raw.createSession(adaptSessionConfig(config))); },
		resumeSession: async (id, config) => { await start(); return remember(await raw.resumeSession(id, adaptSessionConfig(config))); },
	};
	return {
		client,
		start,
		retain: async session => {
			const backing = sessions.get(session);
			if (!started || !backing) {
				throw new Error('Canvas retention requires this started SDK client and its exact session.');
			}
			await backing.rpc.retain();
		},
	};
}

export const canvasSdkFactory: ICopilotCanvasSdkModule = { sdkEntry, createClient };
