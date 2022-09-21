/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/languageStatus';
import * as dom from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { DisposableStore, dispose, toDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { getCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { ThemeColor, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { STATUS_BAR_ERROR_ITEM_BACKGROUND, STATUS_BAR_ERROR_ITEM_FOREGROUND, STATUS_BAR_WARNING_ITEM_BACKGROUND, STATUS_BAR_WARNING_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { Link } from 'vs/platform/opener/browser/link';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { equals } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

class LanguageStatusViewModel {

	constructor(
		readonly combined: readonly ILanguageStatus[],
		readonly dedicated: readonly ILanguageStatus[]
	) { }

	isEqual(other: LanguageStatusViewModel) {
		return equals(this.combined, other.combined) && equals(this.dedicated, other.dedicated);
	}
}

class StoredCounter {

	constructor(@IStorageService private readonly _storageService: IStorageService, private readonly _key: string) { }

	get value() {
		return this._storageService.getNumber(this._key, StorageScope.PROFILE, 0);
	}

	increment(): number {
		const n = this.value + 1;
		this._storageService.store(this._key, n, StorageScope.PROFILE, StorageTarget.MACHINE);
		return n;
	}
}

class EditorStatusContribution implements IWorkbenchContribution {

	private static readonly _id = 'status.languageStatus';

	private static readonly _keyDedicatedItems = 'languageStatus.dedicated';

	private readonly _disposables = new DisposableStore();
	private readonly _interactionCounter: StoredCounter;

	private _dedicated = new Set<string>();

	private _model?: LanguageStatusViewModel;
	private _combinedEntry?: IStatusbarEntryAccessor;
	private _dedicatedEntries = new Map<string, IStatusbarEntryAccessor>();
	private _renderDisposables = new DisposableStore();

	constructor(
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@IStatusbarService private readonly _statusBarService: IStatusbarService,
		@IEditorService private readonly _editorService: IEditorService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		_storageService.onDidChangeValue(this._handleStorageChange, this, this._disposables);
		this._restoreState();
		this._interactionCounter = new StoredCounter(_storageService, 'languageStatus.interactCount');

		_languageStatusService.onDidChange(this._update, this, this._disposables);
		_editorService.onDidActiveEditorChange(this._update, this, this._disposables);
		this._update();

		_statusBarService.onDidChangeEntryVisibility(e => {
			if (!e.visible && this._dedicated.has(e.id)) {
				this._dedicated.delete(e.id);
				this._update();
				this._storeState();
			}
		}, this._disposables);

	}

	dispose(): void {
		this._disposables.dispose();
		this._combinedEntry?.dispose();
		dispose(this._dedicatedEntries.values());
		this._renderDisposables.dispose();
	}

	// --- persisting dedicated items

	private _handleStorageChange(e: IStorageValueChangeEvent) {
		if (e.key !== EditorStatusContribution._keyDedicatedItems) {
			return;
		}
		this._restoreState();
		this._update();
	}

	private _restoreState(): void {
		const raw = this._storageService.get(EditorStatusContribution._keyDedicatedItems, StorageScope.PROFILE, '[]');
		try {
			const ids = <string[]>JSON.parse(raw);
			this._dedicated = new Set(ids);
		} catch {
			this._dedicated.clear();
		}
	}

	private _storeState(): void {
		if (this._dedicated.size === 0) {
			this._storageService.remove(EditorStatusContribution._keyDedicatedItems, StorageScope.PROFILE);
		} else {
			const raw = JSON.stringify(Array.from(this._dedicated.keys()));
			this._storageService.store(EditorStatusContribution._keyDedicatedItems, raw, StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	// --- language status model and UI

	private _createViewModel(editor: ICodeEditor | null): LanguageStatusViewModel {
		if (!editor?.hasModel()) {
			return new LanguageStatusViewModel([], []);
		}
		const all = this._languageStatusService.getLanguageStatus(editor.getModel());
		const combined: ILanguageStatus[] = [];
		const dedicated: ILanguageStatus[] = [];
		for (const item of all) {
			if (this._dedicated.has(item.id)) {
				dedicated.push(item);
			}
			combined.push(item);
		}
		return new LanguageStatusViewModel(combined, dedicated);
	}

	private _update(): void {
		const editor = getCodeEditor(this._editorService.activeTextEditorControl);
		const model = this._createViewModel(editor);

		if (this._model?.isEqual(model)) {
			return;
		}
		this._renderDisposables.clear();

		this._model = model;

		// update when editor language changes
		editor?.onDidChangeModelLanguage(this._update, this, this._renderDisposables);

		// combined status bar item is a single item which hover shows
		// each status item
		if (model.combined.length === 0) {
			// nothing
			this._combinedEntry?.dispose();
			this._combinedEntry = undefined;

		} else {
			const [first] = model.combined;
			const showSeverity = first.severity >= Severity.Warning;
			const text = EditorStatusContribution._severityToComboCodicon(first.severity);

			let isOneBusy = false;
			const ariaLabels: string[] = [];
			const element = document.createElement('div');
			for (const status of model.combined) {
				const isPinned = model.dedicated.includes(status);
				element.appendChild(this._renderStatus(status, showSeverity, isPinned, this._renderDisposables));
				ariaLabels.push(this._asAriaLabel(status));
				isOneBusy = isOneBusy || (!isPinned && status.busy); // unpinned items contribute to the busy-indicator of the composite status item
			}
			const props: IStatusbarEntry = {
				name: localize('langStatus.name', "Editor Language Status"),
				ariaLabel: localize('langStatus.aria', "Editor Language Status: {0}", ariaLabels.join(', next: ')),
				tooltip: element,
				command: ShowTooltipCommand,
				text: isOneBusy ? `${text}\u00A0\u00A0$(sync~spin)` : text,
			};
			if (!this._combinedEntry) {
				this._combinedEntry = this._statusBarService.addEntry(props, EditorStatusContribution._id, StatusbarAlignment.RIGHT, { id: 'status.editor.mode', alignment: StatusbarAlignment.LEFT, compact: true });
			} else {
				this._combinedEntry.update(props);
			}

			// animate the status bar icon whenever language status changes, repeat animation
			// when severity is warning or error, don't show animation when showing progress/busy
			const userHasInteractedWithStatus = this._interactionCounter.value >= 3;
			const node = document.querySelector('.monaco-workbench .statusbar DIV#status\\.languageStatus A>SPAN.codicon');
			const container = document.querySelector('.monaco-workbench .statusbar DIV#status\\.languageStatus');
			if (node instanceof HTMLElement && container) {
				const _wiggle = 'wiggle';
				const _flash = 'flash';
				if (!isOneBusy) {
					// wiggle icon when severe or "new"
					node.classList.toggle(_wiggle, showSeverity || !userHasInteractedWithStatus);
					this._renderDisposables.add(dom.addDisposableListener(node, 'animationend', _e => node.classList.remove(_wiggle)));
					// flash background when severe
					container.classList.toggle(_flash, showSeverity);
					this._renderDisposables.add(dom.addDisposableListener(container, 'animationend', _e => container.classList.remove(_flash)));
				} else {
					node.classList.remove(_wiggle);
					container.classList.remove(_flash);
				}
			}

			// track when the hover shows (this is automagic and DOM mutation spying is needed...)
			//  use that as signal that the user has interacted/learned language status items work
			if (!userHasInteractedWithStatus) {
				const hoverTarget = document.querySelector('.monaco-workbench .context-view');
				if (hoverTarget instanceof HTMLElement) {
					const observer = new MutationObserver(() => {
						if (document.contains(element)) {
							this._interactionCounter.increment();
							observer.disconnect();
						}
					});
					observer.observe(hoverTarget, { childList: true, subtree: true });
					this._renderDisposables.add(toDisposable(() => observer.disconnect()));
				}
			}
		}

		// dedicated status bar items are shows as-is in the status bar
		const newDedicatedEntries = new Map<string, IStatusbarEntryAccessor>();
		for (const status of model.dedicated) {
			const props = EditorStatusContribution._asStatusbarEntry(status);
			let entry = this._dedicatedEntries.get(status.id);
			if (!entry) {
				entry = this._statusBarService.addEntry(props, status.id, StatusbarAlignment.RIGHT, { id: 'status.editor.mode', alignment: StatusbarAlignment.RIGHT });
			} else {
				entry.update(props);
				this._dedicatedEntries.delete(status.id);
			}
			newDedicatedEntries.set(status.id, entry);
		}
		dispose(this._dedicatedEntries.values());
		this._dedicatedEntries = newDedicatedEntries;
	}

	private _renderStatus(status: ILanguageStatus, showSeverity: boolean, isPinned: boolean, store: DisposableStore): HTMLElement {

		const parent = document.createElement('div');
		parent.classList.add('hover-language-status');

		const severity = document.createElement('div');
		severity.classList.add('severity', `sev${status.severity}`);
		severity.classList.toggle('show', showSeverity);
		const severityText = EditorStatusContribution._severityToSingleCodicon(status.severity);
		dom.append(severity, ...renderLabelWithIcons(severityText));
		parent.appendChild(severity);

		const element = document.createElement('div');
		element.classList.add('element');
		parent.appendChild(element);

		const left = document.createElement('div');
		left.classList.add('left');
		element.appendChild(left);

		const label = document.createElement('span');
		label.classList.add('label');
		dom.append(label, ...renderLabelWithIcons(status.busy ? `$(sync~spin)\u00A0\u00A0${status.label}` : status.label));
		left.appendChild(label);

		const detail = document.createElement('span');
		detail.classList.add('detail');
		this._renderTextPlus(detail, status.detail, store);
		left.appendChild(detail);

		const right = document.createElement('div');
		right.classList.add('right');
		element.appendChild(right);

		// -- command (if available)
		const { command } = status;
		if (command) {
			store.add(new Link(right, {
				label: command.title,
				title: command.tooltip,
				href: URI.from({
					scheme: 'command', path: command.id, query: command.arguments && JSON.stringify(command.arguments)
				}).toString()
			}, undefined, this._openerService));
		}

		// -- pin
		const actionBar = new ActionBar(right, {});
		store.add(actionBar);
		let action: Action;
		if (!isPinned) {
			action = new Action('pin', localize('pin', "Add to Status Bar"), Codicon.pin.classNames, true, () => {
				this._dedicated.add(status.id);
				this._statusBarService.updateEntryVisibility(status.id, true);
				this._update();
				this._storeState();
			});
		} else {
			action = new Action('unpin', localize('unpin', "Remove from Status Bar"), Codicon.pinned.classNames, true, () => {
				this._dedicated.delete(status.id);
				this._statusBarService.updateEntryVisibility(status.id, false);
				this._update();
				this._storeState();
			});
		}
		actionBar.push(action, { icon: true, label: false });
		store.add(action);

		return parent;
	}

	private static _severityToComboCodicon(sev: Severity): string {
		switch (sev) {
			case Severity.Error: return '$(bracket-error)';
			case Severity.Warning: return '$(bracket-dot)';
			default: return '$(bracket)';
		}
	}

	private static _severityToSingleCodicon(sev: Severity): string {
		switch (sev) {
			case Severity.Error: return '$(error)';
			case Severity.Warning: return '$(info)';
			default: return '$(check)';
		}
	}

	private _renderTextPlus(target: HTMLElement, text: string, store: DisposableStore): void {
		for (const node of parseLinkedText(text).nodes) {
			if (typeof node === 'string') {
				const parts = renderLabelWithIcons(node);
				dom.append(target, ...parts);
			} else {
				store.add(new Link(target, node, undefined, this._openerService));
			}
		}
	}

	private _asAriaLabel(status: ILanguageStatus): string {
		if (status.accessibilityInfo) {
			return status.accessibilityInfo.label;
		} else if (status.detail) {
			return localize('aria.1', '{0}, {1}', status.label, status.detail);
		} else {
			return localize('aria.2', '{0}', status.label);
		}
	}

	// ---

	private static _asStatusbarEntry(item: ILanguageStatus): IStatusbarEntry {

		let color: ThemeColor | undefined;
		let backgroundColor: ThemeColor | undefined;
		if (item.severity === Severity.Warning) {
			color = themeColorFromId(STATUS_BAR_WARNING_ITEM_FOREGROUND);
			backgroundColor = themeColorFromId(STATUS_BAR_WARNING_ITEM_BACKGROUND);
		} else if (item.severity === Severity.Error) {
			color = themeColorFromId(STATUS_BAR_ERROR_ITEM_FOREGROUND);
			backgroundColor = themeColorFromId(STATUS_BAR_ERROR_ITEM_BACKGROUND);
		}

		return {
			name: localize('name.pattern', '{0} (Language Status)', item.name),
			text: item.busy ? `${item.label}\u00A0\u00A0$(sync~spin)` : item.label,
			ariaLabel: item.accessibilityInfo?.label ?? item.label,
			role: item.accessibilityInfo?.role,
			tooltip: item.command?.tooltip || new MarkdownString(item.detail, { isTrusted: true, supportThemeIcons: true }),
			color,
			backgroundColor,
			command: item.command
		};
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorStatusContribution, 'EditorStatusContribution', LifecyclePhase.Restored);

registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'editor.inlayHints.Reset',
			title: {
				value: localize('reset', 'Reset Language Status Interaction Counter'),
				original: 'Reset Language Status Interaction Counter'
			},
			category: {
				value: localize('cat', 'View'),
				original: 'View'
			},
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).remove('languageStatus.interactCount', StorageScope.PROFILE);
	}
});
