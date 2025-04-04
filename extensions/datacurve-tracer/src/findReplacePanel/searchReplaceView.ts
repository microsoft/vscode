import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { Recorder } from '../recorders/recorder';

// Define interface for text search match
interface TextSearchMatch {
    filePath: string;
    uri: vscode.Uri;
    ranges: vscode.Range[];
    preview: {
        text: string;
        matches: { start: vscode.Position; end: vscode.Position }[];
    };
}

// Define search result interface
interface SearchResult {
    results: TextSearchMatch[];
}

export class SearchReplaceViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'searchReplace';
    private _view?: vscode.WebviewView;
    private _currentMatches: TextSearchMatch[] = [];
    private readonly _extensionUri: vscode.Uri;
    private _currentSearchTerm: string = ''; // Store current search term for tracing

    constructor(
        extensionUri: vscode.Uri,
        private readonly _tracerService?: Recorder // Assuming some tracer service is injected
    ) {
        this._extensionUri = extensionUri;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'search':
                    this._handleSearch(message.query, message.options);
                    break;
                case 'replaceAll':
                    this._handleReplaceAll(message.searchText, message.replaceText);
                    break;
                case 'replaceInFile':
                    this._handleReplaceInFile(message.searchText, message.replaceText, message.filePath);
                    break;
                case 'openFile':
                    this._handleOpenFile(message.file, message.line);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Same HTML as provided in the query (omitted for brevity)
        return `<!DOCTYPE html>
        <html lang='en'>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    padding: 10px;
                }
                .search-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .search-input-container {
                    flex: 1;
                    position: relative;
                }
                input[type='text'] {
                    width: 100%;
                    height: 24px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                    padding: 0 6px;
                    outline: none;
                    box-sizing: border-box;
                }
                input[type='text']:focus {
                    border-color: var(--vscode-focusBorder);
                }
                .options {
                    display: flex;
                    gap: 4px;
                    margin-left: 4px;
                }
                .button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 12px;
                    min-width: 26px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                .active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .active:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .primary-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .primary-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .action-buttons {
                    display: flex;
                    gap: 6px;
                    margin-top: 8px;
                }
                .results {
                    margin-top: 16px;
                    border-top: 1px solid var(--vscode-panel-border);
                    padding-top: 12px;
                    max-height: calc(100vh - 140px);
                    overflow-y: auto;
                }
                .file-header {
                    display: flex;
                    align-items: center;
                    font-weight: 600;
                    color: var(--vscode-foreground);
                    margin: 8px 0 4px 0;
                    padding: 4px 6px;
                    cursor: pointer;
                    border-radius: 3px;
                }
                .file-header:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .match-line {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    padding: 2px 0 2px 16px;
                    cursor: pointer;
                    white-space: pre-wrap;
                    overflow-x: hidden;
                    text-overflow: ellipsis;
                }
                .match-line:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .highlight {
                    background-color: var(--vscode-editor-findMatchHighlightBackground);
                    border: 1px solid var(--vscode-editor-findMatchHighlightBorder);
                }
                .message {
                    margin-top: 10px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                }
                .status-bar {
                    display: flex;
                    justify-content: space-between;
                    padding: 4px 0;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .loader {
                    display: inline-block;
                    border: 2px solid var(--vscode-editor-background);
                    border-top: 2px solid var(--vscode-progressBar-background);
                    border-radius: 50%;
                    width: 12px;
                    height: 12px;
                    animation: spin 1.5s linear infinite;
                    margin-right: 6px;
                    vertical-align: middle;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .hidden {
                    display: none;
                }
                .file-header.selected {
                    background-color: var(--vscode-editor-selectionBackground);
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='search-row'>
                    <div class='search-input-container'>
                        <input type='text' id='search-input' placeholder='Search' autocomplete='off'>
                    </div>
                    <div class='options'>
                        <button id='toggle-case-sensitive' class='button' title='Match Case'>Aa</button>
                        <button id='toggle-whole-word' class='button' title='Match Whole Word'>Ab</button>
                        <button id='toggle-regex' class='button' title='Use Regular Expression'>.*</button>
                    </div>
                </div>
                <div class='search-row'>
                    <div class='search-input-container'>
                        <input type='text' id='replace-input' placeholder='Replace' autocomplete='off'>
                    </div>
                </div>
                <div class='action-buttons'>
                    <button id='search-button' class='button primary-button'>Search</button>
                    <button id='replace-all-button' class='button'>Replace All</button>
                    <button id='replace-file-button' class='button'>Replace in File</button>
                </div>

                <div class='status-bar'>
                    <div>
                        <span id='loading-indicator' class='loader hidden'></span>
                        <span id='result-stats'></span>
                    </div>
                </div>

                <div id='results' class='results'></div>
                <div id='message' class='message'></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let options = {
                    caseSensitive: false,
                    wholeWord: false,
                    regex: false
                };
                let lastSearchTime = 0;
                const DEBOUNCE_TIME = 300; // ms

                // Toggle option buttons
                document.getElementById('toggle-case-sensitive').addEventListener('click', () => {
                    options.caseSensitive = !options.caseSensitive;
                    toggleButton('toggle-case-sensitive', options.caseSensitive);
                });
                document.getElementById('toggle-whole-word').addEventListener('click', () => {
                    options.wholeWord = !options.wholeWord;
                    toggleButton('toggle-whole-word', options.wholeWord);
                });
                document.getElementById('toggle-regex').addEventListener('click', () => {
                    options.regex = !options.regex;
                    toggleButton('toggle-regex', options.regex);
                });

                function toggleButton(id, isActive) {
                    const btn = document.getElementById(id);
                    btn.classList.toggle('active', isActive);
                }

                // Search button
                document.getElementById('search-button').addEventListener('click', () => {
                    performSearch();
                });

                // Enter key in search input
                document.getElementById('search-input').addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') {
                        performSearch();
                    }
                });

                function performSearch() {
                    const query = document.getElementById('search-input').value;
                    if (query) {
                        const now = Date.now();
                        // Debounce to prevent rapid consecutive searches
                        if (now - lastSearchTime > DEBOUNCE_TIME) {
                            lastSearchTime = now;
                            showLoadingState();
                            vscode.postMessage({ command: 'search', query, options });
                        }
                    }
                }

                function showLoadingState() {
                    document.getElementById('loading-indicator').classList.remove('hidden');
                    document.getElementById('result-stats').textContent = 'Searching...';
                }

                // Replace All button
                document.getElementById('replace-all-button').addEventListener('click', () => {
                    const searchText = document.getElementById('search-input').value;
                    const replaceText = document.getElementById('replace-input').value;
                    if (searchText && replaceText) {
                        vscode.postMessage({ command: 'replaceAll', searchText, replaceText });
                    }
                });

                // Replace in File button
                document.getElementById('replace-file-button').addEventListener('click', () => {
                    const searchText = document.getElementById('search-input').value;
                    const replaceText = document.getElementById('replace-input').value;
                    const selectedFile = document.querySelector('.file-header.selected');

                    if (searchText && replaceText && selectedFile) {
                        const filePath = selectedFile.getAttribute('data-path');
                        vscode.postMessage({
                            command: 'replaceInFile',
                            searchText,
                            replaceText,
                            filePath
                        });
                    } else if (!selectedFile) {
                        document.getElementById('message').textContent = 'Please select a file first';
                    }
                });

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'searchStarted':
                            showLoadingState();
                            break;
                        case 'searchResults':
                            displayResults(message.results, message.matchCount, message.isComplete);
                            break;
                        case 'replaceDone':
                            if (message.inFile) {
                                document.getElementById('message').textContent =
                                    \`Replaced \${message.count} occurrences in \${message.filePath}.\`;
                            } else {
                                document.getElementById('message').textContent =
                                    \`Replaced \${message.count} occurrences across all files.\`;
                            }
                            // Don't clear results after single-file replace
                            if (!message.inFile) {
                                document.getElementById('results').innerHTML = '';
                            }
                            break;
                        case 'searchError':
                            document.getElementById('loading-indicator').classList.add('hidden');
                            document.getElementById('result-stats').textContent = '';
                            document.getElementById('message').textContent = message.message;
                            break;
                    }
                });

                function displayResults(results, matchCount, isComplete) {
                    const resultsDiv = document.getElementById('results');

                    // Only clear and recreate on first batch or completion
                    if (resultsDiv.children.length === 0 || isComplete) {
                        resultsDiv.innerHTML = '';
                    }

                    // Update the loading status
                    if (isComplete) {
                        document.getElementById('loading-indicator').classList.add('hidden');
                        document.getElementById('result-stats').textContent =
                            \`\${matchCount} result\${matchCount !== 1 ? 's' : ''} found\`;
                    } else {
                        document.getElementById('result-stats').textContent =
                            \`\${matchCount} matches found so far...\`;
                    }

                    results.forEach(fileResult => {
                        // Check if file section already exists
                        let fileDiv = document.getElementById('file-' + btoa(fileResult.file));

                        if (!fileDiv) {
                            fileDiv = document.createElement('div');
                            fileDiv.id = 'file-' + btoa(fileResult.file);
                            fileDiv.className = 'file-header';
                            fileDiv.setAttribute('data-path', fileResult.file);

                            // USE DISPLAY PATH INSTEAD OF FILE - this is the key change
                            fileDiv.textContent = fileResult.displayPath || fileResult.file.replace('file://', '');

                            fileDiv.addEventListener('click', (e) => {
                                // Toggle selection of this file for per-file replace
                                document.querySelectorAll('.file-header').forEach(el =>
                                    el.classList.remove('selected'));
                                fileDiv.classList.add('selected');

                                if (e.detail === 2) { // Double click to open
                                    vscode.postMessage({
                                        command: 'openFile',
                                        file: fileResult.file,
                                        line: 0
                                    });
                                }
                            });
                            resultsDiv.appendChild(fileDiv);
                        }

                        fileResult.matches.forEach(match => {
                            const matchDiv = document.createElement('div');
                            matchDiv.className = 'match-line';
                            const lineText = \`\${match.line + 1}: \`;
                            const previewHtml = highlightText(match.preview, match.highlights);
                            matchDiv.innerHTML = lineText + previewHtml;
                            matchDiv.addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'openFile',
                                    file: fileResult.file,
                                    line: match.line
                                });
                            });
                            resultsDiv.appendChild(matchDiv);
                        });
                    });
                }

                function highlightText(text, highlights) {
                    highlights.sort((a, b) => a.start - b.start);
                    let html = '';
                    let lastEnd = 0;
                    highlights.forEach(h => {
                        const before = escapeHTML(text.slice(lastEnd, h.start));
                        const match = escapeHTML(text.slice(h.start, h.end));
                        html += before + \`<span class='highlight'>\${match}</span>\`;
                        lastEnd = h.end;
                    });
                    html += escapeHTML(text.slice(lastEnd));
                    return html;
                }

                function escapeHTML(str) {
                    return str.replace(/&/g, '&amp;')
                             .replace(/</g, '&lt;')
                             .replace(/>/g, '&gt;')
                             .replace(/'/g, '&quot;')
                             .replace(/'/g, '&#039;');
                }
            </script>
        </body>
        </html>`;
    }

    private async _handleSearch(query: string, options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean }) {
        console.log(`Search performed with query: '${query}'`);

        // Store search term for later tracing
        this._currentSearchTerm = query;

        this._view?.webview.postMessage({ command: 'searchStarted' });

        const startTime = Date.now();
        const searchResult: SearchResult = { results: [] };
        let matchCount = 0;

        const tokenSource = new vscode.CancellationTokenSource();
        const timeoutId = setTimeout(() => tokenSource.cancel(), 30000);

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Searching...', cancellable: true },
            async (progress, cancelToken) => {
                cancelToken.onCancellationRequested(() => tokenSource.cancel());

                try {
                    // Compile regex once
                    const flags = options.caseSensitive ? 'g' : 'gi';
                    const regex = options.regex
                        ? new RegExp(query, flags)
                        : new RegExp(
                            options.wholeWord ? `\\b${this._escapeRegExp(query)}\\b` : this._escapeRegExp(query),
                            flags
                        );

                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        throw new Error('No workspace folder open');
                    }

                    // Get files to search
                    const searchFiles = await vscode.workspace.findFiles(
                        '{**/*.py,**/*.md,**/*.txt,**/*.pyx,**/Dockerfile,**/Dockerfile.*}',
                        '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/coverage/**,**/.next/**,*.pyc}',
                        50000,
                        tokenSource.token
                    );
                    console.log(`Found ${searchFiles.length} files to search`);

                    // Calculate worker count (2x CPU cores for I/O-bound tasks)
                    const cpuCount = os.cpus().length;
                    const workerCount = Math.min(16, Math.max(4, cpuCount * 2));
                    const chunkSize = Math.ceil(searchFiles.length / workerCount);
                    const fileChunks = [];
                    for (let i = 0; i < searchFiles.length; i += chunkSize) {
                        fileChunks.push(searchFiles.slice(i, i + chunkSize));
                    }

                    // Spawn workers
                    const workers = fileChunks.map((chunk) => {
                        return new Promise<TextSearchMatch[]>((resolve, reject) => {
                            const worker = new Worker(path.join(__dirname, 'searchWorker.js'), {
                                workerData: {
                                    files: chunk.map((uri) => uri.fsPath),
                                    query,
                                    options,
                                },
                            });
                            worker.on('message', resolve);
                            worker.on('error', reject);
                            worker.on('exit', (code) => {
                                if (code !== 0) {
                                    reject(new Error(`Worker stopped with exit code ${code}`));
                                }
                            });
                        });
                    });

                    // Collect results
                    const workerResults = await Promise.all(workers);
                    for (const matches of workerResults) {
                        // Convert simple objects to VS Code objects]
                        const vsCodeMatches = matches.map(match => ({
                            filePath: match.filePath,
                            uri: vscode.Uri.file(match.filePath),
                            ranges: match.ranges.map(r => new vscode.Range(
                                new vscode.Position(r.start.line, r.start.character),
                                new vscode.Position(r.end.line, r.end.character)
                            )),
                            preview: {
                                text: match.preview.text,
                                matches: match.preview.matches.map(m => ({
                                    start: new vscode.Position(m.start.line, m.start.character),
                                    end: new vscode.Position(m.end.line, m.end.character)
                                }))
                            }
                        }));

                        searchResult.results.push(...vsCodeMatches);
                        matchCount += matches.length;
                    }

                    clearTimeout(timeoutId);
                    tokenSource.dispose();

                    const duration = Date.now() - startTime;
                    const filesPerSecond = Math.round(searchFiles.length / (duration / 1000));
                    console.log(
                        `Search completed in ${duration}ms with ${matchCount} matches in ${searchFiles.length} files (${filesPerSecond} files/sec)`
                    );

                    this._currentMatches = searchResult.results;
                    this._sendProgressUpdate(searchResult, matchCount, true);
                } catch (err) {
                    clearTimeout(timeoutId);
                    tokenSource.dispose();
                    console.error('Search failed:', err);
                    this._view?.webview.postMessage({
                        command: 'searchError',
                        message: 'Search failed: ' + (err instanceof Error ? err.message : String(err)),
                    });
                }
            }
        );
    }

    private _sendProgressUpdate(searchResult: SearchResult, matchCount: number, isComplete: boolean) {
        const groupedMatches = searchResult.results.reduce((acc: { [uri: string]: TextSearchMatch[] }, match) => {
            const uri = match.uri.toString();
            if (!acc[uri]) {
                acc[uri] = [];
            }
            acc[uri].push(match);
            return acc;
        }, {});

        const searchResults = Object.entries(groupedMatches).map(([uri, matches]) => ({
            file: uri,
            displayPath: this._getRelativePath(uri),
            matches: matches.map((match) => ({
                line: match.ranges[0].start.line,
                preview: match.preview.text,
                highlights: match.preview.matches.map((range) => ({
                    start: range.start.character,
                    end: range.end.character,
                })),
            })),
        }));

        this._view?.webview.postMessage({
            command: 'searchResults',
            results: searchResults,
            matchCount,
            isComplete,
        });
    }

    private _escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private _handleReplaceAll(searchText: string, replaceText: string) {
        const edit = new vscode.WorkspaceEdit();
        let replacementCount = 0;
        const affectedFiles: { [uri: string]: number[] } = {}; // Track affected files and lines

        this._currentMatches.forEach((match) => {
            const uri = match.uri;
            const uriString = uri.toString();

            match.ranges.forEach((range) => {
                edit.replace(uri, range, replaceText);
                replacementCount++;

                // Track which files and lines are being modified
                if (!affectedFiles[uriString]) {
                    affectedFiles[uriString] = [];
                }
                affectedFiles[uriString].push(range.start.line);
            });
        });

        vscode.workspace.applyEdit(edit).then((success) => {
            if (success) {
                // Record this action in the tracer system
                this._recordReplaceAction(
                    searchText,
                    replaceText,
                    affectedFiles,
                    replacementCount,
                    false
                );

                this._view?.webview.postMessage({ command: 'replaceDone', count: replacementCount });
            } else {
                vscode.window.showErrorMessage('Failed to apply replacements.');
            }
        });
    }

    private _handleOpenFile(file: string, line: number) {
        const uri = vscode.Uri.parse(file);

        // Record this action in the tracer system
        this._recordFileOpenAction(
            this._currentSearchTerm,
            this._getRelativePath(file),
            line
        );

        // Open the file
        vscode.window.showTextDocument(uri, { selection: new vscode.Range(line, 0, line, 0) });
    }

    private _recordFileOpenAction(searchTerm: string, file: string, line: number) {
        console.log(`TRACE: Open file from search - Term: '${searchTerm}', File: ${file}, Line: ${line}`);

        // Call tracer service if available
        if (this._tracerService) {
            try {
                this._tracerService.record({
                    action_id: 'searchOpenFile',
                    event: {
                        searchTerm,
                        file,
                        line,
                    }
                });
            } catch (err) {
                console.error('Failed to record tracer action:', err);
            }
        }
    }

    private _handleReplaceInFile(searchText: string, replaceText: string, filePath: string) {
        console.log(`Replace in file performed: '${searchText}' → '${replaceText}' in ${filePath}`);
        const edit = new vscode.WorkspaceEdit();
        let replacementCount = 0;
        const affectedLines: number[] = [];

        // Filter matches for this file only
        const fileMatches = this._currentMatches.filter(match =>
            match.uri.toString() === filePath);

        fileMatches.forEach(match => {
            match.ranges.forEach(range => {
                edit.replace(match.uri, range, replaceText);
                replacementCount++;
                affectedLines.push(range.start.line);
            });
        });

        vscode.workspace.applyEdit(edit).then(success => {
            if (success) {
                // Record this action in the tracer system
                const affectedFiles: { [uri: string]: number[] } = {};
                affectedFiles[filePath] = affectedLines;

                this._recordReplaceAction(
                    searchText,
                    replaceText,
                    affectedFiles,
                    replacementCount,
                    true
                );

                this._view?.webview.postMessage({
                    command: 'replaceDone',
                    count: replacementCount,
                    inFile: true,
                    filePath: this._getRelativePath(filePath)
                });
            } else {
                vscode.window.showErrorMessage('Failed to apply replacements.');
            }
        });
    }

    private _recordReplaceAction(
        searchText: string,
        replaceText: string,
        affectedFiles: { [uri: string]: number[] },
        count: number,
        isSingleFile: boolean
    ) {
        // Convert file URIs to relative paths
        const files = Object.entries(affectedFiles).map(([uri, lines]) => ({
            file: this._getRelativePath(uri),
            lines
        }));

        console.log(`TRACE: Replace action - From: '${searchText}', To: '${replaceText}', Files:`, files);

        // Call tracer service if available
        if (this._tracerService) {
            try {
                this._tracerService.record({
                    action_id: isSingleFile ? 'searchReplaceInFile' : 'searchReplaceAll',
                    event: {
                        searchTerm: searchText,
                        replaceTerm: replaceText,
                        files,
                        count,
                    }
                });
            } catch (err) {
                console.error('Failed to record tracer action:', err);
            }
        }
    }

    private _getRelativePath(filePath: string): string {
        if (!filePath.startsWith('file://')) {
            return filePath; // Already processed or not a file URI
        }

        // Convert file:// URI to path
        const fsPath = vscode.Uri.parse(filePath).fsPath;

        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return fsPath; // No workspace, return absolute path
        }

        // Try to find relative path from any workspace folder
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            if (fsPath.startsWith(folderPath)) {
                // Get path relative to this workspace folder
                let relativePath = fsPath.substring(folderPath.length);
                // Normalize path separators and remove leading slash
                relativePath = relativePath.replace(/^[/\\]+/, '');
                return relativePath;
            }
        }

        return fsPath; // Fallback to absolute path
    }
}

export function activate(context: vscode.ExtensionContext, tracerService: Recorder) {
    // Get tracer service from extension context (assuming it's available)

    const provider = new SearchReplaceViewProvider(context.extensionUri, tracerService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SearchReplaceViewProvider.viewType, provider)
    );
}
