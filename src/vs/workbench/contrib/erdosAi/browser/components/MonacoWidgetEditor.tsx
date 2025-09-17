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
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { BareFontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { TabCompletionController } from '../../../snippets/browser/tabCompletion.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { MarkerController } from '../../../../../editor/contrib/gotoError/browser/gotoError.js';
import { ParameterHintsController } from '../../../../../editor/contrib/parameterHints/browser/parameterHints.js';
import { FormatOnType } from '../../../../../editor/contrib/format/browser/formatActions.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IMonacoWidgetServices } from '../widgets/widgetTypes.js';
import { NotebookCellRenderer } from './NotebookCellRenderer.js';
import { ViewportSemanticTokensContribution } from '../../../../../editor/contrib/semanticTokens/browser/viewportSemanticTokens.js';
import { WordHighlighterContribution } from '../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import { BracketMatchingController } from '../../../../../editor/contrib/bracketMatching/browser/bracketMatching.js';
import { ICommonUtils } from '../../../../services/erdosAiUtils/common/commonUtils.js';

export interface MonacoWidgetEditorProps {
	content: string;
	filename?: string;
	functionType: 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file';
	language?: 'python' | 'r';
	isReadOnly?: boolean;
	monacoServices: IMonacoWidgetServices;
	configurationService: IConfigurationService;
	commonUtils: ICommonUtils;
	onContentChange?: (content: string) => void;
	onEditorReady?: (editor: CodeEditorWidget) => void;
	height?: string;
	diffLines?: Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		lineNumber: number;
	}>;
	className?: string;
}

/**
 * Monaco editor wrapper component for AI widgets
 * Provides full Monaco editor functionality with proper lifecycle management
 */
