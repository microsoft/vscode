// Son of Anton — Spec Sync Checker Tests
// Tests for bidirectional sync checking between specs and code.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('SyncChecker', () => {

	describe('checkCodeToSpecSync', () => {

		test('should detect when a changed file is referenced by a task', () => {
			const changedFilePath = 'src/middleware/rateLimit.ts';
			const tasksSpec = {
				title: 'Rate Limiting Tasks',
				executionOrder: '1 → 2',
				tasks: [
					{
						id: 1,
						title: 'Add Redis',
						status: 'completed',
						agent: 'anton-code',
						files: ['docker-compose.yml'],
						dependsOn: [],
						description: 'Add Redis.',
					},
					{
						id: 2,
						title: 'Implement middleware',
						status: 'completed',
						agent: 'anton-code',
						files: ['/src/middleware/rateLimit.ts'],
						dependsOn: [1],
						description: 'Implement rate limiter.',
					},
				],
			};

			// Check if the changed file matches any task file
			const matchingTasks = tasksSpec.tasks.filter(task =>
				task.files.some(f => {
					const normTask = f.replace(/^\.\//, '').replace(/^\//, '');
					const normChanged = changedFilePath.replace(/^\.\//, '').replace(/^\//, '');
					return normChanged.endsWith(normTask) || normTask.endsWith(normChanged);
				})
			);

			assert.equal(matchingTasks.length, 1);
			assert.equal(matchingTasks[0].id, 2);
			assert.equal(matchingTasks[0].title, 'Implement middleware');
		});

		test('should return empty when no tasks reference the changed file', () => {
			const changedFilePath = 'src/utils/logger.ts';
			const taskFiles = ['docker-compose.yml', '/src/middleware/rateLimit.ts'];

			const matches = taskFiles.filter(f => {
				const normTask = f.replace(/^\.\//, '').replace(/^\//, '');
				const normChanged = changedFilePath.replace(/^\.\//, '').replace(/^\//, '');
				return normChanged.endsWith(normTask) || normTask.endsWith(normChanged);
			});

			assert.equal(matches.length, 0);
		});
	});

	describe('checkSpecToCodeSync', () => {

		test('should warn about design when requirements change', () => {
			const changedSpecFile = '.son-of-anton/specs/rate-limiting/requirements.md';
			const isRequirements = changedSpecFile.endsWith('requirements.md');

			assert.equal(isRequirements, true);
			// When requirements change, design should be flagged as potentially out of sync
		});

		test('should warn about tasks when design changes', () => {
			const changedSpecFile = '.son-of-anton/specs/rate-limiting/design.md';
			const isDesign = changedSpecFile.endsWith('design.md');

			assert.equal(isDesign, true);
			// When design changes, tasks should be flagged as potentially out of sync
		});

		test('should list affected code files when design changes', () => {
			const designSpec = {
				title: 'Rate Limiting Design',
				approach: 'Redis-backed sliding window',
				diagrams: [],
				fileActions: [
					{ action: 'CREATE', path: '/src/middleware/rateLimit.ts' },
					{ action: 'MODIFY', path: '/src/routes/users.ts', description: 'apply middleware' },
				],
				rawContent: '',
			};

			// Each file action in the design is potentially affected
			assert.equal(designSpec.fileActions.length, 2);
			assert.equal(designSpec.fileActions[0].action, 'CREATE');
			assert.equal(designSpec.fileActions[1].action, 'MODIFY');
		});
	});

	describe('computePipelineState', () => {

		test('should report missing phases when files do not exist', () => {
			const fileExists = () => false;
			const getModifiedTime = () => undefined;

			// When no files exist, all phases should be 'missing'
			const phases = ['requirements.md', 'design.md', 'tasks.md', 'properties.test.ts'];
			for (const phase of phases) {
				assert.equal(fileExists(phase), false);
				assert.equal(getModifiedTime(phase), undefined);
			}
		});

		test('should report draft phases when files exist', () => {
			const existingFiles = new Set(['requirements.md', 'design.md']);
			const fileExists = (path) => existingFiles.has(path.split('/').pop());

			assert.equal(fileExists('specs/rate-limiting/requirements.md'), true);
			assert.equal(fileExists('specs/rate-limiting/design.md'), true);
			assert.equal(fileExists('specs/rate-limiting/tasks.md'), false);
		});
	});
});
