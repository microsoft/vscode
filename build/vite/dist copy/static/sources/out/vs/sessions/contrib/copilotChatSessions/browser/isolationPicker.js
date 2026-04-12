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
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
/**
 * A self-contained widget for selecting the isolation mode.
 *
 * Options:
 * - **Worktree** (`worktree`) — run in a git worktree
 * - **Folder** (`workspace`) — run directly in the folder
 *
 * Only visible when isolation option is enabled, project has a git repo,
 * and the target is CLI.
 *
 * Emits `onDidChange` with the selected `IsolationMode` when the user picks an option.
 */
let IsolationPicker = class IsolationPicker extends Disposable {
    constructor(actionWidgetService, configurationService, sessionsManagementService, sessionsProvidersService) {
        super();
        this.actionWidgetService = actionWidgetService;
        this.configurationService = configurationService;
        this.sessionsManagementService = sessionsManagementService;
        this.sessionsProvidersService = sessionsProvidersService;
        this._hasGitRepo = false;
        this._renderDisposables = this._register(new DisposableStore());
        this._isolationOptionEnabled = this.configurationService.getValue('github.copilot.chat.cli.isolationOption.enabled') !== false;
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('github.copilot.chat.cli.isolationOption.enabled')) {
                this._isolationOptionEnabled = this.configurationService.getValue('github.copilot.chat.cli.isolationOption.enabled') !== false;
                if (!this._isolationOptionEnabled) {
                    this._setModeOnSession('worktree');
                }
                this._updateTriggerLabel();
            }
        }));
        this._register(autorun(reader => {
            const session = this.sessionsManagementService.activeSession.read(reader);
            const isLoading = session?.loading.read(reader);
            const providerSession = session ? this.sessionsProvidersService.getProvider(session.providerId)?.getSession(session.sessionId) : undefined;
            if (providerSession) {
                this._hasGitRepo = !isLoading && !!providerSession.gitRepository;
                // Read isolation mode from session — session is the source of truth
                providerSession.isolationMode.read(reader);
            }
            else {
                this._hasGitRepo = false;
            }
            this._updateTriggerLabel();
        }));
    }
    _getSessionIsolationMode() {
        const session = this.sessionsManagementService.activeSession.get();
        const providerSession = session ? this.sessionsProvidersService.getProvider(session.providerId)?.getSession(session.sessionId) : undefined;
        return providerSession?.isolationMode.get() ?? 'worktree';
    }
    render(container) {
        this._renderDisposables.clear();
        const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
        this._renderDisposables.add({ dispose: () => slot.remove() });
        this._slotElement = slot;
        const trigger = dom.append(slot, dom.$('a.action-label'));
        trigger.tabIndex = 0;
        trigger.role = 'button';
        this._triggerElement = trigger;
        this._updateTriggerLabel();
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
            dom.EventHelper.stop(e, true);
            this._showPicker();
        }));
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                dom.EventHelper.stop(e, true);
                this._showPicker();
            }
        }));
    }
    _showPicker() {
        if (!this._triggerElement || this.actionWidgetService.isVisible) {
            return;
        }
        if (!this._hasGitRepo || !this._isolationOptionEnabled) {
            return;
        }
        const items = [
            {
                kind: "action" /* ActionListItemKind.Action */,
                label: localize('isolationMode.worktree', "Worktree"),
                group: { title: '', icon: Codicon.worktree },
                item: 'worktree',
            },
            {
                kind: "action" /* ActionListItemKind.Action */,
                label: localize('isolationMode.folder', "Folder"),
                group: { title: '', icon: Codicon.folder },
                item: 'workspace',
            },
        ];
        const triggerElement = this._triggerElement;
        const delegate = {
            onSelect: (mode) => {
                this.actionWidgetService.hide();
                this._setModeOnSession(mode);
            },
            onHide: () => { triggerElement.focus(); },
        };
        this.actionWidgetService.show('isolationPicker', false, items, delegate, this._triggerElement, undefined, [], {
            getAriaLabel: (item) => item.label ?? '',
            getWidgetAriaLabel: () => localize('isolationPicker.ariaLabel', "Isolation Mode"),
        });
    }
    _setModeOnSession(mode) {
        const session = this.sessionsManagementService.activeSession.get();
        const providerSession = session ? this.sessionsProvidersService.getProvider(session.providerId)?.getSession(session.sessionId) : undefined;
        providerSession?.setIsolationMode(mode);
    }
    _updateTriggerLabel() {
        if (!this._triggerElement || !this._slotElement) {
            return;
        }
        dom.clearNode(this._triggerElement);
        const isolationMode = this._getSessionIsolationMode();
        let modeIcon;
        let modeLabel;
        switch (isolationMode) {
            case 'workspace':
                modeIcon = Codicon.folder;
                modeLabel = localize('isolationMode.folder', "Folder");
                break;
            case 'worktree':
            default:
                modeIcon = Codicon.worktree;
                modeLabel = localize('isolationMode.worktree', "Worktree");
                break;
        }
        dom.append(this._triggerElement, renderIcon(modeIcon));
        const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
        labelSpan.textContent = modeLabel;
        dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
        const visible = this._isolationOptionEnabled && this._hasGitRepo;
        dom.setVisibility(visible, this._slotElement);
        this._slotElement.classList.toggle('disabled', false);
        this._triggerElement.setAttribute('aria-hidden', String(!visible));
        this._triggerElement.setAttribute('aria-disabled', String(!visible));
        this._triggerElement.tabIndex = visible ? 0 : -1;
    }
};
IsolationPicker = __decorate([
    __param(0, IActionWidgetService),
    __param(1, IConfigurationService),
    __param(2, ISessionsManagementService),
    __param(3, ISessionsProvidersService)
], IsolationPicker);
export { IsolationPicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNvbGF0aW9uUGlja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jb3BpbG90Q2hhdFNlc3Npb25zL2Jyb3dzZXIvaXNvbGF0aW9uUGlja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFakcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFLL0Y7Ozs7Ozs7Ozs7O0dBV0c7QUFDSSxJQUFNLGVBQWUsR0FBckIsTUFBTSxlQUFnQixTQUFRLFVBQVU7SUFTOUMsWUFDdUIsbUJBQTBELEVBQ3pELG9CQUE0RCxFQUN2RCx5QkFBc0UsRUFDdkUsd0JBQW9FO1FBRS9GLEtBQUssRUFBRSxDQUFDO1FBTCtCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDeEMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUN0Qyw4QkFBeUIsR0FBekIseUJBQXlCLENB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