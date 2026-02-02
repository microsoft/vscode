interface Test {
    /**
     * Render +/- indicators for added/deleted changes.
     * Defaults to true.
     */
    renderIndicators?: boolean;
    /**
     * Shows icons in the glyph margin to revert changes.
     * Default to true.
     */
    renderMarginRevertIcon?: boolean;
    /**
     * Original model should be editable?
     * Defaults to false.
     */
    originalEditable?: boolean;
}