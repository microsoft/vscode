/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Suite } from 'mocha';
import { WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { ChatCapabilityDiscoveryService } from '../../browser/chatCapabilityDiscoveryService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestWorkspaceContextService } from '../../../../../platform/workspace/test/common/testWorkspaceContextService.js';

suite('ChatCapabilityDiscoveryService', () => {
	let service: ChatCapabilityDiscoveryService;
	let workspaceContextService: TestWorkspaceContextService;
	
	setup(() => {
		workspaceContextService = new TestWorkspaceContextService();
		const instantiationService = new TestInstantiationService();
		instantiationService.stub('IWorkspaceContextService', workspaceContextService);
		instantiationService.stub('ILogService', new NullLogService());
		
		service = new ChatCapabilityDiscoveryService(workspaceContextService);
	});

	test('should provide capabilities', () => {
		const capabilities = service.getCapabilities();
		assert.ok(capabilities.length > 0, 'Should provide at least one capability');
		
		// Check that key capabilities are present
		const categories = capabilities.map(c => c.category);
		assert.ok(categories.includes('Code Generation'), 'Should include Code Generation capability');
		assert.ok(categories.includes('Debugging'), 'Should include Debugging capability');
		assert.ok(categories.includes('Learning'), 'Should include Learning capability');
	});

	test('should provide different examples for empty workspace vs project workspace', () => {
		const emptyWorkspaceExamples = service.getCapabilityExamples(WorkbenchState.EMPTY);
		const projectWorkspaceExamples = service.getCapabilityExamples(WorkbenchState.WORKSPACE);
		
		assert.ok(emptyWorkspaceExamples.length > 0, 'Should provide examples for empty workspace');
		assert.ok(projectWorkspaceExamples.length > 0, 'Should provide examples for project workspace');
		
		// Examples should be different for different workspace states
		const emptyLabels = emptyWorkspaceExamples.map(e => e.label);
		const projectLabels = projectWorkspaceExamples.map(e => e.label);
		assert.notDeepStrictEqual(emptyLabels, projectLabels, 'Examples should differ between workspace states');
	});

	test('should provide engagement prompts', () => {
		const emptyEngagement = service.getEngagementPrompts(false);
		const projectEngagement = service.getEngagementPrompts(true);
		
		assert.ok(emptyEngagement.length > 0, 'Should provide engagement prompts for empty workspace');
		assert.ok(projectEngagement.length > 0, 'Should provide engagement prompts for project workspace');
	});

	test('capabilities should have required properties', () => {
		const capabilities = service.getCapabilities();
		
		for (const capability of capabilities) {
			assert.ok(capability.category, 'Capability should have a category');
			assert.ok(capability.title, 'Capability should have a title');
			assert.ok(capability.description, 'Capability should have a description');
			assert.ok(capability.icon, 'Capability should have an icon');
			assert.ok(Array.isArray(capability.examples), 'Capability should have examples array');
			assert.ok(capability.examples.length > 0, 'Capability should have at least one example');
		}
	});

	test('suggested prompts should have required properties', () => {
		const examples = service.getCapabilityExamples(WorkbenchState.EMPTY);
		
		for (const example of examples) {
			assert.ok(example.label, 'Example should have a label');
			assert.ok(example.prompt, 'Example should have a prompt');
			assert.ok(example.icon, 'Example should have an icon');
		}
	});

	test('should provide comprehensive overview prompt for exploratory users', () => {
		const overviewPrompt = service.getCapabilityOverviewPrompt();
		
		// Should be comprehensive and interactive
		assert.ok(overviewPrompt.length > 100, 'Overview prompt should be comprehensive');
		assert.ok(overviewPrompt.includes('capabilities'), 'Should mention capabilities');
		assert.ok(overviewPrompt.includes('examples'), 'Should ask for examples');
		assert.ok(overviewPrompt.includes('practices'), 'Should ask for best practices');
		assert.ok(overviewPrompt.includes('interactive'), 'Should emphasize interactivity');
		
		// Should address the scenario in the problem statement
		const promptLower = overviewPrompt.toLowerCase();
		assert.ok(promptLower.includes('programming'), 'Should be programming-focused');
		assert.ok(promptLower.includes('help'), 'Should emphasize helping');
	});
});