// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Type definitions for the build system DAG.
 *
 * The build DAG captures operational knowledge about a project:
 * - Targets/tasks: things that can be built or run
 * - Dependencies: what must complete before what
 * - Environment requirements: what variables and services each target needs
 * - External service dependencies: what must be running
 */

// ---------------------------------------------------------------------------
// Core DAG types
// ---------------------------------------------------------------------------

/** A build/run/test target in the project. */
export interface BuildTarget {
	name: string;
	command: string;
	ecosystem: Ecosystem;
	workingDir: string;
	description?: string;
	estimatedDuration?: string;
	dependsOn: string[];
	envVars: EnvVarRequirement[];
	services: ServiceDependency[];
	watchPatterns?: string[];
}

export type Ecosystem =
	| 'node'
	| 'rust'
	| 'python'
	| 'docker'
	| 'make'
	| 'just'
	| 'task'
	| 'custom';

/** An environment variable requirement for a target. */
export interface EnvVarRequirement {
	name: string;
	required: boolean;
	defaultValue?: string;
	description?: string;
}

/** An external service a target depends on. */
export interface ServiceDependency {
	name: string;
	port?: number;
	healthCheck?: string;
	dockerImage?: string;
}

// ---------------------------------------------------------------------------
// Extraction results
// ---------------------------------------------------------------------------

/** Result of extracting a build DAG from project files. */
export interface ExtractionResult {
	ecosystem: Ecosystem;
	targets: BuildTarget[];
	services: ServiceDependency[];
	extractedAt: number;
	sourceFiles: string[];
}

// ---------------------------------------------------------------------------
// Query results
// ---------------------------------------------------------------------------

/** Ordered list of targets to reach a goal target (topological sort). */
export interface BuildOrder {
	target: string;
	steps: BuildOrderStep[];
	totalEstimatedDuration?: string;
}

export interface BuildOrderStep {
	order: number;
	target: string;
	command: string;
	workingDir: string;
	canRunInParallel?: string[];
}

/** Everything needed to run a specific target. */
export interface EnvironmentRequirements {
	target: string;
	envVars: EnvVarRequirement[];
	services: ServiceDependency[];
	prerequisites: string[];
}

/** Targets affected by file changes. */
export interface AffectedTargets {
	changedFiles: string[];
	affectedTargets: AffectedTarget[];
}

export interface AffectedTarget {
	name: string;
	reason: string;
}

// ---------------------------------------------------------------------------
// FalkorDB graph schema
// ---------------------------------------------------------------------------

/** Cypher queries used by the build DAG service. */
export const BUILD_DAG_SCHEMA = {
	createTarget: `
		MERGE (t:Target {name: $name})
		SET t.command = $command,
			t.ecosystem = $ecosystem,
			t.workingDir = $workingDir,
			t.description = $description,
			t.estimatedDuration = $estimatedDuration
		RETURN t
	`,
	createDependency: `
		MATCH (a:Target {name: $from}), (b:Target {name: $to})
		MERGE (a)-[:DEPENDS_ON]->(b)
	`,
	createEnvVar: `
		MERGE (e:EnvVar {name: $name})
		SET e.required = $required,
			e.defaultValue = $defaultValue,
			e.description = $description
		RETURN e
	`,
	linkTargetEnvVar: `
		MATCH (t:Target {name: $target}), (e:EnvVar {name: $envVar})
		MERGE (t)-[:REQUIRES_ENV]->(e)
	`,
	createService: `
		MERGE (s:Service {name: $name})
		SET s.port = $port,
			s.healthCheck = $healthCheck,
			s.dockerImage = $dockerImage
		RETURN s
	`,
	linkTargetService: `
		MATCH (t:Target {name: $target}), (s:Service {name: $service})
		MERGE (t)-[:REQUIRES_SERVICE]->(s)
	`,
	listTargets: `
		MATCH (t:Target)
		OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:Target)
		RETURN t, collect(dep.name) AS dependencies
		ORDER BY t.name
	`,
	buildOrder: `
		MATCH path = (root:Target {name: $target})-[:DEPENDS_ON*0..10]->(dep:Target)
		RETURN dep.name AS name, dep.command AS command, dep.workingDir AS workingDir,
			   length(path) AS depth
		ORDER BY depth DESC
	`,
	environmentRequirements: `
		MATCH path = (root:Target {name: $target})-[:DEPENDS_ON*0..10]->(dep:Target)
		WITH collect(DISTINCT dep) + [root] AS allTargets
		UNWIND allTargets AS t
		OPTIONAL MATCH (t)-[:REQUIRES_ENV]->(e:EnvVar)
		OPTIONAL MATCH (t)-[:REQUIRES_SERVICE]->(s:Service)
		RETURN t.name AS target,
			   collect(DISTINCT e) AS envVars,
			   collect(DISTINCT s) AS services
	`,
	clearDag: `
		MATCH (n) WHERE n:Target OR n:EnvVar OR n:Service
		DETACH DELETE n
	`,
};
