/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser';
import { localize } from '../../../../nls';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { IWorkbenchContribution } from '../../../common/contributions';
import { IEditorService } from '../../../services/editor/common/editorService';
import { Event } from '../../../../base/common/event';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration';

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
