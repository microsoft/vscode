/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { ComputeEmbeddingsOptions, Embedding, EmbeddingType, Embeddings, IEmbeddingsComputer } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { TelemetryCorrelationId } from '../../../../../util/common/telemetryCorrelationId';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolExtensionSource, LanguageModelToolMCPSource } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IToolEmbeddingsCache, IToolEmbeddingsComputer, ToolEmbeddingsComputer } from '../../../common/virtualTools/toolEmbeddingsComputer';
import { VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from '../../../common/virtualTools/virtualTool';
import { VirtualToolGrouper } from '../../../common/virtualTools/virtualToolGrouper';
import { TOOLS_AND_GROUPS_LIMIT, UNCATEGORIZED_TOOLS_GROUP_NAME } from '../../../common/virtualTools/virtualToolsConstants';
import { ISummarizedToolCategory } from '../../../common/virtualTools/virtualToolTypes';

/**
 * Regression coverage for https://github.com/microsoft/vscode/issues/324113 — the
 * virtual tool packer dropped registered tools so that they were neither top-level
 * nor reachable through any `activate_*` group.
 */
describe('Virtual Tools - grouping must not drop tools (#324113)', () => {
	const EMBEDDING_TYPE = EmbeddingType.text3small_512;

	function makeTool(name: string, source?: LanguageModelToolExtensionSource | LanguageModelToolMCPSource): LanguageModelToolInformation {
		return {
			name,
			description: `Tool for ${name}`,
			inputSchema: undefined,
			source,
			tags: [],
		};
	}

	function makeExtensionSource(id: string): LanguageModelToolExtensionSource {
		// TODO@connor4312
		return new (LanguageModelToolExtensionSource as any)(id, id);
	}

	function makeMCPSource(label: string): LanguageModelToolMCPSource {
		// TODO@connor4312
		return new (LanguageModelToolMCPSource as any)(label, label);
	}

	/** Deterministic vector so clustering behaves identically across runs. */
	function vectorFor(seed: number, dims = 8): number[] {
		const value: number[] = [];
		for (let i = 0; i < dims; i++) {
			value.push(Math.sin((seed + 1) * (i + 1)));
		}
		return value;
	}

	/**
	 * Emulates the embeddings endpoint. A batch containing any name in `failFor` comes
	 * back empty, which is how a failed or truncated remote call surfaces.
	 */
	class FakeEmbeddingsComputer implements IEmbeddingsComputer {
		declare _serviceBrand: undefined;

		constructor(private readonly failFor: ReadonlySet<string> = new Set()) { }

		async computeEmbeddings(type: EmbeddingType, inputs: readonly string[], options?: ComputeEmbeddingsOptions, telemetryInfo?: TelemetryCorrelationId, token?: CancellationToken): Promise<Embeddings> {
			if (inputs.some(input => this.failFor.has(input.split('\n')[0]))) {
				return { type, values: [] };
			}

			const values: Embedding[] = inputs.map((_, i) => ({ type, value: vectorFor(i) }));
			return { type, values };
		}
	}

	/** The real computer, with the pre-computed and on-disk caches removed. */
	class CachelessToolEmbeddingsComputer extends ToolEmbeddingsComputer {
		protected override getCaches() {
			return { embeddingType: EMBEDDING_TYPE, caches: [] };
		}
	}

	class PartiallyCachedToolEmbeddingsComputer extends ToolEmbeddingsComputer {
		protected override getCaches() {
			const cache: IToolEmbeddingsCache = {
				initialize: async () => { },
				get: tool => tool.name === 'partial-0' ? { type: EMBEDDING_TYPE, value: vectorFor(0) } : undefined,
				set: () => { },
			};
			return { embeddingType: EMBEDDING_TYPE, caches: [cache] };
		}
	}

	/** Grouper that never reaches the categorization endpoint. */
	class OfflineVirtualToolGrouper extends VirtualToolGrouper {
		protected override async _generateBulkGroupDescriptions(embeddingGroups: LanguageModelToolInformation[][]): Promise<{ groups: ISummarizedToolCategory[]; missed: number }> {
			return {
				groups: embeddingGroups.map((tools, index) => ({
					name: `group_${index + 1}`,
					summary: `Group containing ${tools.map(t => t.name).join(', ')}`,
					tools,
				})),
				missed: 0,
			};
		}
	}

	function createAccessor(failFor: ReadonlySet<string> = new Set()) {
		const collection = createExtensionUnitTestingServices();
		collection.define(IEmbeddingsComputer, new FakeEmbeddingsComputer(failFor));
		collection.define(IToolEmbeddingsComputer, new SyncDescriptor(CachelessToolEmbeddingsComputer));
		const accessor = collection.createTestingAccessor();
		// Built-in grouping is experiment-gated; pin it so slot pressure stays predictable.
		accessor.get(IConfigurationService).setConfig(ConfigKey.Advanced.DefaultToolsGrouped, false);
		return accessor;
	}

	function newRoot(): VirtualTool {
		const root = new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX, '', Infinity, { wasExpandedByDefault: true });
		root.isExpanded = true;
		return root;
	}

	it('keeps a toolset whose embeddings could not be computed', async () => {
		const accessor = createAccessor(new Set(['exo-run']));
		try {
			const tools = ['exo-run', 'exo-ping', 'exo-status', 'exo-logs', 'exo-restart']
				.map(name => makeTool(name, makeMCPSource('exo')));

			const computer = accessor.get(IInstantiationService).createInstance(CachelessToolEmbeddingsComputer);
			const groups = await computer.computeToolGroupings(tools, 3, CancellationToken.None);

			expect({
				groupCount: groups.length,
				survived: groups.flat().map(t => t.name).sort(),
			}).toEqual({
				groupCount: 3,
				survived: ['exo-logs', 'exo-ping', 'exo-restart', 'exo-run', 'exo-status'],
			});
		} finally {
			accessor.dispose();
		}
	});

	it('keeps singletons that do not fit in the remaining slots', async () => {
		const accessor = createAccessor();
		try {
			const tools = Array.from({ length: 24 }, (_, i) => makeTool(`browser-tool-${i}`, makeExtensionSource('browser-automation')));

			const computer = accessor.get(IInstantiationService).createInstance(CachelessToolEmbeddingsComputer);
			const groups = await computer.computeToolGroupings(tools, 3, CancellationToken.None);
			const survived = new Set(groups.flat().map(t => t.name));

			expect({
				withinLimit: groups.length <= 3,
				lost: tools.map(t => t.name).filter(n => !survived.has(n)),
			}).toEqual({ withinLimit: true, lost: [] });
		} finally {
			accessor.dispose();
		}
	});

	it('keeps tools without embeddings when the embedded tools would otherwise fill the limit', async () => {
		const accessor = createAccessor(new Set(['partial-1']));
		try {
			const tools = Array.from({ length: 5 }, (_, i) => makeTool(`partial-${i}`, makeExtensionSource('partial.extension')));
			const computer = accessor.get(IInstantiationService).createInstance(PartiallyCachedToolEmbeddingsComputer);

			const groups = await computer.computeToolGroupings(tools, 3, CancellationToken.None);

			expect({
				groupCount: groups.length,
				survived: groups.flat().map(tool => tool.name).sort(),
			}).toEqual({ groupCount: 3, survived: tools.map(tool => tool.name).sort() });
		} finally {
			accessor.dispose();
		}
	});

	it('addGroups is lossless: every registered tool stays reachable', async () => {
		const accessor = createAccessor(new Set(['exo-run']));
		try {
			const tools: LanguageModelToolInformation[] = [
				...Array.from({ length: 60 }, (_, i) => makeTool(`builtin_tool_${i}`)),
				...['exo-run', 'exo-ping', 'exo-status', 'exo-logs', 'exo-restart'].map(n => makeTool(n, makeMCPSource('exo'))),
				...Array.from({ length: 24 }, (_, i) => makeTool(`browser_tool_${i}`, makeExtensionSource('browser-automation'))),
				...Array.from({ length: 9 }, (_, i) => makeTool(`docs_tool_${i}`, makeMCPSource('docs'))),
				...Array.from({ length: 8 }, (_, i) => makeTool(`db_tool_${i}`, makeMCPSource('database'))),
			];

			const grouper = accessor.get(IInstantiationService).createInstance(OfflineVirtualToolGrouper);
			const root = newRoot();

			// An empty query keeps the embedding-prediction path off the network.
			await grouper.addGroups('', root, tools.slice(), CancellationToken.None);

			const reachable = new Set(Array.from(root.all(), item => item.name));

			expect({
				registered: tools.length,
				lost: tools.map(t => t.name).filter(n => !reachable.has(n)),
			}).toEqual({ registered: 106, lost: [] });
		} finally {
			accessor.dispose();
		}
	});

	it('keeps toolsets that are too numerous to each get their own slot', async () => {
		const accessor = createAccessor();
		try {
			// One tool each across far more MCP servers than there are slots.
			const tools = Array.from({ length: 120 }, (_, i) => makeTool(`srv${i}_tool`, makeMCPSource(`server-${i}`)));

			const grouper = accessor.get(IInstantiationService).createInstance(OfflineVirtualToolGrouper);
			const root = newRoot();
			await grouper.addGroups('', root, tools.slice(), CancellationToken.None);

			const reachable = new Set(Array.from(root.all(), item => item.name));
			const recovered = Array.from(root.all()).some(i => i.name === `${VIRTUAL_TOOL_NAME_PREFIX}${UNCATEGORIZED_TOOLS_GROUP_NAME}`);

			expect({
				collapsedCount: root.contents.filter(item => item.name !== 'activate_embeddings').length,
				lost: tools.map(t => t.name).filter(n => !reachable.has(n)),
				neededBackstop: recovered,
			}).toEqual({ collapsedCount: TOOLS_AND_GROUPS_LIMIT, lost: [], neededBackstop: false });
		} finally {
			accessor.dispose();
		}
	});

	it('recovers tools omitted by categorization into the uncategorized group', async () => {
		const accessor = createAccessor();
		try {
			const source = makeExtensionSource('lossy.extension');
			const extensionTools = Array.from({ length: 5 }, (_, i) => makeTool(`lossy-${i}`, source));
			const tools = [
				...Array.from({ length: 86 }, (_, i) => makeTool(`builtin-${i}`)),
				...extensionTools,
			];
			vi.spyOn(accessor.get(IToolEmbeddingsComputer), 'computeToolGroupings')
				.mockResolvedValue([extensionTools.slice(0, 2)]);
			const grouper = accessor.get(IInstantiationService).createInstance(OfflineVirtualToolGrouper);
			const root = newRoot();

			await grouper.addGroups('', root, tools, CancellationToken.None);

			const recovered = root.contents.find(item => item.name === `${VIRTUAL_TOOL_NAME_PREFIX}${UNCATEGORIZED_TOOLS_GROUP_NAME}`) as VirtualTool;
			expect(recovered.contents.map(tool => tool.name)).toEqual(extensionTools.slice(2).map(tool => tool.name));
		} finally {
			accessor.dispose();
		}
	});

});
