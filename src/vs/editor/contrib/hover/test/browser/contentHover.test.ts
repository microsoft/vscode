/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { LinkProvider } from '../../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { ITestCodeEditor, TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { LinkDetector } from '../../../links/browser/links.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { ContentHoverResult } from '../../browser/contentHoverTypes.js';
import { HoverStartSource } from '../../browser/hoverOperation.js';
import { HoverRangeAnchor, IHoverPart } from '../../browser/hoverTypes.js';
import { MarkdownHoverParticipant } from '../../browser/markdownHoverParticipant.js';

class RecordingClipboardService extends TestClipboardService {
	readonly copied = new DeferredPromise<string>();

	override async writeText(text: string): Promise<void> {
		await super.writeText(text);
		await this.copied.complete(text);
	}
}

suite('Content Hover', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function renderHover(editor: ITestCodeEditor, instantiationService: TestInstantiationService, disposables: DisposableStore) {
		const clipboard = new RecordingClipboardService();
		instantiationService.set(IClipboardService, clipboard);
		instantiationService.set(IMarkdownRendererService, instantiationService.createInstance(MarkdownRendererService));
		const participant = instantiationService.createInstance(MarkdownHoverParticipant, editor);
		const anchor = new HoverRangeAnchor(0, new Range(1, 1, 1, 1), undefined, undefined);
		const hoverParts = participant.computeSync(anchor, editor.getLineDecorations(1));
		const result = new ContentHoverResult(hoverParts, true, {
			anchor,
			shouldFocus: false,
			source: HoverStartSource.Mouse,
			insistOnKeepingHoverVisible: false
		});
		const hover = disposables.add(instantiationService.createInstance(RenderedContentHover, editor, result, [participant], {
			onContentsChanged: () => { },
			setMinimumDimensions: () => { },
			hide: () => { },
			focus: () => { }
		}));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		container.appendChild(hover.domNode);
		const button = container.querySelector<HTMLElement>('.hover-copy-button');
		assert.ok(button);
		return { hover, button, clipboard };
	}

	async function renderLinkHover(editor: ITestCodeEditor, instantiationService: TestInstantiationService, disposables: DisposableStore, provider: LinkProvider) {
		disposables.add(instantiationService.get(ILanguageFeaturesService).linkProvider.register('*', provider));
		const model = editor.getModel();
		const decorated = Event.toPromise(Event.filter(model.onDidChangeDecorations, () => model.getAllDecorations().some(decoration => decoration.options.description === 'detected-link')), disposables);
		disposables.add(instantiationService.createInstance(LinkDetector, editor));
		await decorated;
		return renderHover(editor, instantiationService, disposables);
	}

	test('issue #151235: Gitlens hover shows up in the wrong place', () => {
		const text = 'just some text';
		withTestCodeEditor(text, {}, (editor) => {
			const actual = RenderedContentHover.computeHoverPositions(
				editor,
				new Range(5, 5, 5, 5),
				[<IHoverPart>{ range: new Range(4, 1, 5, 6) }]
			);
			assert.deepStrictEqual(
				actual,
				{
					showAtPosition: new Position(5, 5),
					showAtSecondaryPosition: new Position(5, 5)
				}
			);
		});
	});

	test('issue #95328: Hover placement with word-wrap', () => {
		const text = 'just some text';
		const opts: TestCodeEditorInstantiationOptions = { wordWrap: 'wordWrapColumn', wordWrapColumn: 6 };
		withTestCodeEditor(text, opts, (editor) => {
			const actual = RenderedContentHover.computeHoverPositions(
				editor,
				new Range(1, 8, 1, 8),
				[<IHoverPart>{ range: new Range(1, 1, 1, 15) }]
			);
			assert.deepStrictEqual(
				actual,
				{
					showAtPosition: new Position(1, 8),
					showAtSecondaryPosition: new Position(1, 6)
				}
			);
		});
	});

	test('copies the link destination instead of the follow-link label', async () => {
		await withAsyncTestCodeEditor('link text', {}, async (editor, _viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			editor.registerDisposable(disposables);
			const destination = 'https://example.com/path?query=a%20b&other=1#fragment';
			const { hover, button, clipboard } = await renderLinkHover(editor, instantiationService, disposables, {
				provideLinks: () => ({ links: [{ range: new Range(1, 1, 1, 10), url: destination }] })
			});
			const accessibleContent = hover.getAccessibleWidgetContentAtIndex(0);

			button.click();

			assert.deepStrictEqual({
				accessibleContentIncludesLabel: accessibleContent.includes('Follow link'),
				accessibleContentIncludesDestination: accessibleContent.includes(destination),
				copied: await clipboard.copied.p
			}, {
				accessibleContentIncludesLabel: true,
				accessibleContentIncludesDestination: false,
				copied: destination
			});
		});
	});

	test('copies a URI link destination with the keyboard', async () => {
		await withAsyncTestCodeEditor('link text', {}, async (editor, _viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			editor.registerDisposable(disposables);
			const range = new Range(1, 1, 1, 10);
			const destination = URI.parse('https://example.com/encoded%20path?q=a%26b');
			const { hover, button, clipboard } = await renderLinkHover(editor, instantiationService, disposables, {
				provideLinks: () => ({ links: [{ range, url: destination, tooltip: 'Open documentation' }] })
			});
			const accessibleContent = hover.getAccessibleWidgetContentAtIndex(0);
			const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
			Object.defineProperty(event, 'keyCode', { get: () => 13 });

			button.dispatchEvent(event);

			assert.deepStrictEqual({
				accessibleContentIncludesLabel: accessibleContent.includes('Open documentation'),
				copied: await clipboard.copied.p
			}, {
				accessibleContentIncludesLabel: true,
				copied: destination.toString()
			});
		});
	});

	test('copies displayed text for unresolved links without resolving them', async () => {
		await withAsyncTestCodeEditor('link text', {}, async (editor, _viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			editor.registerDisposable(disposables);
			const range = new Range(1, 1, 1, 10);
			let resolutions = 0;
			const { hover, button, clipboard } = await renderLinkHover(editor, instantiationService, disposables, {
				provideLinks: () => ({ links: [{ range, tooltip: 'Open documentation' }] }),
				resolveLink: () => {
					resolutions++;
					return { range, url: 'https://example.com' };
				}
			});
			const accessibleContent = hover.getAccessibleWidgetContentAtIndex(0);

			button.click();

			assert.deepStrictEqual({
				copied: await clipboard.copied.p,
				resolutions
			}, {
				copied: accessibleContent,
				resolutions: 0
			});
		});
	});

	test('copies ordinary markdown hover text rather than its link destination', async () => {
		await withAsyncTestCodeEditor('link text', {}, async (editor, _viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			editor.registerDisposable(disposables);
			const decorations = editor.createDecorationsCollection([{
				range: new Range(1, 1, 1, 10),
				options: {
					description: 'test-markdown-hover',
					hoverMessage: new MarkdownString().appendText('More information: ').appendLink('https://example.com', 'Documentation')
				}
			}]);
			disposables.add(toDisposable(() => decorations.clear()));
			const { hover, button, clipboard } = renderHover(editor, instantiationService, disposables);
			const accessibleContent = hover.getAccessibleWidgetContentAtIndex(0);

			button.click();

			assert.deepStrictEqual({
				accessibleContent,
				copied: await clipboard.copied.p
			}, {
				accessibleContent: 'More information: Documentation',
				copied: 'More information: Documentation'
			});
		});
	});
});
