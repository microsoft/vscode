/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorContributionCtor, EditorContributionInstantiation } from '../../../../browser/editorExtensions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { ContentHoverController } from '../../browser/contentHoverController.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { hideLongLineWarningHover } from '../../browser/hoverActions.js';
import { HoverStartMode, HoverStartSource } from '../../browser/hoverOperation.js';
import { HoverParticipantRegistry, IHoverPart } from '../../browser/hoverTypes.js';
import { MarkdownHoverParticipant } from '../../browser/markdownHoverParticipant.js';
import { createCodeEditorServices, TestCodeEditorInstantiationOptions, withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';

suite('Content Hover', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('issue #232298: Don\'t Show Again closes the long line warning hover', async () => {
		const updatedValues: [string, unknown][] = [];
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				updatedValues.push([key, value]);
				return super.updateValue(key, value);
			}
		}({ editor: { maxTokenizationLineLength: 10 } });
		const instantiationService = createCodeEditorServices(store);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IUserInteractionService, new UserInteractionService());
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override onDidShowContextMenu = Event.None;
			override onDidHideContextMenu = Event.None;
		});
		instantiationService.stub(IMenuService, {});
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IMarkdownRendererService, instantiationService.createInstance(MarkdownRendererService));

		const participants = HoverParticipantRegistry.getAll();
		const previousParticipants = participants.splice(0, participants.length);
		HoverParticipantRegistry.register(MarkdownHoverParticipant);
		store.add(toDisposable(() => participants.splice(0, participants.length, ...previousParticipants)));

		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
			dimension: { width: 600, height: 200 },
			hover: { delay: 0 },
		}, {
			contributions: [{ id: ContentHoverController.ID, ctor: ContentHoverController as EditorContributionCtor, instantiation: EditorContributionInstantiation.Eager }],
		}));
		editor.setModel(store.add(instantiateTextModel(instantiationService, 'a line longer than ten characters')));
		const controller = ContentHoverController.get(editor)!;

		const shown = Event.toPromise(controller.onHoverContentsChanged);
		controller.showContentHover(new Range(1, 3, 1, 3), HoverStartMode.Immediate, HoverStartSource.Keyboard, false);
		await shown;
		const warningShown = controller.isHoverVisible && !!container.querySelector('.monaco-hover')?.textContent?.includes('Tokenization is skipped for long lines');

		await instantiationService.invokeFunction(hideLongLineWarningHover);

		assert.deepStrictEqual({ warningShown, hoverVisibleAfterCommand: controller.isHoverVisible, updatedValues }, {
			warningShown: true,
			hoverVisibleAfterCommand: false,
			updatedValues: [['editor.hover.showLongLineWarning', false]],
		});
	});
});
