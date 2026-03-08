// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { EarsRequirement, PropertyTest, RequirementsSpec } from './types';

/**
 * Generate property-based tests from a parsed requirements specification.
 * Maps EARS patterns to fast-check properties.
 */
export function generatePropertyTests(spec: RequirementsSpec): PropertyTest[] {
	const tests: PropertyTest[] = [];

	for (const req of spec.requirements) {
		const generated = generateTestForRequirement(req);
		if (generated) {
			tests.push(generated);
		}
	}

	return tests;
}

/**
 * Generate a property-based test for a single EARS requirement.
 */
function generateTestForRequirement(req: EarsRequirement): PropertyTest | null {
	switch (req.pattern) {
		case 'event-driven':
			return generateEventDrivenTest(req);
		case 'ubiquitous':
			return generateUbiquitousTest(req);
		case 'state-driven':
			return generateStateDrivenTest(req);
		case 'unwanted':
			return generateUnwantedTest(req);
		case 'optional':
			return generateOptionalTest(req);
		case 'complex':
			return generateComplexTest(req);
		default:
			return null;
	}
}

/**
 * Generate a test for event-driven requirements (WHEN ... SHALL ...).
 */
function generateEventDrivenTest(req: EarsRequirement): PropertyTest {
	const testName = `${req.id}: ${req.title} — when trigger occurs, action is performed`;
	const triggerDesc = sanitiseForComment(req.trigger ?? 'trigger');
	const actionDesc = sanitiseForComment(req.action);

	const testCode = `
test('${escapeTestName(testName)}', () => {
	fc.assert(
		fc.property(
			fc.anything(),
			(input) => {
				// Requirement: ${req.id}
				// WHEN ${triggerDesc}
				// the system SHALL ${actionDesc}
				//
				// TODO: Replace with actual trigger simulation and assertion.
				// The arbitrary should model the trigger's input space.
				// The property should assert the action's postcondition.
				const triggerOccurred = simulateTrigger(input);
				if (triggerOccurred) {
					const result = executeAction(input);
					expect(result.actionPerformed).toBe(true);
				}
			}
		)
	);
});`.trim();

	return {
		requirementId: req.id,
		requirementTitle: req.title,
		testName,
		testCode,
		arbitraries: ['fc.anything()'],
		properties: [`When ${triggerDesc}, the system shall ${actionDesc}`],
	};
}

/**
 * Generate a test for ubiquitous requirements (the system SHALL ...).
 */
function generateUbiquitousTest(req: EarsRequirement): PropertyTest {
	const testName = `${req.id}: ${req.title} — property holds for all inputs`;
	const actionDesc = sanitiseForComment(req.action);

	const testCode = `
test('${escapeTestName(testName)}', () => {
	fc.assert(
		fc.property(
			fc.anything(),
			(input) => {
				// Requirement: ${req.id}
				// the system SHALL ${actionDesc}
				//
				// TODO: Replace with actual system invocation and property assertion.
				// This property must hold unconditionally for all valid inputs.
				const result = invokeSystem(input);
				expect(result.satisfiesRequirement).toBe(true);
			}
		)
	);
});`.trim();

	return {
		requirementId: req.id,
		requirementTitle: req.title,
		testName,
		testCode,
		arbitraries: ['fc.anything()'],
		properties: [`The system shall ${actionDesc}`],
	};
}

/**
 * Generate a test for state-driven requirements (WHILE ... SHALL ...).
 */
function generateStateDrivenTest(req: EarsRequirement): PropertyTest {
	const testName = `${req.id}: ${req.title} — while state holds, action is maintained`;
	const stateDesc = sanitiseForComment(req.state ?? 'state');
	const actionDesc = sanitiseForComment(req.action);

	const testCode = `
test('${escapeTestName(testName)}', () => {
	fc.assert(
		fc.property(
			fc.anything(),
			(input) => {
				// Requirement: ${req.id}
				// WHILE ${stateDesc}
				// the system SHALL ${actionDesc}
				//
				// TODO: Replace with actual state setup and continuous assertion.
				// The property must hold as long as the state condition is true.
				const state = setupState(input);
				if (state.isActive) {
					const result = observeSystem(state);
					expect(result.actionMaintained).toBe(true);
				}
			}
		)
	);
});`.trim();

	return {
		requirementId: req.id,
		requirementTitle: req.title,
		testName,
		testCode,
		arbitraries: ['fc.anything()'],
		properties: [`While ${stateDesc}, the system shall ${actionDesc}`],
	};
}

/**
 * Generate a test for unwanted behaviour requirements (IF ... THEN SHALL ...).
 */
