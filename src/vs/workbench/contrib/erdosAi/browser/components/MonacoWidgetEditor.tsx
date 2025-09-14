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

export interface MonacoWidgetEditorProps {
	content: string;
	filename?: string;
	functionType: 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file';
	language?: 'python' | 'r';
	isReadOnly?: boolean;
	monacoServices: IMonacoWidgetServices;
	configurationService: IConfigurationService;
	onContentChange?: (content: string) => void;
	onEditorReady?: (editor: CodeEditorWidget) => void;
	height?: string;
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
	onContentChange,
	onEditorReady,
	height = '300px',
	className = 'monaco-widget-editor'
}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const disposableStoreRef = useRef<DisposableStore | null>(null);
	const [editor, setEditor] = useState<CodeEditorWidget | null>(null);
	const [model, setModel] = useState<ITextModel | null>(null);
	const [dynamicHeight, setDynamicHeight] = useState<string>(height);

	// Determine language ID based on function type, filename, and language prop
	const getLanguageId = useCallback((): string => {
		// For search_replace, use file extension
		if (functionType === 'search_replace' && filename) {
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

		return 'plaintext';
	}, [functionType, filename, language]);

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
		
		// Determine if line numbers should be shown (off for console/terminal)
		const showLineNumbers = functionType !== 'run_console_cmd' && functionType !== 'run_terminal_cmd';
		
		// Create editor options using actual font configuration
		const editorOptions: IEditorOptions = {
			readOnly: isReadOnly,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: showLineNumbers ? 'on' : 'off',
			glyphMargin: false,
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
			automaticLayout: true,
			contextmenu: true,
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				verticalScrollbarSize: 14,
				horizontalScrollbarSize: 14
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
					SuggestController.ID,
					SnippetController2.ID,
					TabCompletionController.ID,
					ContentHoverController.ID,
					MarkerController.ID,
					ParameterHintsController.ID,
					FormatOnType.ID,
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

		// Layout the editor
		codeEditorWidget.layout();

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
			if (currentModelContent !== content) {
				model.setValue(content);
			}
		}
	}, [content, model, editor]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (disposableStoreRef.current) {
				disposableStoreRef.current.dispose();
			}
		};
	}, []);

	// Handle container resize
	useEffect(() => {
		if (editor && containerRef.current) {
			const resizeObserver = new ResizeObserver(() => {
				editor.layout();
			});
			resizeObserver.observe(containerRef.current);
			return () => resizeObserver.disconnect();
		}
		return undefined;
	}, [editor]);


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
