/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../dom.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../iconLabel/iconLabels.js';
import { Disposable } from '../../../common/lifecycle.js';
import * as objects from '../../../common/objects.js';
/**
 * A widget which can render a label with substring highlights, often
 * originating from a filter function like the fuzzy matcher.
 */
export class HighlightedLabel extends Disposable {
    /**
     * Create a new {@link HighlightedLabel}.
     *
     * @param container The parent container to append to.
     */
    constructor(container, options) {
        super();
        this.options = options;
        this.text = '';
        this.title = '';
        this.highlights = [];
        this.didEverRender = false;
        this.domNode = dom.append(container, dom.$('span.monaco-highlighted-label'));
    }
    /**
     * The label's DOM node.
     */
    get element() {
        return this.domNode;
    }
    /**
     * Set the label and highlights.
     *
     * @param text The label to display.
     * @param highlights The ranges to highlight.
     * @param title An optional title for the hover tooltip.
     * @param escapeNewLines Whether to escape new lines.
     * @returns
     */
    set(text, highlights = [], title = '', escapeNewLines, supportIcons) {
        if (!text) {
            text = '';
        }
        if (escapeNewLines) {
            // adjusts highlights inplace
            text = HighlightedLabel.escapeNewLines(text, highlights);
        }
        if (this.didEverRender && this.text === text && this.title === title && objects.equals(this.highlights, highlights)) {
            return;
        }
        this.text = text;
        this.title = title;
        this.highlights = highlights;
        this.render(supportIcons);
    }
    render(supportIcons) {
        const children = [];
        let pos = 0;
        for (const highlight of this.highlights) {
            if (highlight.end === highlight.start) {
                continue;
            }
            if (pos < highlight.start) {
                const substring = this.text.substring(pos, highlight.start);
                if (supportIcons) {
                    children.push(...renderLabelWithIcons(substring));
                }
                else {
                    children.push(substring);
                }
                pos = highlight.start;
            }
            const substring = this.text.substring(pos, highlight.end);
            const element = dom.$('span.highlight', undefined, ...supportIcons ? renderLabelWithIcons(substring) : [substring]);
            if (highlight.extraClasses) {
                element.classList.add(...highlight.extraClasses);
            }
            children.push(element);
            pos = highlight.end;
        }
        if (pos < this.text.length) {
            const substring = this.text.substring(pos);
            if (supportIcons) {
                children.push(...renderLabelWithIcons(substring));
            }
            else {
                children.push(substring);
            }
        }
        dom.reset(this.domNode, ...children);
        if (!this.customHover && this.title !== '') {
            const hoverDelegate = this.options?.hoverDelegate ?? getDefaultHoverDelegate('mouse');
            this.customHover = this._register(getBaseLayerHoverDelegate().setupManagedHover(hoverDelegate, this.domNode, this.title));
        }
        else if (this.customHover) {
            this.customHover.update(this.title);
        }
        this.didEverRender = true;
    }
    static escapeNewLines(text, highlights) {
        let total = 0;
        let extra = 0;
        return text.replace(/\r\n|\r|\n/g, (match, offset) => {
            extra = match === '\r\n' ? -1 : 0;
            offset += total;
            for (const highlight of highlights) {
                if (highlight.end <= offset) {
                    continue;
                }
                if (highlight.start >= offset) {
                    highlight.start += extra;
                }
                if (highlight.end >= offset) {
                    highlight.end += extra;
                }
            }
            total += extra;
            return '\u23CE';
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlnaGxpZ2h0ZWRMYWJlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxjQUFjLENBQUM7QUFHcEMsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdkUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzFELE9BQU8sS0FBSyxPQUFPLE1BQU0sNEJBQTRCLENBQUM7QUFldEQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFVBQVU7SUFTL0M7Ozs7T0FJRztJQUNILFlBQVksU0FBc0IsRUFBbUIsT0FBa0M7UUFDdEYsS0FBSyxFQUFFLENBQUM7UUFENEMsWUFBTyxHQUFQLE9BQU8sQ0FBMkI7UUFYL0UsU0FBSSxHQUFXLEVBQUUsQ0FBQztRQUNsQixVQUFLLEdBQVcsRUFBRSxDQUFDO1FBQ25CLGVBQVUsR0FBMEIsRUFBRSxDQUFDO1FBQ3ZDLGtCQUFhLEdBQVksS0FBSyxDQUFDO1FBV3RDLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILEdBQUcsQ0FBQyxJQUF3QixFQUFFLGFBQW9DLEVBQUUsRUFBRSxRQUFnQixFQUFFLEVBQUUsY0FBd0IsRUFBRSxZQUFzQjtRQUN6SSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsNkJBQTZCO1lBQzdCLElBQUksR0FBRyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDckgsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFTyxNQUFNLENBQUMsWUFBc0I7UUFFcEMsTUFBTSxRQUFRLEdBQW9DLEVBQUUsQ0FBQztRQUNyRCxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFFWixLQUFLLE1BQU0sU0FBUyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN6QyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEtBQUssU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN2QyxTQUFTO1lBQ1YsQ0FBQztZQUVELElBQUksR0FBRyxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDM0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUQsSUFBSSxZQUFZLEVBQUUsQ0FBQztvQkFDbEIsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELENBQUM7cUJBQU0sQ0FBQztvQkFDUCxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMxQixDQUFDO2dCQUNELEdBQUcsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDO1lBQ3ZCLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBRXBILElBQUksU0FBUyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUM1QixPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBRUQsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN2QixHQUFHLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQztRQUNyQixDQUFDO1FBRUQsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM1QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUUsQ0FBQztZQUM1QyxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNsQixRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNuRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMxQixDQUFDO1FBQ0YsQ0FBQztRQUVELEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDO1FBRXJDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDNUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxhQUFhLElBQUksdUJBQXVCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEYsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLHlCQUF5QixFQUFFLENBQUMsaUJBQWlCLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDM0gsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBRUQsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7SUFDM0IsQ0FBQztJQUVELE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBWSxFQUFFLFVBQWlDO1FBQ3BFLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUVkLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDcEQsS0FBSyxHQUFHLEtBQUssS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQztZQUVoQixLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNwQyxJQUFJLFNBQVMsQ0FBQyxHQUFHLElBQUksTUFBTSxFQUFFLENBQUM7b0JBQzdCLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLFNBQVMsQ0FBQyxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7b0JBQy9CLFNBQVMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDO2dCQUMxQixDQUFDO2dCQUNELElBQUksU0FBUyxDQUFDLEdBQUcsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDN0IsU0FBUyxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUM7Z0JBQ3hCLENBQUM7WUFDRixDQUFDO1lBRUQsS0FBSyxJQUFJLEtBQUssQ0FBQztZQUNmLE9BQU8sUUFBUSxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=