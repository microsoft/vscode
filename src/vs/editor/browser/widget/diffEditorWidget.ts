// ... existing imports ...

export class DiffEditorWidget extends Disposable implements IDiffEditor {
    private readonly _originalEditor: CodeEditorWidget;
    private readonly _modifiedEditor: CodeEditorWidget;
    private readonly _domElement: HTMLElement;
    private readonly _diffComputationResult: IDiffComputationResult | null;

    constructor(
        domElement: HTMLElement,
        options: IEditorConstructionOptions,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IInstantiationService instantiationService: IInstantiationService,
        @ICodeEditorService codeEditorService: ICodeEditorService,
        @IThemeService themeService: IThemeService,
        @INotificationService notificationService: INotificationService
    ) {
        super();
        this._domElement = domElement;
        this._diffComputationResult = null;

        // Initialize the diff editor
        this._originalEditor = this._createLeftHandSideEditor(instantiationService, options);
        this._modifiedEditor = this._createRightHandSideEditor(instantiationService, options);

        // Enable text selection in deleted lines
        this._enableDeletedLinesSelection();

        // Enable enhanced search functionality
        this._enhanceSearch();
    }

    private _enableDeletedLinesSelection(): void {
        // Create a mutation observer to handle dynamically added elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        if (node.classList.contains('deleted-sign') || 
                            node.classList.contains('inline-deleted-margin-view-zone')) {
                            // Enable selection on the node and its children
                            this._enableSelectionOnElement(node);
                        }
                    }
                });
            });
        });

        // Start observing the editor DOM
        if (this._domElement) {
            observer.observe(this._domElement, {
                childList: true,
                subtree: true
            });
        }

        // Cleanup when disposed
        this._register(toDisposable(() => observer.disconnect()));
    }

    private _enableSelectionOnElement(element: HTMLElement): void {
        // Enable selection on the element
        element.style.userSelect = 'text';
        element.style.webkitUserSelect = 'text';
        element.style.pointerEvents = 'auto';
        element.style.cursor = 'text';

        // Enable selection on all child elements
        element.querySelectorAll('*').forEach((child) => {
            if (child instanceof HTMLElement) {
                child.style.userSelect = 'text';
                child.style.webkitUserSelect = 'text';
                child.style.pointerEvents = 'auto';
                child.style.cursor = 'text';
            }
        });
    }

    private _enhanceSearch(): void {
        // Enhance the find widget to include deleted lines in search
        const originalModel = this._originalEditor.getModel();
        const modifiedModel = this._modifiedEditor.getModel();

        if (!originalModel || !modifiedModel) {
            return;
        }

        // Override the find controller to include deleted lines in search
        const findController = this._originalEditor.getContribution('editor.contrib.findController') as any;
        if (findController) {
            const originalFind = findController._start.bind(findController);
            
            findController._start = (...args: any[]) => {
                // Call original find implementation
                originalFind(...args);

                // Add support for searching in deleted lines
                if (this._diffComputationResult) {
                    const deletedLines = this._diffComputationResult.changes
                        .filter(change => change.originalEndLineNumber > 0)
                        .map(change => {
                            return originalModel.getValueInRange({
                                startLineNumber: change.originalStartLineNumber,
                                endLineNumber: change.originalEndLineNumber,
                                startColumn: 1,
                                endColumn: Number.MAX_SAFE_INTEGER
                            });
                        })
                        .join('\n');

                    // Include deleted lines in search
                    if (deletedLines) {
                        const searchTerm = findController._state.searchString;
                        const searchRegex = new RegExp(searchTerm, 'g');
                        const matches = deletedLines.match(searchRegex);
                        
                        if (matches) {
                            // Highlight matches in deleted lines
                            this._highlightDeletedMatches(matches, searchTerm);
                        }
                    }
                }
            };
        }
    }

    private _highlightDeletedMatches(matches: RegExpMatchArray, searchTerm: string): void {
        // Add visual indicators for matches in deleted lines
        const deletedLines = this._domElement.querySelectorAll('.deleted-sign');
        deletedLines.forEach((line) => {
            const text = line.textContent || '';
            if (text.includes(searchTerm)) {
                line.classList.add('highlighted-search-result');
            }
        });
    }

    // ... rest of the existing code ...
}