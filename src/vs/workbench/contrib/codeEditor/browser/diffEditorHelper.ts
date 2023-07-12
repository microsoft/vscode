/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { registerDiffEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { DiffReviewNext, DiffReviewPrev } from 'vs/editor/browser/widget/diffEditor.contribution';
import { DiffEditorWidget2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorWidget2';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffComputationResult } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { IDiffEditorContribution } from 'vs/editor/common/editorCommon';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { FloatingClickWidget } from 'vs/workbench/browser/codeeditor';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibilityContribution';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const enum WidgetState {
	Hidden,
	HintWhitespace
}

class DiffEditorHelperContribution extends Disposable implements IDiffEditorContribution {

	public static readonly ID = 'editor.contrib.diffEditorHelper';

	private _helperWidget: FloatingClickWidget | null;
	private _helperWidgetListener: IDisposable | null;
	private _state: WidgetState;

	constructor(
		private readonly _diffEditor: IDiffEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		this._register(AccessibilityHelpAction.addImplementation(105, 'diff-editor', async accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const editorService = accessor.get(IEditorService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const keybindingService = accessor.get(IKeybindingService);

			const next = keybindingService.lookupKeybinding(DiffReviewNext.id)?.getAriaLabel();
			const previous = keybindingService.lookupKeybinding(DiffReviewPrev.id)?.getAriaLabel();

			if (!(editorService.activeTextEditorControl instanceof DiffEditorWidget2)) {
				return;
			}

			const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			if (!codeEditor) {
				return;
			}

			const keys = ['audioCues.diffLineDeleted', 'audioCues.diffLineInserted', 'audioCues.diffLineModified'];

			accessibleViewService.show({
				verbositySettingKey: 'diffEditor',
				provideContent: () => [
					nls.localize('msg1', "You are in a diff editor."),
					nls.localize('msg2', "Press {0} or {1} to view the next or previous diff in the diff review mode that is optimized for screen readers.", next, previous),
					nls.localize('msg3', "To control which audio cues should be played, the following settings can be configured: {0}.", keys.join(', ')),
				].join('\n'),
				onClose: () => {
					codeEditor.focus();
				},
				options: { type: AccessibleViewType.HelpMenu, ariaLabel: nls.localize('chat-help-label', "Diff editor accessibility help") }
			});
		}, ContextKeyExpr.and(
			ContextKeyEqualsExpr.create('diffEditorVersion', 2),
			ContextKeyEqualsExpr.create('isInDiffEditor', true),
		)));

		this._helperWidget = null;
		this._helperWidgetListener = null;
		this._state = WidgetState.Hidden;

		if (!(this._diffEditor instanceof EmbeddedDiffEditorWidget)) {
			this._register(this._diffEditor.onDidUpdateDiff(() => {
				const diffComputationResult = this._diffEditor.getDiffComputationResult();
				this._setState(this._deduceState(diffComputationResult));

				if (diffComputationResult && diffComputationResult.quitEarly) {
					this._notificationService.prompt(
						Severity.Warning,
						nls.localize('hintTimeout', "The diff algorithm was stopped early (after {0} ms.)", this._diffEditor.maxComputationTime),
						[{
							label: nls.localize('removeTimeout', "Remove Limit"),
							run: () => {
								this._configurationService.updateValue('diffEditor.maxComputationTime', 0);
							}
						}],
						{}
					);
				}
			}));
		}
	}

	private _deduceState(diffComputationResult: IDiffComputationResult | null): WidgetState {
		if (!diffComputationResult) {
			return WidgetState.Hidden;
		}
		if (this._diffEditor.ignoreTrimWhitespace && diffComputationResult.changes.length === 0 && !diffComputationResult.identical) {
			return WidgetState.HintWhitespace;
		}
		return WidgetState.Hidden;
	}

	private _setState(newState: WidgetState) {
		if (this._state === newState) {
			return;
		}

		this._state = newState;

		if (this._helperWidgetListener) {
			this._helperWidgetListener.dispose();
			this._helperWidgetListener = null;
		}
		if (this._helperWidget) {
			this._helperWidget.dispose();
			this._helperWidget = null;
		}

		if (this._state === WidgetState.HintWhitespace) {
			this._helperWidget = this._instantiationService.createInstance(FloatingClickWidget, this._diffEditor.getModifiedEditor(), nls.localize('hintWhitespace', "Show Whitespace Differences"), null);
			this._helperWidgetListener = this._helperWidget.onClick(() => this._onDidClickHelperWidget());
			this._helperWidget.render();
		}
	}

	private _onDidClickHelperWidget(): void {
		if (this._state === WidgetState.HintWhitespace) {
			this._configurationService.updateValue('diffEditor.ignoreTrimWhitespace', false);
		}
	}

	override dispose(): void {
		super.dispose();
	}
}

registerDiffEditorContribution(DiffEditorHelperContribution.ID, DiffEditorHelperContribution);
