/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ChatPromptReference, ChatResponseStream } from 'vscode';
import { isCodeBlockWithResource } from '../../src/extension/codeBlocks/node/codeBlockProcessor';
import { ITabsAndEditorsService } from '../../src/platform/tabs/common/tabsAndEditorsService';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { isLocation } from '../../src/util/common/types';
import { URI } from '../../src/util/vs/base/common/uri';
import { ServicesAccessor } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ChatLocation, Location, Uri } from '../../src/vscodeTypes';
import { EditingSimulationHost, EditingSimulationHostResponseProcessor, simulateEditingScenario } from './inlineChatSimulator';
import { EditTestStrategy, IScenario, IScenarioQuery, OutcomeAnnotation } from './types';

export type EditTestStrategyPanel = EditTestStrategy.Agent | EditTestStrategy.Edits;

export async function simulatePanelCodeMapper(
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario,
	strategy?: EditTestStrategyPanel,
	spyOnStream?: (stream: ChatResponseStream) => ChatResponseStream
): Promise<void> {
	const overrideCommand = strategy === undefined ? undefined :
		strategy === EditTestStrategy.Edits ? '/edit' :
			'/editAgent';
	const ensureSlashEdit = (query: string) => {
		if (!overrideCommand) {
			return query;
		}

		return query.startsWith(overrideCommand) ? query : `${overrideCommand} ${query}`;
	};
	const prependEditToUserQueries = (queries: IScenarioQuery[]) => {
		return queries.map(scenarioQuery => {
			return {
				...scenarioQuery,
				query: ensureSlashEdit(scenarioQuery.query),
			};
		});
	};
	const massagedScenario = { ...scenario, queries: prependEditToUserQueries(scenario.queries) };


	const host: EditingSimulationHost = {
		prepareChatRequestLocation: (accessor: ServicesAccessor) => {
			return {
				location: ChatLocation.Panel,
				location2: undefined,
			};
		},

		contributeAdditionalReferences: (accessor: ServicesAccessor, existingReferences: readonly ChatPromptReference[]) => {
			const tabsAndEditorsService = accessor.get(ITabsAndEditorsService);
			const activeTextEditor = tabsAndEditorsService.activeTextEditor;
			if (activeTextEditor) {
				const existingReference = existingReferences.find(ref => _extractUri(ref.value)?.toString() === activeTextEditor.document.uri.toString());
				if (!existingReference) {
					const varWithArg = `file:${activeTextEditor.document.uri.path}`;
					return [{
						id: `copilot.file`,
						name: varWithArg,
						value: new Location(
							activeTextEditor.document.uri,
							activeTextEditor.selection,
						)
					}];
				}
			}
			return [];

			function _extractUri(something: Uri | Location | unknown | undefined): Uri | undefined {
				if (isLocation(something)) {
					return something.uri;
				}
				if (URI.isUri(something)) {
					return something;
				}
				return undefined;
			}
		},

		provideResponseProcessor: (_query: IScenarioQuery): EditingSimulationHostResponseProcessor => {
			return {
				spyOnStream: (stream: ChatResponseStream): ChatResponseStream => {
					return spyOnStream ? spyOnStream(stream) : stream;
				},
				postProcess: async (accessor, workspace, stream, chatResult): Promise<OutcomeAnnotation[]> => {
					const annotations: OutcomeAnnotation[] = [];
					if (strategy === EditTestStrategy.Edits) {
						if (chatResult?.errorDetails) {
							annotations.push({
								severity: 'error',
								label: 'chat-error',
								message: `Chat request failed: ${chatResult.errorDetails.message}`,
							});
							return annotations;
						}

						const codeBlocks = chatResult?.metadata?.codeBlocks;
						if (!Array.isArray(codeBlocks)) {
							throw new Error('No codeblocks in chat result metadata');
						}
						for (const codeBlock of codeBlocks) {
							if (!isCodeBlockWithResource(codeBlock)) {
								annotations.push({
									severity: 'error',
									label: 'missing-path-in-code-block',
									message: 'Code block without a file path',
								});
							}
						}
					}
					return annotations;
				}
			};
		}
	};

	return simulateEditingScenario(
		testingServiceCollection,
		massagedScenario,
		host
	);
}
