/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { Action2, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ISessionHost } from '../../../services/sessions/browser/sessionHost.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../chat/browser/actions/chatActions.js';
import { Menus } from '../../sessions/browser/menus.js';
import { IChangesRepository } from '../../sessions/common/changesRepositories.js';
import { getActiveSessionChanges, IChangesEditorScope, IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../sessions/common/changesViewService.js';
import { createChangesSessionScope } from './changesView.js';
import { ChangesHasRepositoriesContext } from './changesViewService.js';
import './media/changesView.css';

/** Whether the changes of the active chat are in several repositories, which the Repository picker then chooses between. */

export const REPOSITORY_PICKER_ACTION_ID = 'workbench.action.sessions.changesRepositoryPicker';

/** The Repository picker of a Changes header, which renders as {@link ChangesRepositoryPickerActionItem}. */
export class ChangesRepositoryPickerAction extends Action2 {
	constructor() {
		super({
			id: REPOSITORY_PICKER_ACTION_ID,
			title: localize2('changesRepositoryPicker', "Repository"),
			category: CHAT_CATEGORY,
			icon: Codicon.repo,
			f1: false,
			menu: [{
				id: MenuId.ChatEditingSessionChangesFileHeaderToolbar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChangesHasRepositoriesContext),
			}, {
				id: Menus.SessionsEditorHeaderPrimary,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChangesHasRepositoriesContext),
			}],
		});
	}

	override async run(): Promise<void> { }
}


/**
 * Chooses whether the Changes show the changes of every repository of the chat, grouped by repository, or of one, whose
 * own actions, branch and pull request the Changes then offer.
 */
export class ChangesRepositoryPickerActionItem extends ActionWidgetDropdownActionViewItem {

	private readonly _changes: IChangesSessionObservables;
	private _iconElement: HTMLElement | undefined;
	private _nameElement: HTMLElement | undefined;

