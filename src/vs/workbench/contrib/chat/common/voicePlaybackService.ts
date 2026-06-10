/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export const IVoicePlaybackService = createDecorator<IVoicePlaybackService>('voicePlaybackService');

export interface IVoicePlaybackEntry {
	readonly transcript: string;
	readonly timestamp: number;
}

/**
 * Tracks voice playback state for chat sessions: which session is currently
 * speaking, and what the last played message was for each session. Used by
 * the agent sessions view to highlight the speaking row and to drive the
 * "Replay Last Played" action.
 *
 * Playback is reported by the voice agent webview through the workbench
 * commands `_chat.voicePlayback.notifyStart` / `_chat.voicePlayback.notifyEnd`.
 */
export interface IVoicePlaybackService {
	readonly _serviceBrand: undefined;

	/**
	 * The session resource currently being spoken aloud, or `undefined` if
	 * playback is generic (no session id from the backend) or stopped.
	 */
	readonly speakingSession: IObservable<URI | undefined>;

	/**
	 * Increments whenever the per-session last-played map changes. Consumers
	 * can subscribe via `read(reader)` to refresh state without us exposing
	 * the underlying `ResourceMap`.
	 */
	readonly lastPlayedVersion: IObservable<number>;

	/**
	 * Records the start of a TTS playback. When `sessionResource` is undefined,
	 * the audio is generic and no per-session state is updated.
	 */
	notifyPlaybackStart(sessionResource: URI | undefined, transcript: string | undefined): void;
	notifyPlaybackEnd(sessionResource: URI | undefined): void;

	getLastPlayed(sessionResource: URI): IVoicePlaybackEntry | undefined;
	hasLastPlayed(sessionResource: URI): boolean;

	/**
	 * Replays the last played message for `sessionResource` by re-synthesizing
	 * the saved transcript through the registered speech provider. Resolves
	 * once playback completes (or immediately when there is nothing to replay
	 * or no speech provider is available).
	 */
	replay(sessionResource: URI): Promise<void>;

	/**
	 * Stops any active playback for the given session (or all playback if
	 * no session is specified).
	 */
	stop(sessionResource?: URI): void;
}

export class VoicePlaybackService extends Disposable implements IVoicePlaybackService {

	declare readonly _serviceBrand: undefined;

	private readonly _speakingSession = observableValue<URI | undefined>(this, undefined);
	readonly speakingSession: IObservable<URI | undefined> = this._speakingSession;

	private readonly _lastPlayed = new ResourceMap<IVoicePlaybackEntry>();
	private readonly _lastPlayedVersion = observableValue<number>(this, 0);
	readonly lastPlayedVersion: IObservable<number> = this._lastPlayedVersion;

	private _activeReplay: CancellationTokenSource | undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._register(toDisposable(() => {
			this._activeReplay?.dispose(true);
			this._activeReplay = undefined;
		}));
	}

	notifyPlaybackStart(sessionResource: URI | undefined, transcript: string | undefined): void {
		this._speakingSession.set(sessionResource, undefined);
		if (sessionResource && transcript) {
			this._lastPlayed.set(sessionResource, { transcript, timestamp: Date.now() });
			this._lastPlayedVersion.set(this._lastPlayedVersion.get() + 1, undefined);
		}
	}

	notifyPlaybackEnd(sessionResource: URI | undefined): void {
		const current = this._speakingSession.get();
		if (!current) {
			return;
		}
		// Only clear if the end matches the current speaker (or is generic).
		if (!sessionResource || current.toString() === sessionResource.toString()) {
			this._speakingSession.set(undefined, undefined);
		}
	}

	getLastPlayed(sessionResource: URI): IVoicePlaybackEntry | undefined {
		return this._lastPlayed.get(sessionResource);
	}

	hasLastPlayed(sessionResource: URI): boolean {
		return this._lastPlayed.has(sessionResource);
	}

	async replay(sessionResource: URI): Promise<void> {
		const entry = this._lastPlayed.get(sessionResource);
		if (!entry || !entry.transcript) {
			return;
		}

		this._activeReplay?.dispose(true);
		this._activeReplay = new CancellationTokenSource();

		this._speakingSession.set(sessionResource, undefined);
		await this.commandService.executeCommand('_chat.voicePlayback.replay', {
			sessionId: sessionResource.toString(),
			transcript: entry.transcript,
		});
	}

	stop(sessionResource?: URI): void {
		this._activeReplay?.dispose(true);
		this._activeReplay = undefined;
		void this.commandService.executeCommand('_chat.voicePlayback.stop', {
			sessionId: sessionResource?.toString(),
		});
		const current = this._speakingSession.get();
		if (!sessionResource || current?.toString() === sessionResource.toString()) {
			this._speakingSession.set(undefined, undefined);
		}
	}
}

registerSingleton(IVoicePlaybackService, VoicePlaybackService, InstantiationType.Delayed);

//#region Bridge commands invoked by the voice agent extension

interface IPlaybackStartPayload {
	readonly sessionId?: string;
	readonly transcript?: string;
}

interface IPlaybackEndPayload {
	readonly sessionId?: string;
}

function tryParseSessionResource(sessionId: string | undefined): URI | undefined {
	if (!sessionId) {
		return undefined;
	}
	try {
		return URI.parse(sessionId);
	} catch {
		return undefined;
	}
}

CommandsRegistry.registerCommand('_chat.voicePlayback.notifyStart', (accessor: ServicesAccessor, payload?: IPlaybackStartPayload) => {
	const service = accessor.get(IVoicePlaybackService);
	service.notifyPlaybackStart(tryParseSessionResource(payload?.sessionId), payload?.transcript);
});

CommandsRegistry.registerCommand('_chat.voicePlayback.notifyEnd', (accessor: ServicesAccessor, payload?: IPlaybackEndPayload) => {
	const service = accessor.get(IVoicePlaybackService);
	service.notifyPlaybackEnd(tryParseSessionResource(payload?.sessionId));
});

//#endregion
