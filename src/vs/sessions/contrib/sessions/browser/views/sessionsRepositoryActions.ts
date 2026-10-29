/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { NEW_SESSION_IN_REPOSITORY_COMMAND_ID, SELECT_SESSIONS_REPOSITORY_COMMAND_ID, SHOW_ALL_SESSIONS_REPOSITORIES_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ISessionsProjectsService } from '../../../../services/projects/common/sessionsProjects.js';
import { SessionRepositoryKind } from '../../../../services/repositories/common/sessionRepository.js';
import { ISessionsRepositoriesService, ISessionsRepository } from '../../../../services/repositories/common/sessionsRepositories.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { canStartNewSessionLike } from './sessionsList.js';
import { openNewSessionAt, openNewSessionLike } from './sessionsViewActions.js';

/** Whether the sessions list is scoped to a single repository. */
export const SessionsRepositorySelectedContext = new RawContextKey<boolean>('sessionsRepositorySelected', false, localize('sessionsRepositorySelected', "Whether the sessions list shows a single repository."));
/** Whether the sessions list is scoped to a single persistent Project. */
export const SessionsProjectSelectedContext = new RawContextKey<boolean>('sessionsProjectSelected', false, localize('sessionsProjectSelected', "Whether the sessions list shows a single project."));

class SessionsListScopeContextKeysContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionsListScopeContextKeys';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsRepositoriesService repositoriesService: ISessionsRepositoriesService,
		@ISessionsProjectsService projectsService: ISessionsProjectsService,
	) {
		super();
		const repositorySelected = SessionsRepositorySelectedContext.bindTo(contextKeyService);
		const projectSelected = SessionsProjectSelectedContext.bindTo(contextKeyService);
		this._register(autorun(reader => repositorySelected.set(!!repositoriesService.selectedRepository.read(reader))));
		this._register(autorun(reader => projectSelected.set(!!projectsService.selectedProject.read(reader))));
	}
}

registerWorkbenchContribution2(SessionsListScopeContextKeysContribution.ID, SessionsListScopeContextKeysContribution, WorkbenchPhase.AfterRestored);

/** Scopes the sessions list to a repository; a list shows one repository or one project at a time. */
function selectRepositoryScope(accessor: ServicesAccessor, key: string | undefined): void {
	accessor.get(ISessionsProjectsService).selectProject(undefined);
	accessor.get(ISessionsRepositoriesService).selectRepository(key);
}

/**
 * Starts a new session in a repository: like its most recent session that new sessions can
 * start like, keeping that session's provider, or else in its saved location. A repository
 * without either opens the composer for the user to choose where to run.
 */
function openNewSessionInRepository(accessor: ServicesAccessor, repository: ISessionsRepository): Promise<void> {
	const repositoriesService = accessor.get(ISessionsRepositoriesService);
	const source = accessor.get(ISessionsManagementService).getSessions()
		.filter(session => !session.isArchived.get() && canStartNewSessionLike(session) && repositoriesService.isSessionInRepository(session, repository))
		.reduce<ISession | undefined>((latest, session) => !latest || session.createdAt.getTime() > latest.createdAt.getTime() ? session : latest, undefined);
	if (source) {
		return openNewSessionLike(accessor, source);
	}
	return openNewSessionAt(accessor, repository.locations.find(location => location.folderUri.scheme !== Schemas.https));
}

function announceAllSessions(): void {
	status(localize('allSessionsShown', "Showing all sessions."));
}

export function describeRepository(repository: ISessionsRepository, labelService: ILabelService): string {
	if (repository.gitHubRepository) {
		return `${repository.gitHubRepository.owner}/${repository.gitHubRepository.repo}`;
	}
	const location = repository.locations[0];
	return location ? labelService.getUriLabel(location.folderUri, { relative: false }) : '';
}

interface IRepositoryPickItem extends IQuickPickItem {
	readonly repository?: ISessionsRepository;
	readonly isAddRepository?: boolean;
}

