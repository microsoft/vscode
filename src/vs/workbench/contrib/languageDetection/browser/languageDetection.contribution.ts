/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser';
import { localize, localize2 } from '../../../../nls';
import { Registry } from '../../../../platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions';
import { IEditorService } from '../../../services/editor/common/editorService';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar';
import { ILanguageDetectionService, LanguageDetectionHintConfig, LanguageDetectionLanguageEventSource } from '../../../services/languageDetection/common/languageDetectionWorkerService';
import { ThrottledDelayer } from '../../../../base/common/async';
import { ILanguageService } from '../../../../editor/common/languages/language';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions';
import { INotificationService } from '../../../../platform/notification/common/notification';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';
import { NOTEBOOK_EDITOR_EDITABLE } from '../../notebook/common/notebookContextKeys';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys';
import { Schemas } from '../../../../base/common/network';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';

const detectLanguageCommandId = 'editor.detectLanguage';

class LanguageDetectionStatusContribution implements IWorkbenchContribution {

	private static readonly _id = 'status.languageDetectionStatus';

	private readonly _disposables = new DisposableStore();
	private _combinedEntry?: IStatusbarEntryAccessor;
	private _delayer = new ThrottledDelayer(1000);
	private readonly _renderDisposables = new DisposableStore();

	constructor(
		@ILanguageDetectionService private readonly _languageDetectionService: ILanguageDetectionService,
		@IStatusbarService private readonly _statusBarService: IStatusbarService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		_editorService.onDidActiveEditorChange(() => this._update(true), this, this._disposables);
		this._update(false);
	}

	dispose(): void {
		this._disposables.dispose();
		this._delayer.dispose();
		this._combinedEntry?.dispose();
		this._renderDisposables.dispose();
	}

	private _update(clear: boolean): void {
		if (clear) {
			this._combinedEntry?.dispose();
			this._combinedEntry = undefined;
		}
		this._delayer.trigger(() => this._doUpdate());
	}

	private async _doUpdate(): Promise<void> {
		const editor = getCodeEditor(this._editorService.activeTextEditorControl);

		this._renderDisposables.clear();

		// update when editor language changes
		editor?.onDidChangeModelLanguage(() => this._update(true), this, this._renderDisposables);
		editor?.onDidChangeModelContent(() => this._update(false), this, this._renderDisposables);
		const editorModel = editor?.getModel();
		const editorUri = editorModel?.uri;
		const existingId = editorModel?.getLanguageId();
		const enablementConfig = this._configurationService.getValue<LanguageDetectionHintConfig>('workbench.editor.languageDetectionHints');
		const enabled = typeof enablementConfig === 'object' && enablementConfig?.untitledEditors;
		const disableLightbulb = !enabled || editorUri?.scheme !== Schemas.untitled || !existingId;

		if (disableLightbulb || !editorUri) {
			this._combinedEntry?.dispose();
			this._combinedEntry = undefined;
		} else {
			const lang = await this._languageDetectionService.detectLanguage(editorUri);
			const skip: Record<string, string | undefined> = { 'jsonc': 'json' };
			const existing = editorModel.getLanguageId();
			if (lang && lang !== existing && skip[existing] !== lang) {
				const detectedName = this._languageService.getLanguageName(lang) || lang;
				let tooltip = localize('status.autoDetectLanguage', "Accept Detected Language: {0}", detectedName);
				const keybinding = this._keybindingService.lookupKeybinding(detectLanguageCommandId);
				const label = keybinding?.getLabel();
				if (label) {
					tooltip += ` (${label})`;
				}

				const props: IStatusbarEntry = {
					name: localize('langDetection.name', "Language Detection"),
					ariaLabel: localize('langDetection.aria', "Change to Detected Language: {0}", lang),
					tooltip,
					command: detectLanguageCommandId,
					text: '$(lightbulb-autofix)',
				};
				if (!this._combinedEntry) {
					this._combinedEntry = this._statusBarService.addEntry(props, LanguageDetectionStatusContribution._id, StatusbarAlignment.RIGHT, { id: 'status.editor.mode', alignment: StatusbarAlignment.RIGHT, compact: true });
				} else {
					this._combinedEntry.update(props);
				}
			} else {
				this._combinedEntry?.dispose();
				this._combinedEntry = undefined;
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LanguageDetectionStatusContribution, LifecyclePhase.Restored);


registerAction2(class extends Action2 {

	constructor() {
		super({
			id: detectLanguageCommandId,
			title: localize2('detectlang', "Detect Language from Content"),
			f1: true,
			precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.toNegated(), EditorContextKeys.editorTextFocus),
			keybinding: { primary: KeyCode.KeyD | KeyMod.Alt | KeyMod.Shift, weight: KeybindingWeight.WorkbenchContrib }
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const languageDetectionService = accessor.get(ILanguageDetectionService);
		const editor = getCodeEditor(editorService.activeTextEditorControl);
		const notificationService = accessor.get(INotificationService);
		const editorUri = editor?.getModel()?.uri;
		if (editorUri) {
			const lang = await languageDetectionService.detectLanguage(editorUri);
			if (lang) {
				editor.getModel()?.setLanguage(lang, LanguageDetectionLanguageEventSource);
			} else {
				notificationService.warn(localize('noDetection', "Unable to detect editor language"));
			}
		}
	}
});
