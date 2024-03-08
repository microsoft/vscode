/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationHandle, INotificationService, NotificationPriority } from 'vs/platform/notification/common/notification';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

class ScreenReaderModeStatusEntry extends Disposable {

	private readonly screenReaderModeElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(@IStatusbarService private readonly statusbarService: IStatusbarService) {
		super();
	}

	updateScreenReaderModeElement(visible: boolean): void {
		if (visible) {
			if (!this.screenReaderModeElement.value) {
				const text = localize('screenReaderDetected', "Screen Reader Optimized");
				this.screenReaderModeElement.value = this.statusbarService.addEntry({
					name: localize('status.editor.screenReaderMode', "Screen Reader Mode"),
					text,
					ariaLabel: text,
					command: 'showEditorScreenReaderNotification',
					kind: 'prominent'
				}, 'status.editor.screenReaderMode', StatusbarAlignment.RIGHT, 100.6);
			}
		} else {
			this.screenReaderModeElement.clear();
		}
	}
}

export class AccessibilityStatus extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.accessibilityStatus';

	private screenReaderNotification: INotificationHandle | null = null;
	private promptedScreenReader: boolean = false;
	private readonly screenReaderModeElements = new Set<ScreenReaderModeStatusEntry>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super();

		this.createScreenReaderModeElement(instantiationService, this._store);
		this.updateScreenReaderModeElements(accessibilityService.isScreenReaderOptimized());

		CommandsRegistry.registerCommand({ id: 'showEditorScreenReaderNotification', handler: () => this.showScreenReaderNotification() });

		this.registerListeners();
	}

	private createScreenReaderModeElement(instantiationService: IInstantiationService, disposables: DisposableStore): ScreenReaderModeStatusEntry {
		const entry = disposables.add(instantiationService.createInstance(ScreenReaderModeStatusEntry));

		this.screenReaderModeElements.add(entry);
		disposables.add(toDisposable(() => this.screenReaderModeElements.delete(entry)));

		return entry;
	}

	private updateScreenReaderModeElements(visible: boolean): void {
		for (const entry of this.screenReaderModeElements) {
			entry.updateScreenReaderModeElement(visible);
		}
	}

	private registerListeners(): void {
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.onScreenReaderModeChange()));

		this._register(this.configurationService.onDidChangeConfiguration(c => {
			if (c.affectsConfiguration('editor.accessibilitySupport')) {
				this.onScreenReaderModeChange();
			}
		}));

		this._register(this.editorGroupService.onDidCreateAuxiliaryEditorPart(({ instantiationService, disposables }) => {
			const entry = this.createScreenReaderModeElement(instantiationService, disposables);
			entry.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
		}));
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

	private onScreenReaderModeChange(): void {

		// We only support text based editors
		const screenReaderDetected = this.accessibilityService.isScreenReaderOptimized();
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
		this.updateScreenReaderModeElements(this.accessibilityService.isScreenReaderOptimized());
	}

	override dispose(): void {
		super.dispose();

		for (const entry of this.screenReaderModeElements) {
			entry.dispose();
		}
	}
}
