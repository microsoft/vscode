/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from "../../core/dispose";
import { handleANSIOutputToHTML } from './ansiToHtml';
import { imageSize } from 'image-size';

interface WebviewEditorInset {
    readonly editor: vscode.TextEditor;
    readonly line: number;
    readonly height: number;
    readonly webview: vscode.Webview;
    readonly onDidDispose: vscode.Event<void>;
    dispose(): void;
}

interface OutputInset {
    inset: WebviewEditorInset;
    executionId: string;
    cellRange: vscode.Range;
    heightInLines: number;
}

// Extend vscode namespace with proposed API
declare module 'vscode' {
    namespace window {
        export function createWebviewTextEditorInset(
            editor: vscode.TextEditor, 
            line: number, 
            height: number, 
            options?: vscode.WebviewOptions
        ): WebviewEditorInset;
    }
}

export class QuartoInlineOutputManager extends Disposable {
    private cellRangeTracker_ = new Map<string, vscode.Range>(); // executionId -> Range
    private cellOutputs_ = new Map<string, string[]>(); // executionId -> output lines
    private executionUris_ = new Map<string, string>(); // executionId -> document URI
    private activeInsets_ = new Map<string, OutputInset>(); // executionId -> OutputInset
    private cellPositionInsets_ = new Map<string, OutputInset>(); // "uri:startLine:endLine" -> OutputInset
    private activeEditor_?: vscode.TextEditor;

