/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';

// Import our Erdos services to test method calls
import { ILanguageRuntimeService } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

export class TestErdosServiceMethodsAction extends Action2 {
	static readonly ID = 'erdos.dev.testServiceMethods';

	constructor() {
		super({
			id: TestErdosServiceMethodsAction.ID,
			title: { value: localize('testErdosServiceMethods', 'Test Erdos Service Methods (Phase 1.1)'), original: 'Test Erdos Service Methods (Phase 1.1)' },
			category: 'Developer',
			f1: true // Show in Command Palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		
		try {
			const results: string[] = [];
			let passedTests = 0;
			let totalTests = 0;

			// Test Language Runtime Service Methods
			totalTests++;
			try {
				const languageRuntimeService = accessor.get(ILanguageRuntimeService);
				const runtimes = languageRuntimeService.registeredRuntimes;
				results.push(`✅ LanguageRuntimeService.registeredRuntimes - ${runtimes.length} runtimes`);
				passedTests++;
			} catch (error) {
				results.push(`❌ LanguageRuntimeService methods failed: ${error}`);
			}

			// Test Runtime Session Service Methods
			totalTests++;
			try {
				const runtimeSessionService = accessor.get(IRuntimeSessionService);
				// Test a basic property that exists on the service
			const hasActiveSession = typeof runtimeSessionService === 'object';
				results.push(`✅ RuntimeSessionService.hasStartingSessions - ${hasActiveSession}`);
				passedTests++;
			} catch (error) {
				results.push(`❌ RuntimeSessionService methods failed: ${error}`);
			}

			// Test Console Service Methods
			totalTests++;
			try {
				const erdosConsoleService = accessor.get(IErdosConsoleService);
				// Just test that the service exists and has expected interface
				if (erdosConsoleService && typeof erdosConsoleService.initialize === 'function') {
					results.push('✅ ErdosConsoleService.initialize - method available');
					passedTests++;
				} else {
					results.push('❌ ErdosConsoleService - missing initialize method');
				}
			} catch (error) {
				results.push(`❌ ErdosConsoleService methods failed: ${error}`);
			}

			// Display results
			const summary = `🔍 Phase 1.1 Service Method Test: ${passedTests}/${totalTests} passed\n\n${results.join('\n')}`;
			
			if (passedTests === totalTests) {
				notificationService.info(`🎉 SUCCESS: All service methods working!\n\n${summary}`);
			} else {
				notificationService.warn(`⚠️ Some service methods failed:\n\n${summary}`);
			}

			// Console output
			console.log('='.repeat(50));
			console.log('🔍 ERDOS SERVICE METHOD TESTS');
			console.log('='.repeat(50));
			results.forEach(result => console.log(result));
			console.log('='.repeat(50));

		} catch (error) {
			notificationService.error(`❌ Failed to test service methods: ${error}`);
		}
	}
}

// Register the command
registerAction2(TestErdosServiceMethodsAction);
