// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import {
	EarsPattern,
	EarsRequirement,
	UserStory,
	RequirementsSpec,
	DesignSpec,
	DesignDiagram,
	FileAction,
	TasksSpec,
	SpecTask,
	SpecAgentHandle,
	TaskStatus,
} from './types';

/**
 * Parse a requirements.md file into a structured RequirementsSpec.
 */
export function parseRequirements(markdown: string): RequirementsSpec {
	const title = extractTitle(markdown);
	const userStories = parseUserStories(markdown);
	const requirements = parseEarsRequirements(markdown);
	const edgeCases = parseListSection(markdown, 'Edge Cases');
	const outOfScope = parseListSection(markdown, 'Out of Scope');

	return { title, userStories, requirements, edgeCases, outOfScope };
}

/**
 * Parse a design.md file into a structured DesignSpec.
 */
export function parseDesign(markdown: string): DesignSpec {
	const title = extractTitle(markdown);
	const approach = extractSection(markdown, 'Approach');
	const dataModel = extractSectionOrUndefined(markdown, 'Data Model');
	const diagrams = parseDiagrams(markdown);
	const fileActions = parseFileActions(markdown);

	return { title, approach, dataModel, diagrams, fileActions, rawContent: markdown };
}

/**
 * Parse a tasks.md file into a structured TasksSpec.
 */
export function parseTasks(markdown: string): TasksSpec {
	const title = extractTitle(markdown);
	const executionOrder = extractSection(markdown, 'Task Order');
	const tasks = parseTaskBlocks(markdown);

	return { title, executionOrder, tasks };
}

/**
 * Extract the H1 title from a markdown document.
 */
function extractTitle(markdown: string): string {
	const match = markdown.match(/^#\s+(.+)$/m);
	return match ? match[1].trim() : 'Untitled';
}

/**
 * Parse user stories from the "User Stories" section.
 */
function parseUserStories(markdown: string): UserStory[] {
	const section = extractSection(markdown, 'User Stories');
	if (!section) {
		return [];
	}

	const stories: UserStory[] = [];
	const lines = section.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
			continue;
		}

		const storyText = trimmed.replace(/^[-*]\s*/, '');
		const storyMatch = storyText.match(
			/As an?\s+(?<role>.+?),\s+I\s+(?:need|want)\s+(?<need>.+?)\s+so\s+that\s+(?<benefit>.+)/i
		);

		if (storyMatch?.groups) {
			stories.push({
				role: storyMatch.groups['role'].trim(),
				need: storyMatch.groups['need'].trim(),
				benefit: storyMatch.groups['benefit'].trim().replace(/\.$/, ''),
				rawText: storyText,
			});
		} else {
			stories.push({
				role: 'user',
				need: storyText,
				benefit: '',
				rawText: storyText,
			});
		}
	}

	return stories;
}

/**
 * Parse EARS-formatted requirements from the "Requirements" section.
 */
function parseEarsRequirements(markdown: string): EarsRequirement[] {
	const requirements: EarsRequirement[] = [];

	// Match requirement blocks: ### REQ-NNN: Title followed by body
	const reqBlockRegex = /###\s+(?<id>REQ-\d+):\s*(?<title>.+)\n(?<body>[\s\S]*?)(?=\n###\s|$)/g;
	let match;

	while ((match = reqBlockRegex.exec(markdown)) !== null) {
		const id = match.groups!['id'];
		const title = match.groups!['title'].trim();
		const body = match.groups!['body'].trim();

		const parsed = classifyEarsRequirement(id, title, body);
		requirements.push(parsed);
	}

	return requirements;
}

/**
 * Classify an EARS requirement by its syntactic pattern.
 */
function classifyEarsRequirement(id: string, title: string, body: string): EarsRequirement {
	const normalised = body.replace(/\s+/g, ' ').trim();

	// Event-driven: WHEN <trigger>, the system SHALL <action>
	const whenMatch = normalised.match(
		/WHEN\s+(?<trigger>.+?),?\s+the\s+system\s+SHALL\s+(?<action>.+)/i
	);
	if (whenMatch?.groups) {
		return {
			id, title,
			pattern: 'event-driven',
			trigger: whenMatch.groups['trigger'].trim(),
			action: whenMatch.groups['action'].trim(),
			rawText: body,
		};
	}

	// State-driven: WHILE <state>, the system SHALL <action>
	const whileMatch = normalised.match(
		/WHILE\s+(?<state>.+?),?\s+the\s+system\s+SHALL\s+(?<action>.+)/i
	);
	if (whileMatch?.groups) {
		return {
			id, title,
			pattern: 'state-driven',
			state: whileMatch.groups['state'].trim(),
			action: whileMatch.groups['action'].trim(),
			rawText: body,
		};
	}

	// Optional: WHERE <feature>, the system SHALL <action>
	const whereMatch = normalised.match(
		/WHERE\s+(?<feature>.+?),?\s+the\s+system\s+SHALL\s+(?<action>.+)/i
	);
	if (whereMatch?.groups) {
		return {
			id, title,
			pattern: 'optional',
			feature: whereMatch.groups['feature'].trim(),
			action: whereMatch.groups['action'].trim(),
			rawText: body,
		};
	}

	// Unwanted: IF <condition>, THEN the system SHALL <action>
	const ifMatch = normalised.match(
		/IF\s+(?<condition>.+?),?\s+THEN\s+the\s+system\s+SHALL\s+(?<action>.+)/i
	);
	if (ifMatch?.groups) {
		return {
			id, title,
			pattern: 'unwanted',
			condition: ifMatch.groups['condition'].trim(),
			action: ifMatch.groups['action'].trim(),
			rawText: body,
		};
	}

	// FOR EACH pattern (treat as ubiquitous with action)
	const forEachMatch = normalised.match(
		/FOR\s+EACH\s+(?<trigger>.+?),?\s+the\s+system\s+SHALL\s+(?<action>.+)/i
	);
	if (forEachMatch?.groups) {
		return {
			id, title,
			pattern: 'event-driven',
			trigger: `each ${forEachMatch.groups['trigger'].trim()}`,
			action: forEachMatch.groups['action'].trim(),
			rawText: body,
		};
	}

	// Ubiquitous: the system SHALL <action>
	const shallMatch = normalised.match(
		/the\s+system\s+SHALL\s+(?<action>.+)/i
	);
	if (shallMatch?.groups) {
		return {
			id, title,
			pattern: 'ubiquitous',
			action: shallMatch.groups['action'].trim(),
			rawText: body,
		};
	}

	// Fallback: unrecognised pattern
	return {
		id, title,
		pattern: 'complex',
		action: normalised,
		rawText: body,
	};
}

