/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IMonacoWidgetServices } from '../widgets/widgetTypes.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { IModelDecorationOptions, IModelDeltaDecoration } from '../../../../../editor/common/model.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { BareFontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import * as DOM from '../../../../../base/browser/dom.js';

/**
 * Diff data interface matching the existing structure
 */
interface DiffItem {
	type: 'added' | 'deleted' | 'unchanged';
	content: string;
	old_line?: number;
	new_line?: number;
}

export interface ReactMonacoEditorProps {
	content: string;
	diffData?: {
		diff_data: DiffItem[];
		added?: number;
		deleted?: number;
		clean_filename?: string;
	};
	filename?: string;
	monacoServices: IMonacoWidgetServices;
	configurationService: IConfigurationService;
	onContentChange?: (content: string) => void;
	onEditorReady?: (editor: CodeEditorWidget) => void;
	height?: string;
	className?: string;
}

/**
 * Pure React Monaco editor component for diff highlighting
 * Extracted from MonacoDiffWidget to enable clean switching with NotebookCellRenderer
 */
export const ReactMonacoEditor: React.FC<ReactMonacoEditorProps> = ({
	content,
	diffData,
	filename,
	monacoServices,
	configurationService,
	onContentChange,
	onEditorReady,
	height = '300px',
	className = 'react-monaco-editor'
}) => {
	// ALL REACT HOOKS DECLARED FIRST
	const containerRef = useRef<HTMLDivElement | null>(null);
	const disposableStoreRef = useRef<DisposableStore | null>(null);
	const [editor, setEditor] = useState<CodeEditorWidget | null>(null);
	const [model, setModel] = useState<ITextModel | null>(null);
	const [dynamicHeight, setDynamicHeight] = useState<string>(height);
	// Track decoration IDs to properly clear them on re-renders
	const decorationIdsRef = useRef<string[]>([]);

	// Determine language ID based on filename
	const getLanguageId = useCallback((): string => {
		if (!filename) return 'plaintext';
		
		const extension = filename.split('.').pop()?.toLowerCase();
		switch (extension) {
			case 'ts':
			case 'tsx':
				return 'typescript';
			case 'js':
			case 'jsx':
				return 'javascript';
			case 'py':
				return 'python';
			case 'java':
				return 'java';
			case 'cpp':
			case 'cc':
			case 'cxx':
				return 'cpp';
			case 'c':
				return 'c';
			case 'h':
			case 'hpp':
				return 'cpp';
			case 'rs':
				return 'rust';
			case 'go':
				return 'go';
			case 'css':
				return 'css';
			case 'html':
				return 'html';
			case 'json':
				return 'json';
			case 'md':
				return 'markdown';
			case 'xml':
				return 'xml';
			case 'yaml':
			case 'yml':
				return 'yaml';
			case 'sh':
			case 'bash':
				return 'shell';
			case 'r':
				return 'r';
			case 'sql':
				return 'sql';
			case 'php':
				return 'php';
			case 'rb':
				return 'ruby';
			case 'swift':
				return 'swift';
			case 'kt':
				return 'kotlin';
			case 'scala':
				return 'scala';
			case 'clj':
				return 'clojure';
			case 'hs':
				return 'haskell';
			case 'elm':
				return 'elm';
			case 'dart':
				return 'dart';
			case 'lua':
				return 'lua';
			case 'perl':
				return 'perl';
			case 'dockerfile':
				return 'dockerfile';
			default:
				return 'plaintext';
		}
	}, [filename]);

	// Get content for Monaco editor - show ALL lines including deleted ones
	const getEditorContent = useCallback(() => {
		// If we have diff data, use it to create content with all lines
		// Otherwise just use the content prop directly
		if (!diffData || !diffData.diff_data || diffData.diff_data.length === 0) {
			return content || '';
		}

		// Create content from diff data, including ALL lines (added, deleted, unchanged)
		let editorContent = '';
		for (const diffItem of diffData.diff_data) {
			editorContent += diffItem.content + '\n';
		}
		
		// Remove trailing newline
		return editorContent.replace(/\n$/, '');
	}, [diffData, content]);

	// Create line number mapping function
	const createLineNumberRenderer = useCallback(() => {
		if (!diffData || !diffData.diff_data || diffData.diff_data.length === 0) {
			return undefined; // Use default line numbers
		}

		// Create mapping from editor line number to actual file line number
		const lineNumberMap = new Map<number, number>();
		let editorLineNumber = 1;
		
		for (const diffItem of diffData.diff_data) {
			// Use old_line for deleted lines, new_line for added/unchanged lines
			const actualLineNumber = diffItem.type === 'deleted' ? 
				(diffItem.old_line || editorLineNumber) : 
				(diffItem.new_line || diffItem.old_line || editorLineNumber);
			
			lineNumberMap.set(editorLineNumber, actualLineNumber);
			editorLineNumber++;
		}

		// Return custom line number renderer function
		return (lineNumber: number): string => {
			const actualLineNumber = lineNumberMap.get(lineNumber);
			return actualLineNumber ? actualLineNumber.toString() : lineNumber.toString();
		};
	}, [diffData]);

	// Apply diff decorations to show added/deleted lines
	const applyDiffDecorations = useCallback((textModel: ITextModel, codeEditor: CodeEditorWidget) => {
		if (!diffData || !diffData.diff_data || diffData.diff_data.length === 0) {
			return;
		}

		const decorations: IModelDeltaDecoration[] = [];
		let currentLine = 1;

		for (const diffItem of diffData.diff_data) {
			// Process ALL lines (added, deleted, unchanged) since they're all in the editor now
			const decorationOptions: IModelDecorationOptions = {
				description: `diff-${diffItem.type}`,
				isWholeLine: true,
				className: `diff-line-${diffItem.type}`,
				glyphMarginClassName: diffItem.type === 'added' ? 'diff-glyph-added' : 
									 diffItem.type === 'deleted' ? 'diff-glyph-deleted' : undefined,
				marginClassName: diffItem.type === 'added' ? 'diff-margin-added' : 
								 diffItem.type === 'deleted' ? 'diff-margin-deleted' : undefined,
			};

			decorations.push({
				range: new Range(currentLine, 1, currentLine, 1),
				options: decorationOptions
			});

			currentLine++;
		}

		// Clear previous decorations and apply new ones - check if model is not disposed
		if (!textModel.isDisposed()) {
			const newDecorationIds = textModel.deltaDecorations(decorationIdsRef.current, decorations);
			decorationIdsRef.current = newDecorationIds;
		}
	}, [diffData]);

	// Create Monaco editor with diff decorations
	const createEditor = useCallback(() => {
		if (!containerRef.current || !monacoServices || editor) {
			return;
		}

		const { instantiationService, modelService, languageService } = monacoServices;
		const disposableStore = new DisposableStore();
		disposableStoreRef.current = disposableStore;

		// Create custom line number renderer
		const lineNumberRenderer = createLineNumberRenderer();
		
		// Get actual VS Code editor font configuration
		const editorConfig = configurationService.getValue<IEditorOptions>('editor');
		const targetWindow = DOM.getWindow(containerRef.current);
		const actualFontInfo = FontMeasurements.readFontInfo(
			targetWindow,
			BareFontInfo.createFromRawSettings(editorConfig, PixelRatio.getInstance(targetWindow).value)
		);
		
		// Calculate dynamic height based on content lines (max 10 lines)
		const heightContent = getEditorContent();
		const contentLines = heightContent.split('\n').length;
		const maxLines = 10;
		const linesToShow = Math.min(contentLines, maxLines);
		const isNotebookFile = filename ? filename.toLowerCase().endsWith('.ipynb') : false;
		const editorPadding = isNotebookFile ? 30 : 0;
		const calculatedHeight = `${linesToShow * actualFontInfo.lineHeight + editorPadding}px`;
		
		setDynamicHeight(calculatedHeight);
		
		// Create editor options using actual font configuration
		const editorOptions: IEditorOptions = {
			readOnly: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: lineNumberRenderer || 'on',
			glyphMargin: true,
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			cursorStyle: 'line',
			renderWhitespace: 'none',
			renderControlCharacters: false,
			fontFamily: actualFontInfo.fontFamily,
			fontSize: actualFontInfo.fontSize,
			lineHeight: actualFontInfo.lineHeight,
			wordWrap: 'off',
			automaticLayout: false, // Disable to prevent ResizeObserver loops
			contextmenu: true,
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				verticalScrollbarSize: 4,
				horizontalScrollbarSize: 4
			},
			overviewRulerBorder: false,
			hideCursorInOverviewRuler: true,
			overviewRulerLanes: 0,
			renderLineHighlight: 'line',
			renderValidationDecorations: 'on'
		};

		// Create Monaco editor widget
		const codeEditorWidget = instantiationService.createInstance(
			CodeEditorWidget,
			containerRef.current,
			editorOptions,
			{
				isSimpleWidget: true,
				contributions: EditorExtensionsRegistry.getSomeEditorContributions([
					SelectionClipboardContributionID,
					ContextMenuController.ID,
				])
			}
		);

		disposableStore.add(codeEditorWidget);

		// Create language and model
		const languageId = getLanguageId();
		const language = languageService.createById(languageId);
		const uri = URI.from({
			scheme: Schemas.inMemory,
			path: `/erdos-ai-diff-${generateUuid()}`
		});

		const editorContent = getEditorContent();
		const textModel = modelService.createModel(editorContent, language, uri, false);
		disposableStore.add(textModel);

		codeEditorWidget.setModel(textModel);

		// Apply diff decorations
		applyDiffDecorations(textModel, codeEditorWidget);

		// Handle content changes
		if (onContentChange) {
			disposableStore.add(textModel.onDidChangeContent(() => {
				const newContent = textModel.getValue();
				onContentChange(newContent);
			}));
		}

		// Store references
		setEditor(codeEditorWidget);
		setModel(textModel);

		// Set up automatic width adjustment using ResizeObserver for width-only changes
		if (containerRef.current) {
			const heightValue = parseInt(calculatedHeight.replace('px', ''), 10);
			const initialWidth = containerRef.current.getBoundingClientRect().width;
			
			codeEditorWidget.layout({
				width: initialWidth,
				height: heightValue
			});
			
			// Set up ResizeObserver for width-only automatic updates
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const newWidth = entry.contentRect.width;
					// Only update width, keep current height
					const currentLayout = codeEditorWidget.getLayoutInfo();
					codeEditorWidget.layout({
						width: newWidth,
						height: currentLayout.height
					});
				}
			});
			
			resizeObserver.observe(containerRef.current);
			disposableStore.add({
				dispose: () => resizeObserver.disconnect()
			});
		}

		// Notify parent component
		if (onEditorReady) {
			onEditorReady(codeEditorWidget);
		}
	}, [monacoServices, diffData, content, filename, onContentChange, onEditorReady, getLanguageId, getEditorContent, createLineNumberRenderer, editor, configurationService, applyDiffDecorations]);

	// Update height when content changes
	useEffect(() => {
		if (!editor || !containerRef.current || !monacoServices) {
			return;
		}
		
		const editorConfig = configurationService.getValue<IEditorOptions>('editor');
		const targetWindow = DOM.getWindow(containerRef.current);
		const actualFontInfo = FontMeasurements.readFontInfo(
			targetWindow,
			BareFontInfo.createFromRawSettings(editorConfig, PixelRatio.getInstance(targetWindow).value)
		);
		
		// Calculate dynamic height based on current content lines
		const newContent = getEditorContent();
		const contentLines = newContent.split('\n').length;
		const maxLines = 10;
		const linesToShow = Math.min(contentLines, maxLines);
		// Use 30px padding for ipynb cells, 0px for everything else
		const isNotebookFile = filename ? filename.toLowerCase().endsWith('.ipynb') : false;
		const editorPadding = isNotebookFile ? 30 : 0;
		const calculatedHeight = `${linesToShow * actualFontInfo.lineHeight + editorPadding}px`;
		
		
		// Only update if height actually changed to prevent infinite loops
		if (calculatedHeight !== dynamicHeight) {
			setDynamicHeight(calculatedHeight);
			// Update only height, width is handled by ResizeObserver
			if (editor) {
				const heightValue = parseInt(calculatedHeight.replace('px', ''), 10);
				const currentLayout = editor.getLayoutInfo();
				editor.layout({
					width: currentLayout.width,
					height: heightValue
				});
			}
		}
	}, [content, editor, monacoServices, configurationService, dynamicHeight, getEditorContent]);

	// Create editor when container is ready
	useEffect(() => {
		if (containerRef.current && monacoServices && !editor) {
			createEditor();
		}
	}, [createEditor, editor]);

	// Update content when props change
	useEffect(() => {
		if (model && editor) {
			const newContent = getEditorContent();
			
			if (!model.isDisposed() && model.getValue() !== newContent) {
				model.setValue(newContent);
				// Clear decoration tracking when content changes
				decorationIdsRef.current = [];
				// Reapply decorations after content change
				applyDiffDecorations(model, editor);
			}
		}
	}, [diffData, content, model, editor, getEditorContent, applyDiffDecorations]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (disposableStoreRef.current) {
				disposableStoreRef.current.dispose();
			}
		};
	}, []);

	return (
		<div 
			ref={containerRef}
			className={className}
			style={{ 
				height: dynamicHeight
			}}
		/>
	);
};

