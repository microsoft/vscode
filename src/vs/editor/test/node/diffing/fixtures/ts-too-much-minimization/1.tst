class Test {
    protected readonly checkboxesVisible = observableFromEvent<boolean>(
        this.configurationService.onDidChangeConfiguration,
        () => /** @description checkboxesVisible */ this.configurationService.getValue('mergeEditor.showCheckboxes') ?? false
    );

    protected readonly showDeletionMarkers = observableFromEvent<boolean>(
        this.configurationService.onDidChangeConfiguration,
        () => /** @description showDeletionMarkers */ this.configurationService.getValue('mergeEditor.showDeletionMarkers')
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
