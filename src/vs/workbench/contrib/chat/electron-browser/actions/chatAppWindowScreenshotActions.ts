/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { FocusMode, INativeAppWindow } from '../../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IKeybindingEditingService } from '../../../../services/keybinding/common/keybindingEditing.js';
import { selectSystemWideKeybindings } from '../../../keybindings/electron-browser/systemWideKeybindings.js';
import { getScreenshotToolImageData, IScreenshotToolService, ScreenshotToolEntryPoint, ScreenshotToolOutcome } from '../../../screenshotTool/browser/screenshotTool.js';
import { AppWindowScreenshotPermission, AppWindowScreenshotResult, getAppWindowLabel, IAppWindowScreenshotService } from '../../../screenshotTool/electron-browser/appWindowScreenshot.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatContextPickService, IChatContextValueItem } from '../../browser/attachments/chatContextPickService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatWidget, IChatWidgetContrib } from '../../browser/widget/chatWidget.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { isAutoLanguageModel } from '../../common/languageModels.js';
import { AppWindowScreenshotHint } from './chatAppWindowScreenshotHint.js';
import { AppWindowScreenshotSetupDialog } from './chatAppWindowScreenshotSetup.js';

const ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID = 'workbench.action.chat.attachAppWindowScreenshot';
const ATTACH_APP_WINDOW_SCREENSHOT_TITLE = localize2('chat.attachAppWindowScreenshot', "Attach Screenshot of App Window");
const PICK_APP_WINDOW_SCREENSHOT_COMMAND_ID = 'workbench.action.chat.pickAppWindowScreenshot';
const ENABLE_SYSTEM_WIDE_KEYBINDING_COMMAND_ID = 'workbench.action.chat.enableAppWindowScreenshotSystemWideKeybinding';

/** The default keybinding of Attach Screenshot of App Window, which the user can make system-wide. */
const DEFAULT_KEYBINDING = isMacintosh ? 'ctrl+cmd+s' : 'ctrl+alt+shift+s';

/** Remembers that the user saw what capturing the windows of other apps does, and agreed to it. */
const FIRST_USE_ACCEPTED_STORAGE_KEY = 'chat.appWindowScreenshots.firstUseAccepted';

/** How long the Add Context picker waits to name the window that its item captures, as it opens once all items are ready. */
const LABEL_TIMEOUT = 150;

const AppWindowScreenshotsEnabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${ChatConfiguration.AppWindowScreenshotsEnabled}`, true));

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatSidebar',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.AppWindowScreenshotsEnabled]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('chat.appWindowScreenshots.enabled', "Controls whether chat can attach a screenshot of the window of another app, such as the browser or simulator that runs the app that you are building. **Attach Screenshot of App Window** captures the window that you are using or just left, never a window of VS Code, and you can mark up the screenshot before you send it."),
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
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the window was found: the frontmost window of another app, picked by the user in a list or in the system picker, or none when the setup was closed.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How it ended: captured, cancelled, declined in the setup, no window of another app, missing Screen Recording permission, or failed.' };
	permission: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether capturing had the permission that it needs when it started: granted, not granted or restricted on macOS, or not required on other platforms.' };
	inBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether VS Code was in the background when the capture started, as with a system-wide keybinding.' };
};

interface IAppWindowScreenshotRequest {
	readonly source: AppWindowScreenshotSource;
	/** Lets the user pick the window in a list. */
	readonly pick?: boolean;
	/** The window to capture, which a menu named. */
	readonly window?: INativeAppWindow;
}

/**
 * Captures the window of another app for chat, after the setup when it is needed, and returns it as an image attachment
 * that the user can mark up. Explains why a capture failed.
 */
async function captureAppWindowScreenshot(accessor: ServicesAccessor, request: IAppWindowScreenshotRequest): Promise<IChatRequestVariableEntry | undefined> {
	const appWindowScreenshotService = accessor.get(IAppWindowScreenshotService);
	const screenshotToolService = accessor.get(IScreenshotToolService);
	const hostService = accessor.get(IHostService);
	const notificationService = accessor.get(INotificationService);
	const commandService = accessor.get(ICommandService);
	const telemetryService = accessor.get(ITelemetryService);
	const productService = accessor.get(IProductService);
	const instantiationService = accessor.get(IInstantiationService);

	const stopWatch = StopWatch.create(false);
	// A system-wide keybinding runs the command while another app is in front.
	const inBackground = !hostService.hasFocus;
	const permission = await appWindowScreenshotService.getPermission();
	const log = (target: string, result: string, outcome: ScreenshotToolOutcome) => {
		screenshotToolService.logCapture({ entryPoint: ScreenshotToolEntryPoint.ChatAppWindow, outcome, mode: outcome === 'attached' ? 'appWindow' : 'none', durationMs: stopWatch.elapsed() });
		telemetryService.publicLog2<AppWindowScreenshotEvent, AppWindowScreenshotClassification>('screenshotTool.appWindow', { source: request.source, target, result, permission, inBackground });
	};

	if (!await instantiationService.invokeFunction(setUpAppWindowScreenshots, permission, inBackground)) {
		log('none', 'declined', 'cancelled');
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
		return entry;
	}

	if (result.kind === 'noWindow') {
		notificationService.info(localize('appWindowScreenshot.noWindow', "No other app shows a window to capture. Open the app, then try again."));
	} else if (result.kind === 'permissionRequired') {
		// macOS revoked the permission after the setup checked it.
		notificationService.prompt(
			Severity.Warning,
			localize('appWindowScreenshot.permission', "{0} needs the Screen Recording permission to capture the windows of other apps.", productService.nameShort),
			[{
				label: localize('appWindowScreenshot.allowInSettings', "Allow in Settings"),
				run: () => { void appWindowScreenshotService.requestPermission(); },
			}],
		);
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
	log(result.target, result.kind, result.kind === 'cancelled' ? 'cancelled' : 'failed');
	return undefined;
}

/**
 * Shows the setup the first time, and whenever macOS doesn't allow Screen Recording: it explains what a capture takes,
 * lets the user allow Screen Recording, and offers to make the keybinding work while another app is in front. Returns
 * whether the capture can go ahead.
 */
async function setUpAppWindowScreenshots(accessor: ServicesAccessor, permission: AppWindowScreenshotPermission, inBackground: boolean): Promise<boolean> {
	const storageService = accessor.get(IStorageService);
	const hostService = accessor.get(IHostService);
	const keybindingService = accessor.get(IKeybindingService);
	const instantiationService = accessor.get(IInstantiationService);

	const ready = permission === 'granted' || permission === 'notRequired';
	if (ready && storageService.getBoolean(FIRST_USE_ACCEPTED_STORAGE_KEY, StorageScope.APPLICATION, false)) {
		return true;
	}
	if (inBackground) {
		// The setup shows in VS Code, which a system-wide keybinding leaves in the background.
		await hostService.focus(mainWindow, { mode: FocusMode.Force });
	}

	const keybinding = getKeybinding(keybindingService);
	const dialog = instantiationService.createInstance(AppWindowScreenshotSetupDialog, permission, keybinding.accelerator ? {
		label: keybinding.label,
		enabled: keybinding.systemWide,
		enable: () => instantiationService.invokeFunction(enableSystemWideKeybinding, false),
	} : undefined);
	try {
		if (!await dialog.show()) {
			return false;
		}
	} finally {
		dialog.dispose();
	}
	storageService.store(FIRST_USE_ACCEPTED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	return true;
}

/** Returns the keybinding of Attach Screenshot of App Window, and whether it already works while another app is in front. */
function getKeybinding(keybindingService: IKeybindingService): { readonly key: string; readonly label: string; readonly accelerator: string | undefined; readonly systemWide: boolean } {
	const resolved = keybindingService.lookupKeybinding(ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID) ?? keybindingService.resolveUserBinding(DEFAULT_KEYBINDING)[0];
	const key = resolved?.getUserSettingsLabel() ?? DEFAULT_KEYBINDING;
	return {
		key,
		label: resolved?.getLabel() ?? key,
		accelerator: resolved?.getElectronAccelerator() ?? undefined,
		systemWide: selectSystemWideKeybindings(keybindingService.getKeybindings()).candidates.some(candidate => candidate.commandId === ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID),
	};
}

/**
 * Adds the keybinding to the user's keybindings as a system-wide one, which works while another app is in front, and
 * resolves whether it works that way. With `confirm`, a notification also says so.
 */
async function enableSystemWideKeybinding(accessor: ServicesAccessor, confirm: boolean): Promise<boolean> {
	const keybindingService = accessor.get(IKeybindingService);
	const keybindingEditingService = accessor.get(IKeybindingEditingService);
	const notificationService = accessor.get(INotificationService);
	const logService = accessor.get(ILogService);

	const keybinding = getKeybinding(keybindingService);
	if (keybinding.systemWide) {
		if (confirm) {
			notificationService.info(localize('appWindowScreenshot.systemWide.alreadyEnabled', "{0} already attaches a screenshot of the app in front, while VS Code is in the background.", keybinding.label));
		}
		return true;
	}
	if (!keybinding.accelerator) {
		notificationService.error(localize('appWindowScreenshot.systemWide.unsupported', "{0} cannot work while another app is in front. Give Attach Screenshot of App Window a single key combination first.", keybinding.label));
		return false;
	}
	if (selectSystemWideKeybindings(keybindingService.getKeybindings()).candidates.some(candidate => candidate.accelerator === keybinding.accelerator)) {
		notificationService.error(localize('appWindowScreenshot.systemWide.conflict', "{0} cannot work while another app is in front, because another system-wide keybinding uses it.", keybinding.label));
		return false;
	}
	try {
		await keybindingEditingService.addKeybinding(new ResolvedKeybindingItem(undefined, ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, undefined, undefined, false, null, false, true), keybinding.key, undefined);
	} catch (error) {
		logService.error('[AppWindowScreenshot] Adding the system-wide keybinding failed:', error);
		notificationService.error(localize('appWindowScreenshot.systemWide.error', "Unable to make {0} work while another app is in front: {1}", keybinding.label, getErrorMessage(error)));
		return false;
	}
	if (confirm) {
		notificationService.info(localize('appWindowScreenshot.systemWide.enabled', "Press {0} while another app is in front to attach a screenshot of its window to chat.", keybinding.label));
	}
	return true;
}

/** Captures the window of another app and attaches it to the chat input, which comes to the front. */
async function attachAppWindowScreenshot(accessor: ServicesAccessor, request: IAppWindowScreenshotRequest): Promise<void> {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const hostService = accessor.get(IHostService);
	const notificationService = accessor.get(INotificationService);
	const instantiationService = accessor.get(IInstantiationService);

	const inBackground = !hostService.hasFocus;
	if (chatWidgetService.lastFocusedWidget && !chatWidgetService.lastFocusedWidget.attachmentCapabilities.supportsImageAttachments) {
		notificationService.info(localize('appWindowScreenshot.noImages', "This chat does not accept images."));
		return;
	}

	// Captures before VS Code comes to the front, which would change which window is in front.
	const entry = await instantiationService.invokeFunction(captureAppWindowScreenshot, request);
	if (!entry) {
		return;
	}

	// The chat input drops the attachments that it got before its session loaded.
	const widget = await chatWidgetService.revealWidget() ?? chatWidgetService.lastFocusedWidget;
	if (widget && !widget.viewModel) {
		await Event.toPromise(widget.onDidChangeViewModel);
	}
	if (!widget) {
		return;
	}
	widget.attachmentModel.addContext(entry);
	if (inBackground) {
		await hostService.focus(getWindow(widget.domNode), { mode: FocusMode.Force });
	}
	widget.focusInput();
	status(localize('appWindowScreenshot.attached', "Attached a screenshot of {0}.", entry.name));
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
			},
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return attachAppWindowScreenshot(accessor, { source: 'command' });
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

class EnableAppWindowScreenshotSystemWideKeybindingAction extends Action2 {

	constructor() {
		super({
			id: ENABLE_SYSTEM_WIDE_KEYBINDING_COMMAND_ID,
			title: localize2('chat.enableAppWindowScreenshotSystemWideKeybinding', "Use App Window Screenshot Shortcut in Other Apps"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: AppWindowScreenshotsEnabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await enableSystemWideKeybinding(accessor, true);
	}
}

/** The Add Context item, which names the window that it captures when it is known without asking for a permission. */
class AppWindowScreenshotContextValuePick implements IChatContextValueItem {

	readonly type = 'valuePick';
	readonly icon = Codicon.deviceCamera;
	readonly commandId = ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID;

	private window: INativeAppWindow | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
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
		if (!this.configurationService.getValue<boolean>(ChatConfiguration.AppWindowScreenshotsEnabled)
			|| !widget.attachmentCapabilities.supportsImageAttachments
			|| !(isAutoLanguageModel(model) || model?.metadata.capabilities?.vision)) {
			return false;
		}
		this.window = await raceTimeout(this.appWindowScreenshotService.getFrontmostWindow(), LABEL_TIMEOUT);
		return true;
	}

	async asAttachment(widget: IChatWidget): Promise<IChatRequestVariableEntry | undefined> {
		const entry = await this.instantiationService.invokeFunction(captureAppWindowScreenshot, { source: 'addContext', window: this.window });
		widget.focusInput();
		if (entry) {
			status(localize('appWindowScreenshot.attached', "Attached a screenshot of {0}.", entry.name));
		}
		return entry;
	}
}

class AppWindowScreenshotContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.appWindowScreenshot';

	constructor(
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(AppWindowScreenshotContextValuePick)));
	}
}

/** Shows {@link AppWindowScreenshotHint} above the main input of a chat widget. */
class AppWindowScreenshotHintContribution extends Disposable implements IChatWidgetContrib {

	static readonly ID = 'chatAppWindowScreenshotHint';

	readonly id = AppWindowScreenshotHintContribution.ID;

	constructor(
		widget: IChatWidget,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const input = widget.inputPart;
		this._register(instantiationService.createInstance(AppWindowScreenshotHint, {
			inputUri: input.inputUri,
			noticeHost: input.noticeHost,
			container: input.attachmentHintContainerElement,
			getAttachmentIds: () => input.attachmentModel.attachments.map(attachment => attachment.id),
			onDidChangeAttachments: input.attachmentModel.onDidChange,
			onDidChangeDraft: Event.any<unknown>(widget.onDidAcceptInput, widget.onDidChangeViewModel),
			canAttachScreenshots: () => {
				const model = input.selectedLanguageModel.get();
				return widget.location === ChatAgentLocation.Chat
					&& !!widget.attachmentCapabilities.supportsImageAttachments
					&& (isAutoLanguageModel(model) || !!model?.metadata.capabilities?.vision)
					&& contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
			},
		}, { id: ATTACH_APP_WINDOW_SCREENSHOT_COMMAND_ID, title: ATTACH_APP_WINDOW_SCREENSHOT_TITLE.value }));
	}
}

registerAction2(AttachAppWindowScreenshotAction);
registerAction2(PickAppWindowScreenshotAction);
registerAction2(EnableAppWindowScreenshotSystemWideKeybindingAction);
registerWorkbenchContribution2(AppWindowScreenshotContribution.ID, AppWindowScreenshotContribution, WorkbenchPhase.AfterRestored);
ChatWidget.CONTRIBS.push(AppWindowScreenshotHintContribution);