	constructor(
		action: MenuItemAction,
		scope: IChangesSessionScope | undefined,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChangesViewService changesViewService: IChangesViewService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		// Without an explicit scope the picker follows the active session
		const changes = scope?.changes ?? getActiveSessionChanges(changesViewService);
		const onDidChangeActions = new Emitter<void>();
		const select = (repository: IChangesRepository | undefined) => {
			const session = scope?.session.get();
			// An explicit scope without a session must never write to the active session
			if (scope && !session) {
				return;
			}
			changesViewService.setRepository(repository?.root, session, scope?.chat.get());
		};
		const actionProvider: IActionWidgetDropdownActionProvider = {
			onDidChangeActions: onDidChangeActions.event,
			getActions: () => {
				const selected = changes.repositoryObs.get();
				const failures = changes.changesetObs.get()?.folderFailures?.get() ?? [];
				const all: IActionWidgetDropdownAction = {
					...action,
					id: `${REPOSITORY_PICKER_ACTION_ID}.all`,
					label: localize('changesRepositoryPicker.all', "All Repositories"),
					tooltip: '',
					icon: Codicon.repoClone,
					checked: !selected,
					enabled: true,
					category: { label: '', order: 0, showHeader: false },
					run: async () => select(undefined),
				};
				return [all, ...changes.repositoriesObs.get().map((repository): IActionWidgetDropdownAction => {
					const failure = changesViewService.findRepositoryFailure(repository, failures);
					return {
						...action,
						id: `${REPOSITORY_PICKER_ACTION_ID}.${repository.root.toString()}`,
						label: repository.description ?? repository.name,
						tooltip: '',
						icon: failure ? Codicon.error : this._getRepositoryIcon(repository),
						description: failure?.message ?? repository.gitRepository?.branchName,
						ariaDescription: failure ? localize('changesRepositoryPicker.failure', "Its changes could not be loaded: {0}", failure.message) : undefined,
						checked: !!selected && uriIdentityService.extUri.isEqual(selected.root, repository.root),
						enabled: true,
						category: { label: '', order: 1, showHeader: false },
						run: async () => select(repository),
					};
				})];
			},
		};

		super(action, { actionProvider }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
		this._changes = changes;
		this._register(onDidChangeActions);
		this._register(autorun(reader => {
			changes.repositoriesObs.read(reader);
			changes.repositoryObs.read(reader);
			// A repository's row shows why its changes could not be loaded
			changes.changesetObs.read(reader)?.folderFailures?.read(reader);
			onDidChangeActions.fire();
			this._updateLabel();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('changes-picker-action-rich', 'changes-repository-picker');
	}

	protected override renderLabel(element: HTMLElement): null {
		element.classList.add('changes-repository-picker-label');
		this._iconElement = dom.append(element, dom.$('span.changes-repository-picker-icon'));
		this._iconElement.setAttribute('aria-hidden', 'true');
		this._nameElement = dom.append(element, dom.$('span.changes-repository-picker-name'));
		const chevron = dom.append(element, renderIcon(Codicon.chevronDownCompact));
		chevron.setAttribute('aria-hidden', 'true');
		this._updateLabel();
		return null;
	}

	private _updateLabel(): void {
		if (!this._iconElement || !this._nameElement) {
			return;
		}
		const repository = this._changes.repositoryObs.get();
		dom.reset(this._iconElement, renderIcon(repository ? this._getRepositoryIcon(repository) : Codicon.repoClone));
		this._nameElement.textContent = repository ? repository.description ?? repository.name : localize('changesRepositoryPicker.all', "All Repositories");
		this.updateTooltip();
		this.updateAriaLabel();
	}

	protected override getTooltip(): string {
		const repository = this._changes?.repositoryObs.get();
		return repository
			? localize('changesRepositoryPicker.tooltip', "Showing the changes of {0}", repository.description ?? repository.name)
			: localize('changesRepositoryPicker.tooltipAll', "Showing the changes of all repositories");
	}

	protected override setAriaLabelAttributes(element: HTMLElement): void {
		super.setAriaLabelAttributes(element);
		const repository = this._changes?.repositoryObs.get();
		element.ariaLabel = localize('changesRepositoryPicker.ariaLabel', "Repository: {0}", repository ? repository.description ?? repository.name : localize('changesRepositoryPicker.all', "All Repositories"));
	}

	/** The icon of a repository, or of a folder in none. */
	private _getRepositoryIcon(repository: IChangesRepository): ThemeIcon {
		return repository.kind === undefined ? Codicon.folder : Codicon.repo;
	}
}

/** Creates the Repository picker of the header it renders in: of its Changes editor, else of the session of its window. */
class ChangesRepositoryPickerActionItemFactory {

	constructor(
		@IChangesEditorScope private readonly _editorScope: IChangesEditorScope,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@ISessionHost private readonly _sessionHost: ISessionHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	create(action: MenuItemAction): ChangesRepositoryPickerActionItem {
		const scope = this._editorScope.scope ?? createChangesSessionScope(this._changesViewService, this._sessionHost);
		// The main window's picker follows its active session
		return this._instantiationService.createInstance(ChangesRepositoryPickerActionItem, action, scope.isMainWindow ? undefined : scope);
	}
}

/** Renders the Repository picker in the Changes headers, beside the changeset picker. */
export class ChangesRepositoryPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesRepositoryPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		// The header of a Changes editor, and the files header of the Changes view
		for (const menu of [Menus.SessionsEditorHeaderPrimary, MenuId.ChatEditingSessionChangesFileHeaderToolbar]) {
			this._register(actionViewItemService.register(menu, REPOSITORY_PICKER_ACTION_ID, (action, _options, itemInstantiationService) => {
				if (!(action instanceof MenuItemAction)) {
					return undefined;
				}
				// Created where the item is, so that it injects the services of its header, such as of its Changes editor
				return itemInstantiationService.createInstance(ChangesRepositoryPickerActionItemFactory).create(action);
			}));
		}
	}
}
