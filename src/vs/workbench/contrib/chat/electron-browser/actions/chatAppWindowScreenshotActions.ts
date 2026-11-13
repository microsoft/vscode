/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { autorun } from '../../../../../base/common/observable.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { FocusMode, INativeAppWindow } from '../../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../../platform/product/common/product.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { getScreenshotToolImageData, IScreenshotToolImage, IScreenshotToolService, ScreenshotToolEntryPoint, ScreenshotToolOutcome } from '../../../screenshotTool/browser/screenshotTool.js';
import { AppWindowScreenshotPermission, AppWindowScreenshotResult, getAppWindowLabel, IAppWindowScreenshotService } from '../../../screenshotTool/electron-browser/appWindowScreenshot.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatContextPickService, IChatContextValueItem } from '../../browser/attachments/chatContextPickService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatWidget, IChatWidgetContrib } from '../../browser/widget/chatWidget.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { isAutoLanguageModel } from '../../common/languageModels.js';
import { AppWindowScreenshotHint } from './chatAppWindowScreenshotHint.js';
import { AppWindowScreenshotSetupDialog } from './chatAppWindowScreenshotSetup.js';

const ATTACH_APP_WINDOW_SCREENSHOT_TITLE = localize2('chat.attachAppWindowScreenshot', "Attach Screenshot of App Window");
const PICK_APP_WINDOW_SCREENSHOT_COMMAND_ID = 'workbench.action.chat.pickAppWindowScreenshot';

/** How long the Add Context picker waits to name the window that its item captures, as it opens once all items are ready. */
const LABEL_TIMEOUT = 150;

/** How long a capture waits for the chat input to load its session before it gives up attaching the screenshot. */
const VIEW_MODEL_TIMEOUT = 10000;

const AppWindowScreenshotsEnabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${ChatConfiguration.AppWindowScreenshotsEnabled}`, true));

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatSidebar',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.AppWindowScreenshotsEnabled]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('chat.appWindowScreenshots.enabled', "Controls whether chat can attach a screenshot of the window of another app, such as the browser or simulator that runs the app that you are building. **Attach Screenshot of App Window** captures the window that you are using or just left, and you can mark up the screenshot before you send it. Its keybinding also works while the other app is in front."),
		},
	},
});

/** What started a capture, as reported in telemetry. */
type AppWindowScreenshotSource = 'command' | 'addContext';

type AppWindowScreenshotEvent = {
	source: AppWindowScreenshotSource;
	target: string;
	result: string;
	permission: string;
	inBackground: boolean;
};

type AppWindowScreenshotClassification = {
	owner: 'Giuspepe';
	comment: 'Reports how attaching a screenshot of the window of another app to chat ended, to learn how the window is found and why captures fail.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What started the capture: a command, such as from its keybinding, or the Add Context item.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the window was found: the frontmost window of another app, picked by the user in a list or in the system picker, or none when the setup showed instead.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How it ended: captured, cancelled, no window of another app, missing Screen Recording permission (the setup showed), or failed.' };
	permission: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether capturing had the permission that it needs when it started: granted, not granted or restricted on macOS, or not required on other platforms.' };
	inBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether VS Code was in the background when the capture started, as with a system-wide keybinding.' };
};

interface IAppWindowScreenshotRequest {
	readonly source: AppWindowScreenshotSource;
	/** Lets the user pick the window in a list. */
	readonly pick?: boolean;
	/** The window to capture, which a menu named. */
	readonly window?: INativeAppWindow;
	/** The session of the chat to attach the screenshot to, instead of the chat that had focus last. */
	readonly sessionResource?: URI;
}

/** The arguments of Attach Screenshot of App Window, for callers that know which chat to attach the screenshot to. */
interface IAttachAppWindowScreenshotArgs {
	readonly sessionResource: URI;
}

function isAttachAppWindowScreenshotArgs(args: unknown): args is IAttachAppWindowScreenshotArgs {
	return typeof args === 'object' && args !== null && URI.isUri((args as Partial<IAttachAppWindowScreenshotArgs>).sessionResource);
}

/** A screenshot of the window of another app, as an attachment that the user can mark up. */
interface IAppWindowScreenshot {
	readonly entry: IChatRequestVariableEntry;
	readonly image: IScreenshotToolImage;
}

/**
 * Captures the window of another app for chat. When macOS doesn't allow Screen Recording, it shows the setup instead.
 * Explains why a capture failed. When it captured, the caller ends the feedback of the capture, see
 * {@link IAppWindowScreenshotService.endCaptureFeedback}.
 */
async function captureAppWindowScreenshot(accessor: ServicesAccessor, request: IAppWindowScreenshotRequest): Promise<IAppWindowScreenshot | undefined> {
	const appWindowScreenshotService = accessor.get(IAppWindowScreenshotService);
	const screenshotToolService = accessor.get(IScreenshotToolService);
	const hostService = accessor.get(IHostService);
	const notificationService = accessor.get(INotificationService);
	const commandService = accessor.get(ICommandService);
	const telemetryService = accessor.get(ITelemetryService);
	const instantiationService = accessor.get(IInstantiationService);
	const contextKeyService = accessor.get(IContextKeyService);

	// A system-wide keybinding runs the command without checking its precondition.
	if (!contextKeyService.contextMatchesRules(AppWindowScreenshotsEnabled)) {
		return undefined;
	}

	const stopWatch = StopWatch.create(false);
	// A system-wide keybinding runs the command while another app is in front.
	const inBackground = !hostService.hasFocus;
	const permission = await appWindowScreenshotService.getPermission();
	const log = (target: string, result: string, outcome: ScreenshotToolOutcome) => {
		screenshotToolService.logCapture({ entryPoint: ScreenshotToolEntryPoint.ChatAppWindow, outcome, mode: outcome === 'attached' ? 'appWindow' : 'none', durationMs: stopWatch.elapsed() });
		telemetryService.publicLog2<AppWindowScreenshotEvent, AppWindowScreenshotClassification>('screenshotTool.appWindow', { source: request.source, target, result, permission, inBackground });
	};

	if (permission === 'notGranted' || permission === 'restricted') {
		log('none', 'permissionRequired', 'cancelled');
		await instantiationService.invokeFunction(showAppWindowScreenshotSetup, permission, inBackground);
		return undefined;
	}

	const result: AppWindowScreenshotResult = await appWindowScreenshotService.capture({ pick: request.pick, window: request.window });
	if (result.kind === 'captured') {
		const label = getAppWindowLabel(result.window);
		const { data, mimeType } = getScreenshotToolImageData(result.image);
		const entry: IChatRequestVariableEntry = {
			id: generateUuid(),
			kind: 'image',
			name: label,
			fullName: localize('appWindowScreenshot.fullName', "Screenshot of {0}", label),
			value: data.buffer,
			mimeType,
		};
		screenshotToolService.registerEditableAttachment(entry, { original: result.image, annotationState: undefined });
		log(result.target, result.kind, 'attached');
		return { entry, image: result.image };
	}

	void appWindowScreenshotService.endCaptureFeedback();
	log(result.target, result.kind, result.kind === 'cancelled' ? 'cancelled' : 'failed');
	if (result.kind === 'noWindow') {
		notificationService.info(localize('appWindowScreenshot.noWindow', "No other app shows a window to capture. Open the app, then try again."));
	} else if (result.kind === 'permissionRequired') {
		// macOS revoked the permission after it was checked.
		const current = await appWindowScreenshotService.getPermission();
		await instantiationService.invokeFunction(showAppWindowScreenshotSetup, current === 'restricted' ? 'restricted' : 'notGranted', inBackground);
	} else if (result.kind === 'failed') {
		notificationService.prompt(
			Severity.Error,
			result.window
				? localize('appWindowScreenshot.failedWindow', "The window \"{0}\" could not be captured.", getAppWindowLabel(result.window))
				: localize('appWindowScreenshot.failed', "The windows of other apps could not be listed."),
			[{
				label: localize('appWindowScreenshot.pickWindow', "Pick a Window..."),
				run: () => { void commandService.executeCommand(PICK_APP_WINDOW_SCREENSHOT_COMMAND_ID); },
			}],
		);
	}
	return undefined;
}

/** The setup that shows in this window, so that pressing the keybinding again doesn't open another one. */
let shownSetup: Promise<void> | undefined;

/** Shows the setup, while macOS doesn't allow Screen Recording, which lets the user allow it. Resolves once the setup closed. */
async function showAppWindowScreenshotSetup(accessor: ServicesAccessor, permission: AppWindowScreenshotPermission, inBackground: boolean): Promise<void> {
	const hostService = accessor.get(IHostService);
	const instantiationService = accessor.get(IInstantiationService);

	if (inBackground) {
		// The setup shows in VS Code, which a system-wide keybinding leaves in the background.
		await hostService.focus(mainWindow, { mode: FocusMode.Force });
	}
	if (shownSetup) {
		return shownSetup;
	}

	const dialog = instantiationService.createInstance(AppWindowScreenshotSetupDialog, permission);
	shownSetup = (async () => {
		try {
			await dialog.show();
		} finally {
			dialog.dispose();
			shownSetup = undefined;
		}
	})();
	return shownSetup;
}

/**
 * Captures the window of another app and attaches it to the chat that the request names, or else the chat input that
 * was in use, or to the one that comes to the front when that chat isn't shown anymore.
 */
async function attachAppWindowScreenshot(accessor: ServicesAccessor, request: IAppWindowScreenshotRequest): Promise<void> {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const hostService = accessor.get(IHostService);
	const notificationService = accessor.get(INotificationService);
	const instantiationService = accessor.get(IInstantiationService);
	const contextKeyService = accessor.get(IContextKeyService);
	const appWindowScreenshotService = accessor.get(IAppWindowScreenshotService);

	// A system-wide keybinding runs the command without checking its precondition.
	if (!contextKeyService.contextMatchesRules(AppWindowScreenshotsEnabled)) {
		return;
	}
	const inBackground = !hostService.hasFocus;
	const chatInUse = request.sessionResource ? chatWidgetService.getWidgetBySessionResource(request.sessionResource) : chatWidgetService.lastFocusedWidget;
	if (chatInUse && !chatInUse.attachmentCapabilities.supportsImageAttachments) {
		notificationService.info(localize('appWindowScreenshot.noImages', "This chat does not accept images."));
		return;
	}
	const sessionInUse = request.sessionResource ?? chatInUse?.viewModel?.sessionResource;

	// Captures before VS Code comes to the front, which would change which window is in front.
	const screenshot = await instantiationService.invokeFunction(captureAppWindowScreenshot, request);
	if (!screenshot) {
		return;
	}

	try {
		// The user can switch chats while picking the window.
		let widget = sessionInUse ? chatWidgetService.getWidgetBySessionResource(sessionInUse) : undefined;
		let focused: Promise<void> | undefined;
		if (widget?.visible && widget.viewModel && isEqual(widget.viewModel.sessionResource, sessionInUse)) {
			// The chat shows already, so the screenshot flies into it at once, while VS Code comes to the front under the screenshot.
			if (inBackground) {
				focused = hostService.focus(getWindow(widget.domNode), { mode: FocusMode.Force });
			}
		} else {
			// VS Code comes to the front first, as a window behind other apps doesn't render the chat that it reveals.
			if (inBackground) {
				await hostService.focus(chatInUse ? getWindow(chatInUse.domNode) : mainWindow, { mode: FocusMode.Force });
			}
			if (widget && isEqual(widget.viewModel?.sessionResource, sessionInUse)) {
				await chatWidgetService.reveal(widget);
			} else {
				widget = await chatWidgetService.revealWidget() ?? chatWidgetService.lastFocusedWidget;
			}
			// The chat input drops the attachments that it got before its session loaded.
			if (widget && !widget.viewModel) {
				const viewModelChange = Event.toPromise(widget.onDidChangeViewModel);
				await raceTimeout(viewModelChange, VIEW_MODEL_TIMEOUT);
				viewModelChange.cancel();
			}
			if (!widget?.viewModel) {
				return;
			}
			// The chat can be in another window, which also comes to the front, so that the screenshot flies into it.
			if (inBackground) {
				await hostService.focus(getWindow(widget.domNode), { mode: FocusMode.Force });
			}
		}
		widget.attachmentModel.addContext(screenshot.entry);
		// The input renders the attachment at once, which shows once the screenshot covers it.
		const attachment = widget.inputPart.getAttachmentElement(screenshot.entry.id);
		attachment?.style.setProperty('visibility', 'hidden');
		try {
			await appWindowScreenshotService.endCaptureFeedback({ element: attachment ?? widget.inputPart.inputContainerElement ?? widget.inputPart.element, image: screenshot.image });
		} finally {
			attachment?.style.removeProperty('visibility');
		}
		await focused;
		widget.focusInput();
		status(localize('appWindowScreenshot.attached', "Attached a screenshot of {0}.", screenshot.entry.name));
	} finally {
		void appWindowScreenshotService.endCaptureFeedback();
	}
}

class AttachAppWindowScreenshotAction extends Action2 {

	constructor() {
		super({
			id: ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID,
			title: ATTACH_APP_WINDOW_SCREENSHOT_TITLE,
			metadata: {
				description: localize2('chat.attachAppWindowScreenshot.description', "Attaches a screenshot of the window of another app to chat: the window that you are using, or the one that you just left."),
			},
			category: CHAT_CATEGORY,
			f1: true,
			precondition: AppWindowScreenshotsEnabled,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyS,
				mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.KeyS },
				// Captures the window of the app that is in front, which is the point of the keybinding.
				systemWide: true,
			},
		});
	}

	run(accessor: ServicesAccessor, args?: unknown): Promise<void> {
		return attachAppWindowScreenshot(accessor, { source: 'command', sessionResource: isAttachAppWindowScreenshotArgs(args) ? args.sessionResource : undefined });
	}
}

class PickAppWindowScreenshotAction extends Action2 {

	constructor() {
		super({
			id: PICK_APP_WINDOW_SCREENSHOT_COMMAND_ID,
			title: localize2('chat.pickAppWindowScreenshot', "Pick App Window to Screenshot..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: AppWindowScreenshotsEnabled,
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return attachAppWindowScreenshot(accessor, { source: 'command', pick: true });
	}
}

/** The Add Context item, which names the window that it captures when it is known without asking for a permission. */
class AppWindowScreenshotContextValuePick implements IChatContextValueItem {

	readonly type = 'valuePick';
	readonly icon = Codicon.deviceCamera;
	readonly commandId = ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID;

	private window: INativeAppWindow | undefined;

	constructor(
		@IAppWindowScreenshotService private readonly appWindowScreenshotService: IAppWindowScreenshotService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	get label(): string {
		return this.window
			? localize('chatContext.appWindowScreenshot.named', "Screenshot of {0}", getAppWindowLabel(this.window))
			: localize('chatContext.appWindowScreenshot', "Screenshot App Window");
	}

	async isEnabled(widget: IChatWidget): Promise<boolean> {
		this.window = undefined;
		const model = widget.input.selectedLanguageModel.get();
		// An automatically selected model can pick one that sees images, as the image pills assume.
		if (!widget.attachmentCapabilities.supportsImageAttachments || !(isAutoLanguageModel(model) || model?.metadata.capabilities?.vision)) {
			return false;
		}
		this.window = await raceTimeout(this.appWindowScreenshotService.getFrontmostWindow(), LABEL_TIMEOUT);
		return true;
	}

	async asAttachment(widget: IChatWidget): Promise<IChatRequestVariableEntry | undefined> {
		const screenshot = await this.instantiationService.invokeFunction(captureAppWindowScreenshot, { source: 'addContext', window: this.window });
		if (screenshot) {
			await this.appWindowScreenshotService.endCaptureFeedback({ element: widget.inputPart.inputContainerElement ?? widget.inputPart.element, image: screenshot.image });
			status(localize('appWindowScreenshot.attached', "Attached a screenshot of {0}.", screenshot.entry.name));
		}
		widget.focusInput();
		return screenshot?.entry;
	}
}

/** Offers the Add Context item while the feature is on. */
class AppWindowScreenshotContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.appWindowScreenshot';

	constructor(
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const enabled = observableConfigValue(ChatConfiguration.AppWindowScreenshotsEnabled, false, configurationService);
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(AppWindowScreenshotContextValuePick)));
			}
		}));
	}
}

/** Shows {@link AppWindowScreenshotHint} above the main input of a chat widget, while the feature is on. */
class AppWindowScreenshotHintContribution extends Disposable implements IChatWidgetContrib {

	static readonly ID = 'chatAppWindowScreenshotHint';

	readonly id = AppWindowScreenshotHintContribution.ID;

	constructor(
		widget: IChatWidget,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const input = widget.inputPart;
		const enabled = observableConfigValue(ChatConfiguration.AppWindowScreenshotsEnabled, false, configurationService);
		this._register(autorun(reader => {
			if (!enabled.read(reader)) {
				return;
			}
			reader.store.add(instantiationService.createInstance(AppWindowScreenshotHint, {
				inputUri: input.inputUri,
				noticeHost: input.noticeHost,
				container: input.attachmentHintContainerElement,
				getAttachmentIds: () => input.attachmentModel.attachments.map(attachment => attachment.id),
				onDidChangeAttachments: input.attachmentModel.onDidChange,
				onDidChangeDraft: Event.any<unknown>(widget.onDidAcceptInput, widget.onDidChangeViewModel),
				canAttachScreenshots: () => {
					const model = input.selectedLanguageModel.read(undefined);
					return widget.location === ChatAgentLocation.Chat
						&& !!widget.attachmentCapabilities.supportsImageAttachments
						&& (isAutoLanguageModel(model) || !!model?.metadata.capabilities?.vision)
						&& contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
				},
			}, {
				id: ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID,
				title: ATTACH_APP_WINDOW_SCREENSHOT_TITLE.value,
				// Attaches to the chat that shows the hint, which need not be the chat that had focus last.
				run: () => {
					const sessionResource = widget.viewModel?.sessionResource;
					void commandService.executeCommand(ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, sessionResource ? { sessionResource } satisfies IAttachAppWindowScreenshotArgs : undefined);
				},
			}));
		}));
	}
}

registerAction2(AttachAppWindowScreenshotAction);
registerAction2(PickAppWindowScreenshotAction);
registerWorkbenchContribution2(AppWindowScreenshotContribution.ID, AppWindowScreenshotContribution, WorkbenchPhase.AfterRestored);
ChatWidget.CONTRIBS.push(AppWindowScreenshotHintContribution);
