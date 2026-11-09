/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventLike } from '../../../../base/browser/dom.js';
import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ClickAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction, IActionRunner } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ARCHIVE_SESSION_COMMAND_ID, ARCHIVE_SESSION_GROUP_COMMAND_ID } from '../common/sessionCommands.js';

export function getSessionArchiveActionViewItemOptions(options: IActionViewItemOptions, configurationService: IConfigurationService, shouldTriggerClickAnimation?: (context: unknown) => boolean): IMenuEntryActionViewItemOptions {
	return {
		...options,
		shouldTriggerClickAnimation,
		get onClickAnimation() {
			return configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)
				? ClickAnimation.Confetti
				: undefined;
		}
	};
}

/** The Mark as Done button, whose click is where {@link SESSIONS_MARK_AS_DONE_CONFETTI_SETTING} decides whether to celebrate. */
export class SessionArchiveActionViewItem extends MenuEntryActionViewItem {

	private readonly actionRunnerListeners = this._register(new MutableDisposable());
	private readonly spinner = this._register(new MutableDisposable());
	private running = false;

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService private readonly _accessibility: IAccessibilityService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibility);
	}

	override get actionRunner(): IActionRunner {
		return super.actionRunner;
	}

	override set actionRunner(actionRunner: IActionRunner) {
		super.actionRunner = actionRunner;
		this.bindActionRunner(actionRunner);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.bindActionRunner(this.actionRunner);
		this.renderRunningState();
	}

	override async onClick(event: MouseEvent): Promise<void> {
		if (!this.isEnabled()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		// Reduced motion never animates, so the setting cannot change what those users see.
		if (!this._accessibility.isMotionReduced()) {
			logSettingExperimentTrigger(this._telemetryService, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING);
		}
		return super.onClick(event);
	}

	override isEnabled(): boolean {
		return !this.running && super.isEnabled();
	}

	override getActionToRun(event: EventLike & { readonly altKey?: boolean; readonly shiftKey?: boolean }): IAction {
		const action = super.getActionToRun(event);
		// ActionBar runs keyboard actions directly, without calling onClick.
		return this.running ? { ...action, enabled: false, run: async () => { } } : action;
	}

	protected override getTooltip(): string {
		return this.running ? localize('sessionArchive.pending', "{0} (in progress)", this.action.label) : super.getTooltip();
	}

	protected override updateLabel(): void {
		super.updateLabel();
		if (this.running && this.options.label && this.label) {
			this.label.textContent = this.getTooltip();
		}
	}

	protected override updateEnabled(): void {
		super.updateEnabled();
		if (this.running) {
			this.label?.setAttribute('aria-disabled', 'true');
		}
	}

	protected override updateClass(): void {
		super.updateClass();
		const icon = this._menuItemAction.item.icon;
		if (this.running && ThemeIcon.isThemeIcon(icon)) {
			this.label?.classList.remove(...ThemeIcon.asClassNameArray(icon).filter(className => className !== 'codicon'));
		}
	}

	private bindActionRunner(actionRunner: IActionRunner): void {
		const listeners = new DisposableStore();
		this.actionRunnerListeners.value = listeners;
		listeners.add(actionRunner.onWillRun(event => {
			if (event.action === this.action) {
				this.running = true;
				this.renderRunningState();
				status(this.getTooltip());
			}
		}));
		listeners.add(actionRunner.onDidRun(event => {
			if (event.action === this.action) {
				this.running = false;
				this.renderRunningState();
				if (event.error && !isCancellationError(event.error)) {
					this._notificationService.error(event.error);
				}
			}
		}));
	}

	private renderRunningState(): void {
		this.spinner.clear();
		this.updateLabel();
		this.updateClass();
		if (this.running && this.options.icon && this.label) {
			const spinner = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
			this.spinner.value = toDisposable(() => spinner.remove());
			spinner.setAttribute('aria-hidden', 'true');
			this.label.appendChild(spinner);
		}
		this.label?.setAttribute('aria-busy', String(this.running));
		this.updateEnabled();
		this.updateTooltip();
	}
}

export function createSessionActionViewItemProvider(instantiationService: IInstantiationService, configurationService: IConfigurationService, shouldTriggerClickAnimation?: (context: unknown) => boolean): IActionViewItemProvider {
	return (action, options) => {
		if (action instanceof MenuItemAction && (action.id === ARCHIVE_SESSION_COMMAND_ID || action.id === ARCHIVE_SESSION_GROUP_COMMAND_ID)) {
			return instantiationService.createInstance(SessionArchiveActionViewItem, action, getSessionArchiveActionViewItemOptions(options, configurationService, shouldTriggerClickAnimation));
		}
		return undefined;
	};
}
