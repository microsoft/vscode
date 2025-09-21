/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { ParameterHintsController } from '../../../../../editor/contrib/parameterHints/browser/parameterHints.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { BareFontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

export interface SQLMonacoEditorProps {
	value: string;
	onChange?: (e: { target: { value: string } }) => void;
	onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	placeholder?: string;
}

/**
 * SQL Monaco Editor that fully replaces textarea functionality
 * Features:
 * - 2 lines minimum, 6 lines maximum with auto-resize
 * - SQL syntax highlighting and IntelliSense
 * - Proper keyboard shortcuts (Ctrl+Enter)
 * - Full VS Code editor experience
 */
export const SQLMonacoEditor: React.FC<SQLMonacoEditorProps> = ({
	value,
	onChange,
	onKeyDown,
	placeholder = 'Enter your SQL query here...'
}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const disposableStoreRef = useRef<DisposableStore | null>(null);
	const [editor, setEditor] = useState<CodeEditorWidget | null>(null);
	const [model, setModel] = useState<ITextModel | null>(null);
	const [currentHeight, setCurrentHeight] = useState<number>(0);

	// Get services from React context
	const services = useErdosReactServicesContext();


	// Create Monaco editor with proper VS Code resizing pattern
	const createEditor = useCallback(() => {
		if (!containerRef.current || !services || editor) {
			return;
		}

		const { instantiationService, modelService, languageService, configurationService } = services;
		const disposableStore = new DisposableStore();
		disposableStoreRef.current = disposableStore;

		// Get font info for height calculations
		const editorConfig = configurationService.getValue<IEditorOptions>('editor');
		const targetWindow = DOM.getWindow(containerRef.current);
		const actualFontInfo = FontMeasurements.readFontInfo(
			targetWindow,
			BareFontInfo.createFromRawSettings(editorConfig, PixelRatio.getInstance(targetWindow).value)
		);

		// Calculate min/max heights based on 2-6 lines
		const minLines = 2;
		const maxLines = 6;
		const padding = 16; // 8px top + 8px bottom
		const minHeight = minLines * actualFontInfo.lineHeight + padding;
		const maxHeight = maxLines * actualFontInfo.lineHeight + padding;

		// Editor options following VS Code console input pattern
		const editorOptions: IEditorOptions = {
			...configurationService.getValue<IEditorOptions>('editor'),
			readOnly: false,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			lineNumbers: 'off',
			glyphMargin: false,
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			cursorStyle: 'line',
			renderWhitespace: 'none',
			renderControlCharacters: false,
			wordWrap: 'off',
			automaticLayout: false,
			contextmenu: true,
			fixedOverflowWidgets: true,
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				verticalScrollbarSize: 8,
				horizontalScrollbarSize: 8,
				useShadows: false,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
			},
			overviewRulerBorder: false,
			hideCursorInOverviewRuler: true,
			overviewRulerLanes: 0,
			renderLineHighlight: 'none',
			renderValidationDecorations: 'on',
			padding: { top: 0, bottom: 0 },
			lineDecorationsWidth: 0
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
					ContentHoverController.ID,
					ParameterHintsController.ID
				])
			}
		);

		disposableStore.add(codeEditorWidget);

		// Create SQL language and model
		const language = languageService.createById('sql');
		const uri = URI.from({
			scheme: Schemas.inMemory,
			path: `/erdos-database-sql-${generateUuid()}`
		});

		const textModel = modelService.createModel(value || '', language, uri, false);
		disposableStore.add(textModel);

		codeEditorWidget.setModel(textModel);

		// SQL completions should now work automatically!
		// 
		// The database client extension registers its completion provider in serviceManager.ts with:
		// vscode.languages.registerCompletionItemProvider([...{ scheme: 'inmemory' }...], new CompletionProvider(), ...)
		//
		// This Monaco editor creates models with scheme: 'inmemory', so the extension's completion provider
		// should automatically be used by VS Code's language service for any SQL models with inmemory URIs.
		//
		// The SuggestController (included in editor contributions) will automatically trigger the registered 
		// completion providers when the user types trigger characters: ' ', '.', ">", "<", "=", "("
		//

		// Handle content size changes - the proper VS Code way
		disposableStore.add(codeEditorWidget.onDidContentSizeChange(() => {
			const contentHeight = codeEditorWidget.getContentHeight();
			// Constrain height between min and max
			const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, contentHeight));
			
			setCurrentHeight(constrainedHeight);
			
			codeEditorWidget.layout({
				width: containerRef.current?.getBoundingClientRect().width || 0,
				height: constrainedHeight
			});
		}));

		// Handle content changes
		if (onChange) {
			disposableStore.add(textModel.onDidChangeContent(() => {
				const newContent = textModel.getValue();
				onChange({ target: { value: newContent } });
			}));
		}

		// Handle keyboard events
		if (onKeyDown) {
			disposableStore.add(codeEditorWidget.onKeyDown((e) => {
				const reactEvent = {
					key: e.browserEvent.key,
					ctrlKey: e.browserEvent.ctrlKey,
					shiftKey: e.browserEvent.shiftKey,
					altKey: e.browserEvent.altKey,
					metaKey: e.browserEvent.metaKey,
					preventDefault: () => e.preventDefault(),
					stopPropagation: () => e.stopPropagation()
				} as React.KeyboardEvent<HTMLTextAreaElement>;

				onKeyDown(reactEvent);
			}));
		}

		// Store references
		setEditor(codeEditorWidget);
		setModel(textModel);

		// Initial layout - let Monaco determine content height
		setCurrentHeight(minHeight); // Start with minimum height
		codeEditorWidget.layout({
			width: containerRef.current.getBoundingClientRect().width,
			height: minHeight
		});

	}, [services, value, onChange, onKeyDown, editor]);

	// Create editor when container is ready
	useEffect(() => {
		if (containerRef.current && services && !editor) {
			createEditor();
		}
	}, [createEditor, editor]);

	// Update content when value prop changes - simple approach like erdosAi
	useEffect(() => {
		if (model && editor && value !== undefined) {
			const currentModelContent = model.getValue();
			if (!model.isDisposed() && currentModelContent !== value) {
				model.setValue(value);
			}
		}
	}, [value, model, editor]);

	// Handle window resize
	useEffect(() => {
		const handleResize = () => {
			if (editor && containerRef.current) {
				const containerRect = containerRef.current.getBoundingClientRect();
				editor.layout({
					width: containerRect.width,
					height: currentHeight
				});
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [editor, currentHeight]);

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
			style={{ 
				width: '100%',
				height: currentHeight,
				marginBottom: 0,
				border: '1px solid var(--vscode-widget-border)',
				borderRadius: '0',
				backgroundColor: 'var(--vscode-input-background)',
				boxSizing: 'border-box'
			}}
		/>
	);
};
