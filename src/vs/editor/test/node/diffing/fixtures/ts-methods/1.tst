interface Test {
    getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[];
	getViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData;
    getViewLineData(lineNumber: number): ViewLineData;
}