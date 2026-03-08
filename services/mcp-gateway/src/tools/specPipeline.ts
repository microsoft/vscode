// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import fs from 'fs';
import path from 'path';

const SPECS_DIR = '.son-of-anton/specs';

export interface SpecListResult {
	features: SpecFeatureSummary[];
}

export interface SpecFeatureSummary {
	name: string;
	specDir: string;
	hasRequirements: boolean;
	hasDesign: boolean;
	hasTasks: boolean;
	hasProperties: boolean;
}

export interface SpecReadInput {
	feature: string;
	phase: 'requirements' | 'design' | 'tasks' | 'properties';
}

export interface SpecReadResult {
	feature: string;
	phase: string;
	content: string;
	exists: boolean;
}

export interface SpecSyncCheckInput {
	feature: string;
	changedFile: string;
}

export interface SpecSyncCheckResult {
	affected: boolean;
	warnings: string[];
}

/**
 * List all features with specs in the workspace.
 */
export async function specList(projectPath: string): Promise<SpecListResult> {
	const specsPath = path.join(projectPath, SPECS_DIR);

	if (!fs.existsSync(specsPath)) {
		return { features: [] };
	}

	const entries = fs.readdirSync(specsPath, { withFileTypes: true });
	const features: SpecFeatureSummary[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		const featureDir = path.join(specsPath, entry.name);
		features.push({
			name: entry.name,
			specDir: `${SPECS_DIR}/${entry.name}`,
			hasRequirements: fs.existsSync(path.join(featureDir, 'requirements.md')),
			hasDesign: fs.existsSync(path.join(featureDir, 'design.md')),
			hasTasks: fs.existsSync(path.join(featureDir, 'tasks.md')),
			hasProperties: fs.existsSync(path.join(featureDir, 'properties.test.ts')),
		});
	}

	return { features };
}

/**
 * Read the content of a spec file for a feature.
 */
export async function specRead(
	projectPath: string,
	input: SpecReadInput,
): Promise<SpecReadResult> {
	const fileMap: Record<string, string> = {
		requirements: 'requirements.md',
		design: 'design.md',
		tasks: 'tasks.md',
		properties: 'properties.test.ts',
	};

	const fileName = fileMap[input.phase];
	if (!fileName) {
		return { feature: input.feature, phase: input.phase, content: '', exists: false };
	}

	const slug = input.feature.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const filePath = path.join(projectPath, SPECS_DIR, slug, fileName);

	if (!fs.existsSync(filePath)) {
		return { feature: input.feature, phase: input.phase, content: '', exists: false };
	}

	const content = fs.readFileSync(filePath, 'utf-8');
	return { feature: input.feature, phase: input.phase, content, exists: true };
}

/**
 * Check if a changed file affects any spec.
 */
export async function specSyncCheck(
	projectPath: string,
	input: SpecSyncCheckInput,
): Promise<SpecSyncCheckResult> {
	const slug = input.feature.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const tasksPath = path.join(projectPath, SPECS_DIR, slug, 'tasks.md');

	if (!fs.existsSync(tasksPath)) {
		return { affected: false, warnings: [] };
	}

	const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
	const normalisedChangedFile = input.changedFile.replace(/^\.\//, '').replace(/^\//, '');

	const warnings: string[] = [];
	const fileFieldRegex = /-\s*\*\*Files:\*\*\s*(.+)/g;

	let match;
	while ((match = fileFieldRegex.exec(tasksContent)) !== null) {
		const files = match[1].split(',').map(f =>
			f.trim().replace(/\s*\(.+\)\s*$/, '').replace(/^\.\//, '').replace(/^\//, '')
		);

		for (const file of files) {
			if (normalisedChangedFile.endsWith(file) || file.endsWith(normalisedChangedFile)) {
				warnings.push(
					`File "${input.changedFile}" is referenced by spec "${input.feature}". ` +
					`Review the spec to ensure it remains consistent.`
				);
			}
		}
	}

	return { affected: warnings.length > 0, warnings };
}
