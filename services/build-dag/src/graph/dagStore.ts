// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type { BuildTarget, ServiceDependency, BuildOrder, BuildOrderStep, EnvironmentRequirements, AffectedTargets, AffectedTarget } from '../types';

/**
 * Stores and queries the build DAG.
 *
 * In production this would write to FalkorDB alongside the code graph.
 * This in-memory implementation provides the same query interface for
 * standalone use and testing.
 */
export class DagStore {
	private targets = new Map<string, BuildTarget>();
	private services = new Map<string, ServiceDependency>();
	private extractedAt = 0;

	/** Load targets and services into the store, replacing any existing data. */
	load(targets: BuildTarget[], services: ServiceDependency[]): void {
		this.targets.clear();
		this.services.clear();

		for (const target of targets) {
			this.targets.set(target.name, target);
		}
		for (const service of services) {
			this.services.set(service.name, service);
		}

		this.extractedAt = Date.now();
	}

	/** List all build targets, optionally filtered by ecosystem. */
	listTargets(ecosystem?: string): BuildTarget[] {
		const all = Array.from(this.targets.values());
		if (ecosystem) {
			return all.filter(t => t.ecosystem === ecosystem);
		}
		return all;
	}

	/** Get the ordered list of targets to reach a given target (topological sort). */
	buildOrder(targetName: string): BuildOrder {
		const target = this.targets.get(targetName);
		if (!target) {
			throw new Error(`Target not found: ${targetName}`);
		}

		const visited = new Set<string>();
		const order: BuildOrderStep[] = [];

		const visit = (name: string): void => {
			if (visited.has(name)) {
				return;
			}
			visited.add(name);

			const t = this.targets.get(name);
			if (!t) {
				return;
			}

			// Visit dependencies first
			for (const dep of t.dependsOn) {
				visit(dep);
			}

			order.push({
				order: order.length + 1,
				target: name,
				command: t.command,
				workingDir: t.workingDir,
			});
		};

		visit(targetName);

		return {
			target: targetName,
			steps: order,
		};
	}

	/** Get all environment requirements for a target and its transitive dependencies. */
	environmentRequirements(targetName: string): EnvironmentRequirements {
		const target = this.targets.get(targetName);
		if (!target) {
			throw new Error(`Target not found: ${targetName}`);
		}

		const visited = new Set<string>();
		const allEnvVars = new Map<string, BuildTarget['envVars'][0]>();
		const allServices = new Map<string, ServiceDependency>();
		const prerequisites: string[] = [];

		const visit = (name: string): void => {
			if (visited.has(name)) {
				return;
			}
			visited.add(name);

			const t = this.targets.get(name);
			if (!t) {
				return;
			}

			for (const dep of t.dependsOn) {
				visit(dep);
				if (dep !== targetName) {
					prerequisites.push(dep);
				}
			}

			for (const env of t.envVars) {
				allEnvVars.set(env.name, env);
			}

			for (const svc of t.services) {
				const full = this.services.get(svc.name) ?? svc;
				allServices.set(svc.name, full);
			}
		};

		visit(targetName);

		return {
			target: targetName,
			envVars: Array.from(allEnvVars.values()),
			services: Array.from(allServices.values()),
			prerequisites: [...new Set(prerequisites)],
		};
	}

	/** Find targets affected by changes to specific files. */
	affectedTargets(changedFiles: string[]): AffectedTargets {
		const affected: AffectedTarget[] = [];

		for (const target of this.targets.values()) {
			if (!target.watchPatterns) {
				continue;
			}

			for (const file of changedFiles) {
				for (const pattern of target.watchPatterns) {
					if (matchesGlob(file, pattern)) {
						affected.push({
							name: target.name,
							reason: `File ${file} matches watch pattern ${pattern}`,
						});
						break;
					}
				}
			}
		}

		// Also include targets that depend on affected targets
		const affectedNames = new Set(affected.map(a => a.name));
		let changed = true;
		while (changed) {
			changed = false;
			for (const target of this.targets.values()) {
				if (affectedNames.has(target.name)) {
					continue;
				}
				for (const dep of target.dependsOn) {
					if (affectedNames.has(dep)) {
						affectedNames.add(target.name);
						affected.push({
							name: target.name,
							reason: `Depends on affected target ${dep}`,
						});
						changed = true;
						break;
					}
				}
			}
		}

		return { changedFiles, affectedTargets: affected };
	}

	get lastExtractedAt(): number {
		return this.extractedAt;
	}

	get targetCount(): number {
		return this.targets.size;
	}
}

/** Simple glob matching for watch patterns. */
function matchesGlob(filePath: string, pattern: string): boolean {
	// Convert glob pattern to regex
	const regexStr = pattern
		.replace(/\*\*/g, '{{DOUBLESTAR}}')
		.replace(/\*/g, '[^/]*')
		.replace(/\{\{DOUBLESTAR\}\}/g, '.*')
		.replace(/\./g, '\\.')
		.replace(/\?/g, '.');

	try {
		const regex = new RegExp(`^${regexStr}$`);
		return regex.test(filePath);
	} catch {
		return false;
	}
}
