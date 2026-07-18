/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMicCaptureService } from '../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
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
	/** Append `text` to the current draft and submit, creating the session. */
	sendQuery(text: string): void;
	/** Set `text` without submitting. */
	prefillInput(text: string): void;
	/** Focus the composer input. */
	focus(): void;
}

export const INewChatVoiceTargetService = createDecorator<INewChatVoiceTargetService>('newChatVoiceTargetService');

/**
 * Tracks the active new-session composer for voice command routing.
 */
export interface INewChatVoiceTargetService {
	readonly _serviceBrand: undefined;
	/** The most recent focused/registered mounted composer. */
	readonly activeComposer: IObservable<INewChatVoiceComposer | undefined>;
	/** Register a composer as a voice target; dispose to remove it. */
	registerComposer(composer: INewChatVoiceComposer): IDisposable;
	/** Promote `composer` to the active voice target. */
	setActive(composer: INewChatVoiceComposer): void;
}

export class NewChatVoiceTargetService extends Disposable implements INewChatVoiceTargetService {
	declare readonly _serviceBrand: undefined;

	private readonly _composers = new Set<INewChatVoiceComposer>();
	private readonly _activeComposer = observableValue<INewChatVoiceComposer | undefined>(this, undefined);
	readonly activeComposer: IObservable<INewChatVoiceComposer | undefined> = this._activeComposer;

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
}

registerSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);

// --- Voice toolbar menu for the new-session composer ---
// The composer has a custom toolbar, so `MenuId.ChatExecute` voice actions do
// not appear here. Re-surface them with composer-scoped visibility.

export const SessionsNewChatVoiceMenu = new MenuId('SessionsNewChatVoiceMenu');

const WHEN_VOICE_ENABLED = ContextKeyExpr.equals('config.agents.voice.enabled', true);
const WHEN_CONNECTING = ContextKeyExpr.equals('agentsVoiceConnecting', true);
const WHEN_LISTENING = ContextKeyExpr.equals('agentsVoiceListening', true);
const WHEN_CONNECTED = ContextKeyExpr.equals('agentsVoiceConnected', true);
const WHEN_INITIATED_HERE = ContextKeyExpr.equals('agentsVoiceInitiatedHere', true);
const WHEN_VOICE_SURFACE = ContextKeyExpr.equals('newChatVoiceSurface', true);

MenuRegistry.appendMenuItem(SessionsNewChatVoiceMenu, {
	command: { id: 'agentsVoice.connecting', title: localize('agentsVoice.connecting', "Connecting..."), icon: Codicon.loading },
	when: ContextKeyExpr.and(WHEN_VOICE_ENABLED, WHEN_CONNECTING, WHEN_INITIATED_HERE),
	group: 'navigation',
	order: -10,
});

MenuRegistry.appendMenuItem(SessionsNewChatVoiceMenu, {
	command: { id: 'agentsVoice.startVoiceInChat', title: localize('agentsVoice.startVoiceInChat', "Voice Mode"), icon: Codicon.voiceMode },
	when: ContextKeyExpr.and(WHEN_VOICE_ENABLED, WHEN_VOICE_SURFACE, WHEN_LISTENING.negate(), WHEN_CONNECTING.negate()),
	group: 'navigation',
	order: -10,
});

MenuRegistry.appendMenuItem(SessionsNewChatVoiceMenu, {
	command: { id: 'agentsVoice.pttStopInChat', title: localize('agentsVoice.pttStopInChat', "Voice Mode: Stop Recording"), icon: Codicon.voiceMode },
	when: ContextKeyExpr.and(WHEN_VOICE_ENABLED, WHEN_LISTENING, WHEN_INITIATED_HERE),
	group: 'navigation',
	order: -10,
});

MenuRegistry.appendMenuItem(SessionsNewChatVoiceMenu, {
	command: { id: 'agentsVoice.openSettings', title: localize('agentsVoice.openSettings', "Voice Mode Settings"), icon: Codicon.settingsGear },
	when: ContextKeyExpr.and(WHEN_VOICE_ENABLED, WHEN_CONNECTED, WHEN_INITIATED_HERE),
	group: 'navigation',
	order: -9.5,
});

MenuRegistry.appendMenuItem(SessionsNewChatVoiceMenu, {
	command: { id: 'agentsVoice.disconnect', title: localize('agentsVoice.disconnect', "Disconnect Voice Mode"), icon: Codicon.debugDisconnect },
	when: ContextKeyExpr.and(WHEN_VOICE_ENABLED, WHEN_CONNECTED, WHEN_INITIATED_HERE),
	group: 'navigation',
	order: -9,
});

export interface INewChatVoiceControllerOptions {
	/** Container for the voice toolbar. */
	readonly toolbarContainer: HTMLElement;
	/** Input container for glow and transcript overlay. */
	readonly inputContainer: HTMLElement;
	/** Composer driven by voice. */
	readonly composer: INewChatVoiceComposer;
}

/**
 * Wires voice mode into a new-session composer: toolbar, scoped keys,
 * glow/transcript, and {@link INewChatVoiceTargetService} routing.
 */
export class NewChatVoiceController extends Disposable {

	constructor(
		options: INewChatVoiceControllerOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@INewChatVoiceTargetService targetService: INewChatVoiceTargetService,
		@IVoiceSessionController voiceSessionController: IVoiceSessionController,
		@ISessionsService sessionsService: ISessionsService,
		@ITtsPlaybackService ttsPlaybackService: ITtsPlaybackService,
		@IMicCaptureService micCaptureService: IMicCaptureService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();

		this._register(targetService.registerComposer(options.composer));
		this._register(options.composer.onDidFocus(() => targetService.setActive(options.composer)));

		// Keep voice toolbar gating scoped to this composer.
		const scopedContextKeyService = this._register(contextKeyService.createScoped(options.toolbarContainer));
		// True when this composer can show the mic button.
		const voiceSurfaceKey = scopedContextKeyService.createKey<boolean>('newChatVoiceSurface', false);
		// True when voice is active on this composer.
		const initiatedHereKey = scopedContextKeyService.createKey<boolean>('agentsVoiceInitiatedHere', false);
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, options.toolbarContainer, SessionsNewChatVoiceMenu, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));

		// Target the active composer before a session exists, or when it opts in
		// while a session is active. Gate on `isCreated` to exclude drafts.
		const isVoiceSurface = derived(reader => {
			const active = sessionsService.activeSession.read(reader);
			const hasCreatedSession = !!active && active.isCreated.read(reader);
			const isActiveComposer = targetService.activeComposer.read(reader) === options.composer;
			return (options.composer.routesWhileSessionActive || !hasCreatedSession) && isActiveComposer;
		});
		const isVoiceTarget = derived(reader => {
			const voiceActive = voiceSessionController.isConnected.read(reader) || voiceSessionController.isConnecting.read(reader);
			return voiceActive && isVoiceSurface.read(reader);
		});
		this._register(autorun(reader => {
			voiceSurfaceKey.set(isVoiceSurface.read(reader));
			initiatedHereKey.set(isVoiceTarget.read(reader));
		}));

		this._register(setupVoiceInputDecorations({
			voiceSessionController,
			ttsPlaybackService,
			micCaptureService,
			configurationService,
			keybindingService,
			accessibilityService,
		}, {
			inputContainer: options.inputContainer,
			isActive: isVoiceTarget,
			getCurrentResource: () => NEW_CHAT_VOICE_SENTINEL,
		}));
	}
}