/** Asks for a folder and saves it as a repository. Returns the repository, or `undefined` when cancelled or unsupported. */
export async function addRepository(accessor: ServicesAccessor): Promise<ISessionsRepository | undefined> {
	const fileDialogService = accessor.get(IFileDialogService);
	const repositoriesService = accessor.get(ISessionsRepositoriesService);
	const notificationService = accessor.get(INotificationService);
	const labelService = accessor.get(ILabelService);

	const folders = await fileDialogService.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		title: localize('addRepository.title', "Add Repository"),
		openLabel: localize('addRepository.openLabel', "Add Repository"),
	});
	const folderUri = folders?.[0];
	if (!folderUri) {
		return undefined;
	}
	const repository = await repositoriesService.addFolder(folderUri);
	if (!repository) {
		notificationService.warn(localize('addRepository.unsupported', "No agent can work in '{0}', so it was not added as a repository.", labelService.getUriLabel(folderUri, { relative: false })));
	}
	return repository;
}

registerAction2(class SelectSessionsRepositoryAction extends Action2 {
	constructor() {
		super({
			id: SELECT_SESSIONS_REPOSITORY_COMMAND_ID,
			title: localize2('selectRepository', "Select Repository..."),
			category: SessionsCategories.Sessions,
			icon: Codicon.repo,
			f1: true,
			precondition: ChatContextKeys.enabled,
			toggled: SessionsRepositorySelectedContext,
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'navigation',
				order: 5,
				when: ChatContextKeys.enabled,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const repositoriesService = accessor.get(ISessionsRepositoriesService);
		const labelService = accessor.get(ILabelService);
		const instantiationService = accessor.get(IInstantiationService);

		const newSessionButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.add), tooltip: localize('newSessionInRepository.button', "New Session in Repository") };
		const saveButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.pin), tooltip: localize('saveRepository', "Save Repository") };
		const removeButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.pinned), tooltip: localize('removeSavedRepository', "Remove from Saved Repositories") };

		const createItems = (): (IRepositoryPickItem | IQuickPickSeparator)[] => {
			const selected = repositoriesService.selectedRepository.get();
			const repositories = repositoriesService.repositories.get();
			const repositoryItem = (repository: ISessionsRepository): IRepositoryPickItem => {
				const description = describeRepository(repository, labelService);
				return {
					repository,
					label: `$(${repository.kind === SessionRepositoryKind.Folder ? Codicon.folder.id : Codicon.repo.id}) ${repository.label}`,
					description: repository.key === selected?.key ? localize('selectedRepository.description', "{0} (Selected)", description) : description,
					ariaLabel: repository.key === selected?.key ? localize('selectedRepository.aria', "{0}, {1}, selected", repository.label, description) : localize('repository.aria', "{0}, {1}", repository.label, description),
					buttons: [newSessionButton, repository.isSaved ? removeButton : saveButton],
				};
			};
			const saved = repositories.filter(repository => repository.isSaved);
			const others = repositories.filter(repository => !repository.isSaved);
			return [
				{
					label: `$(${Codicon.listFlat.id}) ${localize('allRepositories', "All Repositories")}`,
					ariaLabel: selected ? localize('allRepositories.aria', "All Repositories") : localize('allRepositories.selectedAria', "All Repositories, selected"),
					description: selected ? undefined : localize('allRepositories.selected', "(Selected)"),
				},
				...(saved.length ? [{ type: 'separator' as const, label: localize('savedRepositories', "Saved") }, ...saved.map(repositoryItem)] : []),
				...(others.length ? [{ type: 'separator' as const, label: localize('otherRepositories', "From Sessions") }, ...others.map(repositoryItem)] : []),
				{ type: 'separator' },
				{ label: `$(${Codicon.add.id}) ${localize('addRepository', "Add Repository...")}`, ariaLabel: localize('addRepository.aria', "Add Repository..."), isAddRepository: true },
			];
		};

		const disposables = new DisposableStore();
		const picker = disposables.add(quickInputService.createQuickPick<IRepositoryPickItem>({ useSeparators: true }));
		picker.placeholder = localize('selectRepository.placeholder', "Select a repository to show its sessions");
		picker.matchOnDescription = true;
		const itemId = (item: IRepositoryPickItem | undefined) => item?.isAddRepository ? 'add' : item?.repository?.key ?? 'all';
		let activeId = repositoriesService.selectedRepository.get()?.key ?? 'all';
		disposables.add(picker.onDidChangeActive(([item]) => {
			if (item) {
				activeId = itemId(item);
			}
		}));
		// Repositories refine as lazily resolved repository metadata arrives; keep the active row across updates.
		disposables.add(autorun(reader => {
			repositoriesService.repositories.read(reader);
			repositoriesService.selectedRepository.read(reader);
			const id = activeId;
			picker.items = createItems();
			const active = picker.items.find((item): item is IRepositoryPickItem => item.type !== 'separator' && itemId(item) === id);
			if (active) {
				picker.activeItems = [active];
			}
		}));
		repositoriesService.resolveRepositories();

		disposables.add(picker.onDidTriggerItemButton(({ item, button }) => {
			const repository = item.repository;
			if (!repository) {
				return;
			}
			if (button === newSessionButton) {
				picker.hide();
				instantiationService.invokeFunction(selectRepositoryScope, repository.key);
				void instantiationService.invokeFunction(openNewSessionInRepository, repository);
			} else if (button === saveButton) {
				repositoriesService.saveRepository(repository);
				status(localize('repositorySaved', "Saved repository {0}.", repository.label));
			} else if (button === removeButton) {
				repositoriesService.removeSavedRepository(repository);
				status(localize('repositoryRemoved', "Removed {0} from saved repositories.", repository.label));
			}
		}));
		disposables.add(picker.onDidAccept(() => {
			const item = picker.selectedItems[0];
			picker.hide();
			if (!item) {
				return;
			}
			if (item.isAddRepository) {
				void instantiationService.invokeFunction(addRepository).then(repository => {
					if (repository) {
						instantiationService.invokeFunction(selectRepositoryScope, repository.key);
						status(localize('repositoryAdded', "Added repository {0}. Showing its sessions.", repository.label));
					}
				});
			} else if (item.repository) {
				instantiationService.invokeFunction(selectRepositoryScope, item.repository.key);
				status(localize('repositorySelected', "Showing sessions in {0}.", item.repository.label));
			} else {
				instantiationService.invokeFunction(selectRepositoryScope, undefined);
				announceAllSessions();
			}
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}
});

registerAction2(class NewSessionInRepositoryAction extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_IN_REPOSITORY_COMMAND_ID,
			title: localize2('newSessionInRepository', "New Session in Repository"),
			category: SessionsCategories.Sessions,
			icon: Codicon.add,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, SessionsRepositorySelectedContext),
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'navigation',
				order: 6,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, SessionsRepositorySelectedContext),
			}],
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> | void {
		const repository = accessor.get(ISessionsRepositoriesService).selectedRepository.get();
		if (repository) {
			return openNewSessionInRepository(accessor, repository);
		}
	}
});

registerAction2(class ShowAllSessionsAction extends Action2 {
	constructor() {
		const scoped = ContextKeyExpr.or(SessionsRepositorySelectedContext, SessionsProjectSelectedContext);
		super({
			id: SHOW_ALL_SESSIONS_REPOSITORIES_COMMAND_ID,
			title: localize2('showAllSessions', "Show All Sessions"),
			category: SessionsCategories.Sessions,
			icon: Codicon.close,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, scoped),
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'navigation',
				order: 7,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, scoped),
			}],
		});
	}

	override run(accessor: ServicesAccessor): void {
		selectRepositoryScope(accessor, undefined);
		announceAllSessions();
	}
});
