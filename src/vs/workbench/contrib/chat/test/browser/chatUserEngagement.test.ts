/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Suite } from 'mocha';
import { WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { TestWorkspaceContextService } from '../../../../../platform/workspace/test/common/testWorkspaceContextService.js';
import { ChatCapabilityDiscoveryService } from '../../browser/chatCapabilityDiscoveryService.js';

suite('Enhanced Chat User Engagement', () => {
	let workspaceContextService: TestWorkspaceContextService;
	let capabilityService: ChatCapabilityDiscoveryService;
	
	setup(() => {
		workspaceContextService = new TestWorkspaceContextService();
		capabilityService = new ChatCapabilityDiscoveryService(workspaceContextService);
	});

	test('should provide discovery prompts for users without specific tasks', () => {
		const capabilities = capabilityService.getCapabilities();
		
		// Verify we have capability discovery content
		assert.ok(capabilities.length >= 6, 'Should provide comprehensive capabilities coverage');
		
		// Key capabilities for user engagement
		const categories = capabilities.map(c => c.category);
		assert.ok(categories.includes('Code Generation'), 'Should help with code generation');
		assert.ok(categories.includes('Code Explanation'), 'Should help explain code');
		assert.ok(categories.includes('Debugging'), 'Should help with debugging');
		assert.ok(categories.includes('Learning'), 'Should help with learning');
		assert.ok(categories.includes('Code Review'), 'Should help with code review');
		assert.ok(categories.includes('Testing'), 'Should help with testing');
	});

	test('should provide contextual examples based on workspace state', () => {
		// Empty workspace examples should focus on general programming help
		const emptyExamples = capabilityService.getCapabilityExamples(WorkbenchState.EMPTY);
		const emptyPrompts = emptyExamples.map(e => e.prompt.toLowerCase());
		
		// Should include learning-oriented prompts for empty workspace
		const hasLearningContent = emptyPrompts.some(prompt => 
			prompt.includes('learn') || 
			prompt.includes('explain') || 
			prompt.includes('concept')
		);
		assert.ok(hasLearningContent, 'Empty workspace should include learning-focused prompts');

		// Project workspace examples should focus on project-specific help
		const projectExamples = capabilityService.getCapabilityExamples(WorkbenchState.WORKSPACE);
		const projectPrompts = projectExamples.map(e => e.prompt.toLowerCase());
		
		// Should include project-specific prompts for workspace
		const hasProjectContent = projectPrompts.some(prompt => 
			prompt.includes('project') || 
			prompt.includes('workspace') || 
			prompt.includes('codebase')
		);
		assert.ok(hasProjectContent, 'Project workspace should include project-focused prompts');
	});

	test('should provide engagement prompts that help users discover capabilities', () => {
		const emptyEngagement = capabilityService.getEngagementPrompts(false);
		const projectEngagement = capabilityService.getEngagementPrompts(true);
		
		// Check for capability discovery prompts
		const emptyLabels = emptyEngagement.map(e => e.label.toLowerCase());
		const hasCapabilityDiscovery = emptyLabels.some(label => 
			label.includes('capabilities') || 
			label.includes('help') || 
			label.includes('show')
		);
		assert.ok(hasCapabilityDiscovery, 'Should include capability discovery prompts');

		// Check for guidance prompts
		const hasUsageGuidance = emptyLabels.some(label => 
			label.includes('how to') || 
			label.includes('effectively') || 
			label.includes('use')
		);
		assert.ok(hasUsageGuidance, 'Should include usage guidance prompts');
	});

	test('should help users understand what AI assistant can do', () => {
		const capabilities = capabilityService.getCapabilities();
		
		// Each capability should have clear description and examples
		for (const capability of capabilities) {
			assert.ok(capability.description.length > 20, `${capability.category} should have descriptive explanation`);
			assert.ok(capability.examples.length >= 2, `${capability.category} should have multiple examples`);
			
			// Examples should be concrete and actionable
			for (const example of capability.examples) {
				assert.ok(example.length > 10, `Examples should be descriptive: ${example}`);
			}
		}
	});

	test('should provide diverse example prompts covering different programming aspects', () => {
		const emptyExamples = capabilityService.getCapabilityExamples(WorkbenchState.EMPTY);
		const allPrompts = emptyExamples.map(e => e.prompt);
		
		// Should cover different aspects of programming
		const promptText = allPrompts.join(' ').toLowerCase();
		
		// Check for variety in suggested activities
		const hasCodeGeneration = promptText.includes('write') || promptText.includes('generate') || promptText.includes('create');
		const hasExplanation = promptText.includes('explain') || promptText.includes('understand');
		const hasLearning = promptText.includes('learn') || promptText.includes('teach');
		
		assert.ok(hasCodeGeneration, 'Should include code generation prompts');
		assert.ok(hasExplanation, 'Should include explanation prompts');
		assert.ok(hasLearning, 'Should include learning prompts');
	});
});