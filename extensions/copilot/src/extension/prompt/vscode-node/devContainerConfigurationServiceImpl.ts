/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DevContainerConfigGeneratorArguments, DevContainerConfigGeneratorResult, IDevContainerConfigurationService } from '../../../platform/devcontainer/common/devContainerConfigurationService';
import { ISearchService } from '../../../platform/search/common/searchService';
import * as path from '../../../util/vs/base/common/path';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { DevContainerConfigGenerator } from '../node/devContainerConfigGenerator';

export class DevContainerConfigurationServiceImpl implements IDevContainerConfigurationService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
	) { }

	async generateConfiguration(args: DevContainerConfigGeneratorArguments, cancellationToken: vscode.CancellationToken): Promise<DevContainerConfigGeneratorResult> {
		if (cancellationToken.isCancellationRequested) {
			return { type: 'cancelled' };
		}

		const filenames = (await Promise.all(['*', '*/*', '*/*/*']
			.map(pattern => this.searchService.findFilesWithDefaultExcludes(new vscode.RelativePattern(args.rootUri, pattern), 1000, cancellationToken))))
			.flat()
			.map(entry => path.posix.relative(args.rootUri.path, entry.path));

		const generator = this.instantiationService.createInstance(DevContainerConfigGenerator);
		return generator.generate(args.index, filenames, cancellationToken);
	}
}
