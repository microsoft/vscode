/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Event } from 'vs/base/common/event';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

export class DiffEditorActiveAnnouncementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.diffEditorActiveAnnouncement';

	private _onDidActiveEditorChangeListener?: IDisposable;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._register(Event.runAndSubscribe(_accessibilityService.onDidChangeScreenReaderOptimized, () => this._updateListener()));
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.DiffEditorActive)) {
				this._updateListener();
			}
		}));
	}

	private _updateListener(): void {
		const announcementEnabled = this._configurationService.getValue(AccessibilityVerbositySettingId.DiffEditorActive);
		const screenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();

		if (!announcementEnabled || !screenReaderOptimized) {
			this._onDidActiveEditorChangeListener?.dispose();
			this._onDidActiveEditorChangeListener = undefined;
			return;
		}

		if (this._onDidActiveEditorChangeListener) {
			return;
		}

		this._onDidActiveEditorChangeListener = this._register(this._editorService.onDidActiveEditorChange(() => {
			if (isDiffEditor(this._editorService.activeTextEditorControl)) {
				this._accessibilityService.alert(localize('openDiffEditorAnnouncement', "Diff editor"));
			}
		}));
	}
}
