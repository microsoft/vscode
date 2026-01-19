/*---------------------------------------------------------------------------------------------
 *  Chat Webview Entry Point
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatApp } from './components/ChatApp.js';

// 挂载 React 应用
const container = document.getElementById('root');
if (container) {
	const root = createRoot(container);
	root.render(
		<React.StrictMode>
			<ChatApp />
		</React.StrictMode>
	);
}
