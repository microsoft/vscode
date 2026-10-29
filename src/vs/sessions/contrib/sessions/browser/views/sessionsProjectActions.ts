/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { NEW_SESSIONS_PROJECT_COMMAND_ID, REMOVE_SESSIONS_PROJECT_COMMAND_ID, RENAME_SESSIONS_PROJECT_COMMAND_ID, SHOW_SESSIONS_PROJECT_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ISessionsProject, ISessionsProjectRepository, ISessionsProjectsService } from '../../../../services/projects/common/sessionsProjects.js';
import { ISessionsRepositoriesService, ISessionsRepository } from '../../../../services/repositories/common/sessionsRepositories.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionItemContextMenuId, SessionItemIsProjectContext, SessionSectionToolbarMenuId, SessionSectionTypeContext } from './sessionsList.js';
import { describeRepository } from './sessionsRepositoryActions.js';

/** Projects start their coordinator as a quick chat, which the local agent host serves. */
const ProjectsEnabledContext = ContextKeyExpr.and(ChatContextKeys.enabled, AGENT_HOST_ENABLED_CONTEXT_KEY);

interface IProjectRepositoryPickItem extends IQuickPickItem {
	readonly repository: ISessionsRepository;
}

function toProjectRepository(repository: ISessionsRepository): ISessionsProjectRepository {
	const location = repository.locations[0];
	return { key: repository.key, label: repository.label, folderUri: location?.folderUri, providerId: location?.providerId };
}

function getProjectOfContext(accessor: ServicesAccessor, context: ISession | ISession[] | undefined): ISessionsProject | undefined {
	const session = Array.isArray(context) ? context[0] : context;
	return session && accessor.get(ISessionsProjectsService).getProjectOfCoordinator(session);
}

registerAction2(class NewSessionsProjectAction extends Action2 {
	constructor() {
		super({
			id: NEW_SESSIONS_PROJECT_COMMAND_ID,
			title: localize2('newProject', "New Project..."),
			category: SessionsCategories.Sessions,
			icon: Codicon.add,
			f1: true,
			precondition: ProjectsEnabledContext,
			menu: [SessionSectionToolbarMenuId, Menus.SessionSectionContext].map(id => ({
				id,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(ProjectsEnabledContext, ContextKeyExpr.equals(SessionSectionTypeContext.key, 'projects')),
			})),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const projectsService = accessor.get(ISessionsProjectsService);
		const repositoriesService = accessor.get(ISessionsRepositoriesService);
		const sessionsService = accessor.get(ISessionsService);
		const progressService = accessor.get(IProgressService);
		const notificationService = accessor.get(INotificationService);
		const labelService = accessor.get(ILabelService);

		const name = await quickInputService.input({
			title: localize('newProject.nameTitle', "New Project (1/3)"),
			prompt: localize('newProject.namePrompt', "Name the project after its body of work."),
			placeHolder: localize('newProject.namePlaceholder', "For example, Agents window polish"),
			validateInput: async value => value.trim() ? undefined : localize('newProject.nameRequired', "Enter a project name."),
		});
		if (!name) {
			return;
		}

		repositoriesService.resolveRepositories();
		const selectedRepository = repositoriesService.selectedRepository.get();
		const repositoryItems = repositoriesService.repositories.get().map((repository): IProjectRepositoryPickItem => ({
			repository,
			label: repository.label,
			description: describeRepository(repository, labelService),
			picked: repository.key === selectedRepository?.key,
		}));
		const picks = repositoryItems.length === 0 ? [] : await quickInputService.pick(repositoryItems, {
			canPickMany: true,
			title: localize('newProject.repositoriesTitle', "New Project (2/3)"),
			placeHolder: localize('newProject.repositoriesPlaceholder', "Select the repositories this project works in"),
			matchOnDescription: true,
		});
		if (!picks) {
			return;
		}

		const firstMessage = await quickInputService.input({
			title: localize('newProject.firstMessageTitle', "New Project (3/3)"),
			prompt: localize('newProject.firstMessagePrompt', "What should this project work on first? This starts the project's coordinator chat."),
			validateInput: async value => value.trim() ? undefined : localize('newProject.firstMessageRequired', "Describe the first task for this project."),
		});
		if (!firstMessage) {
			return;
		}

		const cancellation = new CancellationTokenSource();
		try {
			const project = await progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('newProject.progress', "Starting project {0}...", name.trim()),
				cancellable: true,
			}, () => projectsService.createProject({ name, repositories: picks.map(pick => toProjectRepository(pick.repository)), firstMessage }, cancellation.token), () => cancellation.cancel());
			if (!project) {
				if (!cancellation.token.isCancellationRequested) {
					notificationService.warn(localize('newProject.failed', "Couldn't start project {0}.", name.trim()));
				}
				return;
			}
			repositoriesService.selectRepository(undefined);
			projectsService.selectProject(project.id);
			await sessionsService.openSession(project.coordinator);
			status(localize('newProject.created', "Created project {0}. Showing its sessions.", project.name));
		} catch (error) {
			if (!isCancellationError(error)) {
				notificationService.error(localize('newProject.error', "Couldn't start project {0}: {1}", name.trim(), toErrorMessage(error)));
			}
		} finally {
			cancellation.dispose();
		}
	}
});

registerAction2(class ShowSessionsProjectAction extends Action2 {
	constructor() {
		super({
			id: SHOW_SESSIONS_PROJECT_COMMAND_ID,
			title: localize2('showProjectSessions', "Show Project Sessions"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_project',
				order: 0,
				when: SessionItemIsProjectContext,
			}],
		});
	}

	override run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		const project = getProjectOfContext(accessor, context);
		if (project) {
			accessor.get(ISessionsRepositoriesService).selectRepository(undefined);
			accessor.get(ISessionsProjectsService).selectProject(project.id);
			status(localize('projectSelected', "Showing sessions in project {0}.", project.name));
		}
	}
});

registerAction2(class RenameSessionsProjectAction extends Action2 {
	constructor() {
		super({
			id: RENAME_SESSIONS_PROJECT_COMMAND_ID,
			title: localize2('renameProject', "Rename Project..."),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_project',
				order: 1,
				when: SessionItemIsProjectContext,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const project = getProjectOfContext(accessor, context);
		const coordinator = Array.isArray(context) ? context[0] : context;
		if (!project || !coordinator) {
			return;
		}
		const projectsService = accessor.get(ISessionsProjectsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const name = await accessor.get(IQuickInputService).input({
			title: localize('renameProject.title', "Rename Project"),
			value: project.name,
			validateInput: async value => value.trim() ? undefined : localize('newProject.nameRequired', "Enter a project name."),
		});
		if (!name) {
			return;
		}
		projectsService.renameProject(project.id, name);
		// The coordinator row is the project's row, so it carries the project's name.
		if (coordinator.capabilities.get().supportsRename) {
			await sessionsManagementService.renameSession(coordinator, name.trim());
		}
	}
});

registerAction2(class RemoveSessionsProjectAction extends Action2 {
	constructor() {
		super({
			id: REMOVE_SESSIONS_PROJECT_COMMAND_ID,
			title: localize2('removeProject', "Remove Project"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '0_project',
				order: 2,
				when: SessionItemIsProjectContext,
			}],
		});
	}

	override run(accessor: ServicesAccessor, context?: ISession | ISession[]): void {
		const project = getProjectOfContext(accessor, context);
		if (project) {
			accessor.get(ISessionsProjectsService).removeProject(project.id);
			status(localize('projectRemoved', "Removed project {0}. Its sessions remain.", project.name));
		}
	}
});
