// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { readFile } from 'fs/promises';
import path from 'path';
import type { BuildTarget, ExtractionResult } from '../types';

/**
 * Extracts build DAG from Makefiles, Justfiles, and Taskfiles.
 *
 * These tools express explicit DAGs via target dependencies:
 * ```makefile
 * test: build migrate
 * build: install
 * ```
 */
export async function extractMakeDag(projectPath: string): Promise<ExtractionResult | null> {
	// Try each file type in order of preference
	const candidates = [
		{ file: 'Makefile', ecosystem: 'make' as const },
		{ file: 'Justfile', ecosystem: 'just' as const },
		{ file: 'Taskfile.yml', ecosystem: 'task' as const },
	];

	for (const candidate of candidates) {
		const filePath = path.join(projectPath, candidate.file);
		try {
			const content = await readFile(filePath, 'utf-8');
			const targets = candidate.ecosystem === 'task'
				? extractTaskfileTargets(content, projectPath)
				: extractMakeTargets(content, projectPath, candidate.ecosystem);

			return {
				ecosystem: candidate.ecosystem,
				targets,
				services: [],
				extractedAt: Date.now(),
				sourceFiles: [candidate.file],
			};
		} catch {
			// File doesn't exist, try next
		}
	}

	return null;
}

/** Parse Makefile/Justfile targets and dependencies. */
function extractMakeTargets(
	content: string,
	projectPath: string,
	ecosystem: 'make' | 'just',
): BuildTarget[] {
	const targets: BuildTarget[] = [];
	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Match target definitions: "target: dep1 dep2"
		const match = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)/);
		if (!match) {
			continue;
		}

		const name = match[1];
		const depsStr = match[2].trim();
		const deps = depsStr ? depsStr.split(/\s+/).filter(d => !d.startsWith('#')) : [];

		// Collect the recipe lines (indented with tab)
		const recipe: string[] = [];
		let j = i + 1;
		while (j < lines.length && (lines[j].startsWith('\t') || lines[j].startsWith('    '))) {
			recipe.push(lines[j].trim());
			j++;
		}

		const command = ecosystem === 'make'
			? `make ${name}`
			: `just ${name}`;

		targets.push({
			name,
			command,
			ecosystem,
			workingDir: projectPath,
			dependsOn: deps,
			envVars: [],
			services: [],
		});
	}

	return targets;
}

/** Parse Taskfile.yml targets (YAML format). */
function extractTaskfileTargets(content: string, projectPath: string): BuildTarget[] {
	const targets: BuildTarget[] = [];
	const lines = content.split('\n');

	let inTasks = false;
	let currentTask: string | null = null;
	let currentDeps: string[] = [];

	for (const line of lines) {
		const trimmed = line.trimEnd();

		if (trimmed === 'tasks:') {
			inTasks = true;
			continue;
		}

		if (!inTasks) {
			continue;
		}

		// Task name (2 spaces indent)
		const taskMatch = trimmed.match(/^\s{2}(\w[\w-]*):/);
		if (taskMatch) {
			// Save previous task
			if (currentTask) {
				targets.push({
					name: currentTask,
					command: `task ${currentTask}`,
					ecosystem: 'task',
					workingDir: projectPath,
					dependsOn: currentDeps,
					envVars: [],
					services: [],
				});
			}
			currentTask = taskMatch[1];
			currentDeps = [];
			continue;
		}

		// Dependencies
		const depMatch = trimmed.match(/^\s+-\s+task:\s+(\S+)/);
		if (depMatch && currentTask) {
			currentDeps.push(depMatch[1]);
		}
	}

	// Don't forget the last task
	if (currentTask) {
		targets.push({
			name: currentTask,
			command: `task ${currentTask}`,
			ecosystem: 'task',
			workingDir: projectPath,
			dependsOn: currentDeps,
			envVars: [],
			services: [],
		});
	}

	return targets;
}
