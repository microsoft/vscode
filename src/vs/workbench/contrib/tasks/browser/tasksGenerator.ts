/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export interface ITaskGenerationRequirement {
	id: string;
	title: string;
	description: string;
	acceptanceCriteria: string[];
	priority: 'high' | 'medium' | 'low';
}

export interface ITaskGenerationTask {
	id: string;
	title: string;
	description: string;
	dependencies: string[];
	requirementIds: string[];
	estimatedHours: number;
	implementation: {
		needsUnitTests: boolean;
		needsIntegrationTests: boolean;
		needsLoadingStates: boolean;
		needsAccessibility: boolean;
		needsResponsiveness: boolean;
	};
}

export interface ITaskGenerationPlan {
	tasks: ITaskGenerationTask[];
	dependencies: { [taskId: string]: string[] };
	requirements: ITaskGenerationRequirement[];
}

export interface ITasksGeneratorService {
	generateTasksFromFiles(requirementsFile: URI, designFile: URI): Promise<string>;
	generateTasksFromRequirements(requirementsFile: URI): Promise<string>;
	parseRequirementsFile(content: string): ITaskGenerationRequirement[];
	parseDesignFile(content: string): any;
	generateTasksPlan(requirements: ITaskGenerationRequirement[], design: any): ITaskGenerationPlan;
	formatTasksMarkdown(plan: ITaskGenerationPlan): string;
}

