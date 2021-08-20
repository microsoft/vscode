/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/languageStatus';
import * as dom from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerThemingParticipant, ThemeColor, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { NOTIFICATIONS_BORDER, STATUS_BAR_ERROR_ITEM_BACKGROUND, STATUS_BAR_ERROR_ITEM_FOREGROUND, STATUS_BAR_WARNING_ITEM_BACKGROUND, STATUS_BAR_WARNING_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { Link } from 'vs/platform/opener/browser/link';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Button } from 'vs/base/browser/ui/button/button';
import { ICommandService } from 'vs/platform/commands/common/commands';

class EditorStatusContribution implements IWorkbenchContribution {

	private static readonly _id = 'status.languageStatus';

	private readonly _entry = new MutableDisposable<IStatusbarEntryAccessor>();
	private readonly _disposables = new DisposableStore();

	private _status: ILanguageStatus[] = [];

	constructor(
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@IStatusbarService private readonly _statusBarService: IStatusbarService,
		@IEditorService private readonly _editorService: IEditorService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
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
			backgroundColor = themeColorFromId(STATUS_BAR_ERROR_ITEM_BACKGROUND);
			color = themeColorFromId(STATUS_BAR_ERROR_ITEM_FOREGROUND);
		} else if (first.severity === Severity.Warning) {
			backgroundColor = themeColorFromId(STATUS_BAR_WARNING_ITEM_BACKGROUND);
			color = themeColorFromId(STATUS_BAR_WARNING_ITEM_FOREGROUND);
		}

		const element = document.createElement('div');
		for (const status of this._status) {
			element.appendChild(this._renderStatus(status));
		}

		const props: IStatusbarEntry = {
			name: localize('status.editor.status', "Language Status"),
			text: '$(circle-large-outline)',
			ariaLabel: localize('status.editor.status', "Language Status"),
			backgroundColor,
			color,
			tooltip: element
		};

		if (!this._entry.value) {
			this._entry.value = this._statusBarService.addEntry(props, EditorStatusContribution._id, StatusbarAlignment.RIGHT, 100.06);
		} else {
			this._entry.value.update(props);
		}
	}

	private _renderStatus(status: ILanguageStatus): HTMLElement {

		const node = document.createElement('div');
		node.classList.add('hover-language-status-element');

		const left = document.createElement('div');
		left.classList.add('left');
		node.appendChild(left);

		const detail = document.createElement('div');
		detail.classList.add('detail');
		this._renderTextPlus(detail, status.detail);
		left.appendChild(detail);

		const label = document.createElement('div');
		label.classList.add('label');
		this._renderTextPlus(label, status.label);
		left.appendChild(label);

		const right = document.createElement('div');
		right.classList.add('right');
		node.appendChild(right);

		const { command } = status;
		if (command) {
			const btn = new Button(right, { title: command.tooltip });
			btn.label = command.title;
			btn.onDidClick(_e => {
				if (command.arguments) {
					this._commandService.executeCommand(command.id, ...command.arguments);
				} else {
					this._commandService.executeCommand(command.id);
				}
			});
		}
		return node;
	}

	private _renderTextPlus(target: HTMLElement, text: string): void {
		for (let node of parseLinkedText(text).nodes) {
			if (typeof node === 'string') {
				const parts = renderLabelWithIcons(node);
				dom.append(target, ...parts);
			} else {
				dom.append(target, new Link(node, undefined, this._openerService).el);
			}
		}
	}
}

registerThemingParticipant((theme, collector) => {
	collector.addRule(`:root { --code-notifications-border: ${theme.getColor(NOTIFICATIONS_BORDER)}}`);
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorStatusContribution, LifecyclePhase.Restored);
