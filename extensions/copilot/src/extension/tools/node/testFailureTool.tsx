/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PrioritizedList, PromptElement, PromptElementProps, PromptPiece, TextChunk } from '@vscode/prompt-tsx';
import type { CancellationToken, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, PreparedToolInvocation, ProviderResult, TestMessage, TestResultSnapshot } from 'vscode';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { ITestFailure, ITestProvider } from '../../../platform/testing/common/testProvider';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, IEditFilterData, ToolRegistry } from '../common/toolsRegistry';

const enum Constant {
	IdealMaxTokenUsageProportion = 1 / 5,
	MinNumberOfTestsToInclude = 5,

	RankActive = 4,
	RankVisible = 3,
	RankOpen = 2,
	RankSCM = 1,
	RankNone = 0,

	MaxRank = Constant.RankActive,
}

/**
 * Resolves `#testFailure` into zero or more test failures based on the API.
 * It gathers all failures, and if there are less than five failures in the
 * most recent test run or they would use less than 1/5th of the token budget,
 * it renders them.
 *
 * Otherwise, they are ranked and trimmed in the order:
 *
 * 1. Tests or failures in editors that are open
 * 2. Tests or failures in files that have SCM changes
 * 3. Failures whose stacks touch editors that are open
 * 4. Failures whose stacks touch files with SCM changes
 *
 */
export class TestFailureTool implements ICopilotTool<{}> {
	public static readonly toolName = ToolName.TestFailure;

