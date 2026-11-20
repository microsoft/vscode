/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionInfo } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionEditorTab, ExtensionState, IExtension, IExtensionsWorkbenchService, InstallExtensionOptions } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { IExtensionEditorOptions } from '../../../../../workbench/contrib/extensions/common/extensionsInput.js';
import { EnablementState } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { AgentsWindowExtensionPageWorkbenchService } from '../../browser/agentsWindowExtensionPage.js';

function anExtension(id: string, state: ExtensionState): IExtension {
	return new class extends mock<IExtension>() {
		override readonly identifier = { id };
		override readonly state = state;
	}();
}

suite('AgentsWindowExtensionPageWorkbenchService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const installedTools = anExtension('pub.tools', ExtensionState.Installed);
	const marketplaceFormatter = anExtension('pub.formatter', ExtensionState.Uninstalled);

	/**
	 * Creates the service of an extension page, which records what it asks the extensions service and the section to do.
	 * Users confirm uninstalling extensions as `confirmsUninstall` says.
	 */
	function createService(confirmsUninstall = true) {
		const calls: string[] = [];
		const enablements: EnablementState[] = [];
		const describe = (extension: IExtension, flags: readonly (string | false | undefined)[]) => {
			const set = flags.filter(flag => !!flag);
			return set.length ? `${extension.identifier.id} (${set.join(', ')})` : extension.identifier.id;
		};
		const delegate = new class extends mock<IExtensionsWorkbenchService>() {
			override readonly installed = [installedTools];
			override async getExtensions(extensionInfos: IExtensionInfo[]) {
				calls.push(`query ${extensionInfos.map(info => info.id).join(', ')}`);
				return [marketplaceFormatter];
			}
			override async install(extension: IExtension | URI | string, options?: InstallExtensionOptions) {
				assert.ok(typeof extension !== 'string' && !URI.isUri(extension));
				calls.push(`install ${describe(extension, [options?.enable && 'enable', options?.installPreReleaseVersion && 'pre-release'])}`);
				return extension;
			}
			override async uninstall(extension: IExtension) {
				calls.push(`uninstall ${extension.identifier.id}`);
			}
			override async setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState) {
				enablements.push(enablementState);
			}
		};
		const service = new AgentsWindowExtensionPageWorkbenchService(delegate, {
			openExtensionPage: (extension, options: IExtensionEditorOptions | undefined) => calls.push(`open page ${describe(extension, [options?.tab && `tab ${options.tab}`])}`),
			search: text => calls.push(`search ${text}`),
			uninstall: async (extension, uninstall) => {
				calls.push(`confirm uninstalling ${extension.identifier.id}`);
				if (confirmsUninstall) {
					await uninstall();
				}
				return confirmsUninstall;
			},
			didInstall: extension => calls.push(`installed ${extension.identifier.id}`),
		});
		return { service, calls, enablements };
	}

	test('opens the pages of extensions, which it looks up by identifier, and searches extensions, in the section', async () => {
		const { service, calls } = createService();

		await service.open(marketplaceFormatter, { tab: ExtensionEditorTab.Changelog });
		await service.open('PUB.TOOLS');
		await service.open('pub.formatter');
		await service.openSearch('publisher:"Publisher"');
		await service.openSearch('@category:"Programming Languages"');

		assert.deepStrictEqual(calls, [
			'open page pub.formatter (tab changelog)',
			'open page pub.tools',
			'query pub.formatter',
			'open page pub.formatter',
			'search publisher:"Publisher"',
			// Like the Marketplace filters categories.
			'search category:"Programming Languages"',
		]);
	});

	test('enables extensions in the Agents window when it installs them, but not when it updates them', async () => {
		const { service, calls } = createService();

		await service.install(marketplaceFormatter, { installPreReleaseVersion: true });
		await service.install(installedTools);

		assert.deepStrictEqual(calls, [
			'install pub.formatter (enable, pre-release)',
			'installed pub.formatter',
			'install pub.tools',
		]);
	});

	test('enables and disables extensions only in the Agents window, like the section, which uses its dedicated workspace', async () => {
		const { service, enablements } = createService();

		for (const state of [EnablementState.EnabledGlobally, EnablementState.DisabledGlobally, EnablementState.EnabledWorkspace, EnablementState.DisabledWorkspace]) {
			await service.setEnablement(installedTools, state);
		}

		assert.deepStrictEqual(enablements, [EnablementState.EnabledWorkspace, EnablementState.DisabledWorkspace, EnablementState.EnabledWorkspace, EnablementState.DisabledWorkspace]);
	});

	test('uninstalls extensions once users confirm it, and cancels uninstalling them otherwise', async () => {
		const confirmed = createService(true);
		const cancelled = createService(false);

		await confirmed.service.uninstall(installedTools);
		const error = await cancelled.service.uninstall(installedTools).then(() => undefined, error => error);

		assert.deepStrictEqual({ confirmed: confirmed.calls, cancelled: cancelled.calls, cancellation: isCancellationError(error) }, {
			confirmed: ['confirm uninstalling pub.tools', 'uninstall pub.tools'],
			cancelled: ['confirm uninstalling pub.tools'],
			cancellation: true,
		});
	});
});