/**
 * Parse Mermaid diagrams from a markdown document.
 */
function parseDiagrams(markdown: string): DesignDiagram[] {
	const diagrams: DesignDiagram[] = [];
	const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;

	let match;
	while ((match = mermaidRegex.exec(markdown)) !== null) {
		diagrams.push({
			type: 'mermaid',
			content: match[1].trim(),
		});
	}

	return diagrams;
}

/**
 * Parse file actions (CREATE/MODIFY/DELETE) from the design document.
 */
function parseFileActions(markdown: string): FileAction[] {
	const section = extractSection(markdown, 'Files to Create/Modify')
		|| extractSection(markdown, 'File Plan')
		|| extractSection(markdown, 'Files');

	if (!section) {
		return [];
	}

	const actions: FileAction[] = [];
	const lines = section.split('\n');

	for (const line of lines) {
		const trimmed = line.trim().replace(/^[-*]\s*/, '');
		const actionMatch = trimmed.match(
			/^(?<action>CREATE|MODIFY|DELETE):\s*(?<path>\S+)(?:\s*\((?<desc>.+)\))?/i
		);

		if (actionMatch?.groups) {
			actions.push({
				action: actionMatch.groups['action'].toUpperCase() as FileAction['action'],
				path: actionMatch.groups['path'],
				description: actionMatch.groups['desc']?.trim(),
			});
		}
	}

	return actions;
}

/**
 * Parse task blocks from tasks.md.
 */
function parseTaskBlocks(markdown: string): SpecTask[] {
	const tasks: SpecTask[] = [];
	const taskBlockRegex = /###\s+Task\s+(?<num>\d+):\s*(?<title>.+)\n(?<body>[\s\S]*?)(?=\n###\s|$)/g;

	let match;
	while ((match = taskBlockRegex.exec(markdown)) !== null) {
		const id = parseInt(match.groups!['num'], 10);
		const title = match.groups!['title'].trim();
		const body = match.groups!['body'];

		const status = extractField(body, 'Status') as TaskStatus || 'pending';
		const agent = extractField(body, 'Agent') as SpecAgentHandle || 'anton-code';
		const files = extractField(body, 'Files')
			?.split(',')
			.map(f => f.trim().replace(/\s*\(.+\)\s*$/, '')) ?? [];
		const dependsOnRaw = extractField(body, 'Depends on');
		const dependsOn = dependsOnRaw
			? dependsOnRaw.match(/\d+/g)?.map(Number) ?? []
			: [];
		const description = extractField(body, 'Description') || title;

		tasks.push({ id, title, status, agent, files, dependsOn, description });
	}

	return tasks;
}

/**
 * Extract a markdown section by its heading name.
 */
function extractSection(markdown: string, heading: string): string {
	const headingRegex = new RegExp(
		`^#{1,4}\\s+${escapeRegex(heading)}\\s*$`,
		'm'
	);
	const match = markdown.match(headingRegex);
	if (!match || match.index === undefined) {
		return '';
	}

	const headingLevel = match[0].match(/^#+/)![0].length;
	const startIndex = match.index + match[0].length;
	const rest = markdown.substring(startIndex);

	// Find the next heading at the same or higher level
	const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s`, 'm');
	const nextMatch = rest.match(nextHeadingRegex);

	const sectionContent = nextMatch && nextMatch.index !== undefined
		? rest.substring(0, nextMatch.index)
		: rest;

	return sectionContent.trim();
}

function extractSectionOrUndefined(markdown: string, heading: string): string | undefined {
	const result = extractSection(markdown, heading);
	return result || undefined;
}

/**
 * Parse a list section (bullet points) by heading name.
 */
function parseListSection(markdown: string, heading: string): string[] {
	const section = extractSection(markdown, heading);
	if (!section) {
		return [];
	}

	return section
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.startsWith('-') || line.startsWith('*'))
		.map(line => line.replace(/^[-*]\s*/, '').trim());
}

/**
 * Extract a key-value field from a task body (e.g., "- **Status:** pending").
 */
function extractField(body: string, fieldName: string): string | undefined {
	const regex = new RegExp(`-\\s*\\*\\*${escapeRegex(fieldName)}:\\*\\*\\s*(.+)`, 'i');
	const match = body.match(regex);
	return match ? match[1].trim() : undefined;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
