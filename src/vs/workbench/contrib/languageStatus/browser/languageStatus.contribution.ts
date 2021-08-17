/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { ThemeColor, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { STATUS_BAR_WARNING_ITEM_BACKGROUND, STATUS_BAR_WARNING_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { LanguageStatusDetailsWidget } from 'vs/workbench/contrib/languageStatus/browser/languageStatusList';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';

class EditorStatusContribution implements IWorkbenchContribution {

	private static readonly _id = 'status.languageStatus';

	private readonly _entry = new MutableDisposable<IStatusbarEntryAccessor>();
	private readonly _disposables = new DisposableStore();

	private _status: ILanguageStatus[] = [];
	private _showingDetails: boolean = false;

	constructor(
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@IStatusbarService private readonly _statusBarService: IStatusbarService,
		@IEditorService private readonly _editorService: IEditorService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._disposables.add(CommandsRegistry.registerCommand(EditorStatusContribution._id, () => this._toggleDetails()));

		_languageStatusService.onDidChange(this._update, this, this._disposables);
		_editorService.onDidActiveEditorChange(this._update, this, this._disposables);
		this._update();
	}

	dispose(): void {
		this._entry.dispose();
		this._disposables.dispose();
	}

	private _updateStatus(): void {
		const editor = getCodeEditor(this._editorService.activeTextEditorControl);
		if (editor?.hasModel()) {
			this._status = this._languageStatusService.getLanguageStatus(editor.getModel());
		} else {
			this._status = [];
		}
	}

	private _update(): void {

		this._updateStatus();
		if (this._status.length === 0) {
			this._entry.clear();
			return;
		}

		const [first] = this._status;
		let backgroundColor: ThemeColor | undefined;
		let color: ThemeColor | undefined;
		if (first.severity === Severity.Error) {
			backgroundColor = themeColorFromId(STATUS_BAR_WARNING_ITEM_BACKGROUND);
			color = themeColorFromId(STATUS_BAR_WARNING_ITEM_FOREGROUND);
		} else if (first.severity === Severity.Warning) {
			color = themeColorFromId(STATUS_BAR_WARNING_ITEM_BACKGROUND);
		}

		const props: IStatusbarEntry = {
			name: localize('status.editor.status', "Language Status"),
			text: '$(circle-large-outline)',
			ariaLabel: localize('status.editor.status', "Language Status"),
			backgroundColor,
			color,
			command: EditorStatusContribution._id,
			showBeak: this._showingDetails
		};

		if (!this._entry.value) {
			this._entry.value = this._statusBarService.addEntry(props, EditorStatusContribution._id, StatusbarAlignment.RIGHT, 100.06);
		} else {
			this._entry.value.update(props);
		}
	}

	private _toggleDetails(): void {
		if (!this._entry.value) {
			return;
		}

		if (this._showingDetails) {
			this._contextViewService.hideContextView();
			// this._showingDetails = false; // happens in onHide
			return;
		}

		const anchor = document.getElementById(EditorStatusContribution._id);
		if (!anchor) {
			return;
		}

		let widget: LanguageStatusDetailsWidget | undefined;

		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: container => {
				widget = this._instantiationService.createInstance(LanguageStatusDetailsWidget, this._status, container);
				return toDisposable(() => {
					widget?.dispose();
					widget = undefined;
				});

			},
			onHide: () => {
				this._showingDetails = false;
				this._update();
			}
		});
		this._showingDetails = true;
		this._update();
	}
}



Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorStatusContribution, LifecyclePhase.Restored);
