/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { autorunWithStore, observableFromEvent } from 'vs/base/common/observable';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { registerDiffEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev } from 'vs/editor/browser/widget/diffEditor.contribution';
import { DiffEditorWidget2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorWidget2';
import { EmbeddedDiffEditorWidget, EmbeddedDiffEditorWidget2 } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorContribution } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { FloatingClickWidget } from 'vs/workbench/browser/codeeditor';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityHelpAction, AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class DiffEditorHelperContribution extends Disposable implements IDiffEditorContribution {
	public static readonly ID = 'editor.contrib.diffEditorHelper';

	constructor(
		private readonly _diffEditor: IDiffEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		this._register(createScreenReaderHelp());

		const isEmbeddedDiffEditor = (this._diffEditor instanceof EmbeddedDiffEditorWidget) || (this._diffEditor instanceof EmbeddedDiffEditorWidget2);

		if (!isEmbeddedDiffEditor) {
			const computationResult = observableFromEvent(e => this._diffEditor.onDidUpdateDiff(e), () => this._diffEditor.getDiffComputationResult());
			const onlyWhiteSpaceChange = computationResult.map(r => r && !r.identical && r.changes2.length === 0);

			this._register(autorunWithStore((reader, store) => {
				/** @description update state */
				if (onlyWhiteSpaceChange.read(reader)) {
					const helperWidget = store.add(this._instantiationService.createInstance(
						FloatingClickWidget,
						this._diffEditor.getModifiedEditor(),
						localize('hintWhitespace', "Show Whitespace Differences"),
						null
					));
					store.add(helperWidget.onClick(() => {
						this._configurationService.updateValue('diffEditor.ignoreTrimWhitespace', false);
					}));
					helperWidget.render();
				}
			}));

			this._register(this._diffEditor.onDidUpdateDiff(() => {
				const diffComputationResult = this._diffEditor.getDiffComputationResult();

				if (diffComputationResult && diffComputationResult.quitEarly) {
					this._notificationService.prompt(
						Severity.Warning,
						localize('hintTimeout', "The diff algorithm was stopped early (after {0} ms.)", this._diffEditor.maxComputationTime),
						[{
							label: localize('removeTimeout', "Remove Limit"),
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
}

function createScreenReaderHelp(): IDisposable {
	return AccessibilityHelpAction.addImplementation(105, 'diff-editor', async (accessor) => {
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const editorService = accessor.get(IEditorService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const keybindingService = accessor.get(IKeybindingService);

		const next = keybindingService.lookupKeybinding(AccessibleDiffViewerNext.id)?.getAriaLabel();
		const previous = keybindingService.lookupKeybinding(AccessibleDiffViewerPrev.id)?.getAriaLabel();

		if (!(editorService.activeTextEditorControl instanceof DiffEditorWidget2)) {
			return;
		}

		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}

		const keys = ['audioCues.diffLineDeleted', 'audioCues.diffLineInserted', 'audioCues.diffLineModified'];

		accessibleViewService.show({
			verbositySettingKey: AccessibilityVerbositySettingId.DiffEditor,
			provideContent: () => [
				localize('msg1', "You are in a diff editor."),
				localize('msg2', "Press {0} or {1} to view the next or previous diff in the diff review mode that is optimized for screen readers.", next, previous),
				localize('msg3', "To control which audio cues should be played, the following settings can be configured: {0}.", keys.join(', ')),
			].join('\n'),
			onClose: () => {
				codeEditor.focus();
			},
			options: { type: AccessibleViewType.Help, ariaLabel: localize('chat-help-label', "Diff editor accessibility help") }
		});
	}, ContextKeyExpr.and(
		ContextKeyEqualsExpr.create('diffEditorVersion', 2),
		ContextKeyEqualsExpr.create('isInDiffEditor', true)
	));
}

registerDiffEditorContribution(DiffEditorHelperContribution.ID, DiffEditorHelperContribution);
