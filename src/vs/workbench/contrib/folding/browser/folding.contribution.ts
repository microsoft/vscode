/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { FoldingController, FoldingLimitInfo } from 'vs/editor/contrib/folding/browser/folding';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const openSettingsCommand = 'workbench.action.openSettings';
const configureSettingsLabel = nls.localize('status.button.configure', "Configure");

const foldingMaximumRegionsSettingsId = 'editor.foldingMaximumRegions';

export class FoldingLimitIndicatorContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageStatusService private readonly languageStatusService: ILanguageStatusService
	) {
		super();

		let changeListener: IDisposable | undefined;
		let control: any;

		const onActiveEditorChanged = () => {
			const activeControl = editorService.activeTextEditorControl;
			if (activeControl === control) {
				return;
			}
			control = undefined;
			if (changeListener) {
				changeListener.dispose();
				changeListener = undefined;
			}
			const editor = getCodeEditor(activeControl);
			if (editor) {
				const controller = FoldingController.get(editor);
				if (controller) {
					const info = controller.foldingLimitInfo;
					this.updateLimitInfo(info);
					control = activeControl;
					changeListener = controller.onDidChangeFoldingLimit(info => {
						this.updateLimitInfo(info);
					});
				} else {
					this.updateLimitInfo(undefined);
				}
			} else {
				this.updateLimitInfo(undefined);
			}
		};

		this._register(this.editorService.onDidActiveEditorChange(onActiveEditorChanged));

		onActiveEditorChanged();
	}

	private _limitStatusItem: IDisposable | undefined;

	private updateLimitInfo(info: FoldingLimitInfo | undefined) {
		if (this._limitStatusItem) {
			this._limitStatusItem.dispose();
			this._limitStatusItem = undefined;
		}
		if (info && info.limited !== false) {
			const status: ILanguageStatus = {
				id: 'foldingLimitInfo',
				selector: '*',
				name: nls.localize('foldingRangesStatusItem.name', 'Folding Status'),
				severity: Severity.Warning,
				label: nls.localize('status.limitedFoldingRanges.short', 'Folding Ranges Limited'),
				detail: nls.localize('status.limitedFoldingRanges.details', 'only {0} folding ranges shown for performance reasons', info.limited),
				command: { id: openSettingsCommand, arguments: [foldingMaximumRegionsSettingsId], title: configureSettingsLabel },
				accessibilityInfo: undefined,
				source: nls.localize('foldingRangesStatusItem.source', 'Folding'),
				busy: false
			};
			this._limitStatusItem = this.languageStatusService.addStatus(status);
		}

	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	FoldingLimitIndicatorContribution,
	LifecyclePhase.Restored
);