	constructor(
		@ITestProvider private readonly testProvider: ITestProvider,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke({ tokenizationOptions }: LanguageModelToolInvocationOptions<{}>): Promise<LanguageModelToolResult> {
		const failures = Array.from(this.testProvider.getAllFailures());
		if (failures.length === 0) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart(`No test failures were found yet, call the tool ${ToolName.CoreRunTest} to run tests and find failures.`),
			]);
		}

		const json = await renderPromptElementJSON(this.instantiationService, TestFailureList, { failures }, tokenizationOptions && {
			...tokenizationOptions,
			tokenBudget: tokenizationOptions.tokenBudget * Constant.IdealMaxTokenUsageProportion,
		});

		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(json)
		]);
	}

	async filterEdits(resource: URI): Promise<IEditFilterData | undefined> {
		if (await this.testProvider.hasTestsInUri(resource)) {
			return {
				title: l10n.t`Allow changing test assertions?`,
				message: l10n.t`The model wants to change the assertions in \`${this.workspaceService.asRelativePath(resource)}\`. Do you want to allow this?`,
			};
		}
	}

	prepareInvocation(options: LanguageModelToolInvocationPrepareOptions<{}>, token: CancellationToken): ProviderResult<PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Finding test failures`,
			pastTenseMessage: l10n.t`Found test failures`,
		};
	}

	provideInput(): Promise<{}> {
		return Promise.resolve({}); // just to avoid an unnecessary model call
	}
}

ToolRegistry.registerTool(TestFailureTool);

export class TestFailureList extends PromptElement<TestFailureListElementProps> {
	constructor(
		props: PromptElementProps<TestFailureListElementProps>,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IGitExtensionService private readonly gitExtensionService: IGitExtensionService,
	) {
		super(props);
	}

	render() {
		if (!this.props.failures.length) {
			return <TextChunk priority={100}>No test failures were found.</TextChunk>;
		}

		return <>
			<PrioritizedList priority={100} descending>
				{this.sortByRanks(this.props.failures).map(f => <TestFailureElement failure={f} />)}
			</PrioritizedList>
			<TextChunk priority={101}>
				## Rules:<br />
				- Always try to find an error in the implementation code first. Don't suggest any changes in my test cases unless I tell you to.<br />
				- If you need more information about anything in the codebase, use a tool like {ToolName.ReadFile}, {ToolName.ListDirectory}, or {ToolName.FindFiles} to find and read it. Never ask the user to provide it themselves.<br />
				- If you make changes to fix the test, call {ToolName.CoreRunTest} to run the tests and verify the fix.<br />
				- Don't try to make the same changes you made before to fix the test. If you're stuck, ask the user for pointers.<br />
			</TextChunk>
		</>;
	}

	private sortByRanks(failures: readonly ITestFailure[]) {
		const withRanks = failures.map((failure) => {
			let rank = failure.snapshot.uri ? this.rankFile(failure.snapshot.uri) : Constant.RankNone;
			for (const message of failure.task.messages) {
				if (rank === Constant.MaxRank) {
					return { failure, rank }; // abort early if there's nothing better
				}

				if (message.location) {
					rank = Math.max(rank, this.rankFile(message.location.uri));
				}
			}

			if (rank > Constant.RankNone) {
				return { failure, rank };
			}

			for (const message of failure.task.messages) {
				if (message.stackTrace) {
					// limit to first 10 stack frames to avoid going too crazy on giant stacks
					for (const frame of message.stackTrace.slice(0, 10)) {
						if (frame.uri) {
							rank = Math.max(rank, this.rankFile(frame.uri));
						}
					}
				}
			}

			// Ranks from stacktraces are always less than 'primary' ranks, so /10
			return { failure, rank: rank / 10 };
		});

		return withRanks.sort((a, b) => b.rank - a.rank).map(f => f.failure);
	}

	private rankFile(uri: URI): number {
		if (this.tabsAndEditorsService.activeTextEditor?.document.uri.toString() === uri.toString()) {
			return Constant.RankActive;
		}

		if (this.tabsAndEditorsService.visibleTextEditors?.some(e => e.document.uri.toString() === uri.toString())) {
			return Constant.RankVisible;
		}

		if (this.workspaceService.textDocuments.some(d => d.uri.toString() === uri.toString())) {
			return Constant.RankOpen;
		}

		// Check if file has SCM changes
		const repository = this.gitExtensionService.getExtensionApi()?.getRepository(uri);
		if (repository) {
			const state = repository.state;
			const indicies = [
				state.indexChanges,
				state.workingTreeChanges,
				state.mergeChanges,
				state.untrackedChanges
			];

			for (const changes of indicies) {
				if (changes.some(change => change.uri.toString() === uri.toString())) {
					return Constant.RankSCM;
				}
			}
		}

		return Constant.RankNone;
	}
}

interface TestFailureElementProps extends BasePromptElementProps {
	failure: ITestFailure;
}


export interface TestFailureListElementProps extends BasePromptElementProps {
	failures: ITestFailure[];
}

class TestFailureElement extends PromptElement<TestFailureElementProps> {
	constructor(
		props: TestFailureElementProps,
	) {
		super(props);
	}

	render() {
		const f = this.props.failure;

		const namePartsInSameUri: string[] = [];
		for (let n: TestResultSnapshot | undefined = f.snapshot; n; n = n.parent) {
			if (n.uri?.toString() === f.snapshot.uri?.toString()) {
				namePartsInSameUri.push(n.label);
			}
		}

		return <>
			<Tag name='testFailure' attrs={{
				testCase: namePartsInSameUri.reverse().join(' '),
				path: f.snapshot.uri?.fsPath,
			}}>
				{f.task.messages.map(m => <TestMessageElement message={m} />)}
			</Tag>
		</>;
	}
}

interface TestMessageElementProps extends BasePromptElementProps {
	message: TestMessage;
}


class TestMessageElement extends PromptElement<TestMessageElementProps> {
	constructor(
		props: TestMessageElementProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	render() {
		const f = this.props.message;
		const children: PromptPiece[] = [];
		if (f.expectedOutput !== undefined && f.actualOutput !== undefined) {
			children.push(
				<Tag name='expectedOutput'>{f.expectedOutput}</Tag>,
				<Tag name='actualOutput'>{f.actualOutput}</Tag>,
			);
		} else {
			children.push(<Tag name='message'>{typeof f.message === 'string' ? f.message : f.message.value}</Tag>);
		}
		if (f.stackTrace) {
			for (const { label, position, uri } of f.stackTrace) {
				// if there's both a position and URI, the XML element alone is fully descriptive so omit the label
				if (position && uri) {
					children.push(
						<Tag name='stackFrame' attrs={{ path: this.workspaceService.asRelativePath(uri), line: position.line, col: position.character }} />,
					);
				} else {
					children.push(
						<Tag name='stackFrame' attrs={{ path: uri && this.workspaceService.asRelativePath(uri), line: position?.line, col: position?.character }}>{label}</Tag>,
					);
				}
			}
		}

		return <>{children}</>;
	}
}
