/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { McpConfigurationServer } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IOpenURLOptions, IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { McpAddConfigurationCommand } from './mcpCommandsAddConfiguration.js';

const providerScheme = 'mcp-install';

export class McpUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {
	public static readonly scheme = providerScheme;


	private readonly _fileSystemProvider = new Lazy(() => {
		return this._instaService.invokeFunction(accessor => {
			const fileService = accessor.get(IFileService);
			const filesystem = new InMemoryFileSystemProvider();
			this._register(fileService.registerProvider(providerScheme, filesystem));
			return providerScheme;
		});
	});

	constructor(
		@IURLService urlService: IURLService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (uri.path !== 'mcp/install') {
			return false;
		}

		let parsed: McpConfigurationServer & { name: string };
		try {
			parsed = JSON.parse(decodeURIComponent(uri.query));
		} catch (e) {
			return false;
		}

		const { name, ...rest } = parsed;

		const scheme = this._fileSystemProvider.value;
		const fileUri = URI.from({ scheme, path: `/${encodeURIComponent(name)}.json` });

		await this._fileService.writeFile(
			fileUri,
			VSBuffer.fromString(JSON.stringify(rest, null, '\t')),
		);

		const addConfigHelper = this._instaService.createInstance(McpAddConfigurationCommand, undefined);
		addConfigHelper.pickForUrlHandler(fileUri, true);

		return Promise.resolve(true);
	}
}
