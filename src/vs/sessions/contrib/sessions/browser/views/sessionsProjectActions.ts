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
import { SessionProjectKind } from '../../../../services/projects/common/sessionProject.js';
import { ISessionProject, ISessionsProjectsService } from '../../../../services/projects/common/sessionsProjects.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { NEW_SESSION_IN_PROJECT_COMMAND_ID, SELECT_SESSIONS_PROJECT_COMMAND_ID, SHOW_ALL_SESSIONS_PROJECTS_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { canStartNewSessionLike } from './sessionsList.js';
import { openNewSessionAt, openNewSessionLike } from './sessionsViewActions.js';

/** Whether the sessions list is scoped to a project. */
export const SessionsProjectSelectedContext = new RawContextKey<boolean>('sessionsProjectSelected', false, localize('sessionsProjectSelected', "Whether the sessions list shows a single project."));

class SessionsProjectContextKeysContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionsProjectContextKeys';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProjectsService projectsService: ISessionsProjectsService,
	) {
		super();
		const selected = SessionsProjectSelectedContext.bindTo(contextKeyService);
		this._register(autorun(reader => selected.set(!!projectsService.selectedProject.read(reader))));
	}
}

registerWorkbenchContribution2(SessionsProjectContextKeysContribution.ID, SessionsProjectContextKeysContribution, WorkbenchPhase.AfterRestored);

/**
 * Starts a new session in a project: like its most recent session that new sessions can
 * start like, keeping that session's provider, or else in its saved location. A project
 * without either opens the composer for the user to choose where to run.
 */
function openNewSessionInProject(accessor: ServicesAccessor, project: ISessionProject): Promise<void> {
	const projectsService = accessor.get(ISessionsProjectsService);
	const source = accessor.get(ISessionsManagementService).getSessions()
		.filter(session => !session.isArchived.get() && canStartNewSessionLike(session) && projectsService.isSessionInProject(session, project))
		.reduce<ISession | undefined>((latest, session) => !latest || session.createdAt.getTime() > latest.createdAt.getTime() ? session : latest, undefined);
	if (source) {
		return openNewSessionLike(accessor, source);
	}
	return openNewSessionAt(accessor, project.locations.find(location => location.folderUri.scheme !== Schemas.https));
}

function announceAllProjects(): void {
	status(localize('allProjectsSelected', "Showing sessions from all projects."));
}

function describeProject(project: ISessionProject, labelService: ILabelService): string {
	if (project.gitHubRepository) {
		return `${project.gitHubRepository.owner}/${project.gitHubRepository.repo}`;
	}
	const location = project.locations[0];
	return location ? labelService.getUriLabel(location.folderUri, { relative: false }) : '';
}

interface IProjectPickItem extends IQuickPickItem {
	readonly project?: ISessionProject;
	readonly isAddProject?: boolean;
}

async function addProject(accessor: ServicesAccessor): Promise<void> {
	const fileDialogService = accessor.get(IFileDialogService);
	const projectsService = accessor.get(ISessionsProjectsService);
	const notificationService = accessor.get(INotificationService);
	const labelService = accessor.get(ILabelService);

	const folders = await fileDialogService.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		title: localize('addProject.title', "Add Project"),
		openLabel: localize('addProject.openLabel', "Add Project"),
	});
	const folderUri = folders?.[0];
	if (!folderUri) {
		return;
	}
	const project = await projectsService.addFolder(folderUri);
	if (!project) {
		notificationService.warn(localize('addProject.unsupported', "No agent can work in '{0}', so it was not added as a project.", labelService.getUriLabel(folderUri, { relative: false })));
		return;
	}
	projectsService.selectProject(project.key);
	status(localize('projectAdded', "Added project {0}. Showing its sessions.", project.label));
}

