/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LanguageStatus_1;
import './media/languageStatus.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize, localize2 } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { IStatusbarService, ShowTooltipCommand } from '../../../services/statusbar/browser/statusbar.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { equals } from '../../../../base/common/arrays.js';
import { URI } from '../../../../base/common/uri.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHoverService, nativeHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { Event } from '../../../../base/common/event.js';
import { joinStrings } from '../../../../base/common/strings.js';
class LanguageStatusViewModel {
    constructor(combined, dedicated) {
        this.combined = combined;
        this.dedicated = dedicated;
    }
    isEqual(other) {
        return equals(this.combined, other.combined) && equals(this.dedicated, other.dedicated);
    }
}
let StoredCounter = class StoredCounter {
    constructor(_storageService, _key) {
        this._storageService = _storageService;
        this._key = _key;
    }
    get value() {
        return this._storageService.getNumber(this._key, 0 /* StorageScope.PROFILE */, 0);
    }
    increment() {
        const n = this.value + 1;
        this._storageService.store(this._key, n, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        return n;
    }
};
StoredCounter = __decorate([
    __param(0, IStorageService)
], StoredCounter);
let LanguageStatusContribution = class LanguageStatusContribution extends Disposable {
    static { this.Id = 'status.languageStatus'; }
    constructor(editorGroupService) {
        super();
        this.editorGroupService = editorGroupService;
        for (const part of editorGroupService.parts) {
            this.createLanguageStatus(part);
        }
        this._register(editorGroupService.onDidCreateAuxiliaryEditorPart(part => this.createLanguageStatus(part)));
    }
    createLanguageStatus(part) {
        const disposables = new DisposableStore();
        Event.once(part.onWillDispose)(() => disposables.dispose());
        const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
        disposables.add(scopedInstantiationService.createInstance(LanguageStatus));
    }
};
LanguageStatusContribution = __decorate([
    __param(0, IEditorGroupsService)
], LanguageStatusContribution);
export { LanguageStatusContribution };
let LanguageStatus = class LanguageStatus {
    static { LanguageStatus_1 = this; }
    static { this._id = 'status.languageStatus'; }
    static { this._keyDedicatedItems = 'languageStatus.dedicated'; }
    constructor(_languageStatusService, _statusBarService, _editorService, _hoverService, _openerService, _storageService) {
        this._languageStatusService = _languageStatusService;
        this._statusBarService = _statusBarService;
        this._editorService = _editorService;
        this._hoverService = _hoverService;
        this._openerService = _openerService;
        this._storageService = _storageService;
        this._disposables = new DisposableStore();
        this._dedicated = new Set();
        this._dedicatedEntries = new Map();
        this._renderDisposables = new DisposableStore();
        this._combinedEntryTooltip = document.createElement('div');
        _storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, LanguageStatus_1._keyDedicatedItems, this._disposables)(this._handleStorageChange, this, this._disposables);
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
        }, undefined, this._disposables);
    }
    dispose() {
        this._disposables.dispose();
        this._combinedEntry?.dispose();
        dispose(this._dedicatedEntries.values());
        this._renderDisposables.dispose();
    }
    // --- persisting dedicated items
    _handleStorageChange() {
        this._restoreState();
        this._update();
    }
    _restoreState() {
        const raw = this._storageService.get(LanguageStatus_1._keyDedicatedItems, 0 /* StorageScope.PROFILE */, '[]');
        try {
            const ids = JSON.parse(raw);
            this._dedicated = new Set(ids);
        }
        catch {
            this._dedicated.clear();
        }
    }
    _storeState() {
        if (this._dedicated.size === 0) {
            this._storageService.remove(LanguageStatus_1._keyDedicatedItems, 0 /* StorageScope.PROFILE */);
        }
        else {
            const raw = JSON.stringify(Array.from(this._dedicated.keys()));
            this._storageService.store(LanguageStatus_1._keyDedicatedItems, raw, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    // --- language status model and UI
    _createViewModel(editor) {
        if (!editor?.hasModel()) {
            return new LanguageStatusViewModel([], []);
        }
        const all = this._languageStatusService.getLanguageStatus(editor.getModel());
        const combined = [];
        const dedicated = [];
        for (const item of all) {
            if (this._dedicated.has(item.id)) {
                dedicated.push(item);
            }
            combined.push(item);
        }
        return new LanguageStatusViewModel(combined, dedicated);
    }
    _update() {
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
        }
        else {
            const [first] = model.combined;
            const showSeverity = first.severity >= Severity.Warning;
            const text = LanguageStatus_1._severityToComboCodicon(first.severity);
            let isOneBusy = false;
            const ariaLabels = [];
            for (const status of model.combined) {
                const isPinned = model.dedicated.includes(status);
                this._renderStatus(this._combinedEntryTooltip, status, showSeverity, isPinned, this._renderDisposables);
                ariaLabels.push(LanguageStatus_1._accessibilityInformation(status).label);
                isOneBusy = isOneBusy || (!isPinned && status.busy); // unpinned items contribute to the busy-indicator of the composite status item
            }
            const props = {
                name: localize('langStatus.name', "Editor Language Status"),
                ariaLabel: localize('langStatus.aria', "Editor Language Status: {0}", ariaLabels.join(', next: ')),
                tooltip: this._combinedEntryTooltip,
                command: ShowTooltipCommand,
                text: isOneBusy ? '$(loading~spin)' : text,
            };
            if (!this._combinedEntry) {
                this._combinedEntry = this._statusBarService.addEntry(props, LanguageStatus_1._id, 1 /* StatusbarAlignment.RIGHT */, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: 0 /* StatusbarAlignment.LEFT */, compact: true });
            }
            else {
                this._combinedEntry.update(props);
            }
            // animate the status bar icon whenever language status changes, repeat animation
            // when severity is warning or error, don't show animation when showing progress/busy
            const userHasInteractedWithStatus = this._interactionCounter.value >= 3;
            const targetWindow = dom.getWindow(editor?.getContainerDomNode());
            // eslint-disable-next-line no-restricted-syntax
            const node = targetWindow.document.querySelector('.monaco-workbench .statusbar DIV#status\\.languageStatus A>SPAN.codicon');
            // eslint-disable-next-line no-restricted-syntax
            const container = targetWindow.document.querySelector('.monaco-workbench .statusbar DIV#status\\.languageStatus');
            if (dom.isHTMLElement(node) && container) {
                const _wiggle = 'wiggle';
                const _flash = 'flash';
                if (!isOneBusy) {
                    // wiggle icon when severe or "new"
                    node.classList.toggle(_wiggle, showSeverity || !userHasInteractedWithStatus);
                    this._renderDisposables.add(dom.addDisposableListener(node, 'animationend', _e => node.classList.remove(_wiggle)));
                    // flash background when severe
                    container.classList.toggle(_flash, showSeverity);
                    this._renderDisposables.add(dom.addDisposableListener(container, 'animationend', _e => container.classList.remove(_flash)));
                }
                else {
                    node.classList.remove(_wiggle);
                    container.classList.remove(_flash);
                }
            }
            // track when the hover shows (this is automagic and DOM mutation spying is needed...)
            //  use that as signal that the user has interacted/learned language status items work
            if (!userHasInteractedWithStatus) {
                // eslint-disable-next-line no-restricted-syntax
                const hoverTarget = targetWindow.document.querySelector('.monaco-workbench .context-view');
                if (dom.isHTMLElement(hoverTarget)) {
                    const observer = new MutationObserver(() => {
                        if (targetWindow.document.contains(this._combinedEntryTooltip)) {
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
        const newDedicatedEntries = new Map();
        for (const status of model.dedicated) {
            const props = LanguageStatus_1._asStatusbarEntry(status);
            let entry = this._dedicatedEntries.get(status.id);
            if (!entry) {
                entry = this._statusBarService.addEntry(props, status.id, 1 /* StatusbarAlignment.RIGHT */, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: 1 /* StatusbarAlignment.RIGHT */ });
            }
            else {
                entry.update(props);
                this._dedicatedEntries.delete(status.id);
            }
            newDedicatedEntries.set(status.id, entry);
        }
        dispose(this._dedicatedEntries.values());
        this._dedicatedEntries = newDedicatedEntries;
    }
    _renderStatus(container, status, showSeverity, isPinned, store) {
        const parent = document.createElement('div');
        parent.classList.add('hover-language-status');
        container.appendChild(parent);
        store.add(toDisposable(() => parent.remove()));
        const severity = document.createElement('div');
        severity.classList.add('severity', `sev${status.severity}`);
        severity.classList.toggle('show', showSeverity);
        const severityText = LanguageStatus_1._severityToSingleCodicon(status.severity);
        dom.append(severity, ...renderLabelWithIcons(severityText));
        parent.appendChild(severity);
        const element = document.createElement('div');
        element.classList.add('element');
        parent.appendChild(element);
        const left = document.createElement('div');
        left.classList.add('left');
        element.appendChild(left);
        const label = typeof status.label === 'string' ? status.label : status.label.value;
        dom.append(left, ...renderLabelWithIcons(computeText(label, status.busy)));
        this._renderTextPlus(left, status.detail, store);
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
            }, { hoverDelegate: nativeHoverDelegate }, this._hoverService, this._openerService));
        }
        // -- pin
        const actionBar = new ActionBar(right, { hoverDelegate: nativeHoverDelegate });
        const actionLabel = isPinned ? localize('unpin', "Remove from Status Bar") : localize('pin', "Add to Status Bar");
        actionBar.setAriaLabel(actionLabel);
        store.add(actionBar);
        let action;
        if (!isPinned) {
            action = new Action('pin', actionLabel, ThemeIcon.asClassName(Codicon.pin), true, () => {
                this._dedicated.add(status.id);
                this._statusBarService.updateEntryVisibility(status.id, true);
                this._update();
                this._storeState();
            });
        }
        else {
            action = new Action('unpin', actionLabel, ThemeIcon.asClassName(Codicon.pinned), true, () => {
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
    static _severityToComboCodicon(sev) {
        switch (sev) {
            case Severity.Error: return '$(bracket-error)';
            case Severity.Warning: return '$(bracket-dot)';
            default: return '$(bracket)';
        }
    }
    static _severityToSingleCodicon(sev) {
        switch (sev) {
            case Severity.Error: return '$(error)';
            case Severity.Warning: return '$(info)';
            default: return '$(check)';
        }
    }
    _renderTextPlus(target, text, store) {
        let didRenderSeparator = false;
        for (const node of parseLinkedText(text).nodes) {
            if (!didRenderSeparator) {
                dom.append(target, dom.$('span.separator'));
                didRenderSeparator = true;
            }
            if (typeof node === 'string') {
                const parts = renderLabelWithIcons(node);
                dom.append(target, ...parts);
            }
            else {
                store.add(new Link(target, node, undefined, this._hoverService, this._openerService));
            }
        }
    }
    static _accessibilityInformation(status) {
        if (status.accessibilityInfo) {
            return status.accessibilityInfo;
        }
        const textValue = typeof status.label === 'string' ? status.label : status.label.value;
        if (status.detail) {
            return { label: localize('aria.1', '{0}, {1}', textValue, status.detail) };
        }
        else {
            return { label: localize('aria.2', '{0}', textValue) };
        }
    }
    // ---
    static _asStatusbarEntry(item) {
        let kind;
        if (item.severity === Severity.Warning) {
            kind = 'warning';
        }
        else if (item.severity === Severity.Error) {
            kind = 'error';
        }
        const textValue = typeof item.label === 'string' ? item.label : item.label.shortValue;
        return {
            name: localize('name.pattern', '{0} (Language Status)', item.name),
            text: computeText(textValue, item.busy),
            ariaLabel: LanguageStatus_1._accessibilityInformation(item).label,
            role: item.accessibilityInfo?.role,
            tooltip: item.command?.tooltip || new MarkdownString(item.detail, { isTrusted: true, supportThemeIcons: true }),
            kind,
            command: item.command
        };
    }
};
LanguageStatus = LanguageStatus_1 = __decorate([
    __param(0, ILanguageStatusService),
    __param(1, IStatusbarService),
    __param(2, IEditorService),
    __param(3, IHoverService),
    __param(4, IOpenerService),
    __param(5, IStorageService)
], LanguageStatus);
export class ResetAction extends Action2 {
    constructor() {
        super({
            id: 'editor.inlayHints.Reset',
            title: localize2('reset', "Reset Language Status Interaction Counter"),
            category: Categories.View,
            f1: true
        });
    }
    run(accessor) {
        accessor.get(IStorageService).remove('languageStatus.interactCount', 0 /* StorageScope.PROFILE */);
    }
}
function computeText(text, loading) {
    return joinStrings([text !== '' && text, loading && '$(loading~spin)'], '\u00A0\u00A0');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VTdGF0dXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sYW5ndWFnZVN0YXR1cy9icm93c2VyL2xhbmd1YWdlU3RhdHVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDRCQUE0QixDQUFDO0FBQ3BDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDM0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFHLE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxhQUFhLEVBQWUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RixPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFtQixzQkFBc0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQzNILE9BQU8sRUFBNEMsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQTBDLE1BQU0sa0RBQWtELENBQUM7QUFDM0wsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFekUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxvQkFBb0IsRUFBZSxNQUFNLHdEQUF3RCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxhQUFhLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRWpFLE1BQU0sdUJBQXVCO0lBRTVCLFlBQ1UsUUFBb0MsRUFDcEMsU0FBcUM7UUFEckMsYUFBUSxHQUFSLFFBQVEsQ0FBNEI7UUFDcEMsY0FBUyxHQUFULFNBQVMsQ0FBNEI7SUFDM0MsQ0FBQztJQUVMLE9BQU8sQ0FBQyxLQUE4QjtRQUNyQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDekYsQ0FBQztDQUNEO0FBRUQsSUFBTSxhQUFhLEdBQW5CLE1BQU0sYUFBYTtJQUVsQixZQUE4QyxlQUFnQyxFQUFtQixJQUFZO1FBQS9ELG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUFtQixTQUFJLEdBQUosSUFBSSxDQUFRO0lBQUksQ0FBQztJQUVsSCxJQUFJLEtBQUs7UUFDUixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLGdDQUF3QixDQUFDLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRUQsU0FBUztRQUNSLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyw4REFBOEMsQ0FBQztRQUN0RixPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7Q0FDRCxDQUFBO0FBYkssYUFBYTtJQUVMLFdBQUEsZUFBZSxDQUFBO0dBRnZCLGFBQWEsQ0FhbEI7QUFFTSxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLFVBQVU7YUFFekMsT0FBRSxHQUFHLHVCQUF1QixBQUExQixDQUEyQjtJQUU3QyxZQUN3QyxrQkFBd0M7UUFFL0UsS0FBSyxFQUFFLENBQUM7UUFGK0IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFzQjtRQUkvRSxLQUFLLE1BQU0sSUFBSSxJQUFJLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzdDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVPLG9CQUFvQixDQUFDLElBQWlCO1FBQzdDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFNUQsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0YsV0FBVyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUM1RSxDQUFDOztBQXRCVywwQkFBMEI7SUFLcEMsV0FBQSxvQkFBb0IsQ0FBQTtHQUxWLDBCQUEwQixDQXVCdEM7O0FBRUQsSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBYzs7YUFFSyxRQUFHLEdBQUcsdUJBQXVCLEFBQTFCLENBQTJCO2FBRTlCLHVCQUFrQixHQUFHLDBCQUEwQixBQUE3QixDQUE4QjtJQWN4RSxZQUN5QixzQkFBK0QsRUFDcEUsaUJBQXFELEVBQ3hELGNBQStDLEVBQ2hELGFBQTZDLEVBQzVDLGNBQStDLEVBQzlDLGVBQWlEO1FBTHpCLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBd0I7UUFDbkQsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUN2QyxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFDL0Isa0JBQWEsR0FBYixhQUFhLENBQWU7UUFDM0IsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQzdCLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQWxCbEQsaUJBQVksR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRzlDLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBSS9CLHNCQUFpQixHQUFHLElBQUksR0FBRyxFQUFtQyxDQUFDO1FBQ3RELHVCQUFrQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFM0MsMEJBQXFCLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQVV0RSxlQUFlLENBQUMsZ0JBQWdCLCtCQUF1QixnQkFBYyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNqSyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksYUFBYSxDQUFDLGVBQWUsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1FBRTlGLHNCQUFzQixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUUsY0FBYyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFZixpQkFBaUIsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoRCxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2YsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3BCLENBQUM7UUFDRixDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUVsQyxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLGNBQWMsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUMvQixPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFRCxpQ0FBaUM7SUFFekIsb0JBQW9CO1FBQzNCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNyQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVPLGFBQWE7UUFDcEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsZ0JBQWMsQ0FBQyxrQkFBa0IsZ0NBQXdCLElBQUksQ0FBQyxDQUFDO1FBQ3BHLElBQUksQ0FBQztZQUNKLE1BQU0sR0FBRyxHQUFhLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQztJQUVPLFdBQVc7UUFDbEIsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxnQkFBYyxDQUFDLGtCQUFrQiwrQkFBdUIsQ0FBQztRQUN0RixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvRCxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxnQkFBYyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsMkRBQTJDLENBQUM7UUFDOUcsQ0FBQztJQUNGLENBQUM7SUFFRCxtQ0FBbUM7SUFFM0IsZ0JBQWdCLENBQUMsTUFBMEI7UUFDbEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sSUFBSSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUMsQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUM3RSxNQUFNLFFBQVEsR0FBc0IsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sU0FBUyxHQUFzQixFQUFFLENBQUM7UUFDeEMsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RCLENBQUM7WUFDRCxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JCLENBQUM7UUFDRCxPQUFPLElBQUksdUJBQXVCLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFTyxPQUFPO1FBQ2QsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUMxRSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFNUMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWhDLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBRXBCLHNDQUFzQztRQUN0QyxNQUFNLEVBQUUsd0JBQXdCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFOUUsOERBQThEO1FBQzlELG1CQUFtQjtRQUNuQixJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVU7WUFDVixJQUFJLENBQUMsY0FBYyxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBQy9CLElBQUksQ0FBQyxjQUFjLEdBQUcsU0FBUyxDQUFDO1FBRWpDLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDL0IsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDO1lBQ3hELE1BQU0sSUFBSSxHQUFHLGdCQUFjLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXBFLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztZQUN0QixNQUFNLFVBQVUsR0FBYSxFQUFFLENBQUM7WUFDaEMsS0FBSyxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3JDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDeEcsVUFBVSxDQUFDLElBQUksQ0FBQyxnQkFBYyxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN4RSxTQUFTLEdBQUcsU0FBUyxJQUFJLENBQUMsQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsK0VBQStFO1lBQ3JJLENBQUM7WUFFRCxNQUFNLEtBQUssR0FBb0I7Z0JBQzlCLElBQUksRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsd0JBQXdCLENBQUM7Z0JBQzNELFNBQVMsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsNkJBQTZCLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbEcsT0FBTyxFQUFFLElBQUksQ0FBQyxxQkFBcUI7Z0JBQ25DLE9BQU8sRUFBRSxrQkFBa0I7Z0JBQzNCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJO2FBQzFDLENBQUM7WUFDRixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLGdCQUFjLENBQUMsR0FBRyxvQ0FBNEIsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxFQUFFLFNBQVMsaUNBQXlCLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDNU4sQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25DLENBQUM7WUFFRCxpRkFBaUY7WUFDakYscUZBQXFGO1lBQ3JGLE1BQU0sMkJBQTJCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7WUFDeEUsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1lBQ2xFLGdEQUFnRDtZQUNoRCxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyx5RUFBeUUsQ0FBQyxDQUFDO1lBQzVILGdEQUFnRDtZQUNoRCxNQUFNLFNBQVMsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQywwREFBMEQsQ0FBQyxDQUFDO1lBQ2xILElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDMUMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDO2dCQUN6QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDaEIsbUNBQW1DO29CQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsWUFBWSxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztvQkFDN0UsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbkgsK0JBQStCO29CQUMvQixTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7b0JBQ2pELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxjQUFjLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDL0IsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3BDLENBQUM7WUFDRixDQUFDO1lBRUQsc0ZBQXNGO1lBQ3RGLHNGQUFzRjtZQUN0RixJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztnQkFDbEMsZ0RBQWdEO2dCQUNoRCxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO2dCQUMzRixJQUFJLEdBQUcsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztvQkFDcEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUU7d0JBQzFDLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEVBQUUsQ0FBQzs0QkFDaEUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxDQUFDOzRCQUNyQyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7d0JBQ3ZCLENBQUM7b0JBQ0YsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUNsRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4RSxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCwrREFBK0Q7UUFDL0QsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsRUFBbUMsQ0FBQztRQUN2RSxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN0QyxNQUFNLEtBQUssR0FBRyxnQkFBYyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDWixLQUFLLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEVBQUUsb0NBQTRCLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsRUFBRSxTQUFTLGtDQUEwQixFQUFFLENBQUMsQ0FBQztZQUN2TCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUMsQ0FBQztZQUNELG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLG1CQUFtQixDQUFDO0lBQzlDLENBQUM7SUFFTyxhQUFhLENBQUMsU0FBc0IsRUFBRSxNQUF1QixFQUFFLFlBQXFCLEVBQUUsUUFBaUIsRUFBRSxLQUFzQjtRQUV0SSxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFOUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM5QixLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRS9DLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0MsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLE1BQU0sTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDNUQsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ2hELE1BQU0sWUFBWSxHQUFHLGdCQUFjLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlFLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsb0JBQW9CLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTdCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU1QixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzNCLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFMUIsTUFBTSxLQUFLLEdBQUcsT0FBTyxNQUFNLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDbkYsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFM0UsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzdCLE9BQU8sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFM0IsNEJBQTRCO1FBQzVCLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLENBQUM7UUFDM0IsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO2dCQUN6QixLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUs7Z0JBQ3BCLEtBQUssRUFBRSxPQUFPLENBQUMsT0FBTztnQkFDdEIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUM7b0JBQ2QsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7aUJBQ2xHLENBQUMsQ0FBQyxRQUFRLEVBQUU7YUFDYixFQUFFLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUN0RixDQUFDO1FBRUQsU0FBUztRQUNULE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxFQUFFLGFBQWEsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7UUFDL0UsTUFBTSxXQUFXLEdBQVcsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUMxSCxTQUFTLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3BDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckIsSUFBSSxNQUFjLENBQUM7UUFDbkIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRTtnQkFDdEYsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMvQixJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNmLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNwQixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRTtnQkFDM0YsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNsQyxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDL0QsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNmLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNwQixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFDRCxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDckQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVsQixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxNQUFNLENBQUMsdUJBQXVCLENBQUMsR0FBYTtRQUNuRCxRQUFRLEdBQUcsRUFBRSxDQUFDO1lBQ2IsS0FBSyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxrQkFBa0IsQ0FBQztZQUMvQyxLQUFLLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLGdCQUFnQixDQUFDO1lBQy9DLE9BQU8sQ0FBQyxDQUFDLE9BQU8sWUFBWSxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0lBRU8sTUFBTSxDQUFDLHdCQUF3QixDQUFDLEdBQWE7UUFDcEQsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUNiLEtBQUssUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sVUFBVSxDQUFDO1lBQ3ZDLEtBQUssUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sU0FBUyxDQUFDO1lBQ3hDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sVUFBVSxDQUFDO1FBQzVCLENBQUM7SUFDRixDQUFDO0lBRU8sZUFBZSxDQUFDLE1BQW1CLEVBQUUsSUFBWSxFQUFFLEtBQXNCO1FBQ2hGLElBQUksa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1FBQy9CLEtBQUssTUFBTSxJQUFJLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hELElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUN6QixHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDNUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO1lBQzNCLENBQUM7WUFDRCxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixNQUFNLEtBQUssR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDekMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQztZQUM5QixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVPLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxNQUF1QjtRQUMvRCxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzlCLE9BQU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDO1FBQ2pDLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxPQUFPLE1BQU0sQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUN2RixJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNuQixPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUM1RSxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUN4RCxDQUFDO0lBQ0YsQ0FBQztJQUVELE1BQU07SUFFRSxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBcUI7UUFFckQsSUFBSSxJQUFvQyxDQUFDO1FBQ3pDLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDeEMsSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUNsQixDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM3QyxJQUFJLEdBQUcsT0FBTyxDQUFDO1FBQ2hCLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUV0RixPQUFPO1lBQ04sSUFBSSxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQztZQUNsRSxJQUFJLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ3ZDLFNBQVMsRUFBRSxnQkFBYyxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUs7WUFDL0QsSUFBSSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJO1lBQ2xDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sSUFBSSxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQztZQUMvRyxJQUFJO1lBQ0osT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1NBQ3JCLENBQUM7SUFDSCxDQUFDOztBQW5WSSxjQUFjO0lBbUJqQixXQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxlQUFlLENBQUE7R0F4QlosY0FBYyxDQW9WbkI7QUFFRCxNQUFNLE9BQU8sV0FBWSxTQUFRLE9BQU87SUFFdkM7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUseUJBQXlCO1lBQzdCLEtBQUssRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLDJDQUEyQyxDQUFDO1lBQ3RFLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtZQUN6QixFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxNQUFNLENBQUMsOEJBQThCLCtCQUF1QixDQUFDO0lBQzVGLENBQUM7Q0FDRDtBQUVELFNBQVMsV0FBVyxDQUFDLElBQVksRUFBRSxPQUFnQjtJQUNsRCxPQUFPLFdBQVcsQ0FBQyxDQUFDLElBQUksS0FBSyxFQUFFLElBQUksSUFBSSxFQUFFLE9BQU8sSUFBSSxpQkFBaUIsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ3pGLENBQUMifQ==