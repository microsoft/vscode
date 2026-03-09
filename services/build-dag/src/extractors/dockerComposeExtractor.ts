// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { readFile } from 'fs/promises';
import path from 'path';
import type { BuildTarget, ExtractionResult, ServiceDependency } from '../types';

/**
 * Extracts service dependency DAG from docker-compose.yml.
 *
 * Parses service definitions, depends_on relationships, ports,
 * health checks, and environment variables to build a service DAG.
 */
export async function extractDockerComposeDag(projectPath: string): Promise<ExtractionResult | null> {
	const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

	for (const filename of candidates) {
		const filePath = path.join(projectPath, filename);
		try {
			const content = await readFile(filePath, 'utf-8');
			return parseDockerCompose(content, projectPath, filename);
		} catch {
			// File doesn't exist, try next
		}
	}

	return null;
}

function parseDockerCompose(
	content: string,
	projectPath: string,
	sourceFile: string,
): ExtractionResult {
	const targets: BuildTarget[] = [];
	const services: ServiceDependency[] = [];
	const lines = content.split('\n');

	let inServices = false;
	let currentService: string | null = null;
	let currentDeps: string[] = [];
	let currentPort: number | undefined;
	let currentImage: string | undefined;
	let currentHealthCheck: string | undefined;
	let inDependsOn = false;
	let inHealthCheck = false;

	for (const line of lines) {
		const trimmed = line.trimEnd();
		const stripped = trimmed.trim();

		if (stripped === 'services:') {
			inServices = true;
			continue;
		}

		if (!inServices) {
			continue;
		}

		// Top-level service definition (2 spaces or 1 tab)
		const svcMatch = trimmed.match(/^(\s{2}|\t)([a-zA-Z][\w-]*):\s*$/);
		if (svcMatch) {
			// Save previous service
			if (currentService) {
				saveCurrent();
			}

			currentService = svcMatch[2];
			currentDeps = [];
			currentPort = undefined;
			currentImage = undefined;
			currentHealthCheck = undefined;
			inDependsOn = false;
			inHealthCheck = false;
			continue;
		}

		if (!currentService) {
			continue;
		}

		// depends_on section
		if (stripped === 'depends_on:') {
			inDependsOn = true;
			inHealthCheck = false;
			continue;
		}

		// healthcheck section
		if (stripped === 'healthcheck:') {
			inHealthCheck = true;
			inDependsOn = false;
			continue;
		}

		// Other top-level keys reset section tracking
		if (stripped.match(/^[a-z_]+:/) && !stripped.startsWith('-') && !stripped.startsWith('test:')) {
			if (!stripped.startsWith('condition:')) {
				inDependsOn = false;
				inHealthCheck = false;
			}
		}

		// depends_on entries
		if (inDependsOn) {
			const depMatch = stripped.match(/^-?\s*([a-zA-Z][\w-]*):?\s*$/);
			if (depMatch) {
				currentDeps.push(depMatch[1]);
			}
		}

		// Port mapping
		const portMatch = stripped.match(/["']?(\d+):(\d+)["']?/);
		if (portMatch && !currentPort) {
			currentPort = parseInt(portMatch[1], 10);
		}

		// Image
		const imageMatch = stripped.match(/^image:\s*(.+)/);
		if (imageMatch) {
			currentImage = imageMatch[1].trim();
		}

		// Health check test
		if (inHealthCheck) {
			const testMatch = stripped.match(/test:\s*\[.*"(.+)"\]/);
			if (testMatch) {
				currentHealthCheck = testMatch[1];
			}
		}

		// Non-service top-level key ends services section
		if (!trimmed.startsWith(' ') && !trimmed.startsWith('\t') && trimmed.length > 0
			&& trimmed !== 'services:' && !trimmed.startsWith('#')) {
			if (currentService) {
				saveCurrent();
				currentService = null;
			}
			inServices = false;
		}
	}

	// Save last service
	if (currentService) {
		saveCurrent();
	}

	function saveCurrent(): void {
		if (!currentService) {
			return;
		}

		services.push({
			name: currentService,
			port: currentPort,
			healthCheck: currentHealthCheck,
			dockerImage: currentImage,
		});

		targets.push({
			name: `docker:${currentService}`,
			command: `docker compose up ${currentService}`,
			ecosystem: 'docker',
			workingDir: projectPath,
			dependsOn: currentDeps.map(d => `docker:${d}`),
			envVars: [],
			services: currentDeps.map(d => ({ name: d })),
		});
	}

	return {
		ecosystem: 'docker',
		targets,
		services,
		extractedAt: Date.now(),
		sourceFiles: [sourceFile],
	};
}
