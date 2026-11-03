/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExternalUriOpenerPriority } from '../../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IResourceEditorInput, ViewColumn } from '../../../../../../platform/editor/common/editor.js';
import { IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IExternalUriOpener, IExternalUriOpenerService } from '../../../../externalUriOpener/common/externalUriOpenerService.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { LocalhostLinkOpenerContribution } from '../../../electron-browser/features/browserTabManagementFeatures.js';

suite('Localhost Link Opener', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createOpener(openLocalhostLinks: boolean, remote: boolean = false) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const opened: { url: unknown; group: PreferredGroup | undefined }[] = [];
		instantiationService.stub(IExternalUriOpenerService, { registerExternalOpenerProvider: () => Disposable.None });
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			'workbench.browser.openLocalhostLinks': openLocalhostLinks
		}));
		instantiationService.stub(IBrowserViewWorkbenchService, {
			resolveNetwork: () => remote ? { authority: 'remote-host' } : undefined,
			getPreferredGroup: async group => group
		});
		instantiationService.stub(IEditorService, 'openEditor', async (input: IResourceEditorInput, group?: PreferredGroup) => {
			opened.push({ url: (input.options?.viewState as { url?: unknown } | undefined)?.url, group });
			return undefined;
		});
		const contribution = store.add(instantiationService.createInstance(LocalhostLinkOpenerContribution));
		const openers = await Iterable.asyncToArray(contribution.getOpeners(URI.parse('http://localhost:3000')));
		return { contribution, opener: openers[0], opened };
	}

	test('is preferred for localhost links when enabled, an option for other web links, and never offered for other schemes', async () => {
		const enabled = await createOpener(true);
		const disabled = await createOpener(false);
		const priority = (opener: IExternalUriOpener, uri: string) => opener.canOpen(URI.parse(uri), CancellationToken.None);

		assert.deepStrictEqual({
			enabledLocalhost: await priority(enabled.opener, 'http://localhost:3000/app'),
			enabledAllInterfaces: await priority(enabled.opener, 'http://0.0.0.0:3000'),
			enabledWeb: await priority(enabled.opener, 'https://example.com'),
			disabledLocalhost: await priority(disabled.opener, 'http://localhost:3000/app'),
			upperCaseSchemeOpeners: (await Iterable.asyncToArray(enabled.contribution.getOpeners(URI.parse('HTTP://localhost:3000')))).length,
			fileOpeners: (await Iterable.asyncToArray(enabled.contribution.getOpeners(URI.file('/workspace/index.html')))).length,
		}, {
			enabledLocalhost: ExternalUriOpenerPriority.Preferred,
			enabledAllInterfaces: ExternalUriOpenerPriority.Preferred,
			enabledWeb: ExternalUriOpenerPriority.Option,
			disabledLocalhost: ExternalUriOpenerPriority.Option,
			upperCaseSchemeOpeners: 1,
			fileOpeners: 0,
		});
	});

	for (const viewColumn of [undefined, ViewColumn.Beside]) {
		test(`opens the link as written, in the default or explicit side placement: ${viewColumn}`, async () => {
			const { opener, opened } = await createOpener(true);
			const href = 'https://localhost:9448/review?pr=342081&q=a%26b#changes';
			const handled = await opener.openExternalUri(href, { sourceUri: URI.parse(href), sourceHref: href, viewColumn }, CancellationToken.None);
			assert.deepStrictEqual({ handled, opened }, {
				handled: true,
				opened: [{ url: href, group: viewColumn === ViewColumn.Beside ? SIDE_GROUP : undefined }]
			});
		});
	}

	for (const remote of [false, true]) {
		test(`preserves URL encoding ${remote ? 'before' : 'after'} port forwarding for ${remote ? 'remote' : 'local'} browsers`, async () => {
			const { opener, opened } = await createOpener(true, remote);
			const sourceHrefs = [
				'http://localhost:3000/?q=hi',
				'http://localhost:3000/a%2Fb?q=a%26b%3Dc&space=a%20b&percent=%25#part%23one',
			];
			for (const sourceHref of sourceHrefs) {
				const href = sourceHref.replace('localhost:3000', '127.0.0.1:4000');
				await opener.openExternalUri(href, { sourceUri: URI.parse(sourceHref), sourceHref }, CancellationToken.None);
			}
			assert.deepStrictEqual(opened, sourceHrefs.map(sourceHref => ({
				url: remote ? sourceHref : sourceHref.replace('localhost:3000', '127.0.0.1:4000'),
				group: undefined,
			})));
		});
	}
});
