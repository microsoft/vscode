/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-export jsx as jsxDEV for compatibility with vitest/vite dev mode
// which resolves @jsxRuntime automatic to jsx-dev-runtime in development.
export { Fragment, jsx as jsxDEV, jsxs } from './jsx-runtime';
