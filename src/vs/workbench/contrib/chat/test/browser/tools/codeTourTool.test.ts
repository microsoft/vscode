/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';
import { IAgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { ICodeTourRuntime, ICodeTourService } from '../../../browser/codeTour/codeTourService.js';
import { CodeTourTool } from '../../../browser/tools/codeTourTool.js';
import { IChatCodeTourData, IChatCodeTourStop } from '../../../common/chatService/chatService.js';
import { IToolInvocation, IToolResult, IToolResultTextPart, ToolInvocationPresentation, ToolProgress } from '../../../common/tools/languageModelToolsService.js';
import { IObservable, constObservable } from '../../../../../../base/common/observable.js';

function getTextContent(result: IToolResult): string {
	return result.content.find((p): p is IToolResultTextPart => p.kind === 'text')?.value ?? '';
}

suite('CodeTourTool', () => {

	const disposables = new DisposableStore();

	const sessionResource = URI.parse('vscode-chat-session://test/1');
	const workspaceFolder = URI.parse('file:///workspace');

	/** In-memory stand-in that records what the tool asked the tour service to do. */
	class TestCodeTourService implements ICodeTourService {
		declare readonly _serviceBrand: undefined;

		tour: IChatCodeTourData | undefined;
		stopped = false;
		finished = false;
		/** Range `resolveRange` should hand back, or `undefined` to simulate a failed resolve. */
		resolvedRange: IRange | undefined = new Range(3, 1, 5, 1);

		startTour(_sessionResource: URI, title: string): IChatCodeTourData {
			this.tour = { kind: 'codeTour', tourId: 'tour-1', title, stops: [] };
			return this.tour;
		}
		getActiveTour(): IChatCodeTourData | undefined {
			return this.tour;
		}
		async addStop(_sessionResource: URI, stop: IChatCodeTourStop): Promise<boolean> {
			if (this.finished) {
				return false;
			}
			this.tour?.stops.push(stop);
			return true;
		}
		async revealStop(): Promise<void> { }
		observeRuntime(): IObservable<ICodeTourRuntime | undefined> {
			return constObservable(undefined);
		}
		stopTour(): void {
			this.stopped = true;
		}
		isStopped(): boolean {
			return this.stopped;
		}
		async resolveRange(): Promise<IRange | undefined> {
			return this.resolvedRange;
		}
	}

	function createWorkspaceService(): IWorkspaceContextService {
		return {
			_serviceBrand: undefined,
			getWorkspace: () => ({ folders: [{ uri: workspaceFolder } as IWorkspaceFolder] }),
			getWorkspaceFolder: () => ({ uri: workspaceFolder } as IWorkspaceFolder),
		} as unknown as IWorkspaceContextService;
	}

	/** Allows everything except a single blocked host, mirroring the agent network filter. */
	function createNetworkFilter(): IAgentNetworkFilterService {
		return {
			isUriAllowed: (uri: URI) => uri.authority !== 'blocked.example.com',
			formatError: (uri: URI) => `Blocked ${uri.authority}`,
		} as unknown as IAgentNetworkFilterService;
	}

	function createTool(tourService: TestCodeTourService): CodeTourTool {
		return new CodeTourTool(tourService, createWorkspaceService(), createNetworkFilter());
	}

	function createInvocation(parameters: Record<string, unknown>): IToolInvocation {
		return {
			callId: '1',
			toolId: 'vscode_codeTour',
			parameters,
			context: { sessionResource },
		} as IToolInvocation;
	}

	const noopProgress: ToolProgress = { report() { } };

	function invoke(tool: CodeTourTool, parameters: Record<string, unknown>): Promise<IToolResult> {
		return tool.invoke(createInvocation(parameters), async () => 0, noopProgress, CancellationToken.None);
	}

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('the first stop starts the tour and carries the widget data', async () => {
		const tourService = new TestCodeTourService();
		const tool = createTool(tourService);

		const result = await invoke(tool, { tourTitle: 'How chat works', stopTitle: 'Entry point', narration: 'Where it starts.', file: 'src/main.ts', startLine: 3, endLine: 5 });

		assert.deepStrictEqual(
			{
				toolSpecificData: result.toolSpecificData,
				text: getTextContent(result),
			},
			{
				toolSpecificData: {
					kind: 'codeTour',
					tourId: 'tour-1',
					title: 'How chat works',
					stops: [{
						title: 'Entry point',
						narration: 'Where it starts.',
						uri: URI.parse('file:///workspace/src/main.ts'),
						range: new Range(3, 1, 5, 1),
						url: undefined,
					}],
				},
				text: 'Showed stop 1: Entry point.',
			});
	});

	test('later stops append to the same tour without a second widget', async () => {
		const tourService = new TestCodeTourService();
		const tool = createTool(tourService);

		await invoke(tool, { tourTitle: 'Tour', stopTitle: 'One', narration: 'First.', file: 'a.ts', startLine: 1 });
		const second = await invoke(tool, { stopTitle: 'Two', narration: 'Second.', file: 'b.ts', startLine: 1, isLast: true });

		const prepared = await tool.prepareToolInvocation({ parameters: { stopTitle: 'Three', narration: 'Third.' }, toolCallId: '3', chatSessionResource: sessionResource }, CancellationToken.None);

		assert.deepStrictEqual(
			{
				secondToolSpecificData: second.toolSpecificData,
				secondText: getTextContent(second),
				stopTitles: tourService.tour?.stops.map(s => s.title),
				laterPresentation: prepared?.presentation,
			},
			{
				secondToolSpecificData: undefined,
				secondText: 'Showed stop 2: Two. This was the final stop. Wrap up the explanation for the user.',
				stopTitles: ['One', 'Two'],
				laterPresentation: ToolInvocationPresentation.Hidden,
			});
	});

	test('a stopped tour tells the model to stop presenting', async () => {
		const tourService = new TestCodeTourService();
		tourService.stopped = true;
		const tool = createTool(tourService);

		const result = await invoke(tool, { stopTitle: 'One', narration: 'First.', file: 'a.ts', startLine: 1 });

		assert.deepStrictEqual(
			{ text: getTextContent(result), startedTour: !!tourService.tour },
			{ text: 'The user stopped the tour. Do not present more stops; respond to the user directly instead.', startedTour: false });
	});

	test('a stop after the final one tells the model the tour already ended', async () => {
		const tourService = new TestCodeTourService();
		const tool = createTool(tourService);

		await invoke(tool, { tourTitle: 'Tour', stopTitle: 'One', narration: 'First.', file: 'a.ts', startLine: 1, isLast: true });
		tourService.finished = true;
		const extra = await invoke(tool, { stopTitle: 'Two', narration: 'Encore.', file: 'b.ts', startLine: 1 });

		assert.deepStrictEqual(
			{ text: getTextContent(extra), stopTitles: tourService.tour?.stops.map(s => s.title) },
			{ text: 'This tour has already ended. Do not present more stops; summarize the explanation for the user instead.', stopTitles: ['One'] });
	});

	test('unresolvable locations still produce a stop, with a note for the model', async () => {
		const tourService = new TestCodeTourService();
		tourService.resolvedRange = undefined;
		const tool = createTool(tourService);

		const outsideWorkspace = await invoke(tool, { tourTitle: 'Tour', stopTitle: 'Escape', narration: 'Nope.', file: '../outside.ts' });
		const unresolvedRange = await invoke(tool, { stopTitle: 'Symbol', narration: 'Hmm.', file: 'a.ts', symbol: 'missing' });

		assert.deepStrictEqual(
			{
				outsideWorkspaceText: getTextContent(outsideWorkspace),
				unresolvedRangeText: getTextContent(unresolvedRange),
				stopUris: tourService.tour?.stops.map(s => s.uri?.toString()),
			},
			{
				outsideWorkspaceText: 'Showed stop 1: Escape. Could not resolve "../outside.ts" inside the workspace, so no file was opened for this stop.',
				unresolvedRangeText: 'Showed stop 2: Symbol. Could not resolve the requested range, so the file was opened without a highlight. Provide startLine/endLine for the next stop.',
				stopUris: [undefined, 'file:///workspace/a.ts'],
			});
	});

	test('the tool refuses to run outside a chat session', async () => {
		const tool = createTool(new TestCodeTourService());

		const result = await tool.invoke(
			{ callId: '1', toolId: 'vscode_codeTour', parameters: { stopTitle: 'One', narration: 'First.' }, context: undefined } as IToolInvocation,
			async () => 0, noopProgress, CancellationToken.None);

		assert.strictEqual(getTextContent(result), 'The code tour tool can only be used inside a chat session.');
	});

	test('a stop URL is confirmed when allowed and rejected when the network filter blocks it', async () => {
		const tourService = new TestCodeTourService();
		const tool = createTool(tourService);

		const prepared = await tool.prepareToolInvocation(
			{ parameters: { stopTitle: 'Docs', narration: 'Read this.', url: 'https://ok.example.com/docs' }, toolCallId: '1', chatSessionResource: sessionResource },
			CancellationToken.None);

		await assert.rejects(
			() => tool.prepareToolInvocation(
				{ parameters: { stopTitle: 'Bad', narration: 'Nope.', url: 'https://blocked.example.com/x' }, toolCallId: '2', chatSessionResource: sessionResource },
				CancellationToken.None),
			/Blocked blocked.example.com/);

		await invoke(tool, { tourTitle: 'Tour', stopTitle: 'Junk', narration: 'Not a URL.', url: 'not a url' });

		assert.deepStrictEqual(
			{
				confirmationTitle: prepared?.confirmationMessages?.title,
				// A confirmation cannot render on a hidden invocation.
				presentation: prepared?.presentation,
				storedUrl: tourService.tour?.stops[0].url,
			},
			{ confirmationTitle: 'Open Browser Page?', presentation: undefined, storedUrl: undefined });
	});
});
