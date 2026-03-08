// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import {
	RequirementsSpec,
	DesignSpec,
	TasksSpec,
	EarsRequirement,
	UserStory,
	FileAction,
	SpecTask,
} from './types';

/**
 * Generate a requirements.md from a structured RequirementsSpec.
 */
export function generateRequirementsMarkdown(spec: RequirementsSpec): string {
	const sections: string[] = [];

	sections.push(`# ${spec.title}`);
	sections.push('');

	// User Stories
	if (spec.userStories.length > 0) {
		sections.push('## User Stories');
		sections.push('');
		for (const story of spec.userStories) {
			if (story.benefit) {
				sections.push(`- As ${prefixArticle(story.role)}, I need ${story.need} so that ${story.benefit}.`);
			} else {
				sections.push(`- ${story.rawText}`);
			}
		}
		sections.push('');
	}

	// Requirements
	if (spec.requirements.length > 0) {
		sections.push('## Requirements');
		sections.push('');
		for (const req of spec.requirements) {
			sections.push(`### ${req.id}: ${req.title}`);
			sections.push(formatEarsRequirement(req));
			sections.push('');
		}
	}

	// Edge Cases
	if (spec.edgeCases.length > 0) {
		sections.push('## Edge Cases');
		sections.push('');
		for (const ec of spec.edgeCases) {
			sections.push(`- ${ec}`);
		}
		sections.push('');
	}

	// Out of Scope
	if (spec.outOfScope.length > 0) {
		sections.push('## Out of Scope');
		sections.push('');
		for (const oos of spec.outOfScope) {
			sections.push(`- ${oos}`);
		}
		sections.push('');
	}

	return sections.join('\n');
}

/**
 * Generate a design.md from a structured DesignSpec.
 */
export function generateDesignMarkdown(spec: DesignSpec): string {
	const sections: string[] = [];

	sections.push(`# ${spec.title}`);
	sections.push('');

	sections.push('## Approach');
	sections.push('');
	sections.push(spec.approach);
	sections.push('');

	if (spec.dataModel) {
		sections.push('## Data Model');
		sections.push('');
		sections.push(spec.dataModel);
		sections.push('');
	}

	for (const diagram of spec.diagrams) {
		if (diagram.title) {
			sections.push(`## ${diagram.title}`);
			sections.push('');
		}
		sections.push(`\`\`\`${diagram.type}`);
		sections.push(diagram.content);
		sections.push('```');
		sections.push('');
	}

	if (spec.fileActions.length > 0) {
		sections.push('## Files to Create/Modify');
		sections.push('');
		for (const fa of spec.fileActions) {
			const desc = fa.description ? ` (${fa.description})` : '';
			sections.push(`- ${fa.action}: ${fa.path}${desc}`);
		}
		sections.push('');
	}

	return sections.join('\n');
}

/**
 * Generate a tasks.md from a structured TasksSpec.
 */
export function generateTasksMarkdown(spec: TasksSpec): string {
	const sections: string[] = [];

	sections.push(`# ${spec.title}`);
	sections.push('');

	sections.push('## Task Order (dependency graph)');
	sections.push('');
	sections.push(spec.executionOrder);
	sections.push('');

	sections.push('## Tasks');
	sections.push('');

	for (const task of spec.tasks) {
		sections.push(`### Task ${task.id}: ${task.title}`);
		sections.push(`- **Status:** ${task.status}`);
		sections.push(`- **Agent:** ${task.agent}`);
		sections.push(`- **Files:** ${task.files.join(', ')}`);
		if (task.dependsOn.length > 0) {
			const deps = task.dependsOn.map(d => `Task ${d}`).join(', ');
			sections.push(`- **Depends on:** ${deps}`);
		}
		sections.push(`- **Description:** ${task.description}`);
		sections.push('');
	}

	return sections.join('\n');
}

/**
 * Format a single EARS requirement back to its canonical text.
 */
function formatEarsRequirement(req: EarsRequirement): string {
	switch (req.pattern) {
		case 'event-driven':
			return `WHEN ${req.trigger},\nthe system SHALL ${req.action}`;
		case 'state-driven':
			return `WHILE ${req.state},\nthe system SHALL ${req.action}`;
		case 'optional':
			return `WHERE ${req.feature},\nthe system SHALL ${req.action}`;
		case 'unwanted':
			return `IF ${req.condition},\nTHEN the system SHALL ${req.action}`;
		case 'ubiquitous':
			return `the system SHALL ${req.action}`;
		default:
			return req.rawText;
	}
}

/**
 * Add 'a' or 'an' article before a role name if it doesn't already have one.
 */
function prefixArticle(role: string): string {
	if (/^(a|an)\s/i.test(role)) {
		return role;
	}
	const vowels = 'aeiou';
	const article = vowels.includes(role.charAt(0).toLowerCase()) ? 'an' : 'a';
	return `${article} ${role}`;
}
