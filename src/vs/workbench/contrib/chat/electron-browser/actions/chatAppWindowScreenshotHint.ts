/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatAppWindowScreenshotHint.css';
import { $, append, clearNode } from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { selectSystemWideKeybindings } from '../../../keybindings/electron-browser/systemWideKeybindings.js';
import { IAppWindowScreenshotService } from '../../../screenshotTool/electron-browser/appWindowScreenshot.js';
import { ChatImageAttachGesture, IChatUserImageAttachmentEvent, IChatUserImageAttachmentService } from '../../browser/attachments/chatUserImageAttachments.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../browser/widget/input/chatInputNoticeHost.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../browser/widget/input/chatInputNoticeWidget.js';
import { ChatInputStackSlot, setChatInputStackSlot } from '../../browser/widget/input/chatInputStack.js';
import { ChatConfiguration } from '../../common/constants.js';

/** Remembers that the hint showed, in VS Code or in the Agents window, as it only shows once. */
const HINT_SHOWN_STORAGE_KEY = 'chat.appWindowScreenshots.hintShown';

/** Turns off chat tips, which the hint is one of. */
const TIPS_ENABLED_SETTING = 'chat.tips.enabled';

/** Which instructions the hint gives: press the keybinding in chat, press it in the other app, or run the command. */
type AppWindowScreenshotHintCopy = 'inApp' | 'systemWide' | 'palette' | 'none';

type AppWindowScreenshotHintAction = 'opportunity' | 'shown' | 'clicked' | 'dismissed' | 'expired' | 'used';

type AppWindowScreenshotHintEvent = {
	action: AppWindowScreenshotHintAction;
	gesture: ChatImageAttachGesture;
	copy: AppWindowScreenshotHintCopy;
	imageCount: number;
	durationMs: number;
};

type AppWindowScreenshotHintClassification = {
	owner: 'Giuspepe';
	comment: 'Reports the hint that suggests attaching a screenshot of an app window when the user pastes or drops an image into chat, to learn whether it teaches the keybinding.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What happened: the user pasted or dropped an image where the hint could show, logged once per chat input while the feature and tips are on; the hint showed; the user clicked its link, which runs the command; the user dismissed it; it went away with its images or the draft; or the user captured an app window while it showed.' };
	gesture: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user pasted or dropped the image.' };
	copy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which instructions the hint gave: press the keybinding in chat, press it while the other app is in front, run the command from the Command Palette, or none when it did not show.' };
	imageCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many images the paste or drop attached, or the hint is about.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long ago the hint first showed, in milliseconds, or -1 when it did not show.' };
};

/** The chat input that the hint shows above. */
export interface IAppWindowScreenshotHintTarget {
	/** Names the input in the events of {@link IChatUserImageAttachmentService}. */
	readonly inputUri: URI;
	readonly noticeHost: ChatInputNoticeHost;
	/** The slot that the hint renders into. */
	readonly container: HTMLElement;
	getAttachmentIds(): readonly string[];
	readonly onDidChangeAttachments: Event<unknown>;
	/** Fires when the draft goes away, as the user sends it or the input moves to another session. */
	readonly onDidChangeDraft: Event<unknown>;
	/** Whether the input could take a screenshot of an app window, whether or not the feature is on. */
	canAttachScreenshots(): boolean;
}

/** The command that the hint suggests, which attaches a screenshot of an app window. */
export interface IAppWindowScreenshotHintCommand {
	readonly id: string;
	/** The title that the Command Palette shows. */
	readonly title: string;
	/** Runs the command for the chat that shows the hint, as the hint's link does. */
	run(): void;
}

/**
 * Suggests the keybinding of Attach Screenshot of App Window once, right after the user pastes or drops an image into
 * the chat input, which is how they attach a screenshot by hand. It shows as a tip above the input, which yields to
 * every other notice, and goes away with its images or with the draft. The keybinding in it is a link that runs the
 * command, which captures the window, or opens the setup while macOS doesn't allow Screen Recording.
 */
