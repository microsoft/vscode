/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/languageStatus';
import * as dom from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { DisposableStore, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { NOTIFICATIONS_BORDER, STATUS_BAR_ITEM_ACTIVE_BACKGROUND } from 'vs/workbench/common/theme';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { Link } from 'vs/platform/opener/browser/link';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Button } from 'vs/base/browser/ui/button/button';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';

class EditorStatusContribution implements IWorkbenchContribution {

	private static readonly _id = 'status.languageStatus';

	private readonly _disposables = new DisposableStore();

	private _combinedEntry?: IStatusbarEntryAccessor;
	private _dedicatedEntries = new Map<string, IStatusbarEntryAccessor>();
	private _dedicated = new Set<string>();

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

		_statusBarService.onDidChangeEntryVisibility(e => {
			if (!e.visible && this._dedicated.has(e.id)) {
				this._dedicated.delete(e.id);
				this._update();
			}
		}, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
		this._combinedEntry?.dispose();
		dispose(this._dedicatedEntries.values());
	}

	private _getLanguageStatus(): [combined: ILanguageStatus[], dedicated: ILanguageStatus[]] {
		const editor = getCodeEditor(this._editorService.activeTextEditorControl);
		if (!editor?.hasModel()) {
			return [[], []];
		}
		const all = this._languageStatusService.getLanguageStatus(editor.getModel());
		const combined: ILanguageStatus[] = [];
		const dedicated: ILanguageStatus[] = [];
		for (let item of all) {
			if (this._dedicated.has(item.id)) {
				dedicated.push(item);
			} else {
				combined.push(item);
			}
		}
		return [combined, dedicated];
	}

	private _update(): void {

		const [combined, dedicated] = this._getLanguageStatus();

		// combined status bar item is a single item which hover shows
		// each status item
		if (combined.length === 0) {
			// nothing
			this._combinedEntry?.dispose();
			this._combinedEntry = undefined;

		} else {
			const [first] = combined;
			let text: string = '$(info)';
			if (first.severity === Severity.Error) {
				text = '$(error)';
			} else if (first.severity === Severity.Warning) {
				text = '$(warning)';
			}
			const element = document.createElement('div');
			for (const status of combined) {
				element.appendChild(this._renderStatus(status));
			}
			const props: IStatusbarEntry = {
				name: localize('status.editor.status', "Editor Language Status"),
				ariaLabel: localize('status.editor.status', "Editor Language Status"),
				tooltip: element,
				text,
			};
			if (!this._combinedEntry) {
				this._combinedEntry = this._statusBarService.addEntry(props, EditorStatusContribution._id, StatusbarAlignment.RIGHT, 100.11);
			} else {
				this._combinedEntry.update(props);
			}
		}

		// dedicated status bar items are shows as-is in the status bar

		const newDedicatedEntries = new Map<string, IStatusbarEntryAccessor>();
		for (const status of dedicated) {
			const props = EditorStatusContribution._asStatusbarEntry(status);
			let entry = this._dedicatedEntries.get(status.id);
			if (!entry) {
				entry = this._statusBarService.addEntry(props, status.id, StatusbarAlignment.RIGHT, 100.09999);
			} else {
				entry.update(props);
				this._dedicatedEntries.delete(status.id);
			}
			newDedicatedEntries.set(status.id, entry);
		}
		dispose(this._dedicatedEntries.values());
		this._dedicatedEntries = newDedicatedEntries;
	}

	private _renderStatus(status: ILanguageStatus): HTMLElement {

		const node = document.createElement('div');
		node.classList.add('hover-language-status-element');

		const left = document.createElement('div');
		left.classList.add('left');
		node.appendChild(left);

		const label = document.createElement('span');
		label.classList.add('label');
		dom.append(label, ...renderLabelWithIcons(status.label));
		left.appendChild(label);

		const detail = document.createElement('span');
		detail.classList.add('detail');
		this._renderTextPlus(detail, status.detail);
		left.appendChild(detail);

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

		// -- pin
		const action = new Action('pin', localize('pin', "Pin to Status Bar"), Codicon.pin.classNames, true, () => {
			this._dedicated.add(status.id);
			this._statusBarService.updateEntryVisibility(status.id, true);
			this._update();
		});
		const actions = new ActionBar(right, {});
		actions.push(action, { icon: true, label: false });

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

	// ---

	private static _asStatusbarEntry(item: ILanguageStatus): IStatusbarEntry {
		return {
			name: item.name,
			text: item.label,
			ariaLabel: item.label,
			tooltip: new MarkdownString(item.detail, true),
			command: item.command
		};
	}
}

registerThemingParticipant((theme, collector) => {
	collector.addRule(`:root {
		--code-notifications-border: ${theme.getColor(NOTIFICATIONS_BORDER)};
		--code-language-status-item-active-background: ${theme.getColor(STATUS_BAR_ITEM_ACTIVE_BACKGROUND)?.darken(.8)};
	}`);
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorStatusContribution, LifecyclePhase.Restored);
