/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationHandle, INotificationService, NotificationPriority } from 'vs/platform/notification/common/notification';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_FOREGROUND } from 'vs/workbench/common/theme';

export class AccessibilityStatus extends Disposable implements IWorkbenchContribution {
	private screenReaderNotification: INotificationHandle | null = null;
	private promptedScreenReader: boolean = false;
	private readonly screenReaderModeElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super();

		this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => this.onScreenReaderModeChange()));
		this._register(configurationService.onDidChangeConfiguration(c => {
			if (c.affectsConfiguration('editor.accessibilitySupport')) {
				this.onScreenReaderModeChange();
			}
		}));
		CommandsRegistry.registerCommand({ id: 'showEditorScreenReaderNotification', handler: () => this.showScreenReaderNotification() });
		this.updateScreenReaderModeElement(this._accessibilityService.isScreenReaderOptimized());
	}

	private showScreenReaderNotification(): void {
		this.screenReaderNotification = this.notificationService.prompt(
			Severity.Info,
			localize('screenReaderDetectedExplanation.question', "Are you using a screen reader to operate VS Code?"),
			[{
				label: localize('screenReaderDetectedExplanation.answerYes', "Yes"),
				run: () => {
					this.configurationService.updateValue('editor.accessibilitySupport', 'on', ConfigurationTarget.USER);
				}
			}, {
				label: localize('screenReaderDetectedExplanation.answerNo', "No"),
				run: () => {
					this.configurationService.updateValue('editor.accessibilitySupport', 'off', ConfigurationTarget.USER);
				}
			}],
			{
				sticky: true,
				priority: NotificationPriority.URGENT
			}
		);

		Event.once(this.screenReaderNotification.onDidClose)(() => this.screenReaderNotification = null);
	}
	private updateScreenReaderModeElement(visible: boolean): void {
		if (visible) {
			if (!this.screenReaderModeElement.value) {
				const text = localize('screenReaderDetected', "Screen Reader Optimized");
				this.screenReaderModeElement.value = this.statusbarService.addEntry({
					name: localize('status.editor.screenReaderMode', "Screen Reader Mode"),
					text,
					ariaLabel: text,
					command: 'showEditorScreenReaderNotification',
					backgroundColor: themeColorFromId(STATUS_BAR_PROMINENT_ITEM_BACKGROUND),
					color: themeColorFromId(STATUS_BAR_PROMINENT_ITEM_FOREGROUND)
				}, 'status.editor.screenReaderMode', StatusbarAlignment.RIGHT, 100.6);
			}
		} else {
			this.screenReaderModeElement.clear();
		}
	}

	private onScreenReaderModeChange(): void {

		// We only support text based editors
		const screenReaderDetected = this._accessibilityService.isScreenReaderOptimized();
		if (screenReaderDetected) {
			const screenReaderConfiguration = this.configurationService.getValue('editor.accessibilitySupport');
			if (screenReaderConfiguration === 'auto') {
				if (!this.promptedScreenReader) {
					this.promptedScreenReader = true;
					setTimeout(() => this.showScreenReaderNotification(), 100);
				}
			}
		}

		if (this.screenReaderNotification) {
			this.screenReaderNotification.close();
		}
		this.updateScreenReaderModeElement(this._accessibilityService.isScreenReaderOptimized());
	}
}
