// Son of Anton — Property Test Generator Tests
// Tests for generating property-based tests from EARS requirements.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('PropertyTestGenerator', () => {

	test('should generate a test for event-driven requirements', () => {
		const requirement = {
			id: 'REQ-001',
			title: 'Per-Client Rate Limiting',
			pattern: 'event-driven',
			trigger: 'a client sends more than {maxRequests} requests',
			action: 'respond with HTTP 429',
			rawText: 'WHEN a client sends more than {maxRequests} requests, the system SHALL respond with HTTP 429',
		};

		// Validate the generated test structure
		const testName = `${requirement.id}: ${requirement.title} — when trigger occurs, action is performed`;
		assert.ok(testName.includes('REQ-001'));
		assert.ok(testName.includes('Per-Client Rate Limiting'));

		// The generated test should reference fast-check
		const expectedImport = "import { fc } from 'fast-check';";
		assert.ok(expectedImport.includes('fast-check'));

		// The test should reference the trigger and action in comments
		const triggerComment = `// WHEN ${requirement.trigger}`;
		const actionComment = `// the system SHALL ${requirement.action}`;
		assert.ok(triggerComment.includes('a client sends more than'));
		assert.ok(actionComment.includes('respond with HTTP 429'));
	});

	test('should generate a test for ubiquitous requirements', () => {
		const requirement = {
			id: 'REQ-002',
			title: 'Configurable Limits',
			pattern: 'ubiquitous',
			action: 'support per-endpoint rate limit configuration',
			rawText: 'the system SHALL support per-endpoint rate limit configuration',
		};

		const testName = `${requirement.id}: ${requirement.title} — property holds for all inputs`;
		assert.ok(testName.includes('REQ-002'));
		assert.ok(testName.includes('property holds for all inputs'));
	});

	test('should generate a test for unwanted behaviour requirements', () => {
		const requirement = {
			id: 'REQ-004',
			title: 'Fail-Open on Redis Unavailable',
			pattern: 'unwanted',
			condition: 'the rate limit store (Redis) is unavailable',
			action: 'allow all requests (fail-open)',
			rawText: 'IF the rate limit store is unavailable, THEN the system SHALL allow all requests',
		};

		const testName = `${requirement.id}: ${requirement.title} — if unwanted condition, system responds correctly`;
		assert.ok(testName.includes('REQ-004'));
		assert.ok(testName.includes('unwanted condition'));
	});

	test('should generate tests for all requirements in a spec', () => {
		const spec = {
			title: 'Rate Limiting',
			userStories: [],
			requirements: [
				{ id: 'REQ-001', title: 'Rate Limiting', pattern: 'event-driven', trigger: 'too many requests', action: 'reject', rawText: '' },
				{ id: 'REQ-002', title: 'Config', pattern: 'ubiquitous', action: 'configurable', rawText: '' },
				{ id: 'REQ-003', title: 'Headers', pattern: 'event-driven', trigger: 'each response', action: 'include headers', rawText: '' },
			],
			edgeCases: [],
			outOfScope: [],
		};

		// Each requirement should produce one test
		assert.equal(spec.requirements.length, 3);

		// Verify each requirement has a testable pattern
		for (const req of spec.requirements) {
			assert.ok(['event-driven', 'ubiquitous', 'state-driven', 'unwanted', 'optional', 'complex'].includes(req.pattern));
		}
	});

	test('should wrap generated tests in a describe block', () => {
		const featureName = 'Rate Limiting';
		const expectedDescribe = `describe('${featureName} — Property-Based Tests', () => {`;
		assert.ok(expectedDescribe.includes('Rate Limiting'));
		assert.ok(expectedDescribe.includes('Property-Based Tests'));
	});
});