    constructor() {
        super();

        this._register(vscode.window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor_ = editor;
            this.recreateInsetsForEditor();
        }));

        // Listen for document changes to update inset positions
        this._register(vscode.workspace.onDidChangeTextDocument(event => {
            this.handleDocumentChange(event);
        }));

        this.activeEditor_ = vscode.window.activeTextEditor;
    }

    public override dispose() {
        this.disposeAllInsets();
        this.cellRangeTracker_.clear();
        this.cellOutputs_.clear();
        this.executionUris_.clear();
        super.dispose();
    }

    public trackCellExecution(executionId: string, cellRange: vscode.Range): void {
        this.cellRangeTracker_.set(executionId, cellRange);
        // Initialize empty output array for this execution
        this.cellOutputs_.set(executionId, []);
        // Track which document this execution belongs to
        if (this.activeEditor_) {
            this.executionUris_.set(executionId, this.activeEditor_.document.uri.toString());
        }
    }

    public isQuartoExecution(executionId: string): boolean {
        return this.cellRangeTracker_.has(executionId);
    }

    private createPositionKey(uri: string, range: vscode.Range): string {
        return `${uri}:${range.start.line}:${range.end.line}`;
    }

    private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        if (!event.contentChanges.length) return;

        const docUri = event.document.uri.toString();
        
        // Find all insets for this document and update their positions
        const insetsToUpdate: Array<{oldKey: string, newKey: string, inset: OutputInset}> = [];
        
        for (const [positionKey, inset] of this.cellPositionInsets_) {
            if (positionKey.startsWith(docUri + ':')) {
                // Parse the position from the key
                const parts = positionKey.split(':');
                if (parts.length >= 3) {
                    const startLine = parseInt(parts[parts.length - 2]);
                    const endLine = parseInt(parts[parts.length - 1]);
                    
                    // Calculate new position after document changes
                    let newStartLine = startLine;
                    let newEndLine = endLine;
                    
                    for (const change of event.contentChanges) {
                        const changeStartLine = change.range.start.line;
                        const linesAdded = change.text.split('\n').length - 1;
                        const linesRemoved = change.range.end.line - change.range.start.line;
                        const netChange = linesAdded - linesRemoved;
                        
                        // Only update if the change is above our cell
                        if (changeStartLine < startLine) {
                            newStartLine += netChange;
                            newEndLine += netChange;
                        }
                    }
                    
                    // If position changed, mark for update
                    if (newStartLine !== startLine || newEndLine !== endLine) {
                        const newRange = new vscode.Range(newStartLine, 0, newEndLine, 0);
                        const newKey = this.createPositionKey(docUri, newRange);
                        insetsToUpdate.push({oldKey: positionKey, newKey, inset});
                    }
                }
            }
        }
        
        // Apply position updates
        for (const update of insetsToUpdate) {
            this.cellPositionInsets_.delete(update.oldKey);
            this.cellPositionInsets_.set(update.newKey, update.inset);
        }
    }

    public handleRuntimeOutput(output: any): void {
        const executionId = output.parentId;
        const cellRange = this.cellRangeTracker_.get(executionId);
        
        if (!cellRange || !this.activeEditor_) {
            return;
        }

        this.addOutputToExecution(executionId, output);
    }

    private addOutputToExecution(executionId: string, output: any): void {
        const outputLines = this.formatOutputData(output.data);
        const existingOutput = this.cellOutputs_.get(executionId) || [];
        
        // Append new output lines
        existingOutput.push(...outputLines);
        this.cellOutputs_.set(executionId, existingOutput);

        // Update or create the webview inset
        this.updateInsetForExecution(executionId);
        
        // Notify webview of content update for auto-scrolling
        this.notifyWebviewContentUpdate(executionId);
    }

    private isHtmlContent(line: string): boolean {
        const trimmed = line.trim();
        return trimmed.startsWith('<') && (
            trimmed.includes('<img') ||
            trimmed.includes('<svg') ||
            trimmed.includes('<div') ||
            trimmed.includes('<span') ||
            trimmed.includes('<p') ||
            trimmed.includes('<table') ||
            trimmed.includes('<script') ||
            trimmed.includes('<style') ||
            trimmed.includes('class="plotly-output"')
        );
    }

    private hasImages(outputLines: string[]): boolean {
        return outputLines.some(line => {
            const trimmed = line.trim();
            return trimmed.includes('<img') || 
                   (trimmed.startsWith('<svg') && trimmed.includes('</svg>')) ||
                   trimmed.includes('class="plotly-output"');
        });
    }

    private extractImageDimensions(base64Data: string): {width: number, height: number} | null {
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            const dimensions = imageSize(buffer);
            
            if (dimensions && dimensions.width && dimensions.height) {
                return { width: dimensions.width, height: dimensions.height };
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    private calculateViewZoneHeightForImages(outputLines: string[]): number {
        let maxImageHeight = 0;
        
        for (const line of outputLines) {
            const imgMatch = line.match(/src="data:image\/[^;]+;base64,([^"]+)"/);
            if (imgMatch) {
                const dimensions = this.extractImageDimensions(imgMatch[1]);
                if (dimensions) {
                    // Convert pixel height to line height (assuming ~20px per line)
                    const lineHeight = Math.ceil(dimensions.height / 20);
                    maxImageHeight = Math.max(maxImageHeight, lineHeight);
                }
            }
        }
        
        return maxImageHeight > 0 ? Math.min(20, Math.max(8, maxImageHeight + 2)) : 0;
    }

    private calculateViewZoneHeight(outputLines: string[]): number {
        if (this.hasImages(outputLines)) {
            const imageHeight = this.calculateViewZoneHeightForImages(outputLines);
            return imageHeight > 0 ? imageHeight : 15; // Default for images if extraction fails
        } else {
            // For text-only output
            return Math.max(1, Math.min(outputLines.length + 1, 11)); // +1 for header, max 11 lines
        }
    }

    private formatOutputData(data: any): string[] {
        const lines: string[] = [];

        if (!data) {
            return lines;
        }

        // Define the preferred order for output types
        const outputOrder = [
            'text/html',
            'image/png',
            'image/jpeg', 
            'image/jpg',
            'image/svg+xml',
            'image/gif',
            'image/webp',
            'application/vnd.plotly.v1+json',
            'text/plain',
            'application/json'
        ];

        // Process each output type in order if it exists
        for (const mimeType of outputOrder) {
            if (data[mimeType]) {

                switch (mimeType) {
                    case 'image/png':
                        const pngData = Array.isArray(data['image/png']) ? data['image/png'].join('') : data['image/png'];
                        lines.push(`<img src="data:image/png;base64,${pngData}" style="max-width: 100%; height: auto;" alt="Plot output" />`);
                        break;
                    case 'image/jpeg':
                        const jpegData = Array.isArray(data['image/jpeg']) ? data['image/jpeg'].join('') : data['image/jpeg'];
                        lines.push(`<img src="data:image/jpeg;base64,${jpegData}" style="max-width: 100%; height: auto;" alt="Plot output" />`);
                        break;
                    case 'image/jpg':
                        const jpgData = Array.isArray(data['image/jpg']) ? data['image/jpg'].join('') : data['image/jpg'];
                        lines.push(`<img src="data:image/jpeg;base64,${jpgData}" style="max-width: 100%; height: auto;" alt="Plot output" />`);
                        break;
                    case 'image/svg+xml':
                        const svgData = Array.isArray(data['image/svg+xml']) ? data['image/svg+xml'].join('') : data['image/svg+xml'];
                        if (svgData.trim().startsWith('<svg')) {
                            lines.push(svgData);
                        } else {
                            lines.push(`<img src="data:image/svg+xml;base64,${svgData}" style="max-width: 100%; height: auto;" alt="Plot output" />`);
                        }
                        break;
                    case 'image/gif':
                        const gifData = Array.isArray(data['image/gif']) ? data['image/gif'].join('') : data['image/gif'];
                        lines.push(`<img src="data:image/gif;base64,${gifData}" style="max-width: 100%; height: auto;" alt="Plot output" />`);
                        break;
                    case 'image/webp':
                        const webpData = Array.isArray(data['image/webp']) ? data['image/webp'].join('') : data['image/webp'];
                        lines.push(`<img src="data:image/webp;base64,${webpData}" style="max-width: 100%; height: auto;" alt="Plot output" />`);
                        break;
                    case 'application/vnd.plotly.v1+json':
                        const plotlyData = data['application/vnd.plotly.v1+json'];
                        lines.push(`<div class="plotly-output" data-plotly='${JSON.stringify(plotlyData)}'>Interactive plot (Plotly data available)</div>`);
                        break;
                    case 'text/html':
                        const htmlContent = Array.isArray(data['text/html']) ? data['text/html'].join('') : data['text/html'];
                        lines.push(htmlContent);
                        break;
                    case 'text/plain':
                        const textContent = Array.isArray(data['text/plain']) ? data['text/plain'].join('\n') : data['text/plain'];
                        lines.push(...textContent.split('\n'));
                        break;
                    case 'application/json':
                        lines.push(JSON.stringify(data['application/json'], null, 2));
                        break;
                }
            }
        }

        // Handle any remaining output types not in our predefined list
        for (const [mimeType, content] of Object.entries(data)) {
            if (!outputOrder.includes(mimeType)) {
                lines.push(`[${mimeType}] ${JSON.stringify(content, null, 2)}`);
            }
        }

        const filteredLines = lines.filter(line => line.trim().length > 0);
        return filteredLines;
    }

    private updateInsetForExecution(executionId: string): void {
        if (!this.activeEditor_) {
            return;
        }

        const cellRange = this.cellRangeTracker_.get(executionId);
        const outputLines = this.cellOutputs_.get(executionId);
        const executionUri = this.executionUris_.get(executionId);

        if (!cellRange || !outputLines || outputLines.length === 0 || !executionUri) {
            return;
        }

        // Create position key for this cell
        const positionKey = this.createPositionKey(executionUri, cellRange);
        
        const maxLinesBeforeDynamic = 10;
        const currentLines = outputLines.length;
        
        // Check if there's already an inset at this position
        const existingPositionInset = this.cellPositionInsets_.get(positionKey);
        if (existingPositionInset) {
            const oldExecutionId = existingPositionInset.executionId;
            
            if (oldExecutionId === executionId) {
                // Same execution - decide whether to recreate or update
                const currentHeight = existingPositionInset.heightInLines;
                const newHeight = this.calculateViewZoneHeight(this.cellOutputs_.get(executionId) || []);
                
                if (currentLines <= maxLinesBeforeDynamic && newHeight !== currentHeight) {
                    // Still growing and height changed - recreate with new height
                    existingPositionInset.inset.dispose();
                    this.activeInsets_.delete(executionId);
                    this.cellPositionInsets_.delete(positionKey);
                } else if (currentLines > maxLinesBeforeDynamic) {
                    // Over max lines - use dynamic updates with scrolling
                    // Content will be updated by notifyWebviewContentUpdate call after this method
                    return;
                } else {
                    // Same height, under max lines - recreate to ensure scroll to bottom
                    existingPositionInset.inset.dispose();
                    this.activeInsets_.delete(executionId);
                    this.cellPositionInsets_.delete(positionKey);
                }
            } else {
                // Different execution - dispose the old one
                existingPositionInset.inset.dispose();
                this.cellRangeTracker_.delete(oldExecutionId);
                this.cellOutputs_.delete(oldExecutionId);
                this.executionUris_.delete(oldExecutionId);
                this.activeInsets_.delete(oldExecutionId);
                this.cellPositionInsets_.delete(positionKey);
                
            }
        }

        // Create new webview inset for current execution
        this.createInsetForExecution(executionId, cellRange, outputLines);
        
        // Force scroll to bottom for new/recreated webviews
        setTimeout(() => {
            const outputInset = this.activeInsets_.get(executionId);
            if (outputInset) {
                outputInset.inset.webview.postMessage({ type: 'forceScroll' });
            }
        }, 50);
    }

    private createWebviewInset(cellRange: vscode.Range, outputLines: string[], executionId: string, customHeight?: number, isCollapsed?: boolean): WebviewEditorInset | null {
        if (!this.activeEditor_) return null;

        // Show all content - let CSS handle scrolling
        const displayLines = outputLines;

        // Use custom height if provided, otherwise calculate based on content and whether it contains images
        const heightInLines = customHeight !== undefined ? 
            Math.max(1, customHeight) : 
            this.calculateViewZoneHeight(displayLines);

        // Generate HTML content for the webview
        const htmlContent = this.generateOutputHtml(displayLines, executionId, isCollapsed || false);

        // Position the inset after the cell's last line
        const insetLine = cellRange.end.line;

        try {
            const inset = vscode.window.createWebviewTextEditorInset(
                this.activeEditor_,
                insetLine,
                heightInLines,
                {
                    enableScripts: true,
                    enableCommandUris: true,
                    localResourceRoots: [],
                    enableForms: false
                }
            );

            inset.webview.html = htmlContent;

            // Handle messages from the webview
            this._register(inset.webview.onDidReceiveMessage(message => {
                this.handleWebviewMessage(message, executionId);
            }));

            // Set up disposal handling
            this._register(inset.onDidDispose(() => {
                this.activeInsets_.delete(executionId);
            }));

            return inset;
        } catch (error) {
            console.error(`[QuartoOutputManager] Failed to create webview inset:`, error);
            return null;
        }
    }

    private generateOutputHtml(outputLines: string[], executionId: string, isCollapsed: boolean = false): string {
        // Calculate the proper expanded height for the resize message
        const expandedHeight = this.calculateViewZoneHeight(outputLines);
        // Process each line - handle HTML content vs plain text
        const processedLines = outputLines.map(line => {
            // Check if line contains HTML (images, rich content)
            if (this.isHtmlContent(line)) {
                // Return HTML content as-is
                return line;
            } else {
                // Process as plain text with ANSI handling
                return handleANSIOutputToHTML(line);
            }
        });

        // Set initial state based on collapse parameter
        const initialState = isCollapsed ? 'collapsed' : 'expanded';
        const chevronRotation = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        /* SVG icons for controls */
        .codicon {
            display: inline-block;
            width: 12px;
            height: 12px;
        }
        .codicon.chevron {
            width: 24px;
        }
        .codicon svg {
            width: 100%;
            height: 100%;
            fill: currentColor;
            transition: transform 0.2s ease-in-out;
        }
        
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            max-height: 100%;
            overflow: hidden;
        }
        body {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: var(--vscode-editor-line-height);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        }
        .header {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            padding: 1px 8px;
            background-color: var(--vscode-editor-background);
            gap: 8px;
            height: calc(var(--vscode-editor-line-height) * 0.5);
            padding-right: 12px;
            flex-shrink: 0;
        }
        .control-button {
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            padding: 1px;
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 12px;
            font-size: 10px;
        }
        .control-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .output-line {
            white-space: pre;
            margin: 0;
            padding: 2px 4px;
        }
        .output-html {
            margin: 4px 0;
            padding: 2px 4px;
        }
        .output-html img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 4px auto;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .output-html svg {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 4px auto;
        }
        .plotly-output {
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin: 4px 0;
            font-style: italic;
            color: var(--vscode-descriptionForeground);
        }
        /* Dark theme adjustments */
        @media (prefers-color-scheme: dark) {
            .output-html img {
                box-shadow: 0 1px 3px rgba(255, 255, 255, 0.1);
            }
        }
        .output-container {
            font-family: var(--vscode-editor-font-family);
            width: 100%;
            min-width: fit-content;
        }
        .output-content {
            flex: 1;
            overflow-y: auto;
            overflow-x: auto;
            min-height: 0;
            height: 0; /* Force height to be constrained by flex container */
        }
        .output-content.collapsed {
            display: none;
        }
        .output-content.expanded {
            display: block;
        }
        /* ANSI formatting styles */
        .code-bold { font-weight: bold; }
        .code-dim { opacity: 0.6; }
        .code-italic { font-style: italic; }
        .code-underline { text-decoration: underline; }
        .code-double-underline { text-decoration: underline double; }
        .code-blink { animation: blink 1s step-start infinite; }
        .code-rapid-blink { animation: blink 0.5s step-start infinite; }
        .code-hidden { visibility: hidden; }
        .code-strike-through { text-decoration: line-through; }
        .code-overline { text-decoration: overline; }
        .code-superscript { vertical-align: super; font-size: smaller; }
        .code-subscript { vertical-align: sub; font-size: smaller; }
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
        /* ANSI color variables - these will be set by VS Code theme */
        :root {
            --vscode-debug-ansi-black: #000000;
            --vscode-debug-ansi-red: #cd3131;
            --vscode-debug-ansi-green: #0dbc79;
            --vscode-debug-ansi-yellow: #e5e510;
            --vscode-debug-ansi-blue: #2472c8;
            --vscode-debug-ansi-magenta: #bc3fbc;
            --vscode-debug-ansi-cyan: #11a8cd;
            --vscode-debug-ansi-white: #e5e5e5;
            --vscode-debug-ansi-brightBlack: #666666;
            --vscode-debug-ansi-brightRed: #f14c4c;
            --vscode-debug-ansi-brightGreen: #23d18b;
            --vscode-debug-ansi-brightYellow: #f5f543;
            --vscode-debug-ansi-brightBlue: #3b8eea;
            --vscode-debug-ansi-brightMagenta: #d670d6;
            --vscode-debug-ansi-brightCyan: #29b8db;
            --vscode-debug-ansi-brightWhite: #e5e5e5;
        }
    </style>
</head>
<body>
    <div class="header">
        <button class="control-button" id="collapse-btn" title="Collapse/Expand Output">
            <svg class="codicon chevron" id="chevron-icon" viewBox="0 0 16 16" fill="currentColor" style="transform: ${chevronRotation}">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/>
            </svg>
        </button>
        <button class="control-button" id="close-btn" title="Close Output">
            <svg class="codicon" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
            </svg>
        </button>
    </div>
    <div class="output-content ${initialState}" id="output-content">
        <div class="output-container">
            ${processedLines.map(line => {
                const isHtml = this.isHtmlContent(line);
                return isHtml ? `<div class="output-html">${line}</div>` : `<div class="output-line">${line}</div>`;
            }).join('')}
        </div>
    </div>
    
    <script>
        // Get VS Code API for proper webview communication
        const vscode = acquireVsCodeApi();
        
        const collapseBtn = document.getElementById('collapse-btn');
        const closeBtn = document.getElementById('close-btn');
        const outputContent = document.getElementById('output-content');
        const chevronIcon = document.getElementById('chevron-icon');
        
        collapseBtn.addEventListener('click', () => {
            if (outputContent.classList.contains('expanded')) {
                // Collapse
                vscode.postMessage({ 
                    type: 'resize', 
                    executionId: '${executionId}',
                    height: 1 
                });
                
                outputContent.classList.remove('expanded');
                outputContent.classList.add('collapsed');
                chevronIcon.style.transform = 'rotate(0deg)'; // Down when collapsed
            } else {
                // Expand
                vscode.postMessage({ 
                    type: 'resize', 
                    executionId: '${executionId}',
                    height: ${expandedHeight} 
                });
                
                outputContent.classList.remove('collapsed');
                outputContent.classList.add('expanded');
                chevronIcon.style.transform = 'rotate(180deg)'; // Up when expanded
            }
        });
        
        closeBtn.addEventListener('click', () => {
            vscode.postMessage({ 
                type: 'close', 
                executionId: '${executionId}' 
            });
        });

        // Auto-scroll functionality
        function scrollToBottom() {
            if (!outputContent.classList.contains('expanded')) {
                return;
            }
            outputContent.scrollTop = outputContent.scrollHeight;
        }


        // Listen for content updates from the extension
        window.addEventListener('message', (event) => {
            if (event.data.type === 'updateContent') {
                // Update the output container with new content
                const outputContainer = document.querySelector('.output-container');
                if (outputContainer) {
                    outputContainer.innerHTML = event.data.content;
                    setTimeout(scrollToBottom, 10);
                }
            } else if (event.data.type === 'forceScroll') {
                setTimeout(scrollToBottom, 10);
            }
        });

        // Initial scroll to bottom when expanded
        if (outputContent.classList.contains('expanded')) {
            setTimeout(scrollToBottom, 50);
        }
    </script>
</body>
</html>`;
    }

    private handleWebviewMessage(message: any, executionId: string): void {
        switch (message.type) {
            case 'resize':
                this.handleResizeMessage(message, executionId);
                break;
            case 'close':
                this.handleCloseMessage(executionId);
                break;
        }
    }

    private notifyWebviewContentUpdate(executionId: string): void {
        const outputInset = this.activeInsets_.get(executionId);
        const outputLines = this.cellOutputs_.get(executionId);
        
        if (outputInset && outputLines) {
            // Process lines - handle HTML content vs plain text
            const processedLines = outputLines.map(line => {
                // Check if line contains HTML (images, rich content)
                if (this.isHtmlContent(line)) {
                    // Return HTML content as-is
                    return line;
                } else {
                    // Process as plain text with ANSI handling
                    return handleANSIOutputToHTML(line);
                }
            });
            
            const contentHtml = processedLines.map(line => {
                const isHtml = this.isHtmlContent(line);
                return isHtml ? `<div class="output-html">${line}</div>` : `<div class="output-line">${line}</div>`;
            }).join('');
            
            outputInset.inset.webview.postMessage({
                type: 'updateContent',
                content: contentHtml
            });
        }
    }

    private handleResizeMessage(message: any, executionId: string): void {
        
        const outputInset = this.activeInsets_.get(executionId);
        if (!outputInset || !this.activeEditor_) {
            console.error(`[QuartoOutputManager] No active inset (${!!outputInset}) or editor (${!!this.activeEditor_}) for execution ${executionId}`);
            return;
        }

        const newHeight = message.height || 1;

        // Get ALL the data we need BEFORE disposing anything
        const cellRange = this.cellRangeTracker_.get(executionId);
        const executionUri = this.executionUris_.get(executionId);
        const outputLines = this.cellOutputs_.get(executionId) || [];
        
        if (!cellRange) {
            console.error(`[QuartoOutputManager] No cell range found for execution ${executionId}`);
            return;
        }

        if (!executionUri) {
            console.error(`[QuartoOutputManager] No execution URI found for execution ${executionId}`);
            return;
        }

        const positionKey = this.createPositionKey(executionUri, cellRange);

        // NOW dispose the old inset
        outputInset.inset.dispose();
        this.activeInsets_.delete(executionId);
        this.cellPositionInsets_.delete(positionKey);

        // Create new inset with the saved data
        const isCollapsed = newHeight === 1;
        const newInset = this.createWebviewInset(cellRange, outputLines, executionId, newHeight, isCollapsed);
        if (newInset) {
            const newOutputInset: OutputInset = {
                inset: newInset,
                executionId,
                cellRange,
                heightInLines: newHeight
            };
            
            this.activeInsets_.set(executionId, newOutputInset);
            this.cellPositionInsets_.set(positionKey, newOutputInset);
            
            // If expanding, force scroll to bottom to show content
            if (newHeight > 1) {
                setTimeout(() => {
                    newInset.webview.postMessage({ type: 'forceScroll' });
                }, 50); // Small delay to ensure webview is ready
            }
        }
    }

    private handleCloseMessage(executionId: string): void {
        this.clearExecutionOutput(executionId);
    }

    private recreateInsetsForEditor(): void {
        if (!this.activeEditor_) {
            return;
        }

        // Clear existing insets (they're tied to the previous editor)
        for (const [_, outputInset] of this.activeInsets_) {
            outputInset.inset.dispose();
        }
        this.activeInsets_.clear();

        // Only recreate insets that are currently in the position-based map
        // This ensures we only recreate the most recent execution at each position
        const currentEditorUri = this.activeEditor_.document.uri.toString();
        
        for (const [positionKey, outputInset] of this.cellPositionInsets_) {
            // Check if this position belongs to the current editor
            if (positionKey.startsWith(currentEditorUri + ':')) {
                const executionId = outputInset.executionId;
                const cellRange = outputInset.cellRange;
                const outputLines = this.cellOutputs_.get(executionId) || [];
                
                this.createInsetForExecution(executionId, cellRange, outputLines);
            }
        }
    }

    private createInsetForExecution(executionId: string, cellRange: vscode.Range, outputLines: string[]): void {
        if (!this.activeEditor_) return;

        try {
            const inset = this.createWebviewInset(cellRange, outputLines, executionId);
            if (inset) {
                const outputInset: OutputInset = {
                    inset,
                    executionId,
                    cellRange,
                    heightInLines: this.calculateViewZoneHeight(outputLines)
                };
                
                // Store in both maps for compatibility and position tracking
                this.activeInsets_.set(executionId, outputInset);
                
                const executionUri = this.executionUris_.get(executionId);
                if (executionUri) {
                    const positionKey = this.createPositionKey(executionUri, cellRange);
                    this.cellPositionInsets_.set(positionKey, outputInset);
                }
            }
        } catch (error) {
            console.error(`[QuartoOutputManager] Failed to create inset for execution ${executionId}:`, error);
        }
    }

    private disposeAllInsets(): void {
        for (const [_, outputInset] of this.activeInsets_) {
            outputInset.inset.dispose();
        }
        this.activeInsets_.clear();
        this.cellPositionInsets_.clear();
    }

    public clearExecutionOutput(executionId: string): void {        
        // Get position key before removing from tracking
        const cellRange = this.cellRangeTracker_.get(executionId);
        const executionUri = this.executionUris_.get(executionId);
        
        // Remove from tracking
        this.cellOutputs_.delete(executionId);
        this.cellRangeTracker_.delete(executionId);
        this.executionUris_.delete(executionId);

        // Dispose inset
        const outputInset = this.activeInsets_.get(executionId);
        if (outputInset) {
            outputInset.inset.dispose();
            this.activeInsets_.delete(executionId);
            
            // Also remove from position-based tracking
            if (cellRange && executionUri) {
                const positionKey = this.createPositionKey(executionUri, cellRange);
                this.cellPositionInsets_.delete(positionKey);
            }
        }
        
    }

    public clearAllOutputs(): void {
        this.disposeAllInsets();
        this.cellOutputs_.clear();
        this.cellRangeTracker_.clear();
        this.executionUris_.clear();
    }

}

export const quartoInlineOutputManager = new QuartoInlineOutputManager();