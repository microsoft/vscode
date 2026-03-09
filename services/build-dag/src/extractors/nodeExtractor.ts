// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { readFile } from 'fs/promises';
import path from 'path';
import type { BuildTarget, ExtractionResult, EnvVarRequirement, ServiceDependency } from '../types';

/**
 * Extracts build DAG from Node.js/npm/pnpm projects.
 *
 * Parses package.json scripts and infers dependencies between them.
 * Also detects monorepo tools (Nx, Turborepo) and defers to their
 * native dependency graphs when available.
 */
export async function extractNodeDag(projectPath: string): Promise<ExtractionResult> {
	const targets: BuildTarget[] = [];
	const services: ServiceDependency[] = [];
	const sourceFiles: string[] = [];

	// Try to read the root package.json
	const packageJsonPath = path.join(projectPath, 'package.json');
	try {
		const raw = await readFile(packageJsonPath, 'utf-8');
		sourceFiles.push('package.json');
		const pkg = JSON.parse(raw);
		const scripts: Record<string, string> = pkg.scripts ?? {};

		for (const [name, command] of Object.entries(scripts)) {
			const deps = inferScriptDependencies(name, scripts);
			const envVars = inferEnvVars(command);

			targets.push({
				name,
				command: `npm run ${name}`,
				ecosystem: 'node',
				workingDir: projectPath,
				dependsOn: deps,
				envVars,
				services: [],
				watchPatterns: inferWatchPatterns(name),
			});
		}
	} catch {
		// No package.json — not a Node project
	}

	// Try to detect Docker Compose services referenced in scripts
	const composePath = path.join(projectPath, 'docker-compose.yml');
	try {
		const raw = await readFile(composePath, 'utf-8');
		sourceFiles.push('docker-compose.yml');
		const composeSvcs = extractDockerComposeServices(raw);
		services.push(...composeSvcs);
	} catch {
		// No docker-compose.yml
	}

	return {
		ecosystem: 'node',
		targets,
		services,
		extractedAt: Date.now(),
		sourceFiles,
	};
}

/**
 * Infer dependencies between npm scripts based on naming conventions.
 *
 * Common patterns:
 * - "preX" runs before "X"
 * - "test" typically depends on "build"
 * - "start" may depend on "build"
 * - Scripts using "npm run X" inline depend on X
 */
function inferScriptDependencies(
	name: string,
	scripts: Record<string, string>,
): string[] {
	const deps: string[] = [];
	const command = scripts[name] ?? '';

	// Check for pre-script
	if (scripts[`pre${name}`]) {
		deps.push(`pre${name}`);
	}

	// Check for inline npm run references
	const npmRunPattern = /npm run (\S+)/g;
	let match;
	while ((match = npmRunPattern.exec(command)) !== null) {
		const target = match[1];
		if (target !== name && scripts[target]) {
			deps.push(target);
		}
	}

	// Common conventions
	if (name === 'test' && scripts['build'] && !deps.includes('build')) {
		deps.push('build');
	}
	if (name === 'start' && scripts['build'] && !deps.includes('build')) {
		deps.push('build');
	}

	return [...new Set(deps)];
}

/** Extract environment variable references from a command string. */
function inferEnvVars(command: string): EnvVarRequirement[] {
	const vars: EnvVarRequirement[] = [];
	const seen = new Set<string>();

	// Match $VAR and ${VAR} patterns
	const patterns = [/\$\{([A-Z_][A-Z0-9_]*)\}/g, /\$([A-Z_][A-Z0-9_]*)/g];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(command)) !== null) {
			const name = match[1];
			if (!seen.has(name)) {
				seen.add(name);
				vars.push({
					name,
					required: true,
				});
			}
		}
	}

	return vars;
}

/** Infer which files to watch for a given script name. */
function inferWatchPatterns(name: string): string[] {
	if (name.startsWith('test')) {
		return ['src/**/*', 'test/**/*'];
	}
	if (name === 'build' || name === 'compile') {
		return ['src/**/*'];
	}
	if (name === 'lint') {
		return ['src/**/*', '.eslintrc*', 'eslint.config.*'];
	}
	return ['src/**/*'];
}

/** Extract service definitions from a docker-compose.yml string. */
function extractDockerComposeServices(yamlContent: string): ServiceDependency[] {
	const services: ServiceDependency[] = [];

	// Simple YAML parsing for services section — look for service names and ports
	const lines = yamlContent.split('\n');
	let inServices = false;
	let currentService: string | null = null;
	let indent = 0;

	for (const line of lines) {
		const trimmed = line.trimEnd();

		if (trimmed === 'services:') {
			inServices = true;
			indent = 0;
			continue;
		}

		if (!inServices) {
			continue;
		}

		// Top-level keys under services (2-space or tab indent)
		const serviceMatch = trimmed.match(/^(\s{2}|\t)(\w[\w-]*):\s*$/);
		if (serviceMatch) {
			currentService = serviceMatch[2];
			services.push({ name: currentService });
			continue;
		}

		// Look for port mappings
		if (currentService && trimmed.includes('- "') && trimmed.includes(':')) {
			const portMatch = trimmed.match(/["']?(\d+):(\d+)["']?/);
			if (portMatch) {
				const svc = services.find(s => s.name === currentService);
				if (svc) {
					svc.port = parseInt(portMatch[1], 10);
				}
			}
		}

		// Look for image references
		if (currentService) {
			const imageMatch = trimmed.match(/image:\s*(.+)/);
			if (imageMatch) {
				const svc = services.find(s => s.name === currentService);
				if (svc) {
					svc.dockerImage = imageMatch[1].trim();
				}
			}
		}

		// Detect end of services block
		if (!trimmed.startsWith(' ') && !trimmed.startsWith('\t') && trimmed.length > 0 && trimmed !== 'services:') {
			if (!trimmed.startsWith('#')) {
				inServices = false;
			}
		}
	}

	return services;
}