registerAction2(class SelectSessionsProjectAction extends Action2 {
	constructor() {
		super({
			id: SELECT_SESSIONS_PROJECT_COMMAND_ID,
			title: localize2('selectProject', "Select Project..."),
			category: SessionsCategories.Sessions,
			icon: Codicon.repo,
			f1: true,
			precondition: ChatContextKeys.enabled,
			toggled: SessionsProjectSelectedContext,
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
		const projectsService = accessor.get(ISessionsProjectsService);
		const labelService = accessor.get(ILabelService);
		const instantiationService = accessor.get(IInstantiationService);

		const newSessionButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.add), tooltip: localize('newSessionInProject.button', "New Session in Project") };
		const saveButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.pin), tooltip: localize('saveProject', "Save Project") };
		const removeButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.pinned), tooltip: localize('removeSavedProject', "Remove from Saved Projects") };

		const createItems = (): (IProjectPickItem | IQuickPickSeparator)[] => {
			const selected = projectsService.selectedProject.get();
			const projects = projectsService.projects.get();
			const projectItem = (project: ISessionProject): IProjectPickItem => {
				const description = describeProject(project, labelService);
				return {
					project,
					label: `$(${project.kind === SessionProjectKind.Folder ? Codicon.folder.id : Codicon.repo.id}) ${project.label}`,
					description: project.key === selected?.key ? localize('selectedProject.description', "{0} (Selected)", description) : description,
					ariaLabel: project.key === selected?.key ? localize('selectedProject.aria', "{0}, {1}, selected", project.label, description) : localize('project.aria', "{0}, {1}", project.label, description),
					buttons: [newSessionButton, project.isSaved ? removeButton : saveButton],
				};
			};
			const saved = projects.filter(project => project.isSaved);
			const others = projects.filter(project => !project.isSaved);
			return [
				{
					label: `$(${Codicon.listFlat.id}) ${localize('allProjects', "All Projects")}`,
					ariaLabel: selected ? localize('allProjects.aria', "All Projects") : localize('allProjects.selectedAria', "All Projects, selected"),
					description: selected ? undefined : localize('allProjects.selected', "(Selected)"),
				},
				...(saved.length ? [{ type: 'separator' as const, label: localize('savedProjects', "Saved") }, ...saved.map(projectItem)] : []),
				...(others.length ? [{ type: 'separator' as const, label: localize('otherProjects', "From Sessions") }, ...others.map(projectItem)] : []),
				{ type: 'separator' },
				{ label: `$(${Codicon.add.id}) ${localize('addProject', "Add Project...")}`, ariaLabel: localize('addProject.aria', "Add Project..."), isAddProject: true },
			];
		};

		const disposables = new DisposableStore();
		const picker = disposables.add(quickInputService.createQuickPick<IProjectPickItem>({ useSeparators: true }));
		picker.placeholder = localize('selectProject.placeholder', "Select a project to show its sessions");
		picker.matchOnDescription = true;
		const itemId = (item: IProjectPickItem | undefined) => item?.isAddProject ? 'add' : item?.project?.key ?? 'all';
		let activeId = projectsService.selectedProject.get()?.key ?? 'all';
		disposables.add(picker.onDidChangeActive(([item]) => {
			if (item) {
				activeId = itemId(item);
			}
		}));
		// Projects refine as lazily resolved repository metadata arrives; keep the active row across updates.
		disposables.add(autorun(reader => {
			projectsService.projects.read(reader);
			projectsService.selectedProject.read(reader);
			const id = activeId;
			picker.items = createItems();
			const active = picker.items.find((item): item is IProjectPickItem => item.type !== 'separator' && itemId(item) === id);
			if (active) {
				picker.activeItems = [active];
			}
		}));
		projectsService.resolveRepositories();

		disposables.add(picker.onDidTriggerItemButton(({ item, button }) => {
			const project = item.project;
			if (!project) {
				return;
			}
			if (button === newSessionButton) {
				picker.hide();
				projectsService.selectProject(project.key);
				void instantiationService.invokeFunction(openNewSessionInProject, project);
			} else if (button === saveButton) {
				projectsService.saveProject(project);
				status(localize('projectSaved', "Saved project {0}.", project.label));
			} else if (button === removeButton) {
				projectsService.removeSavedProject(project);
				status(localize('projectRemoved', "Removed {0} from saved projects.", project.label));
			}
		}));
		disposables.add(picker.onDidAccept(() => {
			const item = picker.selectedItems[0];
			picker.hide();
			if (!item) {
				return;
			}
			if (item.isAddProject) {
				void instantiationService.invokeFunction(addProject);
			} else if (item.project) {
				projectsService.selectProject(item.project.key);
				status(localize('projectSelected', "Showing sessions in {0}.", item.project.label));
			} else {
				projectsService.selectProject(undefined);
				announceAllProjects();
			}
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}
});

registerAction2(class NewSessionInProjectAction extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_IN_PROJECT_COMMAND_ID,
			title: localize2('newSessionInProject', "New Session in Project"),
			category: SessionsCategories.Sessions,
			icon: Codicon.add,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, SessionsProjectSelectedContext),
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'navigation',
				order: 6,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, SessionsProjectSelectedContext),
			}],
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> | void {
		const project = accessor.get(ISessionsProjectsService).selectedProject.get();
		if (project) {
			return openNewSessionInProject(accessor, project);
		}
	}
});

registerAction2(class ShowAllSessionsProjectsAction extends Action2 {
	constructor() {
		super({
			id: SHOW_ALL_SESSIONS_PROJECTS_COMMAND_ID,
			title: localize2('showAllProjects', "Show Sessions from All Projects"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, SessionsProjectSelectedContext),
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(ISessionsProjectsService).selectProject(undefined);
		announceAllProjects();
	}
});
