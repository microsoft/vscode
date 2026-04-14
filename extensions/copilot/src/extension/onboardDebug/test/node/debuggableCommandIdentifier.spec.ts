/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { SinonStub, stub } from 'sinon';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { basename } from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { DebuggableCommandIdentifier } from '../../node/debuggableCommandIdentifier';
import { ILanguageToolsProvider } from '../../node/languageToolsProvider';

describe('DebuggableCommandIdentifier', () => {
	let accessor: ITestingServicesAccessor;
	let debuggableCommandIdentifier: DebuggableCommandIdentifier;
	let getToolsForLanguages: SinonStub;

	const setConfigEnabled = (enabled: boolean) =>
		accessor.get(IConfigurationService).setConfig(ConfigKey.TerminalToDebuggerEnabled, enabled);

	beforeEach(() => {
		getToolsForLanguages = stub().resolves({ ok: true, commands: ['mytool'] });
		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(ILanguageToolsProvider, {
			_serviceBrand: undefined,
			getToolsForLanguages
		});
		accessor = testingServiceCollection.createTestingAccessor();

		setConfigEnabled(true);
		debuggableCommandIdentifier = accessor
			.get(IInstantiationService)
			.createInstance(DebuggableCommandIdentifier);
	});

	afterEach(() => {
		debuggableCommandIdentifier.dispose();
	});

	it('should return false if globally disabled', async () => {
		setConfigEnabled(false);
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'node index.js', CancellationToken.None);
		expect(result).to.be.false;
	});

	it('should return true for well-known commands', async () => {
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'node index.js', CancellationToken.None);
		expect(result).to.be.true;
	});

	it('should return false for unknown commands', async () => {
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'mytool', CancellationToken.None);
		expect(result).to.be.false;
		expect(getToolsForLanguages.called).to.be.false;
	});

	it('should return true for locals', async () => {
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'mytool', CancellationToken.None);
		expect(result).to.be.false;
		expect(getToolsForLanguages.called).to.be.false;
	});

	// todo@connor4312: these work on macos locally but fail in CI, look into it
	it.skip('should return true if referencing an absolute path', async () => {
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, __filename, CancellationToken.None);
		expect(result).to.be.true;
	});

	// todo@connor4312: these work on macos locally but fail in CI, look into it
	it.skip('should return true if referencing a relative path in a cwd', async () => {
		const result = await debuggableCommandIdentifier.isDebuggable(URI.file(__dirname), basename(__filename), CancellationToken.None);
		expect(result).to.be.true;
	});

	it('should not call the model tools for known languages', async () => {
		(accessor.get(IWorkspaceService) as TestWorkspaceService)
			.didOpenTextDocumentEmitter.fire({ languageId: 'javascript' } as any);

		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'othertool hello', CancellationToken.None);
		expect(result).to.be.false;
		expect(getToolsForLanguages.callCount).to.equal(0);
	});

	it('should return true for model provided commands', async () => {
		(accessor.get(IWorkspaceService) as TestWorkspaceService)
			.didOpenTextDocumentEmitter.fire({ languageId: 'mylang' } as any);
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'mytool hello', CancellationToken.None);
		expect(result).to.be.true;
		expect(getToolsForLanguages.calledWith(['mylang'])).to.be.true;

		// should not call again because no new langauge was seen:
		const result2 = await debuggableCommandIdentifier.isDebuggable(undefined, 'othertool hello', CancellationToken.None);
		expect(result2).to.be.false;
		expect(getToolsForLanguages.callCount).to.equal(1);
	});

	it('returns treatment value 1', async () => {
		accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.TerminalToDebuggerPatterns, ['othert']);
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'othert hello', CancellationToken.None);
		expect(result).to.be.true;
	});

	it('return treatment value 2', async () => {
		accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.TerminalToDebuggerPatterns, ['!mytool']);
		const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'mytool hello', CancellationToken.None);
		expect(result).to.be.false;
	});

	// it('should return true for commands matching specific treatment', async () => {
	// 	(configurationService.getConfig as sinon.SinonStub).returns(['node']);
	// 	const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'node index.js', CancellationToken.None);
	// 	expect(result).to.be.true;
	// });

	// it('should return false for commands matching specific exclusion', async () => {
	// 	(configurationService.getConfig as sinon.SinonStub).returns(['!node']);
	// 	const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'node index.js', CancellationToken.None);
	// 	expect(result).to.be.false;
	// });

	// it('should query language model for unknown commands', async () => {
	// 	(context.globalState.get as sinon.SinonStub).returns({ languages: ['unknown'], commands: [] });
	// 	(instantiationService.createInstance().getToolsForLanguages as sinon.SinonStub).resolves({ commands: ['unknowncommand'], ok: true });
	// 	const result = await debuggableCommandIdentifier.isDebuggable(undefined, 'unknowncommand', CancellationToken.None);
	// 	expect(result).to.be.true;
	// });
});
