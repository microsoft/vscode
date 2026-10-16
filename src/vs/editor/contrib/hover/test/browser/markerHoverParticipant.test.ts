/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IMarker, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { Range } from '../../../../common/core/range.js';
import { IMarkerDecorationsService } from '../../../../common/services/markerDecorations.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { EditorHoverStatusBar } from '../../browser/contentHoverStatusBar.js';
import { IEditorHoverRenderContext } from '../../browser/hoverTypes.js';
import { MarkerHover, MarkerHoverParticipant } from '../../browser/markerHoverParticipant.js';

suite('Marker Hover Participant', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders diagnostics by severity without changing equal-severity order or input', () => {
		withTestCodeEditor('void foo(List<(baz)> l) {}', { readOnly: true }, (editor, _viewModel, instantiationService) => {
			instantiationService.stub(IMarkerDecorationsService, {});
			instantiationService.stub(IMenuService, { getMenuActions: () => [] });
			const participant = instantiationService.createInstance(MarkerHoverParticipant, editor);
			const createHover = (severity: MarkerSeverity, message: string, startColumn: number) => {
				const marker: IMarker = {
					owner: 'test',
					resource: editor.getModel().uri,
					severity,
					message,
					startLineNumber: 1,
					startColumn,
					endLineNumber: 1,
					endColumn: 15
				};
				return new MarkerHover(participant, Range.lift(marker), marker);
			};
			const hoverParts = [
				createHover(MarkerSeverity.Hint, 'Hint diagnostic', 10),
				createHover(MarkerSeverity.Info, 'Info diagnostic', 10),
				createHover(MarkerSeverity.Warning, 'First warning', 10),
				createHover(MarkerSeverity.Warning, 'Second warning', 12),
				createHover(MarkerSeverity.Error, 'Expected to find )', 14)
			];
			const originalOrder = hoverParts.slice();
			const context: IEditorHoverRenderContext = {
				fragment: mainWindow.document.createDocumentFragment(),
				statusBar: store.add(instantiationService.createInstance(EditorHoverStatusBar)),
				onContentsChanged: () => { },
				setMinimumDimensions: () => { },
				hide: () => { },
				focus: () => { }
			};
			const rendered = store.add(participant.renderHoverParts(context, hoverParts));

			assert.deepStrictEqual({
				messages: rendered.renderedHoverParts.map(part => part.hoverPart.marker.message),
				icons: Array.from(context.fragment.querySelectorAll('.marker-severity')).map(icon => ({
					className: icon.className,
					role: icon.getAttribute('role'),
					label: icon.getAttribute('aria-label')
				})),
				accessibleContent: rendered.renderedHoverParts.map(part => participant.getAccessibleContent(part.hoverPart)),
				inputUnchanged: hoverParts.every((part, index) => part === originalOrder[index])
			}, {
				messages: ['Expected to find )', 'First warning', 'Second warning', 'Info diagnostic', 'Hint diagnostic'],
				icons: [
					{ className: 'marker-severity codicon codicon-error', role: 'img', label: 'Error' },
					{ className: 'marker-severity codicon codicon-warning', role: 'img', label: 'Warning' },
					{ className: 'marker-severity codicon codicon-warning', role: 'img', label: 'Warning' },
					{ className: 'marker-severity codicon codicon-info', role: 'img', label: 'Info' },
					{ className: 'marker-severity severity-ignore codicon codicon-info', role: 'img', label: 'Hint' }
				],
				accessibleContent: ['Error: Expected to find )', 'Warning: First warning', 'Warning: Second warning', 'Info: Info diagnostic', 'Hint: Hint diagnostic'],
				inputUnchanged: true
			});
		});

		test('preserves a single diagnostic with multiline text, code and related information', () => {
			withTestCodeEditor('some text', { readOnly: true }, (editor, _viewModel, instantiationService) => {
				instantiationService.stub(IMarkerDecorationsService, {});
				instantiationService.stub(IMenuService, { getMenuActions: () => [] });
				const participant = instantiationService.createInstance(MarkerHoverParticipant, editor);
				const marker: IMarker = {
					owner: 'test',
					resource: editor.getModel().uri,
					severity: MarkerSeverity.Warning,
					message: 'First line\nSecond line',
					source: 'test-source',
					code: { value: 'test-code', target: URI.parse('https://example.com/diagnostic') },
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 5,
					relatedInformation: [{
						resource: URI.file('/related.ts'),
						message: 'Related message',
						startLineNumber: 2,
						startColumn: 3,
						endLineNumber: 2,
						endColumn: 6
					}]
				};
				const hoverPart = new MarkerHover(participant, Range.lift(marker), marker);
				const context: IEditorHoverRenderContext = {
					fragment: mainWindow.document.createDocumentFragment(),
					statusBar: store.add(instantiationService.createInstance(EditorHoverStatusBar)),
					onContentsChanged: () => { },
					setMinimumDimensions: () => { },
					hide: () => { },
					focus: () => { }
				};
				const rendered = store.add(participant.renderHoverParts(context, [hoverPart]));
				const message = context.fragment.querySelector('.marker-message');
				assert.ok(message);
				assert.deepStrictEqual({
					parts: rendered.renderedHoverParts.map(part => part.hoverPart),
					message: message.firstElementChild?.innerHTML,
					whiteSpace: message.querySelector('span')?.style.whiteSpace,
					code: message.querySelector('.code-link')?.getAttribute('href'),
					source: message.children[1].firstElementChild?.textContent,
					relatedInformation: message.lastElementChild?.textContent,
					accessibleContent: participant.getAccessibleContent(hoverPart)
				}, {
					parts: [hoverPart],
					message: 'First line<br>Second line',
					whiteSpace: 'pre-wrap',
					code: 'https://example.com/diagnostic',
					source: 'test-source',
					relatedInformation: 'related.ts(2, 3): Related message',
					accessibleContent: 'Warning: First line\nSecond line\nrelated.ts(2, 3): Related message'
				});
			});
		});
	});
});
