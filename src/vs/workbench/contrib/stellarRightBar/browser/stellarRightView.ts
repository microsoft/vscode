import { ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
import { IWebviewService, WebviewContentPurpose } from '../../webview/browser/webview.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { localize } from '../../../../nls.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { getWindow } from '../../../../base/browser/dom.js';

export class StellarRightView extends ViewPane {
	static readonly ID = 'stellarRight.view';

	private readonly _webview = this._register(new MutableDisposable<IOverlayWebview>());
	private _webviewContainer: HTMLElement | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IFileService private readonly fileService: IFileService,
		@IAccessibleViewInformationService accessibleViewInformationService?: IAccessibleViewInformationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewInformationService);
	}
	protected override renderBody(container: HTMLElement): void {
		container.classList.add('stellar-right-view');
		this._webviewContainer = container;

		// Create webview container with full height
		const webviewContainer = document.createElement('div');
		webviewContainer.style.height = '100%';
		webviewContainer.style.width = '100%';
		container.appendChild(webviewContainer);

		// Initialize the webview
		this.initializeWebview(webviewContainer);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._webview.value && this._webviewContainer) {
			this._webview.value.layoutWebviewOverElement(this._webviewContainer, new Dimension(width, height));
		}
	}

	private async initializeWebview(container: HTMLElement): Promise<void> {
		// Create the webview
		const webview = this.webviewService.createWebviewOverlay({
			providedViewType: StellarRightView.ID,
			title: localize('stellarWebview', 'Stellar Chat'),
			options: {
				purpose: WebviewContentPurpose.NotebookRenderer
			},
			contentOptions: {
				allowScripts: true,
				localResourceRoots: []
			},
			extension: undefined
		});

		this._webview.value = webview;

		// Attach webview to container
		webview.claim(this, getWindow(container), undefined);

		// Load the HTML content
		await this.loadWebviewContent(webview);

		// Set up message handling (for future STEP 3)
		this._register(webview.onMessage((message) => {
			this.handleWebviewMessage(message);
		}));
	}

	private async loadWebviewContent(webview: IOverlayWebview): Promise<void> {
		try {
			// Path to the built React bundle
			const webviewPath = URI.file('/Users/iftatbhuiyan/Visuals/stellar-webview/dist/index.js');

			// Read the bundle
			const bundleContent = await this.fileService.readFile(webviewPath);
			const bundleScript = bundleContent.value.toString();

			// Create HTML that loads the React app
			const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src 'unsafe-inline';
		script-src 'unsafe-inline' 'unsafe-eval';
		connect-src http://127.0.0.1:3001 http://localhost:3001 http://127.0.0.1:1234 http://localhost:1234 https://api.openai.com https://api.anthropic.com;
	">
	<title>Stellar Chat</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
			height: 100vh;
			background: var(--vscode-editor-background);
			color: var(--vscode-foreground);
		}
		#root {
			height: 100%;
			width: 100%;
		}
	</style>
</head>
<body>
	<div id="root"></div>
	<script>
		// Note: The webview already has acquireVsCodeApi available
		// The React bundle will use it
		console.log('[Stellar Webview] Starting React app...');
		console.log('[Stellar Webview] acquireVsCodeApi available:', typeof acquireVsCodeApi !== 'undefined');
	</script>
	<script>
		${bundleScript}
	</script>
</body>
</html>`;

			webview.setHtml(html);
		} catch (error) {
			console.error('Failed to load Stellar webview:', error);

			// Fallback error message
			const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			margin: 0;
			padding: 20px;
			font-family: var(--vscode-font-family);
			background: var(--vscode-editor-background);
			color: var(--vscode-foreground);
		}
		.error {
			padding: 16px;
			background: var(--vscode-inputValidation-errorBackground);
			border: 1px solid var(--vscode-inputValidation-errorBorder);
			border-radius: 4px;
		}
	</style>
</head>
<body>
	<div class="error">
		<h3>⚠️ Failed to Load Stellar Chat</h3>
		<p>Could not load the webview bundle. Please ensure the React app is built:</p>
		<pre>cd /Users/iftatbhuiyan/Visuals/stellar-webview && npm install && npm run build</pre>
		<p>Error: ${error}</p>
	</div>
</body>
</html>`;

			webview.setHtml(errorHtml);
		}
	}

	private handleWebviewMessage(data: any): void {
		console.log('[Stellar] Received raw data from webview:', JSON.stringify(data));

		// VS Code wraps the message in a 'message' property
		const message = data.message || data;

		if (!message || typeof message !== 'object') {
			console.error('[Stellar] Invalid message format:', message);
			return;
		}

		console.log('[Stellar] Processing message type:', message.type);

		switch (message.type) {
			case 'userMessage':
				// Forward message to webview to make API call there (less CSP restrictions)
				this.forwardToWebviewForAPICall(message.content);
				break;

			default:
				console.log('[Stellar] Unknown message type:', message.type);
		}
	}

	private forwardToWebviewForAPICall(userMessage: string): void {
		// Tell the webview to make the API call itself
		// The webview has less restrictive CSP and can make localhost HTTP requests
		if (this._webview.value) {
			this._webview.value.postMessage({
				type: 'makeAPICall',
				content: userMessage
			});
		}
	}

}
