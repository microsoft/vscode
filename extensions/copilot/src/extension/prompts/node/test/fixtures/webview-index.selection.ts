function validateWebviewBoundary(element: HTMLElement) {
	const webviewTop = 0 - (parseInt(element.style.top, 10) || 0);
	return webviewTop >= 0 && webviewTop <= NOTEBOOK_WEBVIEW_BOUNDARY * 2;
}