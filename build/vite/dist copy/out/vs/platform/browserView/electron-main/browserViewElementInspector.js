/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
function useScopedDisposal() {
    const store = new DisposableStore();
    store[Symbol.dispose] = () => store.dispose();
    return store;
}
/**
 * Manages element inspection on a browser view.
 *
 * Attaches a persistent CDP session in the constructor; methods wait for
 * it to be ready before issuing commands.
 */
export class BrowserViewElementInspector extends Disposable {
    constructor(browser) {
        super();
        this._connectionPromise = browser.attach().then(async (conn) => {
            try {
                // Important: don't use `Runtime.*` commands so we can support inspection during debugging.
                // We also initialize here rather than during selection as CSS.enable will hang if debugging is paused, but works if enabled beforehand.
                await conn.sendCommand('DOM.enable');
                await conn.sendCommand('Overlay.enable');
                await conn.sendCommand('CSS.enable');
                if (this._store.isDisposed) {
                    conn.dispose();
                    throw new Error('Inspector disposed before connection was ready');
                }
                this._register(conn);
                return conn;
            }
            catch (error) {
                conn.dispose();
                throw error;
            }
        });
    }
    /**
     * Start element inspection mode on the browser view. Sets up an
     * overlay that highlights elements on hover. When the user clicks, the
     * element data is returned and the overlay is removed.
     *
     * @param token Cancellation token to abort the inspection.
     */
    async getElementData(token) {
        const connection = await this._connectionPromise;
        const store = new DisposableStore();
        const result = new Promise((resolve, reject) => {
            store.add(token.onCancellationRequested(() => {
                resolve(undefined);
            }));
            store.add(connection.onEvent(async (event) => {
                if (event.method !== 'Overlay.inspectNodeRequested') {
                    return;
                }
                const params = event.params;
                if (!params?.backendNodeId) {
                    reject(new Error('Missing backendNodeId in inspectNodeRequested event'));
                    return;
                }
                try {
                    const nodeData = await extractNodeData(connection, { backendNodeId: params.backendNodeId });
                    resolve(nodeData);
                }
                catch (err) {
                    reject(err);
                }
            }));
        });
        try {
            await connection.sendCommand('Overlay.setInspectMode', {
                mode: 'searchForNode',
                highlightConfig: inspectHighlightConfig,
            });
            return await result;
        }
        finally {
            try {
                await connection.sendCommand('Overlay.setInspectMode', {
                    mode: 'none',
                    highlightConfig: { showInfo: false, showStyles: false }
                });
                await connection.sendCommand('Overlay.hideHighlight');
            }
            catch {
                // Best effort cleanup
            }
            store.dispose();
        }
    }
    /**
     * Get element data for the currently focused element.
     */
    async getFocusedElementData() {
        const connection = await this._connectionPromise;
        await connection.sendCommand('Runtime.enable');
        const { result } = await connection.sendCommand('Runtime.evaluate', {
            expression: 'document.activeElement',
            returnByValue: false,
        });
        if (!result?.objectId) {
            return undefined;
        }
        return extractNodeData(connection, { objectId: result.objectId });
    }
    async getVisualViewportScale() {
        try {
            const connection = await this._connectionPromise;
            const result = await connection.sendCommand('Page.getLayoutMetrics');
            if (typeof result.cssVisualViewport?.scale === 'number') {
                const scale = Number(result.cssVisualViewport.scale);
                if (Number.isFinite(scale) && scale > 0) {
                    return scale;
                }
            }
        }
        catch {
            // Ignore execution errors while loading and use defaults.
        }
        return 1;
    }
}
async function extractNodeData(connection, id) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const store = __addDisposableResource(env_1, useScopedDisposal(), false);
        const discoveredNodesByNodeId = {};
        store.add(connection.onEvent(event => {
            if (event.method === 'DOM.setChildNodes') {
                const { nodes } = event.params;
                for (const node of nodes) {
                    discoveredNodesByNodeId[node.nodeId] = node;
                    if (node.children) {
                        for (const child of node.children) {
                            discoveredNodesByNodeId[child.nodeId] = {
                                ...child,
                                parentId: node.nodeId
                            };
                        }
                    }
                    if (node.pseudoElements) {
                        for (const pseudo of node.pseudoElements) {
                            discoveredNodesByNodeId[pseudo.nodeId] = {
                                ...pseudo,
                                parentId: node.nodeId
                            };
                        }
                    }
                }
            }
        }));
        await connection.sendCommand('DOM.getDocument');
        const { node } = await connection.sendCommand('DOM.describeNode', id);
        if (!node) {
            throw new Error('Failed to describe node.');
        }
        let nodeId = node.nodeId;
        if (!nodeId) {
            const { nodeIds } = await connection.sendCommand('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [node.backendNodeId] });
            if (!nodeIds?.length) {
                throw new Error('Failed to get node ID.');
            }
            nodeId = nodeIds[0];
        }
        const { model } = await connection.sendCommand('DOM.getBoxModel', { nodeId });
        if (!model) {
            throw new Error('Failed to get box model.');
        }
        const content = model.content;
        const margin = model.margin;
        const x = Math.min(margin[0], content[0]);
        const y = Math.min(margin[1], content[1]);
        const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
        const height = Math.max(margin[5] - margin[1], content[5] - content[1]);
        const matched = await connection.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
        if (!matched) {
            throw new Error('Failed to get matched css.');
        }
        const computedStyle = formatMatchedStyles(matched);
        const { outerHTML } = await connection.sendCommand('DOM.getOuterHTML', { nodeId });
        if (!outerHTML) {
            throw new Error('Failed to get outerHTML.');
        }
        const attributes = attributeArrayToRecord(node.attributes);
        const ancestors = [];
        let currentNode = discoveredNodesByNodeId[nodeId] ?? node;
        while (currentNode) {
            const attributes = attributeArrayToRecord(currentNode.attributes);
            ancestors.unshift({
                tagName: currentNode.localName,
                id: attributes.id,
                classNames: attributes.class?.trim().split(/\s+/).filter(Boolean)
            });
            currentNode = currentNode.parentId ? discoveredNodesByNodeId[currentNode.parentId] : undefined;
        }
        let computedStyles;
        try {
            const { computedStyle: computedStyleArray } = await connection.sendCommand('CSS.getComputedStyleForNode', { nodeId });
            if (computedStyleArray) {
                computedStyles = {};
                for (const prop of computedStyleArray) {
                    if (prop.name && typeof prop.value === 'string') {
                        computedStyles[prop.name] = prop.value;
                    }
                }
            }
        }
        catch { }
        return {
            outerHTML,
            computedStyle,
            bounds: { x, y, width, height },
            ancestors,
            attributes,
            computedStyles,
            dimensions: { top: y, left: x, width, height }
        };
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
function formatMatchedStyles(matched) {
    const lines = [];
    if (matched.inlineStyle?.cssProperties?.length) {
        lines.push('/* Inline style */');
        lines.push('element {');
        for (const prop of matched.inlineStyle.cssProperties) {
            if (prop.name && prop.value) {
                lines.push(`  ${prop.name}: ${prop.value};`);
            }
        }
        lines.push('}\n');
    }
    if (matched.matchedCSSRules?.length) {
        for (const ruleEntry of matched.matchedCSSRules) {
            const rule = ruleEntry.rule;
            const selectors = rule.selectorList.selectors.map((s) => s.text).join(', ');
            lines.push(`/* Matched Rule from ${rule.origin} */`);
            lines.push(`${selectors} {`);
            for (const prop of rule.style.cssProperties) {
                if (prop.name && prop.value) {
                    lines.push(`  ${prop.name}: ${prop.value};`);
                }
            }
            lines.push('}\n');
        }
    }
    if (matched.inherited?.length) {
        let level = 1;
        for (const inherited of matched.inherited) {
            if (inherited.inlineStyle) {
                lines.push(`/* Inherited from ancestor level ${level} (inline) */`);
                lines.push('element {');
                lines.push(inherited.inlineStyle.cssText || '');
                lines.push('}\n');
            }
            const rules = inherited.matchedCSSRules || [];
            for (const ruleEntry of rules) {
                const rule = ruleEntry.rule;
                const selectors = rule.selectorList.selectors.map((s) => s.text).join(', ');
                lines.push(`/* Inherited from ancestor level ${level} (${rule.origin}) */`);
                lines.push(`${selectors} {`);
                for (const prop of rule.style.cssProperties) {
                    if (prop.name && prop.value) {
                        lines.push(`  ${prop.name}: ${prop.value};`);
                    }
                }
                lines.push('}\n');
            }
            level++;
        }
    }
    return '\n' + lines.join('\n');
}
function attributeArrayToRecord(attributes) {
    const record = {};
    for (let i = 0; i < attributes.length; i += 2) {
        const name = attributes[i];
        const value = attributes[i + 1];
        record[name] = value;
    }
    return record;
}
/** Slightly customised CDP debugger inspect highlight colours. */
const inspectHighlightConfig = {
    showInfo: true,
    showRulers: false,
    showStyles: true,
    showAccessibilityInfo: true,
    showExtensionLines: false,
    contrastAlgorithm: 'aa',
    contentColor: { r: 173, g: 216, b: 255, a: 0.8 },
    paddingColor: { r: 150, g: 200, b: 255, a: 0.5 },
    borderColor: { r: 120, g: 180, b: 255, a: 0.7 },
    marginColor: { r: 200, g: 220, b: 255, a: 0.4 },
    eventTargetColor: { r: 130, g: 160, b: 255, a: 0.8 },
    shapeColor: { r: 130, g: 160, b: 255, a: 0.8 },
    shapeMarginColor: { r: 130, g: 160, b: 255, a: 0.5 },
    gridHighlightConfig: {
        rowGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
        rowHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
        columnGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
        columnHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
        rowLineColor: { r: 120, g: 180, b: 255 },
        columnLineColor: { r: 120, g: 180, b: 255 },
        rowLineDash: true,
        columnLineDash: true
    },
    flexContainerHighlightConfig: {
        containerBorder: { color: { r: 120, g: 180, b: 255 }, pattern: 'solid' },
        itemSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: 'solid' },
        lineSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: 'solid' },
        mainDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
        crossDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
        rowGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
        columnGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    },
    flexItemHighlightConfig: {
        baseSizeBox: { hatchColor: { r: 130, g: 170, b: 255, a: 0.6 } },
        baseSizeBorder: { color: { r: 120, g: 180, b: 255 }, pattern: 'solid' },
        flexibilityArrow: { color: { r: 130, g: 190, b: 255 } }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdFbGVtZW50SW5zcGVjdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYnJvd3NlclZpZXcvZWxlY3Ryb24tbWFpbi9icm93c2VyVmlld0VsZW1lbnRJbnNwZWN0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUE4RGhGLFNBQVMsaUJBQWlCO0lBQ3pCLE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFvRCxDQUFDO0lBQ3RGLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzlDLE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsTUFBTSxPQUFPLDJCQUE0QixTQUFRLFVBQVU7SUFJMUQsWUFBWSxPQUFvQjtRQUMvQixLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUM5QyxLQUFLLEVBQUMsSUFBSSxFQUFDLEVBQUU7WUFDWixJQUFJLENBQUM7Z0JBQ0osMkZBQTJGO2dCQUMzRix3SUFBd0k7Z0JBQ3hJLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDckMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQ3pDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFFckMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUM1QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO2dCQUNuRSxDQUFDO2dCQUNELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JCLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZixNQUFNLEtBQUssQ0FBQztZQUNiLENBQUM7UUFDRixDQUFDLENBQ0QsQ0FBQztJQUNILENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxLQUFLLENBQUMsY0FBYyxDQUFDLEtBQXdCO1FBQzVDLE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDO1FBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxPQUFPLENBQTJCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3hFLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtnQkFDNUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUM1QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssOEJBQThCLEVBQUUsQ0FBQztvQkFDckQsT0FBTztnQkFDUixDQUFDO2dCQUVELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFtQyxDQUFDO2dCQUN6RCxJQUFJLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFDO29CQUM1QixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMscURBQXFELENBQUMsQ0FBQyxDQUFDO29CQUN6RSxPQUFPO2dCQUNSLENBQUM7Z0JBRUQsSUFBSSxDQUFDO29CQUNKLE1BQU0sUUFBUSxHQUFHLE1BQU0sZUFBZSxDQUFDLFVBQVUsRUFBRSxFQUFFLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztvQkFDNUYsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNuQixDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNiLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUM7WUFDSixNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLEVBQUU7Z0JBQ3RELElBQUksRUFBRSxlQUFlO2dCQUNyQixlQUFlLEVBQUUsc0JBQXNCO2FBQ3ZDLENBQUMsQ0FBQztZQUNILE9BQU8sTUFBTSxNQUFNLENBQUM7UUFDckIsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDO2dCQUNKLE1BQU0sVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsRUFBRTtvQkFDdEQsSUFBSSxFQUFFLE1BQU07b0JBQ1osZUFBZSxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFO2lCQUN2RCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDdkQsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUixzQkFBc0I7WUFDdkIsQ0FBQztZQUNELEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixDQUFDO0lBQ0YsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLHFCQUFxQjtRQUMxQixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztRQUVqRCxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFO1lBQ25FLFVBQVUsRUFBRSx3QkFBd0I7WUFDcEMsYUFBYSxFQUFFLEtBQUs7U0FDcEIsQ0FBc0MsQ0FBQztRQUV4QyxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLGVBQWUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELEtBQUssQ0FBQyxzQkFBc0I7UUFDM0IsSUFBSSxDQUFDO1lBQ0osTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUM7WUFDakQsTUFBTSxNQUFNLEdBQUcsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUF5QixDQUFDO1lBQzdGLElBQUksT0FBTyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUN6RCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyRCxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUN6QyxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUiwwREFBMEQ7UUFDM0QsQ0FBQztRQUVELE9BQU8sQ0FBQyxDQUFDO0lBQ1YsQ0FBQztDQUNEO0FBRUQsS0FBSyxVQUFVLGVBQWUsQ0FBQyxVQUEwQixFQUFFLEVBQWlEOzs7UUFDM0csTUFBTSxLQUFLLGtDQUFHLGlCQUFpQixFQUFFLFFBQUEsQ0FBQztRQUVsQyxNQUFNLHVCQUF1QixHQUEwQixFQUFFLENBQUM7UUFDMUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3BDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxtQkFBbUIsRUFBRSxDQUFDO2dCQUMxQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQTRCLENBQUM7Z0JBQ3JELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQzFCLHVCQUF1QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUM7b0JBQzVDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUNuQixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQzs0QkFDbkMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHO2dDQUN2QyxHQUFHLEtBQUs7Z0NBQ1IsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNOzZCQUNyQixDQUFDO3dCQUNILENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQzt3QkFDekIsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7NEJBQzFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRztnQ0FDeEMsR0FBRyxNQUFNO2dDQUNULFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTTs2QkFDckIsQ0FBQzt3QkFDSCxDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFaEQsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLE1BQU0sVUFBVSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQW9CLENBQUM7UUFDekYsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFDRCxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMscUNBQXFDLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBMEIsQ0FBQztZQUMzSixJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDO2dCQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDM0MsQ0FBQztZQUNELE1BQU0sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIsQ0FBQztRQUVELE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBeUIsQ0FBQztRQUN0RyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7UUFDOUIsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUM1QixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFeEUsTUFBTSxPQUFPLEdBQUcsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLDZCQUE2QixFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLG1CQUFtQixDQUFDLE9BQXlCLENBQUMsQ0FBQztRQUNyRSxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsTUFBTSxFQUFFLENBQTBCLENBQUM7UUFDNUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsc0JBQXNCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTNELE1BQU0sU0FBUyxHQUF1QixFQUFFLENBQUM7UUFDekMsSUFBSSxXQUFXLEdBQXNCLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQztRQUM3RSxPQUFPLFdBQVcsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sVUFBVSxHQUFHLHNCQUFzQixDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRSxTQUFTLENBQUMsT0FBTyxDQUFDO2dCQUNqQixPQUFPLEVBQUUsV0FBVyxDQUFDLFNBQVM7Z0JBQzlCLEVBQUUsRUFBRSxVQUFVLENBQUMsRUFBRTtnQkFDakIsVUFBVSxFQUFFLFVBQVUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7YUFDakUsQ0FBQyxDQUFDO1lBQ0gsV0FBVyxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ2hHLENBQUM7UUFFRCxJQUFJLGNBQWtELENBQUM7UUFDdkQsSUFBSSxDQUFDO1lBQ0osTUFBTSxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxHQUFHLE1BQU0sVUFBVSxDQUFDLFdBQVcsQ0FBQyw2QkFBNkIsRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUErRCxDQUFDO1lBQ3BMLElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDeEIsY0FBYyxHQUFHLEVBQUUsQ0FBQztnQkFDcEIsS0FBSyxNQUFNLElBQUksSUFBSSxrQkFBa0IsRUFBRSxDQUFDO29CQUN2QyxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUNqRCxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7b0JBQ3hDLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUVYLE9BQU87WUFDTixTQUFTO1lBQ1QsYUFBYTtZQUNiLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtZQUMvQixTQUFTO1lBQ1QsVUFBVTtZQUNWLGNBQWM7WUFDZCxVQUFVLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtTQUM5QyxDQUFDOzs7Ozs7Ozs7Q0FDRjtBQUVELFNBQVMsbUJBQW1CLENBQUMsT0FBdUI7SUFDbkQsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBRTNCLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDaEQsS0FBSyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDeEIsS0FBSyxNQUFNLElBQUksSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3RELElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzdCLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDO1FBQ0QsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBRUQsSUFBSSxPQUFPLENBQUMsZUFBZSxFQUFFLE1BQU0sRUFBRSxDQUFDO1FBQ3JDLEtBQUssTUFBTSxTQUFTLElBQUksT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ2pELE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUM7WUFDNUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBbUIsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM5RixLQUFLLENBQUMsSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztZQUNyRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsU0FBUyxJQUFJLENBQUMsQ0FBQztZQUM3QixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQzdDLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzdCLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUM5QyxDQUFDO1lBQ0YsQ0FBQztZQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkIsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDL0IsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsS0FBSyxNQUFNLFNBQVMsSUFBSSxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDM0MsSUFBSSxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQzNCLEtBQUssQ0FBQyxJQUFJLENBQUMsb0NBQW9DLEtBQUssY0FBYyxDQUFDLENBQUM7Z0JBQ3BFLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3hCLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ2hELEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkIsQ0FBQztZQUVELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDO1lBQzlDLEtBQUssTUFBTSxTQUFTLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUM7Z0JBQzVCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQW1CLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzlGLEtBQUssQ0FBQyxJQUFJLENBQUMsb0NBQW9DLEtBQUssS0FBSyxJQUFJLENBQUMsTUFBTSxNQUFNLENBQUMsQ0FBQztnQkFDNUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFNBQVMsSUFBSSxDQUFDLENBQUM7Z0JBQzdCLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDN0MsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzt3QkFDN0IsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7b0JBQzlDLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25CLENBQUM7WUFDRCxLQUFLLEVBQUUsQ0FBQztRQUNULENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNoQyxDQUFDO0FBRUQsU0FBUyxzQkFBc0IsQ0FBQyxVQUFvQjtJQUNuRCxNQUFNLE1BQU0sR0FBMkIsRUFBRSxDQUFDO0lBQzFDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUMvQyxNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQ3RCLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxrRUFBa0U7QUFDbEUsTUFBTSxzQkFBc0IsR0FBRztJQUM5QixRQUFRLEVBQUUsSUFBSTtJQUNkLFVBQVUsRUFBRSxLQUFLO0lBQ2pCLFVBQVUsRUFBRSxJQUFJO0lBQ2hCLHFCQUFxQixFQUFFLElBQUk7SUFDM0Isa0JBQWtCLEVBQUUsS0FBSztJQUN6QixpQkFBaUIsRUFBRSxJQUFJO0lBQ3ZCLFlBQVksRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7SUFDaEQsWUFBWSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtJQUNoRCxXQUFXLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO0lBQy9DLFdBQVcsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7SUFDL0MsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO0lBQ3BELFVBQVUsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7SUFDOUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO0lBQ3BELG1CQUFtQixFQUFFO1FBQ3BCLFdBQVcsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7UUFDL0MsYUFBYSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUNqRCxjQUFjLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1FBQ2xELGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUNwRCxZQUFZLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUN4QyxlQUFlLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUMzQyxXQUFXLEVBQUUsSUFBSTtRQUNqQixjQUFjLEVBQUUsSUFBSTtLQUNwQjtJQUNELDRCQUE0QixFQUFFO1FBQzdCLGVBQWUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtRQUN4RSxhQUFhLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7UUFDdEUsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFO1FBQ3RFLG9CQUFvQixFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUN2SCxxQkFBcUIsRUFBRSxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDeEgsV0FBVyxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUM5RyxjQUFjLEVBQUUsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFO0tBQ2pIO0lBQ0QsdUJBQXVCLEVBQUU7UUFDeEIsV0FBVyxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQy9ELGNBQWMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRTtRQUN2RSxnQkFBZ0IsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUU7S0FDdkQ7Q0FDRCxDQUFDIn0=