/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { ICodeEditor, getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EditorOption, filterValidationDecorations } from '../../../../editor/common/config/editorOptions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
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
		@ILanguageStatusService languageStatusService: ILanguageStatusService
	) {
		super();

		const accessors = [new ColorDecorationAccessor(), new FoldingRangeAccessor(), new DiagnosticDecorationAccessor()];
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

	getLimitReporter(editor: ICodeEditor): LimitInfo | undefined {
		return DiagnosticDecorationLimitReporter.get(editor) ?? undefined;
	}
}

export class DiagnosticDecorationLimitReporter extends Disposable implements IEditorContribution, LimitInfo {

	static readonly ID = 'editor.contrib.diagnosticDecorationLimitReporter';

	static get(editor: ICodeEditor): DiagnosticDecorationLimitReporter | null {
		return editor.getContribution<DiagnosticDecorationLimitReporter>(DiagnosticDecorationLimitReporter.ID);
	}

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _limited: number | false = false;

	get limited(): number | false {
		return this._limited;
	}

	constructor(
		private readonly editor: ICodeEditor,
		@IMarkerDecorationsService private readonly markerDecorationsService: IMarkerDecorationsService
	) {
		super();

		this._register(editor.onDidChangeModel(() => this._update()));
		this._register(editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.renderValidationDecorations) || e.hasChanged(EditorOption.readOnly)) {
				this._update();
			}
		}));
		this._register(markerDecorationsService.onDidChangeDecorationLimitExceeded(model => {
			if (model === editor.getModel()) {
				this._update();
			}
		}));
		this._update();
	}

	private _update(): void {
		const model = this.editor.getModel();
		const limited = model && !filterValidationDecorations(this.editor.getOptions())
			? this.markerDecorationsService.getExceededDecorationLimit(model.uri) ?? false
			: false;
		if (limited !== this._limited) {
			this._limited = limited;
			this._onDidChange.fire();
		}
	}
}

class LanguageStatusEntry implements IDisposable {

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
				command: this.accessor.settingsId ? { id: openSettingsCommand, arguments: [this.accessor.settingsId], title: configureSettingsLabel } : undefined,
				accessibilityInfo: undefined,
				source: this.accessor.source,
				busy: false
			};
			this._limitStatusItem = this.languageStatusService.addStatus(status);
		}
	}

	public dispose() {
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

registerEditorContribution(DiagnosticDecorationLimitReporter.ID, DiagnosticDecorationLimitReporter, EditorContributionInstantiation.Lazy);
