/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
async function webviewPreloads(ctx) {
    /* eslint-disable no-restricted-globals, no-restricted-syntax */
    // The use of global `window` should be fine in this context, even
    // with aux windows. This code is running from within an `iframe`
    // where there is only one `window` object anyway.
    const userAgent = navigator.userAgent;
    const isChrome = (userAgent.indexOf('Chrome') >= 0);
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    function promiseWithResolvers() {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve: resolve, reject: reject };
    }
    let currentOptions = ctx.options;
    const isWorkspaceTrusted = ctx.isWorkspaceTrusted;
    let currentRenderOptions = ctx.renderOptions;
    const settingChange = createEmitter();
    const acquireVsCodeApi = globalThis.acquireVsCodeApi;
    const vscode = acquireVsCodeApi();
    delete globalThis.acquireVsCodeApi;
    const tokenizationStyle = new CSSStyleSheet();
    tokenizationStyle.replaceSync(ctx.style.tokenizationCss);
    const runWhenIdle = (typeof requestIdleCallback !== 'function' || typeof cancelIdleCallback !== 'function')
        ? (runner) => {
            setTimeout(() => {
                if (disposed) {
                    return;
                }
                const end = Date.now() + 15; // one frame at 64fps
                runner(Object.freeze({
                    didTimeout: true,
                    timeRemaining() {
                        return Math.max(0, end - Date.now());
                    }
                }));
            });
            let disposed = false;
            return {
                dispose() {
                    if (disposed) {
                        return;
                    }
                    disposed = true;
                }
            };
        }
        : (runner, timeout) => {
            const handle = requestIdleCallback(runner, typeof timeout === 'number' ? { timeout } : undefined);
            let disposed = false;
            return {
                dispose() {
                    if (disposed) {
                        return;
                    }
                    disposed = true;
                    cancelIdleCallback(handle);
                }
            };
        };
    function getOutputContainer(event) {
        for (const node of event.composedPath()) {
            if (node instanceof HTMLElement && node.classList.contains('output')) {
                return {
                    id: node.id
                };
            }
        }
        return;
    }
    let lastFocusedOutput = undefined;
    const handleOutputFocusOut = (event) => {
        const outputFocus = event && getOutputContainer(event);
        if (!outputFocus) {
            return;
        }
        // Possible we're tabbing through the elements of the same output.
        // Lets see if focus is set back to the same output.
        lastFocusedOutput = undefined;
        setTimeout(() => {
            if (lastFocusedOutput?.id === outputFocus.id) {
                return;
            }
            postNotebookMessage('outputBlur', outputFocus);
        }, 0);
    };
    const hasActiveEditableElement = (parent, root = document) => {
        const element = root.activeElement;
        return !!(element && parent.contains(element)
            && (element.matches(':read-write') || element.tagName.toLowerCase() === 'select'
                || (element.shadowRoot && hasActiveEditableElement(element.shadowRoot, element.shadowRoot))));
    };
    // check if an input element is focused within the output element
    const checkOutputInputFocus = (e) => {
        lastFocusedOutput = getOutputContainer(e);
        const activeElement = window.document.activeElement;
        if (!activeElement) {
            return;
        }
        const id = lastFocusedOutput?.id;
        if (id && (hasActiveEditableElement(activeElement, window.document))) {
            postNotebookMessage('outputInputFocus', { inputFocused: true, id });
            activeElement.addEventListener('blur', () => {
                postNotebookMessage('outputInputFocus', { inputFocused: false, id });
            }, { once: true });
        }
    };
    const handleInnerClick = (event) => {
        if (!event || !event.view || !event.view.document) {
            return;
        }
        const outputFocus = lastFocusedOutput = getOutputContainer(event);
        for (const node of event.composedPath()) {
            if (node instanceof HTMLAnchorElement && node.href) {
                if (node.href.startsWith('blob:')) {
                    if (outputFocus) {
                        postNotebookMessage('outputFocus', outputFocus);
                    }
                    handleBlobUrlClick(node.href, node.download);
                }
                else if (node.href.startsWith('data:')) {
                    if (outputFocus) {
                        postNotebookMessage('outputFocus', outputFocus);
                    }
                    handleDataUrl(node.href, node.download);
                }
                else if (node.getAttribute('href')?.trim().startsWith('#')) {
                    // Scrolling to location within current doc
                    if (!node.hash) {
                        postNotebookMessage('scroll-to-reveal', { scrollTop: 0 });
                        return;
                    }
                    const targetId = node.hash.substring(1);
                    // Check outer document first
                    let scrollTarget = event.view.document.getElementById(targetId);
                    if (!scrollTarget) {
                        // Fallback to checking preview shadow doms
                        for (const preview of event.view.document.querySelectorAll('.preview')) {
                            scrollTarget = preview.shadowRoot?.getElementById(targetId);
                            if (scrollTarget) {
                                break;
                            }
                        }
                    }
                    if (scrollTarget) {
                        const scrollTop = scrollTarget.getBoundingClientRect().top + event.view.scrollY;
                        postNotebookMessage('scroll-to-reveal', { scrollTop });
                        return;
                    }
                }
                else {
                    const href = node.getAttribute('href');
                    if (href) {
                        if (href.startsWith('command:') && outputFocus) {
                            postNotebookMessage('outputFocus', outputFocus);
                        }
                        postNotebookMessage('clicked-link', { href });
                    }
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }
        if (outputFocus) {
            postNotebookMessage('outputFocus', outputFocus);
        }
    };
    const blurOutput = () => {
        const selection = window.getSelection();
        if (!selection) {
            return;
        }
        selection.removeAllRanges();
    };
    const selectOutputContents = (cellOrOutputId) => {
        const selection = window.getSelection();
        if (!selection) {
            return;
        }
        const cellOutputContainer = window.document.getElementById(cellOrOutputId);
        if (!cellOutputContainer) {
            return;
        }
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNode(cellOutputContainer);
        selection.addRange(range);
    };
    const selectInputContents = (cellOrOutputId) => {
        const cellOutputContainer = window.document.getElementById(cellOrOutputId);
        if (!cellOutputContainer) {
            return;
        }
        const activeElement = window.document.activeElement;
        if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
            activeElement.select();
        }
    };
    const onPageUpDownSelectionHandler = (e) => {
        if (!lastFocusedOutput?.id || !e.shiftKey) {
            return;
        }
        // If we're pressing `Shift+Up/Down` then we want to select a line at a time.
        if (e.shiftKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
            e.stopPropagation(); // We don't want the notebook to handle this, default behavior is what we need.
            return;
        }
        // We want to handle just `Shift + PageUp/PageDown` & `Shift + Cmd + ArrowUp/ArrowDown` (for mac)
        if (!(e.code === 'PageUp' || e.code === 'PageDown') && !(e.metaKey && (e.code === 'ArrowDown' || e.code === 'ArrowUp'))) {
            return;
        }
        const outputContainer = window.document.getElementById(lastFocusedOutput.id);
        const selection = window.getSelection();
        if (!outputContainer || !selection?.anchorNode) {
            return;
        }
        const activeElement = window.document.activeElement;
        if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
            // Leave for default behavior.
            return;
        }
        // These should change the scroll position, not adjust the selected cell in the notebook
        e.stopPropagation(); // We don't want the notebook to handle this.
        e.preventDefault(); // We will handle selection.
        const { anchorNode, anchorOffset } = selection;
        const range = document.createRange();
        if (e.code === 'PageDown' || e.code === 'ArrowDown') {
            range.setStart(anchorNode, anchorOffset);
            range.setEnd(outputContainer, 1);
        }
        else {
            range.setStart(outputContainer, 0);
            range.setEnd(anchorNode, anchorOffset);
        }
        selection.removeAllRanges();
        selection.addRange(range);
    };
    const disableNativeSelectAll = (e) => {
        if (!lastFocusedOutput?.id) {
            return;
        }
        const activeElement = window.document.activeElement;
        if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
            // The input element will handle this.
            return;
        }
        if ((e.key === 'a' && e.ctrlKey) || (e.metaKey && e.key === 'a')) {
            e.preventDefault(); // We will handle selection in editor code.
            return;
        }
    };
    const handleDataUrl = async (data, downloadName) => {
        postNotebookMessage('clicked-data-url', {
            data,
            downloadName
        });
    };
    const handleBlobUrlClick = async (url, downloadName) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                handleDataUrl(reader.result, downloadName);
            });
            reader.readAsDataURL(blob);
        }
        catch (e) {
            console.error(e.message);
        }
    };
    window.document.body.addEventListener('click', handleInnerClick);
    window.document.body.addEventListener('focusin', checkOutputInputFocus);
    window.document.body.addEventListener('focusout', handleOutputFocusOut);
    window.document.body.addEventListener('keydown', onPageUpDownSelectionHandler);
    window.document.body.addEventListener('keydown', disableNativeSelectAll);
    function createKernelContext() {
        return Object.freeze({
            onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
            postKernelMessage: (data) => postNotebookMessage('customKernelMessage', { message: data }),
        });
    }
    async function runKernelPreload(url) {
        try {
            return await activateModuleKernelPreload(url);
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }
    async function activateModuleKernelPreload(url) {
        const module = await __import(url);
        if (!module.activate) {
            console.error(`Notebook preload '${url}' was expected to be a module but it does not export an 'activate' function`);
            return;
        }
        return module.activate(createKernelContext());
    }
    const dimensionUpdater = new class {
        constructor() {
            this.pending = new Map();
        }
        updateHeight(id, height, options) {
            if (!this.pending.size) {
                setTimeout(() => {
                    this.updateImmediately();
                }, 0);
            }
            const update = this.pending.get(id);
            if (update && update.isOutput) {
                this.pending.set(id, {
                    id,
                    height,
                    init: update.init,
                    isOutput: update.isOutput
                });
            }
            else {
                this.pending.set(id, {
                    id,
                    height,
                    ...options,
                });
            }
        }
        updateImmediately() {
            if (!this.pending.size) {
                return;
            }
            postNotebookMessage('dimension', {
                updates: Array.from(this.pending.values())
            });
            this.pending.clear();
        }
    };
    function elementHasContent(height) {
        // we need to account for a potential 1px top and bottom border on a child within the output container
        return height > 2.1;
    }
    const resizeObserver = new class {
        constructor() {
            this._observedElements = new WeakMap();
            this._observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    if (!window.document.body.contains(entry.target)) {
                        continue;
                    }
                    const observedElementInfo = this._observedElements.get(entry.target);
                    if (!observedElementInfo) {
                        continue;
                    }
                    this.postResizeMessage(observedElementInfo.cellId);
                    if (entry.target.id !== observedElementInfo.id) {
                        continue;
                    }
                    if (!entry.contentRect) {
                        continue;
                    }
                    if (!observedElementInfo.output) {
                        // markup, update directly
                        this.updateHeight(observedElementInfo, entry.target.offsetHeight);
                        continue;
                    }
                    const hasContent = elementHasContent(entry.contentRect.height);
                    const shouldUpdatePadding = (hasContent && observedElementInfo.lastKnownPadding === 0) ||
                        (!hasContent && observedElementInfo.lastKnownPadding !== 0);
                    if (shouldUpdatePadding) {
                        // Do not update dimension in resize observer
                        window.requestAnimationFrame(() => {
                            if (hasContent) {
                                entry.target.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}px`;
                            }
                            else {
                                entry.target.style.padding = `0px`;
                            }
                            this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
                        });
                    }
                    else {
                        this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
                    }
                }
            });
        }
        updateHeight(observedElementInfo, offsetHeight) {
            if (observedElementInfo.lastKnownHeight !== offsetHeight) {
                observedElementInfo.lastKnownHeight = offsetHeight;
                dimensionUpdater.updateHeight(observedElementInfo.id, offsetHeight, {
                    isOutput: observedElementInfo.output
                });
            }
        }
        observe(container, id, output, cellId) {
            if (this._observedElements.has(container)) {
                return;
            }
            this._observedElements.set(container, { id, output, lastKnownPadding: ctx.style.outputNodePadding, lastKnownHeight: -1, cellId });
            this._observer.observe(container);
        }
        postResizeMessage(cellId) {
            // Debounce this callback to only happen after
            // 250 ms. Don't need resize events that often.
            clearTimeout(this._outputResizeTimer);
            this._outputResizeTimer = setTimeout(() => {
                postNotebookMessage('outputResized', {
                    cellId
                });
            }, 250);
        }
    };
    let previousDelta;
    let scrollTimeout;
    let scrolledElement;
    let lastTimeScrolled;
    function flagRecentlyScrolled(node, deltaY) {
        scrolledElement = node;
        if (deltaY === undefined) {
            lastTimeScrolled = Date.now();
            previousDelta = undefined;
            node.setAttribute('recentlyScrolled', 'true');
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => { scrolledElement?.removeAttribute('recentlyScrolled'); }, 300);
            return true;
        }
        if (node.hasAttribute('recentlyScrolled')) {
            if (lastTimeScrolled && Date.now() - lastTimeScrolled > 400) {
                // it has been a while since we actually scrolled
                // if scroll velocity increases significantly, it's likely a new scroll event
                if (!!previousDelta && deltaY < 0 && deltaY < previousDelta - 8) {
                    clearTimeout(scrollTimeout);
                    scrolledElement?.removeAttribute('recentlyScrolled');
                    return false;
                }
                else if (!!previousDelta && deltaY > 0 && deltaY > previousDelta + 8) {
                    clearTimeout(scrollTimeout);
                    scrolledElement?.removeAttribute('recentlyScrolled');
                    return false;
                }
                // the tail end of a smooth scrolling event (from a trackpad) can go on for a while
                // so keep swallowing it, but we can shorten the timeout since the events occur rapidly
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => { scrolledElement?.removeAttribute('recentlyScrolled'); }, 50);
            }
            else {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => { scrolledElement?.removeAttribute('recentlyScrolled'); }, 300);
            }
            previousDelta = deltaY;
            return true;
        }
        return false;
    }
    function eventTargetShouldHandleScroll(event) {
        for (let node = event.target; node; node = node.parentNode) {
            if (!(node instanceof Element) || node.id === 'container' || node.classList.contains('cell_container') || node.classList.contains('markup') || node.classList.contains('output_container')) {
                return false;
            }
            // scroll up
            if (event.deltaY < 0 && node.scrollTop > 0) {
                // there is still some content to scroll
                flagRecentlyScrolled(node);
                return true;
            }
            // scroll down
            if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
                // per https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
                // scrollTop is not rounded but scrollHeight and clientHeight are
                // so we need to check if the difference is less than some threshold
                if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
                    continue;
                }
                // if the node is not scrollable, we can continue. We don't check the computed style always as it's expensive
                if (window.getComputedStyle(node).overflowY === 'hidden' || window.getComputedStyle(node).overflowY === 'visible') {
                    continue;
                }
                flagRecentlyScrolled(node);
                return true;
            }
            if (flagRecentlyScrolled(node, event.deltaY)) {
                return true;
            }
        }
        return false;
    }
    const handleWheel = (event) => {
        if (event.defaultPrevented || eventTargetShouldHandleScroll(event)) {
            return;
        }
        postNotebookMessage('did-scroll-wheel', {
            payload: {
                deltaMode: event.deltaMode,
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                deltaZ: event.deltaZ,
                // Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
                wheelDelta: event.wheelDelta && isChrome ? (event.wheelDelta / window.devicePixelRatio) : event.wheelDelta,
                wheelDeltaX: event.wheelDeltaX && isChrome ? (event.wheelDeltaX / window.devicePixelRatio) : event.wheelDeltaX,
                wheelDeltaY: event.wheelDeltaY && isChrome ? (event.wheelDeltaY / window.devicePixelRatio) : event.wheelDeltaY,
                detail: event.detail,
                shiftKey: event.shiftKey,
                type: event.type
            }
        });
    };
    function focusFirstFocusableOrContainerInOutput(cellOrOutputId, alternateId) {
        const cellOutputContainer = window.document.getElementById(cellOrOutputId) ??
            (!!alternateId ? window.document.getElementById(alternateId) : undefined);
        if (!!cellOutputContainer) {
            if (cellOutputContainer.contains(window.document.activeElement)) {
                return;
            }
            let focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea');
            if (!focusableElement) {
                focusableElement = cellOutputContainer;
                focusableElement.tabIndex = -1;
            }
            if (lastFocusedOutput?.id !== cellOutputContainer.id) {
                lastFocusedOutput = cellOutputContainer;
                postNotebookMessage('outputFocus', { id: cellOutputContainer.id });
            }
            focusableElement.focus();
        }
    }
    function createFocusSink(cellId, focusNext) {
        const element = document.createElement('div');
        element.id = `focus-sink-${cellId}`;
        element.tabIndex = 0;
        element.addEventListener('focus', () => {
            postNotebookMessage('focus-editor', {
                cellId: cellId,
                focusNext
            });
        });
        return element;
    }
    function _internalHighlightRange(range, tagName = 'mark', attributes = {}) {
        // derived from https://github.com/Treora/dom-highlight-range/blob/master/highlight-range.js
        // Return an array of the text nodes in the range. Split the start and end nodes if required.
        function _textNodesInRange(range) {
            if (!range.startContainer.ownerDocument) {
                return [];
            }
            // If the start or end node is a text node and only partly in the range, split it.
            if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
                const startContainer = range.startContainer;
                const endOffset = range.endOffset; // (this may get lost when the splitting the node)
                const createdNode = startContainer.splitText(range.startOffset);
                if (range.endContainer === startContainer) {
                    // If the end was in the same container, it will now be in the newly created node.
                    range.setEnd(createdNode, endOffset - range.startOffset);
                }
                range.setStart(createdNode, 0);
            }
            if (range.endContainer.nodeType === Node.TEXT_NODE
                && range.endOffset < range.endContainer.length) {
                range.endContainer.splitText(range.endOffset);
            }
            // Collect the text nodes.
            const walker = range.startContainer.ownerDocument.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, node => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT);
            walker.currentNode = range.startContainer;
            // // Optimise by skipping nodes that are explicitly outside the range.
            // const NodeTypesWithCharacterOffset = [
            //  Node.TEXT_NODE,
            //  Node.PROCESSING_INSTRUCTION_NODE,
            //  Node.COMMENT_NODE,
            // ];
            // if (!NodeTypesWithCharacterOffset.includes(range.startContainer.nodeType)) {
            //   if (range.startOffset < range.startContainer.childNodes.length) {
            //     walker.currentNode = range.startContainer.childNodes[range.startOffset];
            //   } else {
            //     walker.nextSibling(); // TODO verify this is correct.
            //   }
            // }
            const nodes = [];
            if (walker.currentNode.nodeType === Node.TEXT_NODE) {
                nodes.push(walker.currentNode);
            }
            while (walker.nextNode() && range.comparePoint(walker.currentNode, 0) !== 1) {
                if (walker.currentNode.nodeType === Node.TEXT_NODE) {
                    nodes.push(walker.currentNode);
                }
            }
            return nodes;
        }
        // Replace [node] with <tagName ...attributes>[node]</tagName>
        function wrapNodeInHighlight(node, tagName, attributes) {
            const highlightElement = node.ownerDocument.createElement(tagName);
            Object.keys(attributes).forEach(key => {
                highlightElement.setAttribute(key, attributes[key]);
            });
            const tempRange = node.ownerDocument.createRange();
            tempRange.selectNode(node);
            tempRange.surroundContents(highlightElement);
            return highlightElement;
        }
        if (range.collapsed) {
            return {
                remove: () => { },
                update: () => { }
            };
        }
        // First put all nodes in an array (splits start and end nodes if needed)
        const nodes = _textNodesInRange(range);
        // Highlight each node
        const highlightElements = [];
        for (const nodeIdx in nodes) {
            const highlightElement = wrapNodeInHighlight(nodes[nodeIdx], tagName, attributes);
            highlightElements.push(highlightElement);
        }
        // Remove a highlight element created with wrapNodeInHighlight.
        function _removeHighlight(highlightElement) {
            if (highlightElement.childNodes.length === 1) {
                highlightElement.replaceWith(highlightElement.firstChild);
            }
            else {
                // If the highlight somehow contains multiple nodes now, move them all.
                while (highlightElement.firstChild) {
                    highlightElement.parentNode?.insertBefore(highlightElement.firstChild, highlightElement);
                }
                highlightElement.remove();
            }
        }
        // Return a function that cleans up the highlightElements.
        function _removeHighlights() {
            // Remove each of the created highlightElements.
            for (const highlightIdx in highlightElements) {
                _removeHighlight(highlightElements[highlightIdx]);
            }
        }
        function _updateHighlight(highlightElement, attributes = {}) {
            Object.keys(attributes).forEach(key => {
                highlightElement.setAttribute(key, attributes[key]);
            });
        }
        function updateHighlights(attributes) {
            for (const highlightIdx in highlightElements) {
                _updateHighlight(highlightElements[highlightIdx], attributes);
            }
        }
        return {
            remove: _removeHighlights,
            update: updateHighlights
        };
    }
    function selectRange(_range) {
        const sel = window.getSelection();
        if (sel) {
            try {
                sel.removeAllRanges();
                const r = document.createRange();
                r.setStart(_range.startContainer, _range.startOffset);
                r.setEnd(_range.endContainer, _range.endOffset);
                sel.addRange(r);
            }
            catch (e) {
                console.log(e);
            }
        }
    }
    function highlightRange(range, useCustom, tagName = 'mark', attributes = {}) {
        if (useCustom) {
            const ret = _internalHighlightRange(range, tagName, attributes);
            return {
                range: range,
                dispose: ret.remove,
                update: (color, className) => {
                    if (className === undefined) {
                        ret.update({
                            'style': `background-color: ${color}`
                        });
                    }
                    else {
                        ret.update({
                            'class': className
                        });
                    }
                }
            };
        }
        else {
            window.document.execCommand('hiliteColor', false, matchColor);
            const cloneRange = window.getSelection().getRangeAt(0).cloneRange();
            const _range = {
                collapsed: cloneRange.collapsed,
                commonAncestorContainer: cloneRange.commonAncestorContainer,
                endContainer: cloneRange.endContainer,
                endOffset: cloneRange.endOffset,
                startContainer: cloneRange.startContainer,
                startOffset: cloneRange.startOffset
            };
            return {
                range: _range,
                dispose: () => {
                    selectRange(_range);
                    try {
                        document.designMode = 'On';
                        window.document.execCommand('removeFormat', false, undefined);
                        document.designMode = 'Off';
                        window.getSelection()?.removeAllRanges();
                    }
                    catch (e) {
                        console.log(e);
                    }
                },
                update: (color, className) => {
                    selectRange(_range);
                    try {
                        document.designMode = 'On';
                        window.document.execCommand('removeFormat', false, undefined);
                        window.document.execCommand('hiliteColor', false, color);
                        document.designMode = 'Off';
                        window.getSelection()?.removeAllRanges();
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
            };
        }
    }
    function createEmitter(listenerChange = () => undefined) {
        const listeners = new Set();
        return {
            fire(data) {
                for (const listener of [...listeners]) {
                    listener.fn.call(listener.thisArg, data);
                }
            },
            event(fn, thisArg, disposables) {
                const listenerObj = { fn, thisArg };
                const disposable = {
                    dispose: () => {
                        listeners.delete(listenerObj);
                        listenerChange(listeners);
                    },
                };
                listeners.add(listenerObj);
                listenerChange(listeners);
                if (disposables instanceof Array) {
                    disposables.push(disposable);
                }
                else if (disposables) {
                    disposables.add(disposable);
                }
                return disposable;
            },
        };
    }
    function showRenderError(errorText, outputNode, errors) {
        outputNode.innerText = errorText;
        const errList = document.createElement('ul');
        for (const result of errors) {
            console.error(result);
            const item = document.createElement('li');
            item.innerText = result.message;
            errList.appendChild(item);
        }
        outputNode.appendChild(errList);
    }
    const outputItemRequests = new class {
        constructor() {
            this._requestPool = 0;
            this._requests = new Map();
        }
        getOutputItem(outputId, mime) {
            const requestId = this._requestPool++;
            const { promise, resolve } = promiseWithResolvers();
            this._requests.set(requestId, { resolve });
            postNotebookMessage('getOutputItem', { requestId, outputId, mime });
            return promise;
        }
        resolveOutputItem(requestId, output) {
            const request = this._requests.get(requestId);
            if (!request) {
                return;
            }
            this._requests.delete(requestId);
            request.resolve(output);
        }
    };
    let hasWarnedAboutAllOutputItemsProposal = false;
    function createOutputItem(id, mime, metadata, valueBytes, allOutputItemData, appended) {
        function create(id, mime, metadata, valueBytes, appended) {
            return Object.freeze({
                id,
                mime,
                metadata,
                appendedText() {
                    if (appended) {
                        return textDecoder.decode(appended.valueBytes);
                    }
                    return undefined;
                },
                data() {
                    return valueBytes;
                },
                text() {
                    return textDecoder.decode(valueBytes);
                },
                json() {
                    return JSON.parse(this.text());
                },
                blob() {
                    return new Blob([valueBytes], { type: this.mime });
                },
                get _allOutputItems() {
                    if (!hasWarnedAboutAllOutputItemsProposal) {
                        hasWarnedAboutAllOutputItemsProposal = true;
                        console.warn(`'_allOutputItems' is proposed API. DO NOT ship an extension that depends on it!`);
                    }
                    return allOutputItemList;
                },
            });
        }
        const allOutputItemCache = new Map();
        const allOutputItemList = Object.freeze(allOutputItemData.map(outputItem => {
            const mime = outputItem.mime;
            return Object.freeze({
                mime,
                getItem() {
                    const existingTask = allOutputItemCache.get(mime);
                    if (existingTask) {
                        return existingTask;
                    }
                    const task = outputItemRequests.getOutputItem(id, mime).then(item => {
                        return item ? create(id, item.mime, metadata, item.valueBytes) : undefined;
                    });
                    allOutputItemCache.set(mime, task);
                    return task;
                }
            });
        }));
        const item = create(id, mime, metadata, valueBytes, appended);
        allOutputItemCache.set(mime, Promise.resolve(item));
        return item;
    }
    const onDidReceiveKernelMessage = createEmitter();
    const ttPolicy = window.trustedTypes?.createPolicy('notebookRenderer', {
        createHTML: value => value, // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
        createScript: value => value, // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
    });
    window.addEventListener('wheel', handleWheel);
    const matchColor = window.getComputedStyle(window.document.getElementById('_defaultColorPalatte')).color;
    const currentMatchColor = window.getComputedStyle(window.document.getElementById('_defaultColorPalatte')).backgroundColor;
    class JSHighlighter {
        constructor() {
            this._activeHighlightInfo = new Map();
        }
        addHighlights(matches, ownerID) {
            for (let i = matches.length - 1; i >= 0; i--) {
                const match = matches[i];
                const ret = highlightRange(match.originalRange, true, 'mark', match.isShadow ? {
                    'style': 'background-color: ' + matchColor + ';',
                } : {
                    'class': 'find-match'
                });
                match.highlightResult = ret;
            }
            const highlightInfo = {
                matches,
                currentMatchIndex: -1
            };
            this._activeHighlightInfo.set(ownerID, highlightInfo);
        }
        removeHighlights(ownerID) {
            this._activeHighlightInfo.get(ownerID)?.matches.forEach(match => {
                match.highlightResult?.dispose();
            });
            this._activeHighlightInfo.delete(ownerID);
        }
        highlightCurrentMatch(index, ownerID) {
            const highlightInfo = this._activeHighlightInfo.get(ownerID);
            if (!highlightInfo) {
                console.error('Modified current highlight match before adding highlight list.');
                return;
            }
            const oldMatch = highlightInfo.matches[highlightInfo.currentMatchIndex];
            oldMatch?.highlightResult?.update(matchColor, oldMatch.isShadow ? undefined : 'find-match');
            const match = highlightInfo.matches[index];
            highlightInfo.currentMatchIndex = index;
            const sel = window.getSelection();
            if (!!match && !!sel && match.highlightResult) {
                let offset = 0;
                try {
                    const outputOffset = window.document.getElementById(match.id).getBoundingClientRect().top;
                    const tempRange = document.createRange();
                    tempRange.selectNode(match.highlightResult.range.startContainer);
                    match.highlightResult.range.startContainer.parentElement?.scrollIntoView({ behavior: 'auto', block: 'end', inline: 'nearest' });
                    const rangeOffset = tempRange.getBoundingClientRect().top;
                    tempRange.detach();
                    offset = rangeOffset - outputOffset;
                }
                catch (e) {
                    console.error(e);
                }
                match.highlightResult?.update(currentMatchColor, match.isShadow ? undefined : 'current-find-match');
                window.document.getSelection()?.removeAllRanges();
                postNotebookMessage('didFindHighlightCurrent', {
                    offset
                });
            }
        }
        unHighlightCurrentMatch(index, ownerID) {
            const highlightInfo = this._activeHighlightInfo.get(ownerID);
            if (!highlightInfo) {
                return;
            }
            const oldMatch = highlightInfo.matches[index];
            if (oldMatch && oldMatch.highlightResult) {
                oldMatch.highlightResult.update(matchColor, oldMatch.isShadow ? undefined : 'find-match');
            }
        }
        dispose() {
            window.document.getSelection()?.removeAllRanges();
            this._activeHighlightInfo.forEach(highlightInfo => {
                highlightInfo.matches.forEach(match => {
                    match.highlightResult?.dispose();
                });
            });
        }
    }
    class CSSHighlighter {
        constructor() {
            this._activeHighlightInfo = new Map();
            this._matchesHighlight = new Highlight();
            this._matchesHighlight.priority = 1;
            this._currentMatchesHighlight = new Highlight();
            this._currentMatchesHighlight.priority = 2;
            CSS.highlights?.set(`find-highlight`, this._matchesHighlight);
            CSS.highlights?.set(`current-find-highlight`, this._currentMatchesHighlight);
        }
        _refreshRegistry(updateMatchesHighlight = true) {
            // for performance reasons, only update the full list of highlights when we need to
            if (updateMatchesHighlight) {
                this._matchesHighlight.clear();
            }
            this._currentMatchesHighlight.clear();
            this._activeHighlightInfo.forEach((highlightInfo) => {
                if (updateMatchesHighlight) {
                    for (let i = 0; i < highlightInfo.matches.length; i++) {
                        this._matchesHighlight.add(highlightInfo.matches[i].originalRange);
                    }
                }
                if (highlightInfo.currentMatchIndex < highlightInfo.matches.length && highlightInfo.currentMatchIndex >= 0) {
                    this._currentMatchesHighlight.add(highlightInfo.matches[highlightInfo.currentMatchIndex].originalRange);
                }
            });
        }
        addHighlights(matches, ownerID) {
            for (let i = 0; i < matches.length; i++) {
                this._matchesHighlight.add(matches[i].originalRange);
            }
            const newEntry = {
                matches,
                currentMatchIndex: -1,
            };
            this._activeHighlightInfo.set(ownerID, newEntry);
        }
        highlightCurrentMatch(index, ownerID) {
            const highlightInfo = this._activeHighlightInfo.get(ownerID);
            if (!highlightInfo) {
                console.error('Modified current highlight match before adding highlight list.');
                return;
            }
            highlightInfo.currentMatchIndex = index;
            const match = highlightInfo.matches[index];
            if (match) {
                let offset = 0;
                try {
                    const outputOffset = window.document.getElementById(match.id).getBoundingClientRect().top;
                    match.originalRange.startContainer.parentElement?.scrollIntoView({ behavior: 'auto', block: 'end', inline: 'nearest' });
                    const rangeOffset = match.originalRange.getBoundingClientRect().top;
                    offset = rangeOffset - outputOffset;
                    postNotebookMessage('didFindHighlightCurrent', {
                        offset
                    });
                }
                catch (e) {
                    console.error(e);
                }
            }
            this._refreshRegistry(false);
        }
        unHighlightCurrentMatch(index, ownerID) {
            const highlightInfo = this._activeHighlightInfo.get(ownerID);
            if (!highlightInfo) {
                return;
            }
            highlightInfo.currentMatchIndex = -1;
        }
        removeHighlights(ownerID) {
            this._activeHighlightInfo.delete(ownerID);
            this._refreshRegistry();
        }
        dispose() {
            window.document.getSelection()?.removeAllRanges();
            this._currentMatchesHighlight.clear();
            this._matchesHighlight.clear();
        }
    }
    const _highlighter = (CSS.highlights) ? new CSSHighlighter() : new JSHighlighter();
    function extractSelectionLine(selection) {
        const range = selection.getRangeAt(0);
        // we need to keep a reference to the old selection range to re-apply later
        const oldRange = range.cloneRange();
        const captureLength = selection.toString().length;
        // use selection API to modify selection to get entire line (the first line if multi-select)
        // collapse selection to start so that the cursor position is at beginning of match
        selection.collapseToStart();
        // extend selection in both directions to select the line
        selection.modify('move', 'backward', 'lineboundary');
        selection.modify('extend', 'forward', 'lineboundary');
        const line = selection.toString();
        // using the original range and the new range, we can find the offset of the match from the line start.
        const rangeStart = getStartOffset(selection.getRangeAt(0), oldRange);
        // line range for match
        const lineRange = {
            start: rangeStart,
            end: rangeStart + captureLength,
        };
        // re-add the old range so that the selection is restored
        selection.removeAllRanges();
        selection.addRange(oldRange);
        return { line, range: lineRange };
    }
    function getStartOffset(lineRange, originalRange) {
        // sometimes, the old and new range are in different DOM elements (ie: when the match is inside of <b></b>)
        // so we need to find the first common ancestor DOM element and find the positions of the old and new range relative to that.
        const firstCommonAncestor = findFirstCommonAncestor(lineRange.startContainer, originalRange.startContainer);
        const selectionOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, lineRange.startContainer) + lineRange.startOffset;
        const textOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, originalRange.startContainer) + originalRange.startOffset;
        return textOffset - selectionOffset;
    }
    // modified from https://stackoverflow.com/a/68583466/16253823
    function findFirstCommonAncestor(nodeA, nodeB) {
        const range = new Range();
        range.setStart(nodeA, 0);
        range.setEnd(nodeB, 0);
        return range.commonAncestorContainer;
    }
    function getTextContentLength(node) {
        let length = 0;
        if (node.nodeType === Node.TEXT_NODE) {
            length += node.textContent?.length || 0;
        }
        else {
            for (const childNode of node.childNodes) {
                length += getTextContentLength(childNode);
            }
        }
        return length;
    }
    // modified from https://stackoverflow.com/a/48812529/16253823
    function getSelectionOffsetRelativeTo(parentElement, currentNode) {
        if (!currentNode) {
            return 0;
        }
        let offset = 0;
        if (currentNode === parentElement || !parentElement.contains(currentNode)) {
            return offset;
        }
        // count the number of chars before the current dom elem and the start of the dom
        let prevSibling = currentNode.previousSibling;
        while (prevSibling) {
            offset += getTextContentLength(prevSibling);
            prevSibling = prevSibling.previousSibling;
        }
        return offset + getSelectionOffsetRelativeTo(parentElement, currentNode.parentNode);
    }
    const find = (query, options) => {
        let find = true;
        let matches = [];
        const range = document.createRange();
        range.selectNodeContents(window.document.getElementById('findStart'));
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        viewModel.toggleDragDropEnabled(false);
        try {
            document.designMode = 'On';
            while (find && matches.length < 500) {
                find = window.find(query, /* caseSensitive*/ !!options.caseSensitive, 
                /* backwards*/ false, 
                /* wrapAround*/ false, 
                /* wholeWord */ !!options.wholeWord, 
                /* searchInFrames*/ true, false);
                if (find) {
                    const selection = window.getSelection();
                    if (!selection) {
                        console.log('no selection');
                        break;
                    }
                    // Markdown preview are rendered in a shadow DOM.
                    if (options.includeMarkup && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1
                        && selection.getRangeAt(0).startContainer.classList.contains('markup')) {
                        // markdown preview container
                        const preview = selection.anchorNode?.firstChild;
                        const root = preview.shadowRoot;
                        const shadowSelection = root?.getSelection ? root?.getSelection() : null;
                        // find the match in the shadow dom by checking the selection inside the shadow dom
                        if (shadowSelection && shadowSelection.anchorNode) {
                            matches.push({
                                type: 'preview',
                                id: preview.id,
                                cellId: preview.id,
                                container: preview,
                                isShadow: true,
                                originalRange: shadowSelection.getRangeAt(0),
                                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : undefined,
                            });
                        }
                    }
                    // Outputs might be rendered inside a shadow DOM.
                    if (options.includeOutput && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1
                        && selection.getRangeAt(0).startContainer.classList.contains('output_container')) {
                        // output container
                        const cellId = selection.getRangeAt(0).startContainer.parentElement.id;
                        const outputNode = selection.anchorNode?.firstChild;
                        const root = outputNode.shadowRoot;
                        const shadowSelection = root?.getSelection ? root?.getSelection() : null;
                        if (shadowSelection && shadowSelection.anchorNode) {
                            matches.push({
                                type: 'output',
                                id: outputNode.id,
                                cellId: cellId,
                                container: outputNode,
                                isShadow: true,
                                originalRange: shadowSelection.getRangeAt(0),
                                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : undefined,
                            });
                        }
                    }
                    const anchorNode = selection.anchorNode?.parentElement;
                    if (anchorNode) {
                        const lastEl = matches.length ? matches[matches.length - 1] : null;
                        // Optimization: avoid searching for the output container
                        if (lastEl && lastEl.container.contains(anchorNode) && options.includeOutput) {
                            matches.push({
                                type: lastEl.type,
                                id: lastEl.id,
                                cellId: lastEl.cellId,
                                container: lastEl.container,
                                isShadow: false,
                                originalRange: selection.getRangeAt(0),
                                searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : undefined,
                            });
                        }
                        else {
                            // Traverse up the DOM to find the container
                            for (let node = anchorNode; node; node = node.parentElement) {
                                if (!(node instanceof Element)) {
                                    break;
                                }
                                if (node.classList.contains('output') && options.includeOutput) {
                                    // inside output
                                    const cellId = node.parentElement?.parentElement?.id;
                                    if (cellId) {
                                        matches.push({
                                            type: 'output',
                                            id: node.id,
                                            cellId: cellId,
                                            container: node,
                                            isShadow: false,
                                            originalRange: selection.getRangeAt(0),
                                            searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : undefined,
                                        });
                                    }
                                    break;
                                }
                                if (node.id === 'container' || node === window.document.body) {
                                    break;
                                }
                            }
                        }
                    }
                    else {
                        break;
                    }
                }
            }
        }
        catch (e) {
            console.log(e);
        }
        matches = matches.filter(match => options.findIds.length ? options.findIds.includes(match.cellId) : true);
        _highlighter.addHighlights(matches, options.ownerID);
        window.document.getSelection()?.removeAllRanges();
        viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
        document.designMode = 'Off';
        postNotebookMessage('didFind', {
            matches: matches.map((match, index) => ({
                type: match.type,
                id: match.id,
                cellId: match.cellId,
                index,
                searchPreviewInfo: match.searchPreviewInfo,
            }))
        });
    };
    const copyOutputImage = async (outputId, altOutputId, textAlternates, retries = 5) => {
        if (!window.document.hasFocus() && retries > 0) {
            // copyImage can be called from outside of the webview, which means this function may be running whilst the webview is gaining focus.
            // Since navigator.clipboard.write requires the document to be focused, we need to wait for focus.
            // We cannot use a listener, as there is a high chance the focus is gained during the setup of the listener resulting in us missing it.
            setTimeout(() => { copyOutputImage(outputId, altOutputId, textAlternates, retries - 1); }, 50);
            return;
        }
        try {
            const outputElement = window.document.getElementById(outputId)
                ?? window.document.getElementById(altOutputId);
            let image = outputElement?.querySelector('img');
            if (!image) {
                const svgImage = outputElement?.querySelector('svg.output-image') ??
                    outputElement?.querySelector('div.svgContainerStyle > svg');
                if (svgImage) {
                    image = new Image();
                    image.src = 'data:image/svg+xml,' + encodeURIComponent(svgImage.outerHTML);
                }
            }
            if (image) {
                const ensureImageLoaded = (img) => {
                    return new Promise((resolve, reject) => {
                        if (img.complete && img.naturalWidth > 0) {
                            resolve(img);
                        }
                        else {
                            img.onload = () => resolve(img);
                            img.onerror = () => reject(new Error('Failed to load image'));
                            setTimeout(() => reject(new Error('Image load timeout')), 5000);
                        }
                    });
                };
                const imageToCopy = await ensureImageLoaded(image);
                // Build clipboard data with both image and text formats
                const clipboardData = {
                    'image/png': new Promise((resolve) => {
                        const canvas = document.createElement('canvas');
                        canvas.width = imageToCopy.naturalWidth;
                        canvas.height = imageToCopy.naturalHeight;
                        const context = canvas.getContext('2d');
                        context.drawImage(imageToCopy, 0, 0);
                        canvas.toBlob((blob) => {
                            if (blob) {
                                resolve(blob);
                            }
                            else {
                                console.error('No blob data to write to clipboard');
                            }
                            canvas.remove();
                        }, 'image/png');
                    })
                };
                // Add text alternates if provided
                if (textAlternates) {
                    for (const alternate of textAlternates) {
                        clipboardData[alternate.mimeType] = alternate.content;
                    }
                }
                await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
            }
            else {
                console.error('Could not find image element to copy for output with id', outputId);
            }
        }
        catch (e) {
            console.error('Could not copy image:', e);
        }
    };
    window.addEventListener('message', async (rawEvent) => {
        const event = rawEvent;
        switch (event.data.type) {
            case 'initializeMarkup': {
                try {
                    await Promise.all(event.data.cells.map(info => viewModel.ensureMarkupCell(info)));
                }
                finally {
                    dimensionUpdater.updateImmediately();
                    postNotebookMessage('initializedMarkup', { requestId: event.data.requestId });
                }
                break;
            }
            case 'createMarkupCell':
                viewModel.ensureMarkupCell(event.data.cell);
                break;
            case 'showMarkupCell':
                viewModel.showMarkupCell(event.data.id, event.data.top, event.data.content, event.data.metadata);
                break;
            case 'hideMarkupCells':
                for (const id of event.data.ids) {
                    viewModel.hideMarkupCell(id);
                }
                break;
            case 'unhideMarkupCells':
                for (const id of event.data.ids) {
                    viewModel.unhideMarkupCell(id);
                }
                break;
            case 'deleteMarkupCell':
                for (const id of event.data.ids) {
                    viewModel.deleteMarkupCell(id);
                }
                break;
            case 'updateSelectedMarkupCells':
                viewModel.updateSelectedCells(event.data.selectedCellIds);
                break;
            case 'html': {
                const data = event.data;
                if (data.createOnIdle) {
                    outputRunner.enqueueIdle(data.outputId, signal => {
                        // cancel the idle callback if it exists
                        return viewModel.renderOutputCell(data, signal);
                    });
                }
                else {
                    outputRunner.enqueue(data.outputId, signal => {
                        // cancel the idle callback if it exists
                        return viewModel.renderOutputCell(data, signal);
                    });
                }
                break;
            }
            case 'view-scroll':
                {
                    // const date = new Date();
                    // console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
                    event.data.widgets.forEach(widget => {
                        outputRunner.enqueue(widget.outputId, () => {
                            viewModel.updateOutputsScroll([widget]);
                        });
                    });
                    viewModel.updateMarkupScrolls(event.data.markupCells);
                    break;
                }
            case 'clear':
                renderers.clearAll();
                viewModel.clearAll();
                window.document.getElementById('container').innerText = '';
                break;
            case 'clearOutput': {
                const { cellId, rendererId, outputId } = event.data;
                outputRunner.cancelOutput(outputId);
                viewModel.clearOutput(cellId, outputId, rendererId);
                break;
            }
            case 'hideOutput': {
                const { cellId, outputId } = event.data;
                outputRunner.enqueue(outputId, () => {
                    viewModel.hideOutput(cellId);
                });
                break;
            }
            case 'showOutput': {
                const { outputId, cellTop, cellId, content } = event.data;
                outputRunner.enqueue(outputId, () => {
                    viewModel.showOutput(cellId, outputId, cellTop);
                    if (content) {
                        viewModel.updateAndRerender(cellId, outputId, content);
                    }
                });
                break;
            }
            case 'copyImage': {
                await copyOutputImage(event.data.outputId, event.data.altOutputId, event.data.textAlternates);
                break;
            }
            case 'ack-dimension': {
                for (const { cellId, outputId, height } of event.data.updates) {
                    viewModel.updateOutputHeight(cellId, outputId, height);
                }
                break;
            }
            case 'preload': {
                const resources = event.data.resources;
                for (const { uri } of resources) {
                    kernelPreloads.load(uri);
                }
                break;
            }
            case 'updateRenderers': {
                const { rendererData } = event.data;
                renderers.updateRendererData(rendererData);
                break;
            }
            case 'focus-output':
                focusFirstFocusableOrContainerInOutput(event.data.cellOrOutputId, event.data.alternateId);
                break;
            case 'blur-output':
                blurOutput();
                break;
            case 'select-output-contents':
                selectOutputContents(event.data.cellOrOutputId);
                break;
            case 'select-input-contents':
                selectInputContents(event.data.cellOrOutputId);
                break;
            case 'decorations': {
                let outputContainer = window.document.getElementById(event.data.cellId);
                if (!outputContainer) {
                    viewModel.ensureOutputCell(event.data.cellId, -100000, true);
                    outputContainer = window.document.getElementById(event.data.cellId);
                }
                outputContainer?.classList.add(...event.data.addedClassNames);
                outputContainer?.classList.remove(...event.data.removedClassNames);
                break;
            }
            case 'markupDecorations': {
                const markupCell = window.document.getElementById(event.data.cellId);
                // The cell may not have been added yet if it is out of view.
                // Decorations will be added when the cell is shown.
                if (markupCell) {
                    markupCell?.classList.add(...event.data.addedClassNames);
                    markupCell?.classList.remove(...event.data.removedClassNames);
                }
                break;
            }
            case 'customKernelMessage':
                onDidReceiveKernelMessage.fire(event.data.message);
                break;
            case 'customRendererMessage':
                renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
                break;
            case 'notebookStyles': {
                const documentStyle = window.document.documentElement.style;
                for (let i = documentStyle.length - 1; i >= 0; i--) {
                    const property = documentStyle[i];
                    // Don't remove properties that the webview might have added separately
                    if (property && property.startsWith('--notebook-')) {
                        documentStyle.removeProperty(property);
                    }
                }
                // Re-add new properties
                for (const [name, value] of Object.entries(event.data.styles)) {
                    documentStyle.setProperty(`--${name}`, value);
                }
                break;
            }
            case 'notebookOptions':
                currentOptions = event.data.options;
                viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
                currentRenderOptions = event.data.renderOptions;
                settingChange.fire(currentRenderOptions);
                break;
            case 'tokenizedCodeBlock': {
                const { codeBlockId, html } = event.data;
                MarkdownCodeBlock.highlightCodeBlock(codeBlockId, html);
                break;
            }
            case 'tokenizedStylesChanged': {
                tokenizationStyle.replaceSync(event.data.css);
                break;
            }
            case 'find': {
                _highlighter.removeHighlights(event.data.options.ownerID);
                find(event.data.query, event.data.options);
                break;
            }
            case 'findHighlightCurrent': {
                _highlighter?.highlightCurrentMatch(event.data.index, event.data.ownerID);
                break;
            }
            case 'findUnHighlightCurrent': {
                _highlighter?.unHighlightCurrentMatch(event.data.index, event.data.ownerID);
                break;
            }
            case 'findStop': {
                _highlighter.removeHighlights(event.data.ownerID);
                break;
            }
            case 'returnOutputItem': {
                outputItemRequests.resolveOutputItem(event.data.requestId, event.data.output);
            }
        }
    });
    const renderFallbackErrorName = 'vscode.fallbackToNextRenderer';
    class Renderer {
        constructor(data) {
            this.data = data;
            this._onMessageEvent = createEmitter();
        }
        receiveMessage(message) {
            this._onMessageEvent.fire(message);
        }
        async renderOutputItem(item, element, signal) {
            try {
                await this.load();
            }
            catch (e) {
                if (!signal.aborted) {
                    showRenderError(`Error loading renderer '${this.data.id}'`, element, e instanceof Error ? [e] : []);
                }
                return;
            }
            if (!this._api) {
                if (!signal.aborted) {
                    showRenderError(`Renderer '${this.data.id}' does not implement renderOutputItem`, element, []);
                }
                return;
            }
            try {
                const renderStart = performance.now();
                await this._api.renderOutputItem(item, element, signal);
                this.postDebugMessage('Rendered output item', { id: item.id, duration: `${performance.now() - renderStart}ms` });
            }
            catch (e) {
                if (signal.aborted) {
                    return;
                }
                if (e instanceof Error && e.name === renderFallbackErrorName) {
                    throw e;
                }
                showRenderError(`Error rendering output item using '${this.data.id}'`, element, e instanceof Error ? [e] : []);
                this.postDebugMessage('Rendering output item failed', { id: item.id, error: e + '' });
            }
        }
        disposeOutputItem(id) {
            this._api?.disposeOutputItem?.(id);
        }
        createRendererContext() {
            const { id, messaging } = this.data;
            const context = {
                setState: newState => vscode.setState({ ...vscode.getState(), [id]: newState }),
                getState: () => {
                    const state = vscode.getState();
                    return typeof state === 'object' && state ? state[id] : undefined;
                },
                getRenderer: async (id) => {
                    const renderer = renderers.getRenderer(id);
                    if (!renderer) {
                        return undefined;
                    }
                    if (renderer._api) {
                        return renderer._api;
                    }
                    return renderer.load();
                },
                workspace: {
                    get isTrusted() { return isWorkspaceTrusted; }
                },
                settings: {
                    get lineLimit() { return currentRenderOptions.lineLimit; },
                    get outputScrolling() { return currentRenderOptions.outputScrolling; },
                    get outputWordWrap() { return currentRenderOptions.outputWordWrap; },
                    get linkifyFilePaths() { return currentRenderOptions.linkifyFilePaths; },
                    get minimalError() { return currentRenderOptions.minimalError; },
                },
                get onDidChangeSettings() { return settingChange.event; }
            };
            if (messaging) {
                context.onDidReceiveMessage = this._onMessageEvent.event;
                context.postMessage = message => postNotebookMessage('customRendererMessage', { rendererId: id, message });
            }
            return Object.freeze(context);
        }
        load() {
            this._loadPromise ??= this._load();
            return this._loadPromise;
        }
        /** Inner function cached in the _loadPromise(). */
        async _load() {
            this.postDebugMessage('Start loading renderer');
            try {
                // Preloads need to be loaded before loading renderers.
                await kernelPreloads.waitForAllCurrent();
                const importStart = performance.now();
                const module = await __import(this.data.entrypoint.path);
                this.postDebugMessage('Imported renderer', { duration: `${performance.now() - importStart}ms` });
                if (!module) {
                    return;
                }
                this._api = await module.activate(this.createRendererContext());
                this.postDebugMessage('Activated renderer', { duration: `${performance.now() - importStart}ms` });
                const dependantRenderers = ctx.rendererData
                    .filter(d => d.entrypoint.extends === this.data.id);
                if (dependantRenderers.length) {
                    this.postDebugMessage('Activating dependant renderers', { dependents: dependantRenderers.map(x => x.id).join(', ') });
                }
                // Load all renderers that extend this renderer
                await Promise.all(dependantRenderers.map(async (d) => {
                    const renderer = renderers.getRenderer(d.id);
                    if (!renderer) {
                        throw new Error(`Could not find extending renderer: ${d.id}`);
                    }
                    try {
                        return await renderer.load();
                    }
                    catch (e) {
                        // Squash any errors extends errors. They won't prevent the renderer
                        // itself from working, so just log them.
                        console.error(e);
                        this.postDebugMessage('Activating dependant renderer failed', { dependent: d.id, error: e + '' });
                        return undefined;
                    }
                }));
                return this._api;
            }
            catch (e) {
                this.postDebugMessage('Loading renderer failed');
                throw e;
            }
        }
        postDebugMessage(msg, data) {
            postNotebookMessage('logRendererDebugMessage', {
                message: `[renderer ${this.data.id}] - ${msg}`,
                data
            });
        }
    }
    const kernelPreloads = new class {
        constructor() {
            this.preloads = new Map();
        }
        /**
         * Returns a promise that resolves when the given preload is activated.
         */
        waitFor(uri) {
            return this.preloads.get(uri) || Promise.resolve(new Error(`Preload not ready: ${uri}`));
        }
        /**
         * Loads a preload.
         * @param uri URI to load from
         * @param originalUri URI to show in an error message if the preload is invalid.
         */
        load(uri) {
            const promise = Promise.all([
                runKernelPreload(uri),
                this.waitForAllCurrent(),
            ]);
            this.preloads.set(uri, promise);
            return promise;
        }
        /**
         * Returns a promise that waits for all currently-registered preloads to
         * activate before resolving.
         */
        waitForAllCurrent() {
            return Promise.all([...this.preloads.values()].map(p => p.catch(err => err)));
        }
    };
    const outputRunner = new class {
        constructor() {
            this.outputs = new Map();
            this.pendingOutputCreationRequest = new Map();
        }
        /**
         * Pushes the action onto the list of actions for the given output ID,
         * ensuring that it's run in-order.
         */
        enqueue(outputId, action) {
            this.pendingOutputCreationRequest.get(outputId)?.dispose();
            this.pendingOutputCreationRequest.delete(outputId);
            const record = this.outputs.get(outputId);
            if (!record) {
                const controller = new AbortController();
                this.outputs.set(outputId, { abort: controller, queue: new Promise(r => r(action(controller.signal))) });
            }
            else {
                record.queue = record.queue.then(async (r) => {
                    if (!record.abort.signal.aborted) {
                        await action(record.abort.signal);
                    }
                });
            }
        }
        enqueueIdle(outputId, action) {
            this.pendingOutputCreationRequest.get(outputId)?.dispose();
            outputRunner.pendingOutputCreationRequest.set(outputId, runWhenIdle(() => {
                outputRunner.enqueue(outputId, action);
                outputRunner.pendingOutputCreationRequest.delete(outputId);
            }));
        }
        /**
         * Cancels the rendering of all outputs.
         */
        cancelAll() {
            // Delete all pending idle requests
            this.pendingOutputCreationRequest.forEach(r => r.dispose());
            this.pendingOutputCreationRequest.clear();
            for (const { abort } of this.outputs.values()) {
                abort.abort();
            }
            this.outputs.clear();
        }
        /**
         * Cancels any ongoing rendering out an output.
         */
        cancelOutput(outputId) {
            // Delete the pending idle request if it exists
            this.pendingOutputCreationRequest.get(outputId)?.dispose();
            this.pendingOutputCreationRequest.delete(outputId);
            const output = this.outputs.get(outputId);
            if (output) {
                output.abort.abort();
                this.outputs.delete(outputId);
            }
        }
    };
    const renderers = new class {
        constructor() {
            this._renderers = new Map();
            for (const renderer of ctx.rendererData) {
                this.addRenderer(renderer);
            }
        }
        getRenderer(id) {
            return this._renderers.get(id);
        }
        rendererEqual(a, b) {
            if (a.id !== b.id || a.entrypoint.path !== b.entrypoint.path || a.entrypoint.extends !== b.entrypoint.extends || a.messaging !== b.messaging) {
                return false;
            }
            if (a.mimeTypes.length !== b.mimeTypes.length) {
                return false;
            }
            for (let i = 0; i < a.mimeTypes.length; i++) {
                if (a.mimeTypes[i] !== b.mimeTypes[i]) {
                    return false;
                }
            }
            return true;
        }
        updateRendererData(rendererData) {
            const oldKeys = new Set(this._renderers.keys());
            const newKeys = new Set(rendererData.map(d => d.id));
            for (const renderer of rendererData) {
                const existing = this._renderers.get(renderer.id);
                if (existing && this.rendererEqual(existing.data, renderer)) {
                    continue;
                }
                this.addRenderer(renderer);
            }
            for (const key of oldKeys) {
                if (!newKeys.has(key)) {
                    this._renderers.delete(key);
                }
            }
        }
        addRenderer(renderer) {
            this._renderers.set(renderer.id, new Renderer(renderer));
        }
        clearAll() {
            outputRunner.cancelAll();
            for (const renderer of this._renderers.values()) {
                renderer.disposeOutputItem();
            }
        }
        clearOutput(rendererId, outputId) {
            outputRunner.cancelOutput(outputId);
            this._renderers.get(rendererId)?.disposeOutputItem(outputId);
        }
        async render(item, preferredRendererId, element, signal) {
            const primaryRenderer = this.findRenderer(preferredRendererId, item);
            if (!primaryRenderer) {
                const errorMessage = (window.document.documentElement.style.getPropertyValue('--notebook-cell-renderer-not-found-error') || '').replace('$0', () => item.mime);
                this.showRenderError(item, element, errorMessage);
                return;
            }
            // Try primary renderer first
            if (!(await this._doRender(item, element, primaryRenderer, signal)).continue) {
                return;
            }
            // Primary renderer failed in an expected way. Fallback to render the next mime types
            for (const additionalItemData of item._allOutputItems) {
                if (additionalItemData.mime === item.mime) {
                    continue;
                }
                const additionalItem = await additionalItemData.getItem();
                if (signal.aborted) {
                    return;
                }
                if (additionalItem) {
                    const renderer = this.findRenderer(undefined, additionalItem);
                    if (renderer) {
                        if (!(await this._doRender(additionalItem, element, renderer, signal)).continue) {
                            return; // We rendered successfully
                        }
                    }
                }
            }
            // All renderers have failed and there is nothing left to fallback to
            const errorMessage = (window.document.documentElement.style.getPropertyValue('--notebook-cell-renderer-fallbacks-exhausted') || '').replace('$0', () => item.mime);
            this.showRenderError(item, element, errorMessage);
        }
        async _doRender(item, element, renderer, signal) {
            try {
                await renderer.renderOutputItem(item, element, signal);
                return { continue: false }; // We rendered successfully
            }
            catch (e) {
                if (signal.aborted) {
                    return { continue: false };
                }
                if (e instanceof Error && e.name === renderFallbackErrorName) {
                    return { continue: true };
                }
                else {
                    throw e; // Bail and let callers handle unknown errors
                }
            }
        }
        findRenderer(preferredRendererId, info) {
            let renderer;
            if (typeof preferredRendererId === 'string') {
                renderer = Array.from(this._renderers.values())
                    .find((renderer) => renderer.data.id === preferredRendererId);
            }
            else {
                const renderers = Array.from(this._renderers.values())
                    .filter((renderer) => renderer.data.mimeTypes.includes(info.mime) && !renderer.data.entrypoint.extends);
                if (renderers.length) {
                    // De-prioritize built-in renderers
                    renderers.sort((a, b) => +a.data.isBuiltin - +b.data.isBuiltin);
                    // Use first renderer we find in sorted list
                    renderer = renderers[0];
                }
            }
            return renderer;
        }
        showRenderError(info, element, errorMessage) {
            const errorContainer = document.createElement('div');
            const error = document.createElement('div');
            error.className = 'no-renderer-error';
            error.innerText = errorMessage;
            const cellText = document.createElement('div');
            cellText.innerText = info.text();
            errorContainer.appendChild(error);
            errorContainer.appendChild(cellText);
            element.innerText = '';
            element.appendChild(errorContainer);
        }
    }();
    const viewModel = new class ViewModel {
        constructor() {
            this._markupCells = new Map();
            this._outputCells = new Map();
        }
        clearAll() {
            for (const cell of this._markupCells.values()) {
                cell.dispose();
            }
            this._markupCells.clear();
            for (const output of this._outputCells.values()) {
                output.dispose();
            }
            this._outputCells.clear();
        }
        async createMarkupCell(init, top, visible) {
            const existing = this._markupCells.get(init.cellId);
            if (existing) {
                console.error(`Trying to create markup that already exists: ${init.cellId}`);
                return existing;
            }
            const cell = new MarkupCell(init.cellId, init.mime, init.content, top, init.metadata);
            cell.element.style.visibility = visible ? '' : 'hidden';
            this._markupCells.set(init.cellId, cell);
            await cell.ready;
            return cell;
        }
        async ensureMarkupCell(info) {
            let cell = this._markupCells.get(info.cellId);
            if (cell) {
                cell.element.style.visibility = info.visible ? '' : 'hidden';
                await cell.updateContentAndRender(info.content, info.metadata);
            }
            else {
                cell = await this.createMarkupCell(info, info.offset, info.visible);
            }
        }
        deleteMarkupCell(id) {
            const cell = this.getExpectedMarkupCell(id);
            if (cell) {
                cell.remove();
                cell.dispose();
                this._markupCells.delete(id);
            }
        }
        async updateMarkupContent(id, newContent, metadata) {
            const cell = this.getExpectedMarkupCell(id);
            await cell?.updateContentAndRender(newContent, metadata);
        }
        showMarkupCell(id, top, newContent, metadata) {
            const cell = this.getExpectedMarkupCell(id);
            cell?.show(top, newContent, metadata);
        }
        hideMarkupCell(id) {
            const cell = this.getExpectedMarkupCell(id);
            cell?.hide();
        }
        unhideMarkupCell(id) {
            const cell = this.getExpectedMarkupCell(id);
            cell?.unhide();
        }
        getExpectedMarkupCell(id) {
            const cell = this._markupCells.get(id);
            if (!cell) {
                console.log(`Could not find markup cell '${id}'`);
                return undefined;
            }
            return cell;
        }
        updateSelectedCells(selectedCellIds) {
            const selectedCellSet = new Set(selectedCellIds);
            for (const cell of this._markupCells.values()) {
                cell.setSelected(selectedCellSet.has(cell.id));
            }
        }
        toggleDragDropEnabled(dragAndDropEnabled) {
            for (const cell of this._markupCells.values()) {
                cell.toggleDragDropEnabled(dragAndDropEnabled);
            }
        }
        updateMarkupScrolls(markupCells) {
            for (const { id, top } of markupCells) {
                const cell = this._markupCells.get(id);
                if (cell) {
                    cell.element.style.top = `${top}px`;
                }
            }
        }
        async renderOutputCell(data, signal) {
            const preloadErrors = await Promise.all(data.requiredPreloads.map(p => kernelPreloads.waitFor(p.uri).then(() => undefined, err => err)));
            if (signal.aborted) {
                return;
            }
            const cellOutput = this.ensureOutputCell(data.cellId, data.cellTop, false);
            return cellOutput.renderOutputElement(data, preloadErrors, signal);
        }
        ensureOutputCell(cellId, cellTop, skipCellTopUpdateIfExist) {
            let cell = this._outputCells.get(cellId);
            const existed = !!cell;
            if (!cell) {
                cell = new OutputCell(cellId);
                this._outputCells.set(cellId, cell);
            }
            if (existed && skipCellTopUpdateIfExist) {
                return cell;
            }
            cell.element.style.top = cellTop + 'px';
            return cell;
        }
        clearOutput(cellId, outputId, rendererId) {
            const cell = this._outputCells.get(cellId);
            cell?.clearOutput(outputId, rendererId);
        }
        showOutput(cellId, outputId, top) {
            const cell = this._outputCells.get(cellId);
            cell?.show(outputId, top);
        }
        updateAndRerender(cellId, outputId, content) {
            const cell = this._outputCells.get(cellId);
            cell?.updateContentAndRerender(outputId, content);
        }
        hideOutput(cellId) {
            const cell = this._outputCells.get(cellId);
            cell?.hide();
        }
        updateOutputHeight(cellId, outputId, height) {
            const cell = this._outputCells.get(cellId);
            cell?.updateOutputHeight(outputId, height);
        }
        updateOutputsScroll(updates) {
            for (const request of updates) {
                const cell = this._outputCells.get(request.cellId);
                cell?.updateScroll(request);
            }
        }
    }();
    class MarkdownCodeBlock {
        static { this.pendingCodeBlocksToHighlight = new Map(); }
        static highlightCodeBlock(id, html) {
            const el = MarkdownCodeBlock.pendingCodeBlocksToHighlight.get(id);
            if (!el) {
                return;
            }
            const trustedHtml = ttPolicy?.createHTML(html) ?? html;
            el.innerHTML = trustedHtml; // CodeQL [SM03712] The rendered content comes from VS Code's tokenizer and is considered safe
            const root = el.getRootNode();
            if (root instanceof ShadowRoot) {
                if (!root.adoptedStyleSheets.includes(tokenizationStyle)) {
                    root.adoptedStyleSheets.push(tokenizationStyle);
                }
            }
        }
        static requestHighlightCodeBlock(root) {
            const codeBlocks = [];
            let i = 0;
            for (const el of root.querySelectorAll('.vscode-code-block')) {
                const lang = el.getAttribute('data-vscode-code-block-lang');
                if (el.textContent && lang) {
                    const id = `${Date.now()}-${i++}`;
                    codeBlocks.push({ value: el.textContent, lang: lang, id });
                    MarkdownCodeBlock.pendingCodeBlocksToHighlight.set(id, el);
                }
            }
            return codeBlocks;
        }
    }
    class MarkupCell {
        constructor(id, mime, content, top, metadata) {
            this._isDisposed = false;
            const self = this;
            this.id = id;
            this._content = { value: content, version: 0, metadata: metadata };
            const { promise, resolve, reject } = promiseWithResolvers();
            this.ready = promise;
            let cachedData;
            this.outputItem = Object.freeze({
                id,
                mime,
                get metadata() {
                    return self._content.metadata;
                },
                text: () => {
                    return this._content.value;
                },
                json: () => {
                    return undefined;
                },
                data: () => {
                    if (cachedData?.version === this._content.version) {
                        return cachedData.value;
                    }
                    const data = textEncoder.encode(this._content.value);
                    cachedData = { version: this._content.version, value: data };
                    return data;
                },
                blob() {
                    return new Blob([this.data()], { type: this.mime });
                },
                _allOutputItems: [{
                        mime,
                        getItem: async () => this.outputItem,
                    }]
            });
            const root = window.document.getElementById('container');
            const markupCell = document.createElement('div');
            markupCell.className = 'markup';
            markupCell.style.position = 'absolute';
            markupCell.style.width = '100%';
            this.element = document.createElement('div');
            this.element.id = this.id;
            this.element.classList.add('preview');
            this.element.style.position = 'absolute';
            this.element.style.top = top + 'px';
            this.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
            markupCell.appendChild(this.element);
            root.appendChild(markupCell);
            this.addEventListeners();
            this.updateContentAndRender(this._content.value, this._content.metadata).then(() => {
                if (!this._isDisposed) {
                    resizeObserver.observe(this.element, this.id, false, this.id);
                }
                resolve();
            }, () => reject());
        }
        dispose() {
            this._isDisposed = true;
            this.renderTaskAbort?.abort();
            this.renderTaskAbort = undefined;
        }
        addEventListeners() {
            this.element.addEventListener('dblclick', () => {
                postNotebookMessage('toggleMarkupPreview', { cellId: this.id });
            });
            this.element.addEventListener('click', e => {
                postNotebookMessage('clickMarkupCell', {
                    cellId: this.id,
                    altKey: e.altKey,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                });
            });
            this.element.addEventListener('contextmenu', e => {
                postNotebookMessage('contextMenuMarkupCell', {
                    cellId: this.id,
                    clientX: e.clientX,
                    clientY: e.clientY,
                });
            });
            this.element.addEventListener('mouseenter', () => {
                postNotebookMessage('mouseEnterMarkupCell', { cellId: this.id });
            });
            this.element.addEventListener('mouseleave', () => {
                postNotebookMessage('mouseLeaveMarkupCell', { cellId: this.id });
            });
            this.element.addEventListener('dragstart', e => {
                markupCellDragManager.startDrag(e, this.id);
            });
            this.element.addEventListener('drag', e => {
                markupCellDragManager.updateDrag(e, this.id);
            });
            this.element.addEventListener('dragend', e => {
                markupCellDragManager.endDrag(e, this.id);
            });
        }
        async updateContentAndRender(newContent, metadata) {
            this._content = { value: newContent, version: this._content.version + 1, metadata };
            this.renderTaskAbort?.abort();
            const controller = new AbortController();
            this.renderTaskAbort = controller;
            try {
                await renderers.render(this.outputItem, undefined, this.element, this.renderTaskAbort.signal);
            }
            finally {
                if (this.renderTaskAbort === controller) {
                    this.renderTaskAbort = undefined;
                }
            }
            const root = (this.element.shadowRoot ?? this.element);
            const html = [];
            for (const child of root.children) {
                switch (child.tagName) {
                    case 'LINK':
                    case 'SCRIPT':
                    case 'STYLE':
                        // not worth sending over since it will be stripped before rendering
                        break;
                    default:
                        html.push(child.outerHTML);
                        break;
                }
            }
            const codeBlocks = MarkdownCodeBlock.requestHighlightCodeBlock(root);
            postNotebookMessage('renderedMarkup', {
                cellId: this.id,
                html: html.join(''),
                codeBlocks
            });
            dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
                isOutput: false
            });
        }
        show(top, newContent, metadata) {
            this.element.style.visibility = '';
            this.element.style.top = `${top}px`;
            if (typeof newContent === 'string' || metadata) {
                this.updateContentAndRender(newContent ?? this._content.value, metadata ?? this._content.metadata);
            }
            else {
                this.updateMarkupDimensions();
            }
        }
        hide() {
            this.element.style.visibility = 'hidden';
        }
        unhide() {
            this.element.style.visibility = '';
            this.updateMarkupDimensions();
        }
        remove() {
            this.element.remove();
        }
        async updateMarkupDimensions() {
            dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
                isOutput: false
            });
        }
        setSelected(selected) {
            this.element.classList.toggle('selected', selected);
        }
        toggleDragDropEnabled(enabled) {
            if (enabled) {
                this.element.classList.add('draggable');
                this.element.setAttribute('draggable', 'true');
            }
            else {
                this.element.classList.remove('draggable');
                this.element.removeAttribute('draggable');
            }
        }
    }
    class OutputCell {
        constructor(cellId) {
            this.outputElements = new Map();
            const container = window.document.getElementById('container');
            const upperWrapperElement = createFocusSink(cellId);
            container.appendChild(upperWrapperElement);
            this.element = document.createElement('div');
            this.element.style.position = 'absolute';
            this.element.style.outline = '0';
            this.element.id = cellId;
            this.element.classList.add('cell_container');
            container.appendChild(this.element);
            this.element = this.element;
            const lowerWrapperElement = createFocusSink(cellId, true);
            container.appendChild(lowerWrapperElement);
        }
        dispose() {
            for (const output of this.outputElements.values()) {
                output.dispose();
            }
            this.outputElements.clear();
        }
        createOutputElement(data) {
            let outputContainer = this.outputElements.get(data.outputId);
            if (!outputContainer) {
                outputContainer = new OutputContainer(data.outputId);
                this.element.appendChild(outputContainer.element);
                this.outputElements.set(data.outputId, outputContainer);
            }
            return outputContainer.createOutputElement(data.outputId, data.outputOffset, data.left, data.cellId);
        }
        async renderOutputElement(data, preloadErrors, signal) {
            const startTime = Date.now();
            const outputElement /** outputNode */ = this.createOutputElement(data);
            await outputElement.render(data.content, data.rendererId, preloadErrors, signal);
            // don't hide until after this step so that the height is right
            outputElement /** outputNode */.element.style.visibility = data.initiallyHidden ? 'hidden' : '';
            if (!!data.executionId && !!data.rendererId) {
                let outputSize = undefined;
                if (data.content.type === 1 /* extension */) {
                    outputSize = data.content.output.valueBytes.length;
                }
                // Only send performance messages for non-empty outputs up to a certain size
                if (outputSize !== undefined && outputSize > 0 && outputSize < 100 * 1024) {
                    postNotebookMessage('notebookPerformanceMessage', {
                        cellId: data.cellId,
                        executionId: data.executionId,
                        duration: Date.now() - startTime,
                        rendererId: data.rendererId,
                        outputSize
                    });
                }
            }
        }
        clearOutput(outputId, rendererId) {
            const output = this.outputElements.get(outputId);
            output?.clear(rendererId);
            output?.dispose();
            this.outputElements.delete(outputId);
        }
        show(outputId, top) {
            const outputContainer = this.outputElements.get(outputId);
            if (!outputContainer) {
                return;
            }
            this.element.style.visibility = '';
            this.element.style.top = `${top}px`;
        }
        hide() {
            this.element.style.visibility = 'hidden';
        }
        updateContentAndRerender(outputId, content) {
            this.outputElements.get(outputId)?.updateContentAndRender(content);
        }
        updateOutputHeight(outputId, height) {
            this.outputElements.get(outputId)?.updateHeight(height);
        }
        updateScroll(request) {
            this.element.style.top = `${request.cellTop}px`;
            const outputElement = this.outputElements.get(request.outputId);
            if (outputElement) {
                outputElement.updateScroll(request.outputOffset);
                if (request.forceDisplay && outputElement.outputNode) {
                    // TODO @rebornix @mjbvz, there is a misalignment here.
                    // We set output visibility on cell container, other than output container or output node itself.
                    outputElement.outputNode.element.style.visibility = '';
                }
            }
            if (request.forceDisplay) {
                this.element.style.visibility = '';
            }
        }
    }
    class OutputContainer {
        get outputNode() {
            return this._outputNode;
        }
        constructor(outputId) {
            this.outputId = outputId;
            this.element = document.createElement('div');
            this.element.classList.add('output_container');
            this.element.setAttribute('data-vscode-context', JSON.stringify({ 'preventDefaultContextMenuItems': true }));
            this.element.style.position = 'absolute';
            this.element.style.overflow = 'hidden';
        }
        dispose() {
            this._outputNode?.dispose();
        }
        clear(rendererId) {
            if (rendererId) {
                renderers.clearOutput(rendererId, this.outputId);
            }
            this.element.remove();
        }
        updateHeight(height) {
            this.element.style.maxHeight = `${height}px`;
            this.element.style.height = `${height}px`;
        }
        updateScroll(outputOffset) {
            this.element.style.top = `${outputOffset}px`;
        }
        createOutputElement(outputId, outputOffset, left, cellId) {
            this.element.innerText = '';
            this.element.style.maxHeight = '0px';
            this.element.style.top = `${outputOffset}px`;
            this._outputNode?.dispose();
            this._outputNode = new OutputElement(outputId, left, cellId);
            this.element.appendChild(this._outputNode.element);
            return this._outputNode;
        }
        updateContentAndRender(content) {
            this._outputNode?.updateAndRerender(content);
        }
    }
    vscode.postMessage({
        __vscode_notebook_message: true,
        type: 'initialized'
    });
    for (const preload of ctx.staticPreloadsData) {
        kernelPreloads.load(preload.entrypoint);
    }
    function postNotebookMessage(type, properties) {
        vscode.postMessage({
            __vscode_notebook_message: true,
            type,
            ...properties
        });
    }
    class OutputElement {
        constructor(outputId, left, cellId) {
            this.outputId = outputId;
            this.cellId = cellId;
            this.hasResizeObserver = false;
            this.isImageOutput = false;
            this.element = document.createElement('div');
            this.element.id = outputId;
            this.element.classList.add('output');
            this.element.style.position = 'absolute';
            this.element.style.top = `0px`;
            this.element.style.left = left + 'px';
            this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
            this.element.addEventListener('mouseenter', () => {
                postNotebookMessage('mouseenter', { id: outputId });
            });
            this.element.addEventListener('mouseleave', () => {
                postNotebookMessage('mouseleave', { id: outputId });
            });
            // Add drag handler
            this.element.addEventListener('dragstart', (e) => {
                if (!e.dataTransfer) {
                    return;
                }
                const outputData = {
                    outputId: this.outputId,
                };
                e.dataTransfer.setData('notebook-cell-output', JSON.stringify(outputData));
            });
            // Add alt key handlers
            window.addEventListener('keydown', (e) => {
                if (e.altKey) {
                    this.element.draggable = true;
                }
            });
            window.addEventListener('keyup', (e) => {
                if (!e.altKey) {
                    this.element.draggable = this.isImageOutput;
                }
            });
            // Handle window blur to reset draggable state
            window.addEventListener('blur', () => {
                this.element.draggable = this.isImageOutput;
            });
        }
        dispose() {
            this.renderTaskAbort?.abort();
            this.renderTaskAbort = undefined;
        }
        async render(content, preferredRendererId, preloadErrors, signal) {
            this.renderTaskAbort?.abort();
            this.renderTaskAbort = undefined;
            this._content = { preferredRendererId, preloadErrors };
            if (content.type === 0 /* RenderOutputType.Html */) {
                const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
                this.element.innerHTML = trustedHtml; // CodeQL [SM03712] The content comes from renderer extensions, not from direct user input.
            }
            else if (preloadErrors.some(e => e instanceof Error)) {
                const errors = preloadErrors.filter((e) => e instanceof Error);
                showRenderError(`Error loading preloads`, this.element, errors);
            }
            else {
                const imageMimeTypes = ['image/png', 'image/jpeg', 'image/svg'];
                this.isImageOutput = imageMimeTypes.includes(content.output.mime);
                this.element.draggable = this.isImageOutput;
                const item = createOutputItem(this.outputId, content.output.mime, content.metadata, content.output.valueBytes, content.allOutputs, content.output.appended);
                const controller = new AbortController();
                this.renderTaskAbort = controller;
                // Abort rendering if caller aborts
                signal?.addEventListener('abort', () => controller.abort());
                try {
                    await renderers.render(item, preferredRendererId, this.element, controller.signal);
                }
                finally {
                    if (this.renderTaskAbort === controller) {
                        this.renderTaskAbort = undefined;
                    }
                }
            }
            if (!this.hasResizeObserver) {
                this.hasResizeObserver = true;
                resizeObserver.observe(this.element, this.outputId, true, this.cellId);
            }
            const offsetHeight = this.element.offsetHeight;
            const cps = document.defaultView.getComputedStyle(this.element);
            const verticalPadding = parseFloat(cps.paddingTop) + parseFloat(cps.paddingBottom);
            const contentHeight = offsetHeight - verticalPadding;
            if (elementHasContent(contentHeight) && cps.padding === '0px') {
                // we set padding to zero if the output has no content (then we can have a zero-height output DOM node)
                // thus we need to ensure the padding is accounted when updating the init height of the output
                dimensionUpdater.updateHeight(this.outputId, offsetHeight + ctx.style.outputNodePadding * 2, {
                    isOutput: true,
                    init: true
                });
                this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
            }
            else if (elementHasContent(contentHeight)) {
                dimensionUpdater.updateHeight(this.outputId, this.element.offsetHeight, {
                    isOutput: true,
                    init: true
                });
                this.element.style.padding = `0 ${ctx.style.outputNodePadding}px 0 ${ctx.style.outputNodeLeftPadding}`;
            }
            else {
                // we have a zero-height output DOM node
                dimensionUpdater.updateHeight(this.outputId, 0, {
                    isOutput: true,
                    init: true,
                });
            }
            const root = this.element.shadowRoot ?? this.element;
            const codeBlocks = MarkdownCodeBlock.requestHighlightCodeBlock(root);
            if (codeBlocks.length > 0) {
                postNotebookMessage('renderedCellOutput', {
                    codeBlocks
                });
            }
        }
        updateAndRerender(content) {
            if (this._content) {
                this.render(content, this._content.preferredRendererId, this._content.preloadErrors);
            }
        }
    }
    const markupCellDragManager = new class MarkupCellDragManager {
        constructor() {
            window.document.addEventListener('dragover', e => {
                // Allow dropping dragged markup cells
                e.preventDefault();
            });
            window.document.addEventListener('drop', e => {
                e.preventDefault();
                const drag = this.currentDrag;
                if (!drag) {
                    return;
                }
                this.currentDrag = undefined;
                postNotebookMessage('cell-drop', {
                    cellId: drag.cellId,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    dragOffsetY: e.clientY,
                });
            });
        }
        startDrag(e, cellId) {
            if (!e.dataTransfer) {
                return;
            }
            if (!currentOptions.dragAndDropEnabled) {
                return;
            }
            this.currentDrag = { cellId, clientY: e.clientY };
            const overlayZIndex = 9999;
            if (!this.dragOverlay) {
                this.dragOverlay = document.createElement('div');
                this.dragOverlay.style.position = 'absolute';
                this.dragOverlay.style.top = '0';
                this.dragOverlay.style.left = '0';
                this.dragOverlay.style.zIndex = `${overlayZIndex}`;
                this.dragOverlay.style.width = '100%';
                this.dragOverlay.style.height = '100%';
                this.dragOverlay.style.background = 'transparent';
                window.document.body.appendChild(this.dragOverlay);
            }
            e.target.style.zIndex = `${overlayZIndex + 1}`;
            e.target.classList.add('dragging');
            postNotebookMessage('cell-drag-start', {
                cellId: cellId,
                dragOffsetY: e.clientY,
            });
            // Continuously send updates while dragging instead of relying on `updateDrag`.
            // This lets us scroll the list based on drag position.
            const trySendDragUpdate = () => {
                if (this.currentDrag?.cellId !== cellId) {
                    return;
                }
                postNotebookMessage('cell-drag', {
                    cellId: cellId,
                    dragOffsetY: this.currentDrag.clientY,
                });
                window.requestAnimationFrame(trySendDragUpdate);
            };
            window.requestAnimationFrame(trySendDragUpdate);
        }
        updateDrag(e, cellId) {
            if (cellId !== this.currentDrag?.cellId) {
                this.currentDrag = undefined;
            }
            else {
                this.currentDrag = { cellId, clientY: e.clientY };
            }
        }
        endDrag(e, cellId) {
            this.currentDrag = undefined;
            e.target.classList.remove('dragging');
            postNotebookMessage('cell-drag-end', {
                cellId: cellId
            });
            if (this.dragOverlay) {
                this.dragOverlay.remove();
                this.dragOverlay = undefined;
            }
            e.target.style.zIndex = '';
        }
    }();
}
export function preloadsScriptStr(styleValues, options, renderOptions, renderers, preloads, isWorkspaceTrusted, nonce) {
    const ctx = {
        style: styleValues,
        options,
        renderOptions,
        rendererData: renderers,
        staticPreloadsData: preloads,
        isWorkspaceTrusted,
        nonce,
    };
    // TS will try compiling `import()` in webviewPreloads, so use a helper function instead
    // of using `import(...)` directly
    return `
		const __import = (x) => import(x);
		(${webviewPreloads})(
			JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(ctx))}"))
		)\n//# sourceURL=notebookWebviewPreloads.js\n`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld1ByZWxvYWRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L3JlbmRlcmVycy93ZWJ2aWV3UHJlbG9hZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUF3RmhHLEtBQUssVUFBVSxlQUFlLENBQUMsR0FBbUI7SUFFakQsZ0VBQWdFO0lBRWhFLGtFQUFrRTtJQUNsRSxpRUFBaUU7SUFDakUsa0RBQWtEO0lBRWxELE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7SUFDdEMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BELE1BQU0sV0FBVyxHQUFHLElBQUksV0FBVyxFQUFFLENBQUM7SUFDdEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQztJQUV0QyxTQUFTLG9CQUFvQjtRQUM1QixJQUFJLE9BQTRDLENBQUM7UUFDakQsSUFBSSxNQUE4QixDQUFDO1FBQ25DLE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxDQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQzNDLE9BQU8sR0FBRyxHQUFHLENBQUM7WUFDZCxNQUFNLEdBQUcsR0FBRyxDQUFDO1FBQ2QsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFRLEVBQUUsTUFBTSxFQUFFLE1BQU8sRUFBRSxDQUFDO0lBQ3hELENBQUM7SUFFRCxJQUFJLGNBQWMsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDO0lBQ2pDLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0lBQ2xELElBQUksb0JBQW9CLEdBQUcsR0FBRyxDQUFD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