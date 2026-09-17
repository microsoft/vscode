/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SyncDescriptor } from '../../../../../../util/vs/platform/instantiation/common/descriptors';
import { createExtensionTestingServices } from '../../../../../test/vscode-node/services';
import { ICompletionsEditorAndPluginInfo } from '../../../lib/src/config';
import { ICompletionsFileSystemService } from '../../../lib/src/fileSystem';
import { ICompletionsFetcherService } from '../../../lib/src/networking';
import { _createBaselineContext } from '../../../lib/src/test/context';
import { StaticFetcher } from '../../../lib/src/test/fetcher';
import { ICompletionsTextDocumentManagerService } from '../../../lib/src/textDocumentManager';
import { VSCodeEditorInfo } from '../config';
import { CopilotExtensionStatus, ICompletionsExtensionStatus } from '../extensionStatus';
import { extensionFileSystem } from '../fileSystem';
import { ExtensionTextDocumentManager } from '../textDocumentManager';
import { ExtensionTestConfigProvider } from './config';

/**
 * A default context for VSCode extension testing, building on general one in `lib`.
 * Only includes items that are needed for almost all extension tests.
 */
export function createExtensionTestingContext() {
	let serviceCollection = createExtensionTestingServices();
	serviceCollection = _createBaselineContext(serviceCollection, new ExtensionTestConfigProvider());

	serviceCollection.define(ICompletionsFetcherService, new StaticFetcher());
	serviceCollection.define(ICompletionsEditorAndPluginInfo, new VSCodeEditorInfo());
	serviceCollection.define(ICompletionsTextDocumentManagerService, new SyncDescriptor(ExtensionTextDocumentManager));
	serviceCollection.define(ICompletionsFileSystemService, extensionFileSystem);
	serviceCollection.define(ICompletionsExtensionStatus, new CopilotExtensionStatus());

	return serviceCollection;
}
