/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { TasksGeneratorService } from './tasksGenerator.js';
import { TASKS_CATEGORY } from '../common/tasks.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class GenerateTasksFromRequirementsAction extends Action2 {
	static readonly ID = 'workbench.action.tasks.generateFromRequirements';
	static readonly LABEL = nls.localize('generateTasksFromRequirements', 'Generate Tasks from Requirements');

	constructor() {
		super({
			id: GenerateTasksFromRequirementsAction.ID,
			title: GenerateTasksFromRequirementsAction.LABEL,
			category: TASKS_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const fileService = accessor.get(IFileService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const textFileService = accessor.get(ITextFileService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);
		const logService = accessor.get(ILogService);

		try {
			const workspace = workspaceService.getWorkspace();
			if (!workspace || workspace.folders.length === 0) {
				notificationService.error(nls.localize('noWorkspace', 'No workspace is open. Please open a workspace first.'));
				return;
			}

			const workspaceFolder = workspace.folders[0];
			const requirementsFile = URI.joinPath(workspaceFolder.uri, 'requirements.md');
			const designFile = URI.joinPath(workspaceFolder.uri, 'design.md');
			const tasksFile = URI.joinPath(workspaceFolder.uri, 'tasks.md');

			// Check if requirements.md exists
			let requirementsExists = false;
			let designExists = false;

			try {
				await fileService.stat(requirementsFile);
				requirementsExists = true;
			} catch {
				// File doesn't exist
			}

			try {
				await fileService.stat(designFile);
				designExists = true;
			} catch {
				// File doesn't exist
			}

			if (!requirementsExists && !designExists) {
				notificationService.error(nls.localize('noRequirementsOrDesign', 'Neither requirements.md nor design.md found in the workspace root.'));
				return;
			}

			if (!requirementsExists) {
				const createRequirements = await quickInputService.pick([
					{ label: nls.localize('yes', 'Yes'), description: nls.localize('createRequirementsDesc', 'Create a sample requirements.md file') },
					{ label: nls.localize('no', 'No'), description: nls.localize('cancelDesc', 'Cancel the operation') }
				], {
					placeHolder: nls.localize('createRequirementsPrompt', 'requirements.md not found. Would you like to create a sample file?')
				});

				if (!createRequirements || createRequirements.label === nls.localize('no', 'No')) {
					return;
				}

				// Create sample requirements.md
				const sampleRequirements = this._getSampleRequirements();
				await textFileService.create([{ resource: requirementsFile, value: sampleRequirements }]);
				notificationService.info(nls.localize('createdRequirements', 'Created sample requirements.md file. Please edit it with your actual requirements.'));
			}

			if (!designExists) {
				const createDesign = await quickInputService.pick([
					{ label: nls.localize('yes', 'Yes'), description: nls.localize('createDesignDesc', 'Create a sample design.md file') },
					{ label: nls.localize('no', 'No'), description: nls.localize('skipDesignDesc', 'Continue without design.md') }
				], {
					placeHolder: nls.localize('createDesignPrompt', 'design.md not found. Would you like to create a sample file?')
				});

				if (createDesign && createDesign.label === nls.localize('yes', 'Yes')) {
					// Create sample design.md
					const sampleDesign = this._getSampleDesign();
					await textFileService.create([{ resource: designFile, value: sampleDesign }]);
					notificationService.info(nls.localize('createdDesign', 'Created sample design.md file. Please edit it with your actual design specifications.'));
				}
			}

			// Check if tasks.md already exists
			let tasksExists = false;
			try {
				await fileService.stat(tasksFile);
				tasksExists = true;
			} catch {
				// File doesn't exist
			}

			if (tasksExists) {
				const overwrite = await quickInputService.pick([
					{ label: nls.localize('yes', 'Yes'), description: nls.localize('overwriteDesc', 'Overwrite the existing tasks.md file') },
					{ label: nls.localize('no', 'No'), description: nls.localize('cancelDesc', 'Cancel the operation') }
				], {
					placeHolder: nls.localize('overwritePrompt', 'tasks.md already exists. Do you want to overwrite it?')
				});

				if (!overwrite || overwrite.label === nls.localize('no', 'No')) {
					return;
				}
			}

			// Generate the tasks
			notificationService.info(nls.localize('generatingTasks', 'Generating tasks from requirements and design...'));

			const tasksGenerator = new TasksGeneratorService(fileService, workspaceService, logService);
			
			// Handle the case where design.md might not exist
			let tasksContent: string;
			if (designExists || await this._fileExists(fileService, designFile)) {
				tasksContent = await tasksGenerator.generateTasksFromFiles(requirementsFile, designFile);
			} else {
				// Generate from requirements only
				const requirementsFileContent = await fileService.readFile(requirementsFile);
				const requirements = tasksGenerator.parseRequirementsFile(requirementsFileContent.value.toString());
				const plan = tasksGenerator.generateTasksPlan(requirements, {});
				tasksContent = tasksGenerator.formatTasksMarkdown(plan);
			}

			// Save the tasks.md file
			if (tasksExists) {
				const existingContent = await fileService.readFile(tasksFile);
				await textFileService.write(tasksFile, tasksContent);
			} else {
				await textFileService.create([{ resource: tasksFile, value: tasksContent }]);
			}

			notificationService.info(nls.localize('tasksGenerated', 'Successfully generated tasks.md with implementation plan!'));

			// Open the generated file
			await textFileService.files.open(tasksFile);

		} catch (error) {
			logService.error('Failed to generate tasks from requirements', error);
			notificationService.error(nls.localize('generateTasksError', 'Failed to generate tasks: {0}', error.message));
		}
	}

	private async _fileExists(fileService: IFileService, uri: URI): Promise<boolean> {
		try {
			await fileService.stat(uri);
			return true;
		} catch {
			return false;
		}
	}

	private _getSampleRequirements(): string {
		return `# Project Requirements

## User Authentication
**Priority:** high

Users must be able to securely authenticate to access the application.

**Acceptance Criteria:**
- Users can register with email and password
- Users can log in with valid credentials
- Users can log out from any page
- Invalid login attempts are handled gracefully
- Passwords must meet security requirements

## Dashboard Overview
**Priority:** high

Users need a central dashboard to view key information and navigate the application.

**Acceptance Criteria:**
- Dashboard displays user-specific summary information
- Navigation menu is accessible from dashboard
- Dashboard loads quickly (< 2 seconds)
- Dashboard is responsive on mobile devices

## Data Management
**Priority:** medium

Users should be able to create, read, update, and delete their data.

**Acceptance Criteria:**
- Users can create new data entries
- Users can view their existing data in a list
- Users can edit their data entries
- Users can delete data with confirmation
- Data changes are saved automatically

## Reporting Features
**Priority:** low

Users should be able to generate reports from their data.

**Acceptance Criteria:**
- Users can generate basic reports
- Reports can be exported to PDF
- Reports include date range filtering
- Reports are accessible and screen-reader friendly
`;
	}

	private _getSampleDesign(): string {
		return `# Design Specification

## Architecture

The application follows a modern web architecture with:
- Frontend: React with TypeScript
- Backend: Node.js with Express
- Database: PostgreSQL
- Authentication: JWT tokens

## Components

- LoginForm: Handles user authentication
- Dashboard: Main application interface
- DataTable: Displays user data with CRUD operations
- ReportGenerator: Creates and exports reports
- Navigation: App-wide navigation component

## UI Requirements

- Responsive design for mobile and desktop
- Accessible according to WCAG 2.1 AA standards
- Dark and light theme support
- Consistent design system with Material-UI
- Loading states for all async operations

## Tech Stack

- React 18
- TypeScript
- Material-UI (MUI)
- React Router
- Axios for API calls
- Jest for testing
`;
	}
}

registerAction2(GenerateTasksFromRequirementsAction);