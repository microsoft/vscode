/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { IProcessPropertyMap } from 'vs/platform/terminal/common/terminal';
import { refreshLabel } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

function terminalProperties(partial?: Partial<{ processName: string }>): { processName: string } {
	return {
		processName: '',
		...partial
	};
}

function processProperties(partial?: Partial<IProcessPropertyMap>): IProcessPropertyMap {
	return {
		cwd: '',
		initialCwd: '',
		...partial
	};
}

suite('Workbench - TerminalInstance', () => {
	suite('refreshLabel', () => {
		let configurationService: TestConfigurationService;
		let instantiationService: TestInstantiationService;
		let workspaceContextService: IWorkspaceContextService;

		setup(async () => {
			configurationService = new TestConfigurationService();
			instantiationService = new TestInstantiationService();
			workspaceContextService = instantiationService.stub(IWorkspaceContextService, {
				getWorkspace() { return null as any; }
			});
		});

		it('should resolve to "" when the template variables are empty', () => {
			strictEqual(refreshLabel('${process}', terminalProperties({ processName: '' }), processProperties(), undefined), '');
		});
		it('should resolve cwd', () => {
		});
		it('should resolve cwdFolder', () => {
			if (isWindows) {
			} else {
			}
		});
		it('should resolve workspaceFolder', () => {
		});
		it('should resolve local', () => {
		});
		it('should resolve process', () => {
		});
		it('should resolve sequence', () => {
		});
		it('should resolve task', () => {
		});
		it('should resolve separator', () => {
		});
		it('should hide adjacent separators', () => {
		});
		it('should always return static title when specified', () => {
		});
		it('should provide cwdFolder for all cwds when in multi-root', () => {
		});
		it('should hide cwdFolder in empty workspaces when cwd matches the workspace\'s default cwd ($HOME or $HOMEDRIVE$HOMEPATH)', async () => {
		});
		it('should hide cwdFolder in single-root workspaces when cwd matches the workspace\'s default cwd', async () => {
			await configurationService.setUserConfiguration('terminal', { integrated: { cwd: '/foo' } });
			console.log(workspaceContextService);
		});
	});
});
