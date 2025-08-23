// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * These are fake dom type definitions that rxjs depends on.
 * Another solution is to add the 'dom' lib to tsconfig, but that's even worse.
 * We don't need dom, as the extension does nothing with the dom (dom = HTML entities and the like).
 */

interface EventTarget { }
interface NodeList { }
interface HTMLCollection { }
interface XMLHttpRequest { }
interface Event { }
interface MessageEvent { }
interface CloseEvent { }
interface WebSocket { }
