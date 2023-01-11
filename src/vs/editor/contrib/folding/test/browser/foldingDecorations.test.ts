/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IModelDecorationOptions, InjectedTextCursorStops, InjectedTextOptions, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions, TextModel } from 'vs/editor/common/model/textModel';
import { foldedBackgroundMinimap, foldingCollapsedIcon, FoldingDecorationProvider, foldingExpandedIcon, foldingManualCollapsedIcon, foldingManualExpandedIcon } from 'vs/editor/contrib/folding/browser/foldingDecorations';
import { createTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

suite('Folding Decoration Provider', () => {
	const ELLIPSES = '\u22EF'; /* ellipses unicode character */

	const INJECTED_COLLAPSED_TEXT_OPTIONS: InjectedTextOptions = {
		content: ELLIPSES,
		inlineClassName: 'collapsed-text',
		inlineClassNameAffectsLetterSpacing: true,
		cursorStops: InjectedTextCursorStops.None
	};

	const COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-collapsed-highlighted-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'folded-background',
		minimap: foldedBackgroundMinimap,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon),
		hideContent: true
	};

	const MANUALLY_COLLAPSED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-manually-collapsed-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualCollapsedIcon),
		hideContent: true
	};

	const MANUALLY_COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-manually-collapsed-highlighted-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'folded-background',
		minimap: foldedBackgroundMinimap,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualCollapsedIcon),
		hideContent: true
	};

	const NO_CONTROLS_COLLAPSED_HIGHLIGHTED_RANGE_DECORATION: IModelDecorationOptions = {
		description: 'folding-no-controls-range-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'folded-background',
		minimap: foldedBackgroundMinimap,
		isWholeLine: true,
		hideContent: true
	};

	const NO_CONTROLS_COLLAPSED_RANGE_DECORATION: IModelDecorationOptions = {
		description: 'folding-no-controls-range-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		hideContent: true
	};

	const COLLAPSED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-collapsed-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon),
		hideContent: true,
	};

	const MANUALLY_EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-manually-expanded-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingManualExpandedIcon),
		before: { content: '' }
	});

	const MANUALLY_EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-manually-expanded-auto-hide-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualExpandedIcon),
		before: { content: '' }
	});

	const EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-expanded-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingExpandedIcon),
		before: { content: '' }
	});

	const EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-expanded-auto-hide-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingExpandedIcon),
		before: { content: '' }
	});

	const NO_CONTROLS_EXPANDED_RANGE_DECORATION = ModelDecorationOptions.register({
		description: 'folding-no-controls-range-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		before: { content: '' }
	});

	const HIDDEN_RANGE_DECORATION = ModelDecorationOptions.register({
		description: 'folding-hidden-range-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		before: { content: '' }
	});

	let model: TextModel;
	let editor: ICodeEditor;

	setup(() => {
		model = createTextModel('');
		editor = createTestCodeEditor(model);
	});

	teardown(() => {
		model.dispose();
		editor.dispose();
	});

	test('getDecorationOption, hidden', () => {
		const provider = new FoldingDecorationProvider(editor);
		const options = provider.getDecorationOption(false, true, false);
		assert.deepStrictEqual(options, HIDDEN_RANGE_DECORATION);
	});

	test('getDecorationOption, no controls', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingControls = 'never';
		const options = provider.getDecorationOption(false, false, false);
		assert.deepStrictEqual(options, NO_CONTROLS_EXPANDED_RANGE_DECORATION);
	});

	test('getDecorationOption, auto hide controls', () => {
		const provider = new FoldingDecorationProvider(editor);
		const options = provider.getDecorationOption(false, false, false);
		assert.deepStrictEqual(options, EXPANDED_AUTO_HIDE_VISUAL_DECORATION);
	});

	test('getDecorationOption, always show controls', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingControls = 'always';
		const options = provider.getDecorationOption(false, false, false);
		assert.deepStrictEqual(options, EXPANDED_VISUAL_DECORATION);
	});

	test('getDecorationOption, auto hide controls, manually expanded', () => {
		const provider = new FoldingDecorationProvider(editor);
		const options = provider.getDecorationOption(false, false, true);
		assert.deepStrictEqual(options, MANUALLY_EXPANDED_AUTO_HIDE_VISUAL_DECORATION);
	});

	test('getDecorationOption, always show controls, manually expanded', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingControls = 'always';
		const options = provider.getDecorationOption(false, false, true);
		assert.deepStrictEqual(options, MANUALLY_EXPANDED_VISUAL_DECORATION);
	});

	test('getDecorationOption, no controls, collapsed', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingHighlights = false;
		provider.showFoldingControls = 'never';
		const options = provider.getDecorationOption(true, false, false);
		assert.deepStrictEqual(options, applyCollapsedText(NO_CONTROLS_COLLAPSED_RANGE_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, auto hide controls, collapsed', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingHighlights = false;
		const options = provider.getDecorationOption(true, false, false);
		assert.deepStrictEqual(options, applyCollapsedText(COLLAPSED_VISUAL_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, always show controls, collapsed', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingHighlights = false;
		provider.showFoldingControls = 'always';
		const options = provider.getDecorationOption(true, false, false);
		assert.deepStrictEqual(options, applyCollapsedText(COLLAPSED_VISUAL_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, no controls, collapsed, highlighted', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingControls = 'never';
		const options = provider.getDecorationOption(true, false, false);
		assert.deepStrictEqual(options, applyCollapsedText(NO_CONTROLS_COLLAPSED_HIGHLIGHTED_RANGE_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, auto hide controls, collapsed, highlighted', () => {
		const provider = new FoldingDecorationProvider(editor);
		const options = provider.getDecorationOption(true, false, false);
		assert.deepStrictEqual(options, applyCollapsedText(COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, always show controls, collapsed, highlighted', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingControls = 'always';
		const options = provider.getDecorationOption(true, false, false);
		assert.deepStrictEqual(options, applyCollapsedText(COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, manually collapsed', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingHighlights = false;
		const options = provider.getDecorationOption(true, false, true);
		assert.deepStrictEqual(options, applyCollapsedText(MANUALLY_COLLAPSED_VISUAL_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, manually collapsed, highlighted', () => {
		const provider = new FoldingDecorationProvider(editor);
		const options = provider.getDecorationOption(true, false, true);
		assert.deepStrictEqual(options, applyCollapsedText(MANUALLY_COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION, ELLIPSES));
	});

	test('getDecorationOption, collapsed with custom text', () => {
		const provider = new FoldingDecorationProvider(editor);
		provider.showFoldingHighlights = false;
		const options = provider.getDecorationOption(true, false, false, 'custom text');
		assert.deepStrictEqual(options, applyCollapsedText(COLLAPSED_VISUAL_DECORATION, 'custom text'));
	});

	test('getDecorationOption, collapsed with custom text, highlighted', () => {
		const provider = new FoldingDecorationProvider(editor);
		const options = provider.getDecorationOption(true, false, false, 'custom text');
		assert.deepStrictEqual(options, applyCollapsedText(COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION, 'custom text'));
	});

	function applyCollapsedText(decorationOptions: IModelDecorationOptions, collapsedText: string) {
		const before: InjectedTextOptions = { ...INJECTED_COLLAPSED_TEXT_OPTIONS, content: replaceVisibleWhiteSpace(collapsedText) };
		return ModelDecorationOptions.register({ ...decorationOptions, before });
	}

	function replaceVisibleWhiteSpace(str: string) {
		const noBreakWhitespace = '\xa0';
		return str.replace(/[ \t]/g, noBreakWhitespace);
	}
});


