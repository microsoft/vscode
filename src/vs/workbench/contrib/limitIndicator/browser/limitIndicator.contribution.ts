/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { ICodeEditor, getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption, filterValidationDecorations } from '../../../../editor/common/config/editorOptions.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import * as nls from '../../../../nls.js';

import { FoldingController } from '../../../../editor/contrib/folding/browser/folding.js';
import { ColorDetector } from '../../../../editor/contrib/colorPicker/browser/colorDetector.js';

const openSettingsCommand = 'workbench.action.openSettings';
const configureSettingsLabel = nls.localize('status.button.configure', "Configure");

/**
 * Uses the language status indicator to report performance limits for folding ranges, color decorators, and diagnostic highlights.
 */
export class LimitIndicatorContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService editorService: IEditorService,
		@ILanguageStatusService languageStatusService: ILanguageStatusService,
		@IMarkerDecorationsService markerDecorationsService: IMarkerDecorationsService
	) {
		super();

		const accessors = [new ColorDecorationAccessor(), new FoldingRangeAccessor(), new DiagnosticDecorationAccessor(markerDecorationsService)];
		const statusEntries = accessors.map(indicator => new LanguageStatusEntry(languageStatusService, indicator));
		statusEntries.forEach(entry => this._register(entry));

		let control: unknown;

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

	readonly limited: number | false;
}

interface LanguageFeatureAccessor {
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly source: string;
	readonly settingsId?: string;
	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined;
}

class ColorDecorationAccessor implements LanguageFeatureAccessor {
	readonly id = 'decoratorsLimitInfo';
	readonly name = nls.localize('colorDecoratorsStatusItem.name', 'Color Decorator Status');
	readonly label = nls.localize('status.limitedColorDecorators.short', 'Color decorators');
	readonly source = nls.localize('colorDecoratorsStatusItem.source', 'Color Decorators');
	readonly settingsId = 'editor.colorDecoratorsLimit';

	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined {
		return ColorDetector.get(editor)?.limitReporter;
	}
}

class FoldingRangeAccessor implements LanguageFeatureAccessor {
	readonly id = 'foldingLimitInfo';
	readonly name = nls.localize('foldingRangesStatusItem.name', 'Folding Status');
	readonly label = nls.localize('status.limitedFoldingRanges.short', 'Folding ranges');
	readonly source = nls.localize('foldingRangesStatusItem.source', 'Folding');
	readonly settingsId = 'editor.foldingMaximumRegions';

	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined {
		return FoldingController.get(editor)?.limitReporter;
	}
}

class DiagnosticDecorationAccessor implements LanguageFeatureAccessor {
	readonly id = 'diagnosticsLimitInfo';
	readonly name = nls.localize('diagnosticHighlightsStatusItem.name', "Diagnostic Highlight Status");
	readonly label = nls.localize('status.limitedDiagnosticHighlights.short', "Diagnostic highlights");
	readonly source = nls.localize('diagnosticHighlightsStatusItem.source', "Diagnostics");

	constructor(private readonly markerDecorationsService: IMarkerDecorationsService) { }

	getLimitReporter(editor: ICodeEditor): LimitInfo {
		const markerDecorationsService = this.markerDecorationsService;
		return {
			onDidChange: Event.any(
				Event.signal(editor.onDidChangeModel),
				Event.signal(Event.filter(editor.onDidChangeConfiguration, e => e.hasChanged(EditorOption.renderValidationDecorations) || e.hasChanged(EditorOption.readOnly))),
				Event.signal(Event.filter(markerDecorationsService.onDidChangeMarker, model => model === editor.getModel()))
			),
			get limited(): number | false {
				const model = editor.getModel();
				return model && !filterValidationDecorations(editor.getOptions()) ? markerDecorationsService.getDecorationLimit(model.uri) : false;
			}
		};
	}
}

class LanguageStatusEntry implements IDisposable {

	private _limitStatusItem: IDisposable | undefined;
	private _indicatorChangeListener: IDisposable | undefined;
	private _limited: number | false = false;

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
		const limited = info?.limited ?? false;
		if (limited === this._limited) {
			return;
		}
		this._limited = limited;

		if (this._limitStatusItem) {
			this._limitStatusItem.dispose();
			this._limitStatusItem = undefined;
		}
		if (limited !== false) {
			const status: ILanguageStatus = {
				id: this.accessor.id,
				selector: '*',
				name: this.accessor.name,
				severity: Severity.Warning,
				label: this.accessor.label,
				detail: nls.localize('status.limited.details', 'only {0} shown for performance reasons', limited),
				command: this.accessor.settingsId ? { id: openSettingsCommand, arguments: [this.accessor.settingsId], title: configureSettingsLabel } : undefined,
				accessibilityInfo: undefined,
				source: this.accessor.source,
				busy: false
			};
			this._limitStatusItem = this.languageStatusService.addStatus(status);
		}
	}

	public dispose() {
		this._limited = false;
		this._limitStatusItem?.dispose();
		this._limitStatusItem = undefined;
		this._indicatorChangeListener?.dispose();
		this._indicatorChangeListener = undefined;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	LimitIndicatorContribution,
	LifecyclePhase.Restored
);
