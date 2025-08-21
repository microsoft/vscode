/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
// Import our Erdos services
import { ILanguageRuntimeService } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IErdosLayoutService } from '../../../services/erdosLayout/browser/interfaces/erdosLayoutService.js';
import { IErdosNewFolderService } from '../../../services/erdosNewFolder/common/erdosNewFolder.js';
import { IErdosNotebookService } from '../../../services/erdosNotebook/browser/erdosNotebookService.js';

export class TestErdosServicesAction extends Action2 {
	static readonly ID = 'erdos.dev.testServices';

	constructor() {
		super({
			id: TestErdosServicesAction.ID,
			title: { value: localize('testErdosServices', 'Test Erdos Services (Phase 1.1)'), original: 'Test Erdos Services (Phase 1.1)' },
			category: 'Developer',
			f1: true // Show in Command Palette
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		
		try {
			// Test results
			const results: string[] = [];
			let passedTests = 0;
			let totalTests = 0;

			// Test 1: Language Runtime Service
			totalTests++;
			try {
				const languageRuntimeService = accessor.get(ILanguageRuntimeService);
				if (languageRuntimeService) {
					results.push('✅ ILanguageRuntimeService - INJECTABLE');
					passedTests++;
				}
			} catch (error) {
				results.push('❌ ILanguageRuntimeService - FAILED TO INJECT');
			}

			// Test 2: Runtime Session Service
			totalTests++;
			try {
				const runtimeSessionService = accessor.get(IRuntimeSessionService);
				if (runtimeSessionService) {
					results.push('✅ IRuntimeSessionService - INJECTABLE');
					passedTests++;
				}
			} catch (error) {
				results.push('❌ IRuntimeSessionService - FAILED TO INJECT');
			}

			// Test 3: Erdos Console Service
			totalTests++;
			try {
				const erdosConsoleService = accessor.get(IErdosConsoleService);
				if (erdosConsoleService) {
					results.push('✅ IErdosConsoleService - INJECTABLE');
					passedTests++;
				}
			} catch (error) {
				results.push('❌ IErdosConsoleService - FAILED TO INJECT');
			}

			// Test 4: Erdos Layout Service
			totalTests++;
			try {
				const erdosLayoutService = accessor.get(IErdosLayoutService);
				if (erdosLayoutService) {
					results.push('✅ IErdosLayoutService - INJECTABLE');
					passedTests++;
				}
			} catch (error) {
				results.push('❌ IErdosLayoutService - FAILED TO INJECT');
			}

			// Test 5: Erdos New Folder Service
			totalTests++;
			try {
				const erdosNewFolderService = accessor.get(IErdosNewFolderService);
				if (erdosNewFolderService) {
					results.push('✅ IErdosNewFolderService - INJECTABLE');
					passedTests++;
				}
			} catch (error) {
				results.push('❌ IErdosNewFolderService - FAILED TO INJECT');
			}

			// Test 6: Erdos Notebook Service
			totalTests++;
			try {
				const erdosNotebookService = accessor.get(IErdosNotebookService);
				if (erdosNotebookService) {
					results.push('✅ IErdosNotebookService - INJECTABLE');
					passedTests++;
				}
			} catch (error) {
				results.push('❌ IErdosNotebookService - FAILED TO INJECT');
			}

			// Display results
			const summary = `🧪 Phase 1.1 Service Test Results: ${passedTests}/${totalTests} passed\n\n${results.join('\n')}`;
			
			if (passedTests === totalTests) {
				notificationService.info(`🎉 SUCCESS: All Erdos services are working!\n\n${summary}`);
			} else {
				notificationService.warn(`⚠️ Some services failed injection:\n\n${summary}`);
			}

			// Also log to console for debugging
			console.log('='.repeat(50));
			console.log('🧪 ERDOS PHASE 1.1 SERVICE TEST RESULTS');
			console.log('='.repeat(50));
			results.forEach(result => console.log(result));
			console.log(`\n🎯 Final Score: ${passedTests}/${totalTests} services working`);
			console.log('='.repeat(50));

		} catch (error) {
			notificationService.error(`❌ Failed to run Erdos service tests: ${error}`);
		}
	}
}

// Register the command
registerAction2(TestErdosServicesAction);
