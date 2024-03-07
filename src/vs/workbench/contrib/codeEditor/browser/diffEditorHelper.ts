/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { autorunWithStore, observableFromEvent } from 'vs/base/common/observable';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { registerDiffEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev } from 'vs/editor/browser/widget/diffEditor/commands';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { IDiffEditorContribution } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { FloatingEditorClickWidget } from 'vs/workbench/browser/codeeditor';
import { Extensions, IConfigurationMigrationRegistry } from 'vs/workbench/common/configuration';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { getCommentCommandInfo } from 'vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp';
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

		const isEmbeddedDiffEditor = this._diffEditor instanceof EmbeddedDiffEditorWidget;

		if (!isEmbeddedDiffEditor) {
			const computationResult = observableFromEvent(e => this._diffEditor.onDidUpdateDiff(e), () => /** @description diffEditor.diffComputationResult */ this._diffEditor.getDiffComputationResult());
			const onlyWhiteSpaceChange = computationResult.map(r => r && !r.identical && r.changes2.length === 0);

			this._register(autorunWithStore((reader, store) => {
				/** @description update state */
				if (onlyWhiteSpaceChange.read(reader)) {
					const helperWidget = store.add(this._instantiationService.createInstance(
						FloatingEditorClickWidget,
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
		const contextKeyService = accessor.get(IContextKeyService);

		if (!(editorService.activeTextEditorControl instanceof DiffEditorWidget)) {
			return;
		}

		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}

		const next = keybindingService.lookupKeybinding(AccessibleDiffViewerNext.id)?.getAriaLabel();
		const previous = keybindingService.lookupKeybinding(AccessibleDiffViewerPrev.id)?.getAriaLabel();
		let switchSides;
		const switchSidesKb = keybindingService.lookupKeybinding('diffEditor.switchSide')?.getAriaLabel();
		if (switchSidesKb) {
			switchSides = localize('msg3', "Run the command Diff Editor: Switch Side ({0}) to toggle between the original and modified editors.", switchSidesKb);
		} else {
			switchSides = localize('switchSidesNoKb', "Run the command Diff Editor: Switch Side, which is currently not triggerable via keybinding, to toggle between the original and modified editors.");
		}

		const diffEditorActiveAnnouncement = localize('msg5', "The setting, accessibility.verbosity.diffEditorActive, controls if a diff editor announcement is made when it becomes the active editor.");

		const keys = ['accessibility.signals.diffLineDeleted', 'accessibility.signals.diffLineInserted', 'accessibility.signals.diffLineModified'];
		const content = [
			localize('msg1', "You are in a diff editor."),
			localize('msg2', "View the next ({0}) or previous ({1}) diff in diff review mode, which is optimized for screen readers.", next, previous),
			switchSides,
			diffEditorActiveAnnouncement,
			localize('msg4', "To control which accessibility signals should be played, the following settings can be configured: {0}.", keys.join(', ')),
		];
		const commentCommandInfo = getCommentCommandInfo(keybindingService, contextKeyService, codeEditor);
		if (commentCommandInfo) {
			content.push(commentCommandInfo);
		}
		accessibleViewService.show({
			id: AccessibleViewProviderId.DiffEditor,
			verbositySettingKey: AccessibilityVerbositySettingId.DiffEditor,
			provideContent: () => content.join('\n\n'),
			onClose: () => {
				codeEditor.focus();
			},
			options: { type: AccessibleViewType.Help }
		});
	}, ContextKeyEqualsExpr.create('isInDiffEditor', true));
}

registerDiffEditorContribution(DiffEditorHelperContribution.ID, DiffEditorHelperContribution);

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'diffEditor.experimental.collapseUnchangedRegions',
		migrateFn: (value, accessor) => {
			return [
				['diffEditor.hideUnchangedRegions.enabled', { value }],
				['diffEditor.experimental.collapseUnchangedRegions', { value: undefined }]
			];
		}
	}]);
