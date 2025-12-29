/**
 * Webview UI Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

console.log('[Code Ship Webview] Starting React mount...');

const root = document.getElementById('root');
if (root) {
    try {
        ReactDOM.createRoot(root).render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
        console.log('[Code Ship Webview] React mounted successfully');
    } catch (error) {
        console.error('[Code Ship Webview] React mount failed:', error);
        root.innerHTML = '<div style="color: red; padding: 20px;">Error: ' + String(error) + '</div>';
    }
} else {
    console.error('[Code Ship Webview] #root element not found');
}
