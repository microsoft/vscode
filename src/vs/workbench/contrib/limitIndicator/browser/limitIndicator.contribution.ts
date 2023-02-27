/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ICodeEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Event } from 'vs/base/common/event';
import * as nls from 'vs/nls';

import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';

const openSettingsCommand = 'workbench.action.openSettings';
const configureSettingsLabel = nls.localize('status.button.configure', "Configure");

/**
 * Uses that language status indicator to show information which language features have been limited for performance reasons.
 * Currently this is used for folding ranges and for color decorators.
 */
export class LimitIndicatorContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService editorService: IEditorService,
		@ILanguageStatusService languageStatusService: ILanguageStatusService
	) {
		super();

		const accessors = [new ColorDecorationAccessor(), new FoldingRangeAccessor()];
		const statusEntries = accessors.map(indicator => new LanguageStatusEntry(languageStatusService, indicator));
		statusEntries.forEach(entry => this._register(entry));

		let control: any;

		const onActiveEditorChanged = () => {
			const activeControl = editorService.activeTextEditorControl;
			if (activeControl === control) {
				return;
			}
			control = activeControl;
			const editor = getCodeEditor(activeControl);

			statusEntries.forEach(statusEntry => statusEntry.onActiveEditorChanged(editor));
		};
		this._register(editorService.onDidActiveEditorChange(onActiveEditorChanged));

		onActiveEditorChanged();
	}

}


export interface LimitInfo {
	readonly onDidChange: Event<void>;

	readonly computed: number;
	readonly limited: number | false;
}

interface LanguageFeatureAccessor {
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly source: string;
	readonly settingsId: string;
	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined;
}

class ColorDecorationAccessor implements LanguageFeatureAccessor {
	readonly id = 'decoratorsLimitInfo';
	readonly name = nls.localize('colorDecoratorsStatusItem.name', 'Color Decorator Status');
	readonly label = nls.localize('status.limitedColorDecorators.short', 'Color Decorators');
	readonly source = nls.localize('colorDecoratorsStatusItem.source', 'Color Decorators');
	readonly settingsId = 'editor.colorDecoratorsLimit';

	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined {
		return ColorDetector.get(editor)?.limitReporter;
	}
}

class FoldingRangeAccessor implements LanguageFeatureAccessor {
	readonly id = 'foldingLimitInfo';
	readonly name = nls.localize('foldingRangesStatusItem.name', 'Folding Status');
	readonly label = nls.localize('status.limitedFoldingRanges.short', 'Folding Ranges');
	readonly source = nls.localize('foldingRangesStatusItem.source', 'Folding');
	readonly settingsId = 'editor.foldingMaximumRegions';

	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined {
		return FoldingController.get(editor)?.limitReporter;
	}
}

class LanguageStatusEntry {

	private _limitStatusItem: IDisposable | undefined;
	private _indicatorChangeListener: IDisposable | undefined;

	constructor(private languageStatusService: ILanguageStatusService, private accessor: LanguageFeatureAccessor) {
	}

	onActiveEditorChanged(editor: ICodeEditor | null): boolean {
		if (this._indicatorChangeListener) {
			this._indicatorChangeListener.dispose();
			this._indicatorChangeListener = undefined;
		}

		let info: LimitInfo | undefined;
		if (editor) {
			info = this.accessor.getLimitReporter(editor);
		}
		this.updateStatusItem(info);
		if (info) {
			this._indicatorChangeListener = info.onDidChange(_ => {
				this.updateStatusItem(info);
			});
			return true;
		}
		return false;
	}


	private updateStatusItem(info: LimitInfo | undefined) {
		if (this._limitStatusItem) {
			this._limitStatusItem.dispose();
			this._limitStatusItem = undefined;
		}
		if (info && info.limited !== false) {
			const status: ILanguageStatus = {
				id: this.accessor.id,
				selector: '*',
				name: this.accessor.name,
				severity: Severity.Warning,
				label: this.accessor.label,
				detail: nls.localize('status.limited.details', 'only {0} shown for performance reasons', info.limited),
				command: { id: openSettingsCommand, arguments: [this.accessor.settingsId], title: configureSettingsLabel },
				accessibilityInfo: undefined,
				source: this.accessor.source,
				busy: false
			};
			this._limitStatusItem = this.languageStatusService.addStatus(status);
		}
	}

	public dispose() {
		this._limitStatusItem?.dispose;
		this._limitStatusItem = undefined;
		this._indicatorChangeListener?.dispose;
		this._indicatorChangeListener = undefined;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	LimitIndicatorContribution,
	LifecyclePhase.Restored
);