export class TasksGeneratorService implements ITasksGeneratorService {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService
	) { }

	async generateTasksFromRequirements(requirementsFile: URI): Promise<string> {
		try {
			this._logService.info('Starting task generation from requirements only', { requirementsFile: requirementsFile.toString() });
			
			const requirementsContent = await this._fileService.readFile(requirementsFile).catch(err => {
				this._logService.warn('Could not read requirements file', err);
				throw new Error(`Could not read requirements file: ${err.message}`);
			});

			const requirements = this.parseRequirementsFile(requirementsContent.value.toString());
			if (requirements.length === 0) {
				throw new Error('No requirements found in requirements.md. Please check the file format.');
			}

			const plan = this.generateTasksPlan(requirements, {});
			
			this._logService.info('Task generation from requirements completed successfully', { 
				taskCount: plan.tasks.length, 
				requirementCount: plan.requirements.length 
			});
			
			return this.formatTasksMarkdown(plan);
		} catch (error) {
			this._logService.error('Failed to generate tasks from requirements', error);
			throw error;
		}
	}
		try {
			this._logService.info('Starting task generation from files', { requirementsFile: requirementsFile.toString(), designFile: designFile.toString() });
			
			const [requirementsContent, designContent] = await Promise.all([
				this._fileService.readFile(requirementsFile).catch(err => {
					this._logService.warn('Could not read requirements file', err);
					throw new Error(`Could not read requirements file: ${err.message}`);
				}),
				this._fileService.readFile(designFile).catch(err => {
					this._logService.warn('Could not read design file', err);
					throw new Error(`Could not read design file: ${err.message}`);
				})
			]);

			const requirements = this.parseRequirementsFile(requirementsContent.value.toString());
			if (requirements.length === 0) {
				throw new Error('No requirements found in requirements.md. Please check the file format.');
			}

			const design = this.parseDesignFile(designContent.value.toString());
			const plan = this.generateTasksPlan(requirements, design);
			
			this._logService.info('Task generation completed successfully', { 
				taskCount: plan.tasks.length, 
				requirementCount: plan.requirements.length 
			});
			
			return this.formatTasksMarkdown(plan);
		} catch (error) {
			this._logService.error('Failed to generate tasks from files', error);
			throw error;
		}
	}

	parseRequirementsFile(content: string): ITaskGenerationRequirement[] {
		const requirements: ITaskGenerationRequirement[] = [];
		const lines = content.split('\n');
		let currentRequirement: Partial<ITaskGenerationRequirement> | null = null;
		let isInAcceptanceCriteria = false;

		for (const line of lines) {
			const trimmedLine = line.trim();
			
			// Check for requirement headers (## or ###)
			const headerMatch = trimmedLine.match(/^#{2,3}\s+(.+)/);
			if (headerMatch) {
				// Save previous requirement
				if (currentRequirement && currentRequirement.title) {
					requirements.push({
						id: this._generateId(currentRequirement.title),
						title: currentRequirement.title,
						description: currentRequirement.description || '',
						acceptanceCriteria: currentRequirement.acceptanceCriteria || [],
						priority: currentRequirement.priority || 'medium'
					});
				}

				// Start new requirement
				currentRequirement = {
					title: headerMatch[1],
					description: '',
					acceptanceCriteria: [],
					priority: 'medium'
				};
				isInAcceptanceCriteria = false;
			}
			// Check for acceptance criteria section
			else if (trimmedLine.toLowerCase().includes('acceptance criteria') || 
					 trimmedLine.toLowerCase().includes('success criteria')) {
				isInAcceptanceCriteria = true;
			}
			// Check for priority indicators (look for **Priority:** pattern)
			else if (trimmedLine.toLowerCase().match(/\*\*priority:\*\*\s*(high|medium|low)/i)) {
				const priorityMatch = trimmedLine.match(/\*\*priority:\*\*\s*(high|medium|low)/i);
				if (priorityMatch && currentRequirement) {
					currentRequirement.priority = priorityMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
				}
			}
			// Handle bullet points for acceptance criteria
			else if (isInAcceptanceCriteria && (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* '))) {
				if (currentRequirement) {
					currentRequirement.acceptanceCriteria = currentRequirement.acceptanceCriteria || [];
					currentRequirement.acceptanceCriteria.push(trimmedLine.substring(2));
				}
			}
			// Add to description if we have a current requirement
			else if (currentRequirement && trimmedLine && !isInAcceptanceCriteria && 
					!trimmedLine.toLowerCase().includes('priority:')) {
				currentRequirement.description = (currentRequirement.description || '') + 
					(currentRequirement.description ? ' ' : '') + trimmedLine;
			}
		}

		// Save the last requirement
		if (currentRequirement && currentRequirement.title) {
			requirements.push({
				id: this._generateId(currentRequirement.title),
				title: currentRequirement.title,
				description: currentRequirement.description || '',
				acceptanceCriteria: currentRequirement.acceptanceCriteria || [],
				priority: currentRequirement.priority || 'medium'
			});
		}

		return requirements;
	}

	parseDesignFile(content: string): any {
		// Basic parsing for design file - look for sections about UI components, architecture, etc.
		const design = {
			components: [] as string[],
			architecture: '',
			techStack: [] as string[],
			uiRequirements: [] as string[]
		};

		const lines = content.split('\n');
		let currentSection = '';

		for (const line of lines) {
			const trimmedLine = line.trim();
			
			if (trimmedLine.match(/^#{1,3}\s+.*component/i)) {
				currentSection = 'components';
			} else if (trimmedLine.match(/^#{1,3}\s+.*architecture/i)) {
				currentSection = 'architecture';
			} else if (trimmedLine.match(/^#{1,3}\s+.*tech.*stack/i)) {
				currentSection = 'techStack';
			} else if (trimmedLine.match(/^#{1,3}\s+.*ui|user.*interface/i)) {
				currentSection = 'uiRequirements';
			}

			if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
				const item = trimmedLine.substring(2);
				if (currentSection === 'components') {
					design.components.push(item);
				} else if (currentSection === 'techStack') {
					design.techStack.push(item);
				} else if (currentSection === 'uiRequirements') {
					design.uiRequirements.push(item);
				}
			} else if (currentSection === 'architecture' && trimmedLine) {
				design.architecture += (design.architecture ? ' ' : '') + trimmedLine;
			}
		}

		return design;
	}

	generateTasksPlan(requirements: ITaskGenerationRequirement[], design: any): ITaskGenerationPlan {
		const tasks: ITaskGenerationTask[] = [];
		const dependencies: { [taskId: string]: string[] } = {};

		// Generate foundation tasks first
		const foundationTask: ITaskGenerationTask = {
			id: 'foundation-setup',
			title: 'Foundation Setup',
			description: 'Set up project foundation, dependencies, and basic structure',
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
		};
		tasks.push(foundationTask);

		// Generate tasks for each requirement
		requirements.forEach((requirement, index) => {
			const taskId = `task-${requirement.id}`;
			const task: ITaskGenerationTask = {
				id: taskId,
				title: `Implement ${requirement.title}`,
				description: requirement.description,
				dependencies: index === 0 ? ['foundation-setup'] : [`task-${requirements[index - 1].id}`],
				requirementIds: [requirement.id],
				estimatedHours: this._estimateHours(requirement),
				implementation: {
					needsUnitTests: true,
					needsIntegrationTests: requirement.priority === 'high',
					needsLoadingStates: requirement.description.toLowerCase().includes('load') || 
									   requirement.description.toLowerCase().includes('fetch'),
					needsAccessibility: true,
					needsResponsiveness: requirement.description.toLowerCase().includes('ui') || 
									   requirement.description.toLowerCase().includes('interface')
				}
			};
			tasks.push(task);
			dependencies[taskId] = task.dependencies;
		});

		// Add testing and polish tasks
		const testingTask: ITaskGenerationTask = {
			id: 'integration-testing',
			title: 'Integration Testing',
			description: 'Comprehensive integration testing across all components',
			dependencies: tasks.slice(1).map(t => t.id), // Depends on all feature tasks
			requirementIds: requirements.map(r => r.id),
			estimatedHours: 8,
			implementation: {
				needsUnitTests: false,
				needsIntegrationTests: true,
				needsLoadingStates: false,
				needsAccessibility: true,
				needsResponsiveness: true
			}
		};
		tasks.push(testingTask);
		dependencies[testingTask.id] = testingTask.dependencies;

		return {
			tasks,
			dependencies,
			requirements
		};
	}

	formatTasksMarkdown(plan: ITaskGenerationPlan): string {
		const lines: string[] = [];
		
		lines.push('# Implementation Tasks');
		lines.push('');
		lines.push('This document contains the implementation plan generated from requirements and design specifications.');
		lines.push('');

		// Summary section
		lines.push('## Summary');
		lines.push('');
		lines.push(`- **Total Tasks**: ${plan.tasks.length}`);
		lines.push(`- **Total Requirements**: ${plan.requirements.length}`);
		lines.push(`- **Estimated Hours**: ${plan.tasks.reduce((sum, task) => sum + task.estimatedHours, 0)}`);
		lines.push('');

		// Requirements mapping
		lines.push('## Requirements');
		lines.push('');
		plan.requirements.forEach(req => {
			lines.push(`### ${req.title} (${req.id})`);
			lines.push('');
			lines.push(`**Priority**: ${req.priority}`);
			lines.push('');
			lines.push(req.description);
			lines.push('');
			if (req.acceptanceCriteria.length > 0) {
				lines.push('**Acceptance Criteria:**');
				req.acceptanceCriteria.forEach(criteria => {
					lines.push(`- ${criteria}`);
				});
				lines.push('');
			}
		});

		// Tasks section
		lines.push('## Tasks');
		lines.push('');

		// Sort tasks by dependencies (topological sort)
		const sortedTasks = this._topologicalSort(plan.tasks, plan.dependencies);
		
		sortedTasks.forEach((task, index) => {
			lines.push(`### ${index + 1}. ${task.title}`);
			lines.push('');
			lines.push(`**ID**: \`${task.id}\``);
			lines.push(`**Estimated Hours**: ${task.estimatedHours}`);
			lines.push('');
			lines.push(task.description);
			lines.push('');

			if (task.dependencies.length > 0) {
				lines.push('**Dependencies:**');
				task.dependencies.forEach(dep => {
					lines.push(`- ${dep}`);
				});
				lines.push('');
			}

			if (task.requirementIds.length > 0) {
				lines.push('**Related Requirements:**');
				task.requirementIds.forEach(reqId => {
					const requirement = plan.requirements.find(r => r.id === reqId);
					lines.push(`- [${requirement?.title || reqId}](#${reqId})`);
				});
				lines.push('');
			}

			lines.push('**Implementation Details:**');
			lines.push(`- Unit Tests: ${task.implementation.needsUnitTests ? '✓' : '✗'}`);
			lines.push(`- Integration Tests: ${task.implementation.needsIntegrationTests ? '✓' : '✗'}`);
			lines.push(`- Loading States: ${task.implementation.needsLoadingStates ? '✓' : '✗'}`);
			lines.push(`- Accessibility: ${task.implementation.needsAccessibility ? '✓' : '✗'}`);
			lines.push(`- Responsiveness: ${task.implementation.needsResponsiveness ? '✓' : '✗'}`);
			lines.push('');

			lines.push('**Status**: [ ] Not Started');
			lines.push('');
		});

		// Dependency graph
		lines.push('## Dependency Graph');
		lines.push('');
		lines.push('```');
		lines.push('Task Dependencies:');
		Object.entries(plan.dependencies).forEach(([taskId, deps]) => {
			if (deps.length > 0) {
				lines.push(`${taskId} -> [${deps.join(', ')}]`);
			}
		});
		lines.push('```');
		lines.push('');

		return lines.join('\n');
	}

	private _generateId(title: string): string {
		return title.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.replace(/\s+/g, '-')
			.substring(0, 50);
	}

	private _estimateHours(requirement: ITaskGenerationRequirement): number {
		let hours = 4; // Base hours

		// Adjust based on priority
		if (requirement.priority === 'high') {
			hours += 4;
		} else if (requirement.priority === 'low') {
			hours -= 1;
		}

		// Adjust based on acceptance criteria count
		hours += requirement.acceptanceCriteria.length * 0.5;

		// Adjust based on description complexity
		const words = requirement.description.split(' ').length;
		if (words > 50) {
			hours += 2;
		}

		return Math.max(2, Math.round(hours));
	}

	private _topologicalSort(tasks: ITaskGenerationTask[], dependencies: { [taskId: string]: string[] }): ITaskGenerationTask[] {
		const visited = new Set<string>();
		const visiting = new Set<string>();
		const result: ITaskGenerationTask[] = [];
		const taskMap = new Map(tasks.map(task => [task.id, task]));

		const visit = (taskId: string): void => {
			if (visiting.has(taskId)) {
				throw new Error(`Circular dependency detected involving task: ${taskId}`);
			}
			if (visited.has(taskId)) {
				return;
			}

			visiting.add(taskId);
			const deps = dependencies[taskId] || [];
			for (const dep of deps) {
				visit(dep);
			}
			visiting.delete(taskId);
			visited.add(taskId);

			const task = taskMap.get(taskId);
			if (task) {
				result.push(task);
			}
		};

		for (const task of tasks) {
			if (!visited.has(task.id)) {
				visit(task.id);
			}
		}

		return result;
	}
}