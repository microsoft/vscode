class Test {
    protected readonly checkboxesVisible = observableFromEvent<boolean>(
        this.configurationService.onDidChangeConfiguration,
        () => /** @description checkboxesVisible */ this.configurationService.getValue('mergeEditor.showCheckboxes') ?? false
    );

    protected readonly showDeletionMarkers = observableFromEvent<boolean>(
        this.configurationService.onDidChangeConfiguration,
        () => /** @description showDeletionMarkers */ this.configurationService.getValue('mergeEditor.showDeletionMarkers') ?? true
    );

    protected readonly useSimplifiedDecorations = observableFromEvent<boolean>(
        this.configurationService.onDidChangeConfiguration,
        () => /** @description useSimplifiedDecorations */ this.configurationService.getValue('mergeEditor.useSimplifiedDecorations') ?? false
    );

    public readonly editor = this.instantiationService.createInstance(
        CodeEditorWidget,
        this.htmlElements.editor,
        {},
        {
            contributions: this.getEditorContributions(),
        }
    );
}