export const MonacoWidgetEditor: React.FC<MonacoWidgetEditorProps> = ({
	content,
	filename,
	functionType,
	language,
	isReadOnly = false,
	monacoServices,
	configurationService,
	commonUtils,
	onContentChange,
	onEditorReady,
	height = '300px',
	diffLines,
	className = 'monaco-widget-editor'
}) => {
	// Detect if content is structured notebook cell data
	let isNotebookCells = false;
	let cellData = null;
	
	try {
		const parsed = JSON.parse(content);
		if (parsed.type === 'notebook_cells') {
			isNotebookCells = true;
			cellData = parsed.cells;
		}
	} catch (e) {
		// Content is not JSON, treating as regular content
	}

	// If this is notebook cell data, render with NotebookCellRenderer
	if (isNotebookCells && cellData) {
		return (
			<NotebookCellRenderer 
				cells={cellData} 
				monacoServices={monacoServices} 
				configurationService={configurationService}
				commonUtils={commonUtils}
				isReadOnly={isReadOnly}
				functionType={functionType}
				filename={filename}
			/>
		);
	}

	// Regular Monaco editor logic for non-notebook content
	const containerRef = useRef<HTMLDivElement | null>(null);
	const disposableStoreRef = useRef<DisposableStore | null>(null);
	const [editor, setEditor] = useState<CodeEditorWidget | null>(null);
	const [model, setModel] = useState<ITextModel | null>(null);
	const [dynamicHeight, setDynamicHeight] = useState<string>(height);
	// Track decoration IDs to properly clear them on re-renders
	const decorationIdsRef = useRef<string[]>([]);

	// Determine language ID based on function type, filename, and language prop
	const getLanguageId = useCallback((): string => {
		// For search_replace, use file extension
		if (functionType === 'search_replace' && filename) {
			const extension = commonUtils.getFileExtension(filename).toLowerCase();
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
		}

		// For console/terminal commands, use language prop or function type
		if (functionType === 'run_console_cmd' || functionType === 'run_terminal_cmd') {
			if (language === 'python') {
				return 'python';
			} else if (language === 'r') {
				return 'r';
			} else if (functionType === 'run_terminal_cmd') {
				return 'shell';
			}
		}

		// For notebook files or when language prop is explicitly provided, use language prop
		if ((filename && commonUtils.getFileExtension(filename).toLowerCase() === 'ipynb') || (functionType === 'run_file' && language)) {
			if (language === 'python') {
				return 'python';
			} else if (language === 'r') {
				return 'r';
			}
		}

		return 'plaintext';
	}, [functionType, filename, language]);

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
		const contentLines = content.split('\n').length;
		const maxLines = 10;
		const linesToShow = Math.min(contentLines, maxLines);
		const calculatedHeight = `${linesToShow * actualFontInfo.lineHeight}px`;
		
		// Only update if height actually changed to prevent infinite loops
		if (calculatedHeight !== dynamicHeight) {
			setDynamicHeight(calculatedHeight);
			// Manually trigger layout since automaticLayout is disabled
			setTimeout(() => {
				if (editor && containerRef.current) {
					const containerRect = containerRef.current.getBoundingClientRect();
					const heightValue = parseInt(calculatedHeight.replace('px', ''), 10);
					editor.layout({
						width: containerRect.width,
						height: heightValue
					});
				}
			}, 0);
		}
	}, [content, editor, monacoServices, configurationService]);

	// Create Monaco editor
	const createEditor = useCallback(() => {

		if (!containerRef.current) {
			return;
		}
		if (!monacoServices) {
			return;
		}
		if (editor) {
			return;
		}
		const { instantiationService, modelService, languageService } = monacoServices;
		const disposableStore = new DisposableStore();
		disposableStoreRef.current = disposableStore;


		// Get actual VS Code editor font configuration
		const editorConfig = configurationService.getValue<IEditorOptions>('editor');
		const targetWindow = DOM.getWindow(containerRef.current);
		const actualFontInfo = FontMeasurements.readFontInfo(
			targetWindow,
			BareFontInfo.createFromRawSettings(editorConfig, PixelRatio.getInstance(targetWindow).value)
		);
		

		// Calculate dynamic height based on content lines (max 10 lines)
		const contentLines = content.split('\n').length;
		const maxLines = 10;
		const linesToShow = Math.min(contentLines, maxLines);
		const calculatedHeight = `${linesToShow * actualFontInfo.lineHeight}px`;
		
		setDynamicHeight(calculatedHeight);
		
		// Determine if this is a notebook cell based on file extension or if we're rendering individual cell content
		const isNotebookFile = filename ? commonUtils.getFileExtension(filename).toLowerCase() === 'ipynb' : false;
		const isRenderingCellContent = isNotebookFile && functionType === 'run_file' && !isNotebookCells;
		const isNotebookCell = isNotebookFile && (isRenderingCellContent || functionType !== 'run_file');
		
		// Determine if line numbers should be shown (off for console/terminal and notebook cells)
		const showLineNumbers = functionType !== 'run_console_cmd' && functionType !== 'run_terminal_cmd' && !isNotebookCell;
		
		// Create editor options using actual font configuration
		const editorOptions: IEditorOptions = {
			readOnly: isReadOnly,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: showLineNumbers ? 'on' : 'off',
			glyphMargin: false,
			folding: isNotebookCell ? true : false, // Enable folding for notebook cells
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
				verticalScrollbarSize: 14,
				horizontalScrollbarSize: 14,
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
			},
			overviewRulerBorder: false,
			hideCursorInOverviewRuler: true,
			overviewRulerLanes: 0,
			renderLineHighlight: isNotebookCell ? 'none' : 'line', // Notebook cells don't highlight lines
			renderValidationDecorations: 'on',
			padding: isNotebookCell ? { top: 8, bottom: 8 } : undefined, // Add notebook-specific padding for better visual appearance
			lineDecorationsWidth: isNotebookCell ? 0 : undefined
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
					SuggestController.ID,
					SnippetController2.ID,
					TabCompletionController.ID,
					ContentHoverController.ID,
					MarkerController.ID,
					ParameterHintsController.ID,
					FormatOnType.ID,
					ViewportSemanticTokensContribution.ID,
					WordHighlighterContribution.ID,
					BracketMatchingController.ID,
				])
			}
		);

		disposableStore.add(codeEditorWidget);

		// Create language and model
		const languageId = getLanguageId();
		
		const language = languageService.createById(languageId);
		const uri = URI.from({
			scheme: Schemas.inMemory,
			path: `/erdos-ai-widget-${functionType}-${generateUuid()}`
		});

		const textModel = modelService.createModel(content || '', language, uri, false);
		disposableStore.add(textModel);

		codeEditorWidget.setModel(textModel);

		// Handle content changes for non-readonly editors
		if (!isReadOnly && onContentChange) {
			disposableStore.add(textModel.onDidChangeContent(() => {
				const newContent = textModel.getValue();
				onContentChange(newContent);
			}));
		}

		// Store references
		setEditor(codeEditorWidget);
		setModel(textModel);

		// Layout the editor with explicit dimensions
		const containerRect = containerRef.current.getBoundingClientRect();
		const heightValue = parseInt(calculatedHeight.replace('px', ''), 10);
		codeEditorWidget.layout({
			width: containerRect.width,
			height: heightValue
		});

		// Notify parent component
		if (onEditorReady) {
			onEditorReady(codeEditorWidget);
		}
	}, [monacoServices, functionType, filename, content, isReadOnly, onContentChange, onEditorReady, getLanguageId, editor]);

	// Create editor when container is ready
	useEffect(() => {
		if (containerRef.current && monacoServices && !editor) {
			createEditor();
		}
	}, [createEditor, editor]);

	// Update content when prop changes
	useEffect(() => {
		if (model && editor && content !== undefined) {
			const currentModelContent = model.getValue();
			if (!model.isDisposed() && currentModelContent !== content) {
				model.setValue(content);
			}
			
			// Apply diff decorations if diffLines are provided
			if (diffLines && diffLines.length > 0) {
				
				const decorations: any[] = [];
				
				diffLines.forEach(diffLine => {
					if (diffLine.type !== 'unchanged') {
						const decoration = {
							range: {
								startLineNumber: diffLine.lineNumber,
								startColumn: 1,
								endLineNumber: diffLine.lineNumber,
								endColumn: Number.MAX_SAFE_INTEGER
							},
							options: {
								className: `diff-line-${diffLine.type}`,
								isWholeLine: true,
								marginClassName: `diff-margin-${diffLine.type}`,
								glyphMarginClassName: `diff-glyph-${diffLine.type}`
							}
						};
						decorations.push(decoration);
					}
				});
				
			if (decorations.length > 0) {
				// Clear previous decorations and apply new ones - check if editor is not disposed
				if (!editor.getModel()?.isDisposed()) {
					const newDecorationIds = editor.deltaDecorations(decorationIdsRef.current, decorations);
					decorationIdsRef.current = newDecorationIds;
				}
			} else {
				// Clear all decorations if no new ones to apply
				if (!editor.getModel()?.isDisposed()) {
					editor.deltaDecorations(decorationIdsRef.current, []);
					decorationIdsRef.current = [];
				}
			}
		} else {
			// Clear all decorations if no diffLines provided
			if (decorationIdsRef.current.length > 0 && !editor.getModel()?.isDisposed()) {
				editor.deltaDecorations(decorationIdsRef.current, []);
				decorationIdsRef.current = [];
			}
		}
		}
	}, [content, model, editor, diffLines]);

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
				height: dynamicHeight,
				width: '100%'
			}}
		/>
	);
};