export class AppWindowScreenshotHint extends Disposable {

	/** Holds the tip lane from the paste or drop until the hint goes away. */
	private readonly _claim = this._register(new MutableDisposable());
	private readonly _content = this._register(new MutableDisposable<DisposableStore>());
	private _notice: ChatInputNoticeWidget | undefined;
	/** The images that the hint is about, while it waits for the lane or shows. */
	private readonly _imageIds = new Set<string>();
	private _gesture: ChatImageAttachGesture = 'paste';
	private _copy: AppWindowScreenshotHintCopy = 'none';
	private _shownAt: number | undefined;
	private _loggedOpportunity = false;
	private _leading = false;
	private _claiming = false;
	/** The claim that this window gave back last, which its cached value can hold for a moment longer. */
	private _releasedClaim: string | undefined;

	constructor(
		private readonly _target: IAppWindowScreenshotHintTarget,
		private readonly _command: IAppWindowScreenshotHintCommand,
		@IChatUserImageAttachmentService userImageAttachmentService: IChatUserImageAttachmentService,
		@IAppWindowScreenshotService private readonly _appWindowScreenshotService: IAppWindowScreenshotService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._register(userImageAttachmentService.onDidAttachImages(e => {
			if (isEqual(e.inputUri, this._target.inputUri)) {
				this._onDidAttachImages(e);
			}
		}));
		this._register(this._target.onDidChangeAttachments(() => {
			if (this._imageIds.size && !this._hasImagesAttached()) {
				this._end('expired');
			}
		}));
		this._register(this._target.onDidChangeDraft(() => this._end('expired')));
		this._register(this._appWindowScreenshotService.onDidChangeHasCaptured(() => {
			if (this._appWindowScreenshotService.hasCaptured) {
				this._end('used');
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if ((e.affectsConfiguration(ChatConfiguration.AppWindowScreenshotsEnabled) || e.affectsConfiguration(TIPS_ENABLED_SETTING)) && !this._isTurnedOn()) {
				this._end('expired');
			}
		}));
		// Takes the hint off screen even when the notice host is gone and won't stand it down.
		this._register(toDisposable(() => this._clearContent()));
	}

	private _onDidAttachImages(e: IChatUserImageAttachmentEvent): void {
		if (!this._target.canAttachScreenshots() || !this._isTurnedOn()) {
			return;
		}
		if (!this._loggedOpportunity) {
			this._loggedOpportunity = true;
			this._log('opportunity', e.gesture, 'none', e.attachmentIds.length, -1);
		}
		// A hint that waits or shows already is about these images too.
		if (!this._imageIds.size && (this._appWindowScreenshotService.hasCaptured || this._wasShown())) {
			return;
		}
		for (const id of e.attachmentIds) {
			this._imageIds.add(id);
		}
		if (this._claim.value) {
			return;
		}

		this._gesture = e.gesture;
		const claim = this._target.noticeHost.occupy(ChatInputNoticeLane.Tip, {
			focusTarget: {
				hasFocus: () => this._notice?.hasFocus() ?? false,
				focus: () => this._notice?.focus(),
				// The lane is held from the paste or drop, but there is only something to focus once the hint renders.
				canFocus: () => !!this._notice,
			},
			onDidChangeLeading: leading => this._setLeading(leading),
		});
		// The host can hand over the lane while claiming it, and the hint may have ended already then.
		if (this._imageIds.size) {
			this._claim.value = claim;
		} else {
			claim.dispose();
		}
	}

	/** Whether the feature and tips are on. */
	private _isTurnedOn(): boolean {
		return !!this._configurationService.getValue<boolean>(ChatConfiguration.AppWindowScreenshotsEnabled) && this._configurationService.getValue<boolean>(TIPS_ENABLED_SETTING) !== false;
	}

	/** Whether the hint still applies: it is turned on, the input can take the screenshot, and the user hasn't captured one yet. */
	private _isEligible(): boolean {
		return this._isTurnedOn() && this._target.canAttachScreenshots() && !this._appWindowScreenshotService.hasCaptured && this._hasImagesAttached();
	}

	/** Whether the hint showed, as far as this window knows: another window may have shown it a moment ago. */
	private _wasShown(): boolean {
		return this._isClaimed(this._storageService.get(HINT_SHOWN_STORAGE_KEY, StorageScope.APPLICATION_SHARED));
	}

	/** Whether a stored value claims the hint's showing, which neither an empty value nor a claim that this window gave back does. */
	private _isClaimed(value: string | undefined): boolean {
		return !!value && value !== this._releasedClaim;
	}

	/** Whether the hint can show now, which a claim of its one showing needs before and after it. */
	private _isReadyToShow(): boolean {
		return !this._store.isDisposed && this._leading && this._isEligible();
	}

	private _hasImagesAttached(): boolean {
		return this._target.getAttachmentIds().some(id => this._imageIds.has(id));
	}

	private _setLeading(leading: boolean): void {
		this._leading = leading;
		if (!leading) {
			this._clearContent();
			return;
		}
		if (this._shownAt !== undefined) {
			this._render();
			return;
		}
		// Things may have changed while the hint waited for other notices.
		if (!this._isEligible() || this._wasShown()) {
			this._end('expired');
			return;
		}
		void this._claimShowing();
	}

	/**
	 * Claims the hint's one showing, which only one window can do, and shows it. The claim is the stored value, so the
	 * hint only claims while it can show, and gives the claim back when it went away or stood down meanwhile.
	 */
	private async _claimShowing(): Promise<void> {
		if (this._claiming) {
			return;
		}
		this._claiming = true;
		let claim: string | undefined;
		let shownElsewhere = false;
		try {
			// The cached value can lag behind other windows, so the claim reads and swaps the value that they share.
			const shown = await this._storageService.readApplicationSharedValue(HINT_SHOWN_STORAGE_KEY);
			if (this._isClaimed(shown)) {
				shownElsewhere = true;
			} else if (this._isReadyToShow()) {
				const id = generateUuid();
				if ((await this._storageService.compareAndSwapApplicationSharedValue(HINT_SHOWN_STORAGE_KEY, shown, id)).swapped) {
					claim = id;
				} else {
					shownElsewhere = true;
				}
			}
		} finally {
			this._claiming = false;
		}

		if (claim && this._isReadyToShow()) {
			this._show();
		} else if (claim) {
			// An empty value lets the next paste or drop claim the showing, unless another window claimed it since.
			this._releasedClaim = claim;
			void this._storageService.compareAndSwapApplicationSharedValue(HINT_SHOWN_STORAGE_KEY, claim, '');
		} else if (shownElsewhere && !this._store.isDisposed) {
			this._end('expired');
		}
		// Otherwise the hint went away, or stood down and claims again once it leads.
	}

	private _show(): void {
		this._render();
		this._shownAt = Date.now();
		this._log('shown', this._gesture, this._copy, this._imageIds.size, 0);
		if (this._configurationService.getValue<boolean>(this._environmentService.isSessionsWindow ? AccessibilityVerbositySettingId.SessionsChat : AccessibilityVerbositySettingId.Chat)) {
			this._notice?.announce();
		}
	}

	private _render(): void {
		this._clearContent();
		const { copy, message, ariaLabel } = this._getCopy();
		this._copy = copy;

		const store = new DisposableStore();
		const notice = store.add(new ChatInputNoticeWidget({
			variant: ChatInputNoticeVariant.Tip,
			className: 'chat-app-window-screenshot-hint',
			ariaLabel,
			ariaRoleDescription: localize('appWindowScreenshotHint.roleDescription', "tip"),
			onEscape: () => this._end('dismissed'),
		}));
		append(notice.domNode, $(`span.chat-app-window-screenshot-hint-icon${ThemeIcon.asCSSSelector(Codicon.deviceCamera)}`, { 'aria-hidden': 'true' }));
		const rendered = store.add(this._markdownRendererService.render(message, { actionHandler: () => this._runCommand() }));
		append(notice.domNode, $('.chat-app-window-screenshot-hint-message')).appendChild(rendered.element);
		notice.addDismissAction({ onActivate: () => this._end('dismissed') });

		this._content.value = store;
		this._notice = notice;
		this._target.container.appendChild(notice.domNode);
		setChatInputStackSlot(this._target.container, ChatInputStackSlot.Docked);
	}

	/**
	 * Words the hint for the user's keybinding, which can work while the app is in front, or for the command when it has
	 * none. Either is a link that runs the command.
	 */
	private _getCopy(): { readonly copy: AppWindowScreenshotHintCopy; readonly message: MarkdownString; readonly ariaLabel: string } {
		const link = `command:${this._command.id}`;
		const markdown = (value: string) => new MarkdownString(value, { isTrusted: { enabledCommands: [this._command.id] } });
		const keybinding = this._keybindingService.lookupKeybinding(this._command.id);
		const label = keybinding?.getLabel();
		if (!keybinding || !label) {
			const message = markdown(localize('appWindowScreenshotHint.palette', "Showing the agent your app? Next time, switch from your app to chat and run [{0}]({1}) from the Command Palette to attach a screenshot of its window.", escapeMarkdownSyntaxTokens(this._command.title), link));
			return { copy: 'palette', message, ariaLabel: renderAsPlaintext(message) };
		}

		const accelerator = keybinding.getElectronAccelerator();
		const systemWide = !!accelerator && selectSystemWideKeybindings(this._keybindingService.getKeybindings(), this._contextKeyService).candidates.some(candidate => candidate.commandId === this._command.id && candidate.accelerator === accelerator);
		const format = (key: string) => markdown(systemWide
			? localize('appWindowScreenshotHint.systemWide', "Showing the agent your app? Next time, press [{0}]({1}) while your app is in front to attach a screenshot of its window.", escapeMarkdownSyntaxTokens(key), link)
			: localize('appWindowScreenshotHint.inApp', "Showing the agent your app? Next time, switch from your app to chat and press [{0}]({1}) to attach a screenshot of its window.", escapeMarkdownSyntaxTokens(key), link));
		return { copy: systemWide ? 'systemWide' : 'inApp', message: format(label), ariaLabel: renderAsPlaintext(format(keybinding.getAriaLabel() ?? label)) };
	}

	/** Runs the command from the hint's link: it captures the window, or opens the setup while macOS doesn't allow Screen Recording. */
	private _runCommand(): void {
		if (this._shownAt !== undefined) {
			this._log('clicked', this._gesture, this._copy, this._imageIds.size, Date.now() - this._shownAt);
		}
		this._command.run();
	}

	/** Takes the hint away. When it never showed, the next paste or drop can show it. */
	private _end(action: 'dismissed' | 'expired' | 'used'): void {
		if (!this._imageIds.size) {
			return;
		}
		if (this._shownAt !== undefined) {
			this._log(action, this._gesture, this._copy, this._imageIds.size, Date.now() - this._shownAt);
		}
		this._imageIds.clear();
		this._shownAt = undefined;
		this._copy = 'none';
		// Released before the content goes, so the notice host moves focus back to the input only when it was in the hint.
		this._claim.clear();
		this._clearContent();
	}

	private _clearContent(): void {
		this._notice = undefined;
		this._content.clear();
		clearNode(this._target.container);
		setChatInputStackSlot(this._target.container, ChatInputStackSlot.Empty);
	}

	private _log(action: AppWindowScreenshotHintAction, gesture: ChatImageAttachGesture, copy: AppWindowScreenshotHintCopy, imageCount: number, durationMs: number): void {
		this._telemetryService.publicLog2<AppWindowScreenshotHintEvent, AppWindowScreenshotHintClassification>('screenshotTool.appWindowHint', { action, gesture, copy, imageCount, durationMs });
	}
}
