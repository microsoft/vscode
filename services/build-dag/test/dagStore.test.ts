// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DagStore } from '../src/graph/dagStore';
import type { BuildTarget, ServiceDependency } from '../src/types';

function createTarget(overrides: Partial<BuildTarget> & Pick<BuildTarget, 'name'>): BuildTarget {
	return {
		command: `npm run ${overrides.name}`,
		ecosystem: 'node',
		workingDir: '/project',
		dependsOn: [],
		envVars: [],
		services: [],
		...overrides,
	};
}

describe('DagStore', () => {
	test('lists all targets', () => {
		const store = new DagStore();
		store.load([
			createTarget({ name: 'build' }),
			createTarget({ name: 'test', ecosystem: 'node' }),
			createTarget({ name: 'docker:api', ecosystem: 'docker' }),
		], []);

		assert.equal(store.targetCount, 3);
		assert.equal(store.listTargets().length, 3);
		assert.equal(store.listTargets('node').length, 2);
		assert.equal(store.listTargets('docker').length, 1);
	});

	test('computes build order with topological sort', () => {
		const store = new DagStore();
		store.load([
			createTarget({ name: 'install' }),
			createTarget({ name: 'build', dependsOn: ['install'] }),
			createTarget({ name: 'test', dependsOn: ['build'] }),
			createTarget({ name: 'migrate', dependsOn: ['install'] }),
			createTarget({ name: 'e2e', dependsOn: ['test', 'migrate'] }),
		], []);

		const order = store.buildOrder('e2e');
		assert.equal(order.target, 'e2e');
		assert.equal(order.steps.length, 5);

		// install must come before build and migrate
		const stepNames = order.steps.map(s => s.target);
		assert.ok(stepNames.indexOf('install') < stepNames.indexOf('build'));
		assert.ok(stepNames.indexOf('install') < stepNames.indexOf('migrate'));
		assert.ok(stepNames.indexOf('build') < stepNames.indexOf('test'));
		assert.ok(stepNames.indexOf('test') < stepNames.indexOf('e2e'));
	});

	test('throws for unknown target in build order', () => {
		const store = new DagStore();
		store.load([createTarget({ name: 'build' })], []);

		assert.throws(() => store.buildOrder('nonexistent'), /Target not found/);
	});

	test('computes environment requirements transitively', () => {
		const services: ServiceDependency[] = [
			{ name: 'postgres', port: 5432, healthCheck: 'pg_isready', dockerImage: 'postgres:16' },
			{ name: 'redis', port: 6379 },
		];

		const store = new DagStore();
		store.load([
			createTarget({
				name: 'migrate',
				envVars: [{ name: 'DATABASE_URL', required: true }],
				services: [{ name: 'postgres' }],
			}),
			createTarget({
				name: 'build',
				envVars: [{ name: 'NODE_ENV', required: false, defaultValue: 'development' }],
			}),
			createTarget({
				name: 'test',
				dependsOn: ['build', 'migrate'],
				envVars: [{ name: 'API_SECRET', required: true }],
				services: [{ name: 'redis' }],
			}),
		], services);

		const reqs = store.environmentRequirements('test');
		assert.equal(reqs.target, 'test');

		// Should include env vars from test, build, and migrate
		const envNames = reqs.envVars.map(e => e.name).sort();
		assert.deepStrictEqual(envNames, ['API_SECRET', 'DATABASE_URL', 'NODE_ENV']);

		// Should include services from test and migrate
		const svcNames = reqs.services.map(s => s.name).sort();
		assert.deepStrictEqual(svcNames, ['postgres', 'redis']);

		// Postgres should have full service details
		const postgres = reqs.services.find(s => s.name === 'postgres');
		assert.equal(postgres?.port, 5432);
		assert.equal(postgres?.dockerImage, 'postgres:16');

		// Should list build and migrate as prerequisites
		assert.ok(reqs.prerequisites.includes('build'));
		assert.ok(reqs.prerequisites.includes('migrate'));
	});

	test('finds affected targets from changed files', () => {
		const store = new DagStore();
		store.load([
			createTarget({ name: 'build', watchPatterns: ['src/**/*'] }),
			createTarget({ name: 'test', watchPatterns: ['src/**/*', 'test/**/*'], dependsOn: ['build'] }),
			createTarget({ name: 'lint', watchPatterns: ['src/**/*'] }),
			createTarget({ name: 'deploy', dependsOn: ['test'] }),
		], []);

		const result = store.affectedTargets(['src/app.ts']);
		const affectedNames = result.affectedTargets.map(a => a.name);

		// build, test, lint are directly affected (watch patterns match)
		assert.ok(affectedNames.includes('build'));
		assert.ok(affectedNames.includes('test'));
		assert.ok(affectedNames.includes('lint'));
		// deploy is transitively affected (depends on test)
		assert.ok(affectedNames.includes('deploy'));
	});

	test('returns empty affected targets for unrelated files', () => {
		const store = new DagStore();
		store.load([
			createTarget({ name: 'build', watchPatterns: ['src/**/*'] }),
		], []);

		const result = store.affectedTargets(['docs/readme.md']);
		assert.equal(result.affectedTargets.length, 0);
	});
});
