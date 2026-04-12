/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CallHierarchyModel, } from '../common/callHierarchy.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createMatches } from '../../../../base/common/filters.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { compare } from '../../../../base/common/strings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
export class Call {
    constructor(item, locations, model, parent) {
        this.item = item;
        this.locations = locations;
        this.model = model;
        this.parent = parent;
    }
    static compare(a, b) {
        let res = compare(a.item.uri.toString(), b.item.uri.toString());
        if (res === 0) {
            res = Range.compareRangesUsingStarts(a.item.range, b.item.range);
        }
        return res;
    }
}
export class DataSource {
    constructor(getDirection) {
        this.getDirection = getDirection;
    }
    hasChildren() {
        return true;
    }
    async getChildren(element) {
        if (element instanceof CallHierarchyModel) {
            return element.roots.map(root => new Call(root, undefined, element, undefined));
        }
        const { model, item } = element;
        if (this.getDirection() === "outgoingCalls" /* CallHierarchyDirection.CallsFrom */) {
            return (await model.resolveOutgoingCalls(item, CancellationToken.None)).map(call => {
                return new Call(call.to, call.fromRanges.map(range => ({ range, uri: item.uri })), model, element);
            });
        }
        else {
            return (await model.resolveIncomingCalls(item, CancellationToken.None)).map(call => {
                return new Call(call.from, call.fromRanges.map(range => ({ range, uri: call.from.uri })), model, element);
            });
        }
    }
}
export class Sorter {
    compare(element, otherElement) {
        return Call.compare(element, otherElement);
    }
}
export class IdentityProvider {
    constructor(getDirection) {
        this.getDirection = getDirection;
    }
    getId(element) {
        let res = this.getDirection() + JSON.stringify(element.item.uri) + JSON.stringify(element.item.range);
        if (element.parent) {
            res += this.getId(element.parent);
        }
        return res;
    }
}
class CallRenderingTemplate {
    constructor(icon, label) {
        this.icon = icon;
        this.label = label;
    }
}
export class CallRenderer {
    constructor() {
        this.templateId = CallRenderer.id;
    }
    static { this.id = 'CallRenderer'; }
    renderTemplate(container) {
        container.classList.add('callhierarchy-element');
        const icon = document.createElement('div');
        container.appendChild(icon);
        const label = new IconLabel(container, { supportHighlights: true });
        return new CallRenderingTemplate(icon, label);
    }
    renderElement(node, _index, template) {
        const { element, filterData } = node;
        const deprecated = element.item.tags?.includes(1 /* SymbolTag.Deprecated */);
        template.icon.className = '';
        template.icon.classList.add('inline', 'codicon-colored', ...ThemeIcon.asClassNameArray(SymbolKinds.toIcon(element.item.kind)));
        template.label.setLabel(element.item.name, element.item.detail, { labelEscapeNewLines: true, matches: createMatches(filterData), strikethrough: deprecated });
    }
    disposeTemplate(template) {
        template.label.dispose();
    }
}
export class VirtualDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(_element) {
        return CallRenderer.id;
    }
}
export class AccessibilityProvider {
    constructor(getDirection) {
        this.getDirection = getDirection;
    }
    getWidgetAriaLabel() {
        return localize('tree.aria', "Call Hierarchy");
    }
    getAriaLabel(element) {
        if (this.getDirection() === "outgoingCalls" /* CallHierarchyDirection.CallsFrom */) {
            return localize('from', "calls from {0}", element.item.name);
        }
        else {
            return localize('to', "callers of {0}", element.item.name);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbEhpZXJhcmNoeVRyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jYWxsSGllcmFyY2h5L2Jyb3dzZXIvY2FsbEhpZXJhcmNoeVRyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUE2QyxrQkFBa0IsR0FBRyxNQUFNLDRCQUE0QixDQUFDO0FBQzVHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTVFLE9BQU8sRUFBYyxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0UsT0FBTyxFQUFFLFdBQVcsRUFBdUIsTUFBTSx3Q0FBd0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsTUFBTSxPQUFPLElBQUk7SUFDaEIsWUFDVSxJQUF1QixFQUN2QixTQUFpQyxFQUNqQyxLQUF5QixFQUN6QixNQUF3QjtRQUh4QixTQUFJLEdBQUosSUFBSSxDQUFtQjtRQUN2QixjQUFTLEdBQVQsU0FBUyxDQUF3QjtRQUNqQyxVQUFLLEdBQUwsS0FBSyxDQUFvQjtRQUN6QixXQUFNLEdBQU4sTUFBTSxDQUFrQjtJQUM5QixDQUFDO0lBRUwsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFPLEVBQUUsQ0FBTztRQUM5QixJQUFJLEdBQUcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMs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