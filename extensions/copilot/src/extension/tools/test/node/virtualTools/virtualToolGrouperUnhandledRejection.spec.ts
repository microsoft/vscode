/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IEmbeddingsComputer } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { Barrier, DeferredPromise } from '../../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolExtensionSource } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from '../../../common/virtualTools/virtualTool';
import { VirtualToolGrouper } from '../../../common/virtualTools/virtualToolGrouper';
import { TOOLS_AND_GROUPS_LIMIT } from '../../../common/virtualTools/virtualToolsConstants';
import { ISummarizedToolCategory } from '../../../common/virtualTools/virtualToolTypes';

class BlockingVirtualToolGrouper extends VirtualToolGrouper {
	readonly groupingStarted = new DeferredPromise<void>();
	readonly continueGrouping = new Barrier();

	protected override async _generateBulkGroupDescriptions(embeddingGroups: LanguageModelToolInformation[][], _token: CancellationToken): Promise<{ groups: ISummarizedToolCategory[]; missed: number }> {
		await this.groupingStarted.complete(undefined);
		await this.continueGrouping.wait();
		return {
			groups: embeddingGroups.map(tools => ({
				name: 'test_group',
				summary: 'Test group',
				tools,
			})),
			missed: 0,
		};
	}
}

function makeExtensionSource(id: string): LanguageModelToolExtensionSource {
	const source: LanguageModelToolExtensionSource = Object.create(LanguageModelToolExtensionSource.prototype);
	Object.defineProperties(source, {
		id: { value: id, enumerable: true },
		label: { value: id, enumerable: true },
	});
	return source;
}

function makeTool(name: string, source?: LanguageModelToolExtensionSource): LanguageModelToolInformation {
	return {
		name,
		description: `Tool for ${name}`,
		inputSchema: undefined,
		source,
		tags: [],
	};
}

describe('Virtual Tools - Grouper promise handling', () => {
	let accessor: ITestingServicesAccessor;
	let grouper: BlockingVirtualToolGrouper;

	beforeEach(() => {
		const services = createExtensionUnitTestingServices();
		accessor = services.createTestingAccessor();
		grouper = accessor.get(IInstantiationService).createInstance(BlockingVirtualToolGrouper);
		vi.spyOn(accessor.get(IConfigurationService), 'getExperimentBasedConfig').mockReturnValue(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		accessor.dispose();
	});

	it('handles an embeddings rejection while other grouping work is pending', async () => {
		const embeddingsError = new Error('Error fetching embeddings: 422');
		vi.spyOn(accessor.get(IEmbeddingsComputer), 'computeEmbeddings').mockRejectedValue(embeddingsError);

		const unhandledRejections: unknown[] = [];
		const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
		process.on('unhandledRejection', onUnhandledRejection);

		const builtInTools = Array.from({ length: TOOLS_AND_GROUPS_LIMIT - 1 }, (_, index) => makeTool(`builtin_${index}`));
		const extensionSource = makeExtensionSource('test.extension');
		const extensionTools = [
			makeTool('extension_1', extensionSource),
			makeTool('extension_2', extensionSource),
		];
		const root = new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX, '', Infinity, { wasExpandedByDefault: true });
		let grouping: Promise<void> | undefined;

		try {
			grouping = grouper.addGroups('query', root, [...builtInTools, ...extensionTools], CancellationToken.None);
			await grouper.groupingStarted.p;
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(unhandledRejections).toEqual([]);

			grouper.continueGrouping.open();
			await expect(grouping).resolves.toBeUndefined();
		} finally {
			grouper.continueGrouping.open();
			await grouping;
			process.off('unhandledRejection', onUnhandledRejection);
		}
	});
});