function generateUnwantedTest(req: EarsRequirement): PropertyTest {
	const testName = `${req.id}: ${req.title} — if unwanted condition, system responds correctly`;
	const conditionDesc = sanitiseForComment(req.condition ?? 'condition');
	const actionDesc = sanitiseForComment(req.action);

	const testCode = `
test('${escapeTestName(testName)}', () => {
	fc.assert(
		fc.property(
			fc.anything(),
			(input) => {
				// Requirement: ${req.id}
				// IF ${conditionDesc}
				// THEN the system SHALL ${actionDesc}
				//
				// TODO: Replace with actual condition simulation and recovery assertion.
				// The property tests the system's response to unwanted situations.
				const conditionMet = checkCondition(input);
				if (conditionMet) {
					const result = observeRecovery(input);
					expect(result.handledCorrectly).toBe(true);
				}
			}
		)
	);
});`.trim();

	return {
		requirementId: req.id,
		requirementTitle: req.title,
		testName,
		testCode,
		arbitraries: ['fc.anything()'],
		properties: [`If ${conditionDesc}, then the system shall ${actionDesc}`],
	};
}

/**
 * Generate a test for optional feature requirements (WHERE ... SHALL ...).
 */
function generateOptionalTest(req: EarsRequirement): PropertyTest {
	const testName = `${req.id}: ${req.title} — when feature is enabled, property holds`;
	const featureDesc = sanitiseForComment(req.feature ?? 'feature');
	const actionDesc = sanitiseForComment(req.action);

	const testCode = `
test('${escapeTestName(testName)}', () => {
	fc.assert(
		fc.property(
			fc.boolean(),
			fc.anything(),
			(featureEnabled, input) => {
				// Requirement: ${req.id}
				// WHERE ${featureDesc}
				// the system SHALL ${actionDesc}
				//
				// TODO: Replace with actual feature toggle and conditional assertion.
				// The property only needs to hold when the feature is enabled.
				if (featureEnabled) {
					const result = invokeWithFeature(input);
					expect(result.satisfiesRequirement).toBe(true);
				}
			}
		)
	);
});`.trim();

	return {
		requirementId: req.id,
		requirementTitle: req.title,
		testName,
		testCode,
		arbitraries: ['fc.boolean()', 'fc.anything()'],
		properties: [`Where ${featureDesc}, the system shall ${actionDesc}`],
	};
}

/**
 * Generate a placeholder test for complex/unrecognised requirements.
 */
function generateComplexTest(req: EarsRequirement): PropertyTest {
	const testName = `${req.id}: ${req.title} — complex requirement property`;
	const actionDesc = sanitiseForComment(req.action);

	const testCode = `
test('${escapeTestName(testName)}', () => {
	// Requirement: ${req.id}
	// Complex requirement — manual property definition needed.
	// Raw text: ${sanitiseForComment(req.rawText)}
	//
	// TODO: Define the property and arbitraries for this complex requirement.
	fc.assert(
		fc.property(
			fc.anything(),
			(input) => {
				const result = invokeSystem(input);
				expect(result.satisfiesRequirement).toBe(true);
			}
		)
	);
});`.trim();

	return {
		requirementId: req.id,
		requirementTitle: req.title,
		testName,
		testCode,
		arbitraries: ['fc.anything()'],
		properties: [actionDesc],
	};
}

/**
 * Generate the full properties.test.ts file content.
 */
export function generatePropertyTestFile(spec: RequirementsSpec, featureName: string): string {
	const tests = generatePropertyTests(spec);

	const sections: string[] = [];

	sections.push(`// Property-based tests generated from ${featureName} requirements.`);
	sections.push('// Each test maps to an EARS requirement in requirements.md.');
	sections.push('// Replace TODO stubs with actual implementations.');
	sections.push('');
	sections.push("import fc from 'fast-check';");
	sections.push('');
	sections.push(`describe('${escapeTestName(featureName)} — Property-Based Tests', () => {`);

	for (const test of tests) {
		sections.push('');
		sections.push(`\t// Requirement: ${test.requirementId} — ${test.requirementTitle}`);
		sections.push(`\t// Properties: ${test.properties.join('; ')}`);
		sections.push(`\t// Arbitraries: ${test.arbitraries.join(', ')}`);
		sections.push(indent(test.testCode, 1));
	}

	sections.push('});');
	sections.push('');

	return sections.join('\n');
}

/**
 * Sanitise a string for use in a code comment (remove newlines, limit length).
 */
function sanitiseForComment(text: string): string {
	return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
}

/**
 * Escape single quotes in test names.
 */
function escapeTestName(name: string): string {
return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Indent a block of text by a number of tab levels.
 */
function indent(text: string, levels: number): string {
	const prefix = '\t'.repeat(levels);
	return text.split('\n').map(line => line ? `${prefix}${line}` : line).join('\n');
}
