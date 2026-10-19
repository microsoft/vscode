/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, derived, derivedOpts, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IMicCaptureService } from '../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { setupVoiceInputDecorations } from './voiceInputDecorations.js';

/**
 * Stable resource for targeting the new-session composer before a session exists.
 * This keeps dictation on the composer so it creates a configured session.
 */
export const NEW_CHAT_VOICE_SENTINEL = URI.from({ scheme: 'sessions-voice', authority: 'new-chat', path: '/composer' });

/** New-session composer APIs used by voice mode. */
export interface INewChatVoiceComposer {
	/** Fires when the composer input gains focus. */
	readonly onDidFocus: Event<void>;
	/**
	 * When true, this remains a voice target even with an active session.
	 * Otherwise, it targets only before any session exists.
	 */
	readonly routesWhileSessionActive?: boolean;
	/** Append `text` and submit; resolves false if submission is refused or fails. */
	sendQuery(text: string): Promise<boolean>;
	/** Set `text` without submitting. */
	prefillInput(text: string): void;
	/** Focus the composer input. */
	focus(): void;
	/** Models currently offered by the composer. */
	getVoiceModels(): readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Select a model by its exact frontend identifier. */
	selectVoiceModel(identifier: string): boolean;
}

export const INewChatVoiceTargetService = createDecorator<INewChatVoiceTargetService>('newChatVoiceTargetService');

/**
 * Tracks the active new-session composer for voice command routing.
 */
export interface INewChatVoiceTargetService {
	readonly _serviceBrand: undefined;
	/** The most recent focused/registered mounted composer. */
	readonly activeComposer: IObservable<INewChatVoiceComposer | undefined>;
	/** The input resource currently selected for voice decorations. */
	readonly currentVoiceInputResource: IObservable<URI | undefined>;
	/** Register a composer as a voice target; dispose to remove it. */
	registerComposer(composer: INewChatVoiceComposer): IDisposable;
	/** Promote `composer` to the active voice target. */
	setActive(composer: INewChatVoiceComposer): void;
	/** Allow the next composer replacement initiated by a voice request. */
	beginVoiceTransition(): IDisposable;
	/** Consume a pending voice-initiated composer replacement. */
	consumeVoiceTransition(): boolean;
}

export class NewChatVoiceTargetService extends Disposable implements INewChatVoiceTargetService {
	declare readonly _serviceBrand: undefined;

	private readonly _composers = new Set<INewChatVoiceComposer>();
	private readonly _activeComposer = observableValue<INewChatVoiceComposer | undefined>(this, undefined);
	readonly activeComposer: IObservable<INewChatVoiceComposer | undefined> = this._activeComposer;
	private _voiceTransitionVersion = 0;
	private _pendingVoiceTransition: number | undefined;

	/** Session resource of the last-focused chat widget (the last-focused input). */
	private readonly _focusedSessionResource: IObservable<URI | undefined>;

	readonly currentVoiceInputResource: IObservable<URI | undefined>;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this._focusedSessionResource = observableFromEvent(this,
			this.chatWidgetService.onDidChangeFocusedSession,
			() => this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource);

		this.currentVoiceInputResource = derivedOpts({ owner: this, equalsFn: isEqual }, reader => {
			const composer = this._activeComposer.read(reader);
			const active = this.sessionsService.activeSession.read(reader);
			const created = active?.isCreated.read(reader) ? active.activeChat.read(reader)?.resource : undefined;
			// The composer wins while it opts in (or before a session exists),
			// matching `_chat.voice.getCurrentSession` routing.
			if (composer && (composer.routesWhileSessionActive || !created)) {
				return NEW_CHAT_VOICE_SENTINEL;
			}
			if (created) {
				return created;
			}
			return this._focusedSessionResource.read(reader);
		});
	}

	registerComposer(composer: INewChatVoiceComposer): IDisposable {
		this._composers.add(composer);
		this._activeComposer.set(composer, undefined);
		return toDisposable(() => {
			this._composers.delete(composer);
			if (this._activeComposer.get() === composer) {
				// Fall back to the last remaining composer.
				const remaining = [...this._composers];
				this._activeComposer.set(remaining.length ? remaining[remaining.length - 1] : undefined, undefined);
			}
		});
	}

	setActive(composer: INewChatVoiceComposer): void {
		if (this._composers.has(composer)) {
			this._activeComposer.set(composer, undefined);
		}
	}

	beginVoiceTransition(): IDisposable {
		const version = ++this._voiceTransitionVersion;
		this._pendingVoiceTransition = version;
		return toDisposable(() => {
			if (this._pendingVoiceTransition === version) {
				this._pendingVoiceTransition = undefined;
			}
		});
	}

	consumeVoiceTransition(): boolean {
		if (this._pendingVoiceTransition === undefined) {
			return false;
		}
		this._pendingVoiceTransition = undefined;
		return true;
	}
}

/**
 * Shows the Voice Mode transcript and glow on a composer's input while it owns
 * a Voice Mode session that targets its draft.
 */
export class NewChatVoiceInputDecorations extends Disposable {
	constructor(
		inputContainer: HTMLElement,
		isVisible: IObservable<boolean>,
		ownsDraftVoiceSession: IObservable<boolean>,
		@IVoiceSessionController voiceSessionController: IVoiceSessionController,
		@ITtsPlaybackService ttsPlaybackService: ITtsPlaybackService,
		@IMicCaptureService micCaptureService: IMicCaptureService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();
		this._register(setupVoiceInputDecorations({
			voiceSessionController,
			ttsPlaybackService,
			micCaptureService,
			configurationService,
			keybindingService,
			themeService,
			accessibilityService,
		}, {
			inputContainer,
			isActive: isVisible,
			isOwner: derived(this, reader => voiceSessionController.hasDraftTarget.read(reader) && ownsDraftVoiceSession.read(reader)),
		}));
	}
}

registerSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);
