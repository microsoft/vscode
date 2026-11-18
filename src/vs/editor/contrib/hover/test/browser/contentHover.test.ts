/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { HoverVerbosityAction } from '../../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { EditorHoverStatusBar } from '../../browser/contentHoverStatusBar.js';
import { HoverStartSource } from '../../browser/hoverOperation.js';
import { HoverRangeAnchor, IEditorHoverRenderContext, IHoverPart } from '../../browser/hoverTypes.js';
import { MarkdownHoverParticipant } from '../../browser/markdownHoverParticipant.js';
import { TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import '../../browser/hover.css';

suite('Content Hover', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('verbosity actions use the hover foreground and clearly dim the unavailable action', async () => {
		await withAsyncTestCodeEditor('some text', {}, async (editor, _viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			try {
				instantiationService.set(IMarkdownRendererService, new MarkdownRendererService(NullOpenerService));
				const range = new Range(1, 1, 1, 5);
				let canIncrease = true;
				disposables.add(instantiationService.get(ILanguageFeaturesService).hoverProvider.register('*', {
					provideHover: () => ({
						range,
						contents: [{ value: 'Hover content' }],
						canIncreaseVerbosity: canIncrease,
						canDecreaseVerbosity: !canIncrease
					})
				}));
				const participant = instantiationService.createInstance(MarkdownHoverParticipant, editor);
				const container = mainWindow.document.createElement('div');
				container.className = 'monaco-editor';
				const hover = mainWindow.document.createElement('div');
				hover.className = 'monaco-hover';
				container.appendChild(hover);
				mainWindow.document.body.appendChild(container);
				disposables.add(toDisposable(() => container.remove()));

				for (const foreground of ['rgb(204, 204, 204)', 'rgb(97, 97, 97)', 'rgb(255, 255, 255)', 'rgb(41, 41, 41)']) {
					hover.style.setProperty('--vscode-editorHoverWidget-foreground', foreground);
					hover.style.setProperty('--vscode-textLink-foreground', 'rgb(0, 0, 128)');
					for (const increase of [true, false]) {
						canIncrease = increase;
						const parts = [];
						for await (const part of participant.computeAsync(new HoverRangeAnchor(0, range, undefined, undefined), [], HoverStartSource.Keyboard, CancellationToken.None)) {
							parts.push(part);
						}
						const context: IEditorHoverRenderContext = {
							fragment: mainWindow.document.createDocumentFragment(),
							statusBar: disposables.add(instantiationService.createInstance(EditorHoverStatusBar)),
							onContentsChanged: () => { },
							setMinimumDimensions: () => { },
							hide: () => { },
							focus: () => { }
						};
						const rendered = participant.renderHoverParts(context, parts);
						try {
							hover.replaceChildren(context.fragment);
							const actions = Array.from(hover.querySelectorAll('.verbosity-actions-inner .codicon'));
							assert.deepStrictEqual(actions.map(action => ({
								color: mainWindow.getComputedStyle(action).color,
								opacity: mainWindow.getComputedStyle(action).opacity,
								cursor: mainWindow.getComputedStyle(action).cursor,
								enabled: action.classList.contains('enabled')
							})), [
								{ color: foreground, opacity: increase ? '1' : '0.25', cursor: increase ? 'pointer' : 'default', enabled: increase },
								{ color: foreground, opacity: increase ? '0.25' : '1', cursor: increase ? 'default' : 'pointer', enabled: !increase }
							]);
						} finally {
							rendered.dispose();
						}
					}
				}
			} finally {
				disposables.dispose();
			}
		});
	});

	test('verbosity actions stay at the bottom of the hover row after the verbosity changes', async () => {
		await withAsyncTestCodeEditor('some text', {}, async (editor, _viewModel, instantiationService) => {
			const disposables = new DisposableStore();
			try {
				instantiationService.set(IMarkdownRendererService, new MarkdownRendererService(NullOpenerService));
				const range = new Range(1, 1, 1, 5);
				disposables.add(instantiationService.get(ILanguageFeaturesService).hoverProvider.register('*', {
					provideHover: (_model, _position, _token, context) => {
						const lineCount = context?.verbosityRequest ? 6 : 1;
						return {
							range,
							contents: [{ value: Array.from({ length: lineCount }, (_, i) => `Line ${i}`).join('\n\n') }],
							canIncreaseVerbosity: true,
							canDecreaseVerbosity: !!context?.verbosityRequest
						};
					}
				}));
				const participant = instantiationService.createInstance(MarkdownHoverParticipant, editor);
				const container = mainWindow.document.createElement('div');
				container.className = 'monaco-editor';
				const hover = mainWindow.document.createElement('div');
				hover.className = 'monaco-hover';
				const scroller = mainWindow.document.createElement('div');
				scroller.style.overflow = 'hidden';
				scroller.style.height = '400px';
				hover.appendChild(scroller);
				container.appendChild(hover);
				mainWindow.document.body.appendChild(container);
				disposables.add(toDisposable(() => container.remove()));

				const parts = [];
				for await (const part of participant.computeAsync(new HoverRangeAnchor(0, range, undefined, undefined), [], HoverStartSource.Keyboard, CancellationToken.None)) {
					parts.push(part);
				}
				const context: IEditorHoverRenderContext = {
					fragment: mainWindow.document.createDocumentFragment(),
					statusBar: disposables.add(instantiationService.createInstance(EditorHoverStatusBar)),
					onContentsChanged: () => { },
					setMinimumDimensions: () => { },
					hide: () => { },
					focus: () => { }
				};
				disposables.add(participant.renderHoverParts(context, parts));
				scroller.appendChild(context.fragment);

				const actionsBottom = () => {
					const row = scroller.querySelector('.hover-row')!.getBoundingClientRect();
					const actions = scroller.querySelector('.verbosity-actions-inner')!.getBoundingClientRect();
					const viewport = scroller.getBoundingClientRect();
					return {
						rowTaller: row.height > actions.height,
						fromRowBottom: Math.round(row.bottom - actions.bottom),
						fromViewportBottom: Math.round(viewport.bottom - actions.bottom)
					};
				};
				const initial = actionsBottom();

				await participant.updateMarkdownHoverVerbosityLevel(HoverVerbosityAction.Increase, 0);
				const afterIncrease = actionsBottom();

				scroller.style.height = '40px';
				const scrolledToTop = actionsBottom();

				scroller.scrollTop = scroller.scrollHeight;
				const scrolledToBottom = actionsBottom();

				assert.deepStrictEqual(
					{ initial: initial.fromRowBottom, afterIncrease: { rowTaller: afterIncrease.rowTaller, fromRowBottom: afterIncrease.fromRowBottom }, scrolledToTop: scrolledToTop.fromViewportBottom, scrolledToBottom: scrolledToBottom.fromRowBottom },
					{ initial: 0, afterIncrease: { rowTaller: true, fromRowBottom: 0 }, scrolledToTop: 0, scrolledToBottom: 0 }
				);
			} finally {
				disposables.dispose();
			}
		});
	});
});
