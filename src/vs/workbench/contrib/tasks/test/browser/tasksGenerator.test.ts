/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TasksGeneratorService } from '../../browser/tasksGenerator.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('TasksGeneratorService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let tasksGenerator: TasksGeneratorService;

	setup(() => {
		const mockFileService = mock<IFileService>();
		const mockWorkspaceService = mock<IWorkspaceContextService>();
		const logService: ILogService = new NullLogService();

		tasksGenerator = new TasksGeneratorService(
			mockFileService,
			mockWorkspaceService,
			logService
		);
	});

	test('parseRequirementsFile should extract requirements from markdown', () => {
		const content = `# Project Requirements

## User Authentication
**Priority:** high

Users must be able to securely authenticate to access the application.

**Acceptance Criteria:**
- Users can register with email and password
- Users can log in with valid credentials
- Users can log out from any page

## Dashboard Overview
**Priority:** medium

Users need a central dashboard to view key information.

**Acceptance Criteria:**
- Dashboard displays user-specific summary information
- Dashboard loads quickly (< 2 seconds)
`;

		const requirements = tasksGenerator.parseRequirementsFile(content);

		assert.strictEqual(requirements.length, 2);
		
		const authRequirement = requirements[0];
		assert.strictEqual(authRequirement.title, 'User Authentication');
		assert.strictEqual(authRequirement.priority, 'high');
		assert.strictEqual(authRequirement.acceptanceCriteria.length, 3);
		assert.strictEqual(authRequirement.acceptanceCriteria[0], 'Users can register with email and password');

		const dashboardRequirement = requirements[1];
		assert.strictEqual(dashboardRequirement.title, 'Dashboard Overview');
		assert.strictEqual(dashboardRequirement.priority, 'medium');
		assert.strictEqual(dashboardRequirement.acceptanceCriteria.length, 2);
	});

	test('parseDesignFile should extract design components', () => {
		const content = `# Design Specification

## Components

- LoginForm: Handles user authentication
- Dashboard: Main application interface
- DataTable: Displays user data

## Architecture

The application follows a modern web architecture with React and Node.js.

## UI Requirements

- Responsive design for mobile and desktop
- Accessible according to WCAG standards
`;

		const design = tasksGenerator.parseDesignFile(content);

		assert.strictEqual(design.components.length, 3);
		assert.strictEqual(design.components[0], 'LoginForm: Handles user authentication');
		assert.strictEqual(design.uiRequirements.length, 2);
		assert.ok(design.architecture.includes('modern web architecture'));
	});

	test('generateTasksPlan should create tasks with dependencies', () => {
		const requirements = [
			{
				id: 'auth',
				title: 'User Authentication',
				description: 'Users must be able to authenticate',
				acceptanceCriteria: ['Users can log in'],
				priority: 'high' as const
			},
			{
				id: 'dashboard',
				title: 'Dashboard',
				description: 'Central dashboard for users',
				acceptanceCriteria: ['Dashboard displays info'],
				priority: 'medium' as const
			}
		];

		const design = {
			components: ['LoginForm', 'Dashboard'],
			architecture: 'React app',
			techStack: ['React', 'Node.js'],
			uiRequirements: ['Responsive design']
		};

		const plan = tasksGenerator.generateTasksPlan(requirements, design);

		// Should have foundation task + 2 requirement tasks + integration testing task
		assert.strictEqual(plan.tasks.length, 4);
		
		const foundationTask = plan.tasks[0];
		assert.strictEqual(foundationTask.id, 'foundation-setup');
		assert.strictEqual(foundationTask.dependencies.length, 0);

		const authTask = plan.tasks[1];
		assert.strictEqual(authTask.id, 'task-auth');
		assert.ok(authTask.dependencies.includes('foundation-setup'));
		assert.ok(authTask.requirementIds.includes('auth'));

		const dashboardTask = plan.tasks[2];
		assert.strictEqual(dashboardTask.id, 'task-dashboard');
		assert.ok(dashboardTask.dependencies.includes('task-auth'));

		const testingTask = plan.tasks[3];
		assert.strictEqual(testingTask.id, 'integration-testing');
		assert.ok(testingTask.dependencies.includes('task-auth'));
		assert.ok(testingTask.dependencies.includes('task-dashboard'));
	});

	test('formatTasksMarkdown should generate valid markdown', () => {
		const plan = {
			tasks: [
				{
					id: 'foundation-setup',
					title: 'Foundation Setup',
					description: 'Set up project foundation',
					dependencies: [],
					requirementIds: [],
					estimatedHours: 4,
					implementation: {
						needsUnitTests: true,
						needsIntegrationTests: false,
						needsLoadingStates: false,
						needsAccessibility: false,
						needsResponsiveness: false
					}
				}
			],
			dependencies: { 'foundation-setup': [] },
			requirements: [
				{
					id: 'auth',
					title: 'User Authentication',
					description: 'Users must authenticate',
					acceptanceCriteria: ['Users can log in'],
					priority: 'high' as const
				}
			]
		};

		const markdown = tasksGenerator.formatTasksMarkdown(plan);

		assert.ok(markdown.includes('# Implementation Tasks'));
		assert.ok(markdown.includes('## Summary'));
		assert.ok(markdown.includes('**Total Tasks**: 1'));
		assert.ok(markdown.includes('**Estimated Hours**: 4'));
		assert.ok(markdown.includes('## Requirements'));
		assert.ok(markdown.includes('### User Authentication (auth)'));
		assert.ok(markdown.includes('## Tasks'));
		assert.ok(markdown.includes('### 1. Foundation Setup'));
		assert.ok(markdown.includes('**Unit Tests: ✓**'));
		assert.ok(markdown.includes('**Status**: [ ] Not Started'));
	});

	test('should handle empty requirements gracefully', () => {
		const requirements = tasksGenerator.parseRequirementsFile('# Empty Requirements\n\nNo requirements here.');
		
		assert.strictEqual(requirements.length, 1);
		assert.strictEqual(requirements[0].title, 'Empty Requirements');
		assert.strictEqual(requirements[0].acceptanceCriteria.length, 0);
	});

	test('should handle requirements without acceptance criteria', () => {
		const content = `## Simple Requirement

This is a simple requirement without acceptance criteria.
`;

		const requirements = tasksGenerator.parseRequirementsFile(content);
		
		assert.strictEqual(requirements.length, 1);
		assert.strictEqual(requirements[0].title, 'Simple Requirement');
		assert.strictEqual(requirements[0].acceptanceCriteria.length, 0);
		assert.ok(requirements[0].description.includes('simple requirement'));
	});
});