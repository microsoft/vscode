/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { Range } from '../../../common/core/range.js';
import { IModelDeltaDecoration } from '../../../common/model.js';
import { LineEditSource, ILineEditSourcesChangedEvent } from '../../../common/lineEditSource.js';
import { LineEditIndicatorCssClass, LineEditIndicatorTooltip, LineEditIndicatorCommandId } from '../common/lineEditIndicator.js';
import './lineEditIndicator.css';
import * as nls from '../../../../nls.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * Editor contribution that shows line edit source indicators in the glyph margin
 */
export class LineEditIndicatorContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.lineEditIndicator';

	public static get(editor: ICodeEditor): LineEditIndicatorContribution | null {
		return editor.getContribution<LineEditIndicatorContribution>(LineEditIndicatorContribution.ID);
	}

	private readonly _editor: ICodeEditor;
	private _enabled: boolean = false; // Default disabled
	private _decorationsCollection: string[] = [];

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;

		// Listen for line edit source changes
		this._register(this._editor.onDidChangeModel(() => {
			this._clearDecorations();
			this._attachToModel();
		}));

		if (this._editor.getModel()) {
			this._attachToModel();
		}
	}

	private _attachToModel(): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		// Listen for line edit source changes
		this._register(model.onDidChangeLineEditSources((e: ILineEditSourcesChangedEvent) => {
			if (this._enabled) {
				this._updateDecorations(e);
			}
		}));

		// Initialize decorations for all existing line edit sources
		if (this._enabled) {
			this._initializeDecorations();
		}
	}

	private _initializeDecorations(): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const allLineEditSources = model.getAllLineEditSources();
		const newDecorations: IModelDeltaDecoration[] = [];

		for (const [lineNumber, source] of allLineEditSources) {
			const decoration = this._createDecorationForLine(lineNumber, source);
			if (decoration) {
				newDecorations.push(decoration);
			}
		}

		this._decorationsCollection = model.deltaDecorations(this._decorationsCollection, newDecorations);
	}

	private _updateDecorations(event: ILineEditSourcesChangedEvent): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const newDecorations: IModelDeltaDecoration[] = [];

		// Create decorations for changed lines
		for (const [lineNumber, source] of event.changes) {
			const decoration = this._createDecorationForLine(lineNumber, source);
			if (decoration) {
				newDecorations.push(decoration);
			}
		}

		// Update decorations - this will replace all existing decorations
		// We rebuild all decorations to ensure consistency
		this._decorationsCollection = model.deltaDecorations(this._decorationsCollection, []);
		this._initializeDecorations();
	}

	private _createDecorationForLine(lineNumber: number, source: LineEditSource): IModelDeltaDecoration | null {
		if (source === LineEditSource.Undetermined) {
			// Don't show indicators for undetermined sources by default
			return null;
		}

		const cssClass = this._getCssClassForSource(source);
		const tooltip = this._getTooltipForSource(source);

		return {
			range: new Range(lineNumber, 1, lineNumber, 1),
			options: {
				description: 'line-edit-indicator',
				glyphMarginClassName: `codicon codicon-triangle-right ${cssClass}`,
				glyphMarginHoverMessage: { value: tooltip },
				stickiness: 1 // TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
			}
		};
	}

	private _getCssClassForSource(source: LineEditSource): string {
		switch (source) {
			case LineEditSource.Human:
				return LineEditIndicatorCssClass.Human;
			case LineEditSource.AI:
				return LineEditIndicatorCssClass.AI;
			case LineEditSource.Undetermined:
				return LineEditIndicatorCssClass.Undetermined;
			default:
				return LineEditIndicatorCssClass.Undetermined;
		}
	}

	private _getTooltipForSource(source: LineEditSource): string {
		switch (source) {
			case LineEditSource.Human:
				return LineEditIndicatorTooltip.Human;
			case LineEditSource.AI:
				return LineEditIndicatorTooltip.AI;
			case LineEditSource.Undetermined:
				return LineEditIndicatorTooltip.Undetermined;
			default:
				return LineEditIndicatorTooltip.Undetermined;
		}
	}

	private _clearDecorations(): void {
		const model = this._editor.getModel();
		if (model && this._decorationsCollection.length > 0) {
			this._decorationsCollection = model.deltaDecorations(this._decorationsCollection, []);
		}
	}

	public enable(): void {
		if (!this._enabled) {
			this._enabled = true;
			this._initializeDecorations();
		}
	}

	public disable(): void {
		if (this._enabled) {
			this._enabled = false;
			this._clearDecorations();
		}
	}

	public toggle(): void {
		if (this._enabled) {
			this.disable();
		} else {
			this.enable();
		}
	}

	public isEnabled(): boolean {
		return this._enabled;
	}

	public override dispose(): void {
		this._clearDecorations();
		super.dispose();
	}
}

// Register the contribution
registerEditorContribution(LineEditIndicatorContribution.ID, LineEditIndicatorContribution, EditorContributionInstantiation.Eager);

// Editor actions for enable/disable/toggle
export class EnableLineEditIndicatorAction extends EditorAction {
	constructor() {
		super({
			id: LineEditIndicatorCommandId.Enable,
			label: nls.localize('enableLineEditIndicator', "Enable Line Edit Indicators"),
			alias: 'Enable Line Edit Indicators',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: 0
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const contribution = LineEditIndicatorContribution.get(editor);
		if (contribution) {
			contribution.enable();
		}
	}
}

export class DisableLineEditIndicatorAction extends EditorAction {
	constructor() {
		super({
			id: LineEditIndicatorCommandId.Disable,
			label: nls.localize('disableLineEditIndicator', "Disable Line Edit Indicators"),
			alias: 'Disable Line Edit Indicators',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: 0
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const contribution = LineEditIndicatorContribution.get(editor);
		if (contribution) {
			contribution.disable();
		}
	}
}

export class ToggleLineEditIndicatorAction extends EditorAction {
	constructor() {
		super({
			id: LineEditIndicatorCommandId.Toggle,
			label: nls.localize('toggleLineEditIndicator', "Toggle Line Edit Indicators"),
			alias: 'Toggle Line Edit Indicators',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: 0
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const contribution = LineEditIndicatorContribution.get(editor);
		if (contribution) {
			contribution.toggle();
		}
	}
}

// Register the actions
registerEditorAction(EnableLineEditIndicatorAction);
registerEditorAction(DisableLineEditIndicatorAction);
registerEditorAction(ToggleLineEditIndicatorAction);
