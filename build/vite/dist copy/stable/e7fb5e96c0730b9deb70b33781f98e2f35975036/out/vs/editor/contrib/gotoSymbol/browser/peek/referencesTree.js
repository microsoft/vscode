/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FileReferencesRenderer_1;
import * as dom from '../../../../../base/browser/dom.js';
import { CountBadge } from '../../../../../base/browser/ui/countBadge/countBadge.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { createMatches, FuzzyScore } from '../../../../../base/common/filters.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ITextModelService } from '../../../../common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { defaultCountBadgeStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { FileReferences, OneReference, ReferencesModel } from '../referencesModel.js';
let DataSource = class DataSource {
    constructor(_resolverService) {
        this._resolverService = _resolverService;
    }
    hasChildren(element) {
        if (element instanceof ReferencesModel) {
            return true;
        }
        if (element instanceof FileReferences) {
            return true;
        }
        return false;
    }
    getChildren(element) {
        if (element instanceof ReferencesModel) {
            return element.groups;
        }
        if (element instanceof FileReferences) {
            return element.resolve(this._resolverService).then(val => {
                // if (element.failure) {
                // 	// refresh the element on failure so that
                // 	// we can update its rendering
                // 	return tree.refresh(element).then(() => val.children);
                // }
                return val.children;
            });
        }
        throw new Error('bad tree');
    }
};
DataSource = __decorate([
    __param(0, ITextModelService)
], DataSource);
export { DataSource };
//#endregion
export class Delegate {
    getHeight() {
        return 23;
    }
    getTemplateId(element) {
        if (element instanceof FileReferences) {
            return FileReferencesRenderer.id;
        }
        else {
            return OneReferenceRenderer.id;
        }
    }
}
let StringRepresentationProvider = class StringRepresentationProvider {
    constructor(_keybindingService) {
        this._keybindingService = _keybindingService;
    }
    getKeyboardNavigationLabel(element) {
        if (element instanceof OneReference) {
            const parts = element.parent.getPreview(element)?.preview(element.range);
            if (parts) {
                return parts.value;
            }
        }
        // FileReferences or unresolved OneReference
        return basename(element.uri);
    }
    mightProducePrintableCharacter(event) {
        return this._keybindingService.mightProducePrintableCharacter(event);
    }
};
StringRepresentationProvider = __decorate([
    __param(0, IKeybindingService)
], StringRepresentationProvider);
export { StringRepresentationProvider };
export class IdentityProvider {
    getId(element) {
        return element instanceof OneReference ? element.id : element.uri;
    }
}
//#region render: File
let FileReferencesTemplate = class FileReferencesTemplate extends Disposable {
    constructor(container, _labelService) {
        super();
        this._labelService = _labelService;
        const parent = document.createElement('div');
        parent.classList.add('reference-file');
        this.file = this._register(new IconLabel(parent, { supportHighlights: true }));
        this.badge = this._register(new CountBadge(dom.append(parent, dom.$('.count')), {}, defaultCountBadgeStyles));
        container.appendChild(parent);
    }
    set(element, matches) {
        const parent = dirname(element.uri);
        this.file.setLabel(this._labelService.getUriBasenameLabel(element.uri), this._labelService.getUriLabel(parent, { relative: true }), { title: this._labelService.getUriLabel(element.uri), matches });
        const len = element.children.length;
        this.badge.setCount(len);
        if (len > 1) {
            this.badge.setTitleFormat(localize('referencesCount', "{0} references", len));
        }
        else {
            this.badge.setTitleFormat(localize('referenceCount', "{0} reference", len));
        }
    }
};
FileReferencesTemplate = __decorate([
    __param(1, ILabelService)
], FileReferencesTemplate);
let FileReferencesRenderer = class FileReferencesRenderer {
    static { FileReferencesRenderer_1 = this; }
    static { this.id = 'FileReferencesRenderer'; }
    constructor(_instantiationService) {
        this._instantiationService = _instantiationService;
        this.templateId = FileReferencesRenderer_1.id;
    }
    renderTemplate(container) {
        return this._instantiationService.createInstance(FileReferencesTemplate, container);
    }
    renderElement(node, index, template) {
        template.set(node.element, createMatches(node.filterData));
    }
    disposeTemplate(templateData) {
        templateData.dispose();
    }
};
FileReferencesRenderer = FileReferencesRenderer_1 = __decorate([
    __param(0, IInstantiationService)
], FileReferencesRenderer);
export { FileReferencesRenderer };
//#endregion
//#region render: Reference
class OneReferenceTemplate extends Disposable {
    constructor(container) {
        super();
        this.label = this._register(new HighlightedLabel(container));
    }
    set(element, score) {
        const preview = element.parent.getPreview(element)?.preview(element.range);
        if (!preview || !preview.value) {
            // this means we FAILED to resolve the document or the value is the empty string
            this.label.set(`${basename(element.uri)}:${element.range.startLineNumber + 1}:${element.range.startColumn + 1}`);
        }
        else {
            // render search match as highlight unless
            // we have score, then render the score
            const { value, highlight } = preview;
            if (score && !FuzzyScore.isDefault(score)) {
                this.label.element.classList.toggle('referenceMatch', false);
                this.label.set(value, createMatches(score));
            }
            else {
                this.label.element.classList.toggle('referenceMatch', true);
                this.label.set(value, [highlight]);
            }
        }
    }
}
export class OneReferenceRenderer {
    constructor() {
        this.templateId = OneReferenceRenderer.id;
    }
    static { this.id = 'OneReferenceRenderer'; }
    renderTemplate(container) {
        return new OneReferenceTemplate(container);
    }
    renderElement(node, index, templateData) {
        templateData.set(node.element, node.filterData);
    }
    disposeTemplate(templateData) {
        templateData.dispose();
    }
}
//#endregion
export class AccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('treeAriaLabel', "References");
    }
    getAriaLabel(element) {
        return element.ariaMessage;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlc1RyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvcGVlay9yZWZlcmVuY2VzVHJlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUUxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDdkcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBSWxGLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFVLE1BQU0sdUNBQXVDLENBQUM7QUFDMUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNqRyxPQUFPLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQU0vRSxJQUFNLFVBQVUsR0FBaEIsTUFBTSxVQUFVO0lBRXRC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