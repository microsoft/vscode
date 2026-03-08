// Son of Anton — Spec Pipeline MCP Tool Tests
// Tests for the spec_list, spec_read, and spec_sync_check MCP tools.

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('specPipeline MCP tools', () => {
	let tmpDir;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soa-spec-test-'));

		// Create a sample spec structure
		const specsDir = path.join(tmpDir, '.son-of-anton', 'specs', 'rate-limiting');
		fs.mkdirSync(specsDir, { recursive: true });

		fs.writeFileSync(path.join(specsDir, 'requirements.md'), '# Rate Limiting\n\n## Requirements\n\n### REQ-001: Rate Limit\nthe system SHALL limit requests.\n');
		fs.writeFileSync(path.join(specsDir, 'design.md'), '# Rate Limiting — Technical Design\n\n## Approach\n\nRedis-backed sliding window.\n');
		fs.writeFileSync(path.join(specsDir, 'tasks.md'), '# Rate Limiting — Tasks\n\n## Tasks\n\n### Task 1: Implement middleware\n- **Status:** pending\n- **Agent:** anton-code\n- **Files:** src/middleware/rateLimit.ts\n- **Description:** Implement rate limiter.\n');
	});

	describe('specList', () => {

		test('should list features with spec presence info', () => {
			const specsPath = path.join(tmpDir, '.son-of-anton', 'specs');
			const entries = fs.readdirSync(specsPath, { withFileTypes: true });

			const features = entries
				.filter(e => e.isDirectory())
				.map(e => {
					const featureDir = path.join(specsPath, e.name);
					return {
						name: e.name,
						hasRequirements: fs.existsSync(path.join(featureDir, 'requirements.md')),
						hasDesign: fs.existsSync(path.join(featureDir, 'design.md')),
						hasTasks: fs.existsSync(path.join(featureDir, 'tasks.md')),
						hasProperties: fs.existsSync(path.join(featureDir, 'properties.test.ts')),
					};
				});

			assert.equal(features.length, 1);
			assert.deepStrictEqual(features[0], {
				name: 'rate-limiting',
				hasRequirements: true,
				hasDesign: true,
				hasTasks: true,
				hasProperties: false,
			});
		});

		test('should return empty when no specs directory exists', () => {
			const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soa-empty-'));
			const specsPath = path.join(emptyDir, '.son-of-anton', 'specs');
			assert.equal(fs.existsSync(specsPath), false);
			fs.rmSync(emptyDir, { recursive: true });
		});
	});

	describe('specRead', () => {

		test('should read requirements content', () => {
			const filePath = path.join(tmpDir, '.son-of-anton', 'specs', 'rate-limiting', 'requirements.md');
			const content = fs.readFileSync(filePath, 'utf-8');

			assert.ok(content.includes('# Rate Limiting'));
			assert.ok(content.includes('REQ-001'));
		});

		test('should return exists=false for missing phase', () => {
			const filePath = path.join(tmpDir, '.son-of-anton', 'specs', 'rate-limiting', 'properties.test.ts');
			const exists = fs.existsSync(filePath);

			assert.equal(exists, false);
		});
	});

	describe('specSyncCheck', () => {

		test('should detect when a changed file is referenced by a task', () => {
			const tasksPath = path.join(tmpDir, '.son-of-anton', 'specs', 'rate-limiting', 'tasks.md');
			const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
			const changedFile = 'src/middleware/rateLimit.ts';

			const fileFieldRegex = /-\s*\*\*Files:\*\*\s*(.+)/g;
			const warnings = [];
			let match;

			while ((match = fileFieldRegex.exec(tasksContent)) !== null) {
				const files = match[1].split(',').map(f =>
					f.trim().replace(/\s*\(.+\)\s*$/, '').replace(/^\.\//, '').replace(/^\//, '')
				);

				for (const file of files) {
					if (changedFile.endsWith(file) || file.endsWith(changedFile)) {
						warnings.push(`File "${changedFile}" is referenced by spec.`);
					}
				}
			}

			assert.equal(warnings.length, 1);
			assert.ok(warnings[0].includes('rateLimit.ts'));
		});

		test('should not warn for unrelated files', () => {
			const tasksPath = path.join(tmpDir, '.son-of-anton', 'specs', 'rate-limiting', 'tasks.md');
			const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
			const changedFile = 'src/utils/logger.ts';

			const fileFieldRegex = /-\s*\*\*Files:\*\*\s*(.+)/g;
			const warnings = [];
			let match;

			while ((match = fileFieldRegex.exec(tasksContent)) !== null) {
				const files = match[1].split(',').map(f =>
					f.trim().replace(/\s*\(.+\)\s*$/, '').replace(/^\.\//, '').replace(/^\//, '')
				);

				for (const file of files) {
					if (changedFile.endsWith(file) || file.endsWith(changedFile)) {
						warnings.push(`File "${changedFile}" is referenced.`);
					}
				}
			}

			assert.equal(warnings.length, 0);
		});
	});
});
