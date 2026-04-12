/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TypeHierarchyModel } from '../common/typeHierarchy.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createMatches } from '../../../../base/common/filters.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { compare } from '../../../../base/common/strings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
export class Type {
    constructor(item, model, parent) {
        this.item = item;
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
        if (element instanceof TypeHierarchyModel) {
            return element.roots.map(root => new Type(root, element, undefined));
        }
        const { model, item } = element;
        if (this.getDirection() === "supertypes" /* TypeHierarchyDirection.Supertypes */) {
            return (await model.provideSupertypes(item, CancellationToken.None)).map(item => {
                return new Type(item, model, element);
            });
        }
        else {
            return (await model.provideSubtypes(item, CancellationToken.None)).map(item => {
                return new Type(item, model, element);
            });
        }
    }
}
export class Sorter {
    compare(element, otherElement) {
        return Type.compare(element, otherElement);
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
class TypeRenderingTemplate {
    constructor(icon, label) {
        this.icon = icon;
        this.label = label;
    }
}
export class TypeRenderer {
    constructor() {
        this.templateId = TypeRenderer.id;
    }
    static { this.id = 'TypeRenderer'; }
    renderTemplate(container) {
        container.classList.add('typehierarchy-element');
        const icon = document.createElement('div');
        container.appendChild(icon);
        const label = new IconLabel(container, { supportHighlights: true });
        return new TypeRenderingTemplate(icon, label);
    }
    renderElement(node, _index, template) {
        const { element, filterData } = node;
        const deprecated = element.item.tags?.includes(1 /* SymbolTag.Deprecated */);
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
        return TypeRenderer.id;
    }
}
export class AccessibilityProvider {
    constructor(getDirection) {
        this.getDirection = getDirection;
    }
    getWidgetAriaLabel() {
        return localize('tree.aria', "Type Hierarchy");
    }
    getAriaLabel(element) {
        if (this.getDirection() === "supertypes" /* TypeHierarchyDirection.Supertypes */) {
            return localize('supertypes', "supertypes of {0}", element.item.name);
        }
        else {
            return localize('subtypes', "subtypes of {0}", element.item.name);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZUhpZXJhcmNoeVRyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90eXBlSGllcmFyY2h5L2Jyb3dzZXIvdHlwZUhpZXJhcmNoeVRyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUE2QyxrQkFBa0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzNHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTVFLE9BQU8sRUFBYyxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0UsT0FBTyxFQUFFLFdBQVcsRUFBYSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxNQUFNLE9BQU8sSUFBSTtJQUNoQixZQUNVLElBQXVCLEVBQ3ZCLEtBQXlCLEVBQ3pCLE1BQXdCO1FBRnhCLFNBQUksR0FBSixJQUFJLENBQW1CO1FBQ3ZCLFVBQUssR0FBTCxLQUFLLENBQW9CO1FBQ3pCLFdBQU0sR0FBTixNQUFNLENBQWtCO0lBQzlCLENBQUM7SUFFTCxNQUFNLENBQUMsT0FBTyxDQUFDLENBQU8sRUFBRSxDQUFPO1FBQzlCLElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcs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