/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
export const CodeActionKind = new class {
    constructor() {
        this.QuickFix = new HierarchicalKind('quickfix');
        this.Refactor = new HierarchicalKind('refactor');
        this.RefactorExtract = this.Refactor.append('extract');
        this.RefactorInline = this.Refactor.append('inline');
        this.RefactorMove = this.Refactor.append('move');
        this.RefactorRewrite = this.Refactor.append('rewrite');
        this.Notebook = new HierarchicalKind('notebook');
        this.Source = new HierarchicalKind('source');
        this.SourceOrganizeImports = this.Source.append('organizeImports');
        this.SourceFixAll = this.Source.append('fixAll');
        this.SurroundWith = this.Refactor.append('surround');
    }
};
export var CodeActionAutoApply;
(function (CodeActionAutoApply) {
    CodeActionAutoApply["IfSingle"] = "ifSingle";
    CodeActionAutoApply["First"] = "first";
    CodeActionAutoApply["Never"] = "never";
})(CodeActionAutoApply || (CodeActionAutoApply = {}));
export var CodeActionTriggerSource;
(function (CodeActionTriggerSource) {
    CodeActionTriggerSource["Refactor"] = "refactor";
    CodeActionTriggerSource["RefactorPreview"] = "refactor preview";
    CodeActionTriggerSource["Lightbulb"] = "lightbulb";
    CodeActionTriggerSource["Default"] = "other (default)";
    CodeActionTriggerSource["SourceAction"] = "source action";
    CodeActionTriggerSource["QuickFix"] = "quick fix action";
    CodeActionTriggerSource["FixAll"] = "fix all";
    CodeActionTriggerSource["OrganizeImports"] = "organize imports";
    CodeActionTriggerSource["AutoFix"] = "auto fix";
    CodeActionTriggerSource["QuickFixHover"] = "quick fix hover window";
    CodeActionTriggerSource["OnSave"] = "save participants";
    CodeActionTriggerSource["ProblemsView"] = "problems view";
})(CodeActionTriggerSource || (CodeActionTriggerSource = {}));
export function mayIncludeActionsOfKind(filter, providedKind) {
    // A provided kind may be a subset or superset of our filtered kind.
    if (filter.include && !filter.include.intersects(providedKind)) {
        return false;
    }
    if (filter.excludes) {
        if (filter.excludes.some(exclude => excludesAction(providedKind, exclude, filter.include))) {
            return false;
        }
    }
    // Don't return source actions unless they are explicitly requested
    if (!filter.includeSourceActions && CodeActionKind.Source.contains(providedKind)) {
        return false;
    }
    return true;
}
export function filtersAction(filter, action) {
    const actionKind = action.kind ? new HierarchicalKind(action.kind) : undefined;
    // Filter out actions by kind
    if (filter.include) {
        if (!actionKind || !filter.include.contains(actionKind)) {
            return false;
        }
    }
    if (filter.excludes) {
        if (actionKind && filter.excludes.some(exclude => excludesAction(actionKind, exclude, filter.include))) {
            return false;
        }
    }
    // Don't return source actions unless they are explicitly requested
    if (!filter.includeSourceActions) {
        if (actionKind && CodeActionKind.Source.contains(actionKind)) {
            return false;
        }
    }
    if (filter.onlyIncludePreferredActions) {
        if (!action.isPreferred) {
            return false;
        }
    }
    return true;
}
function excludesAction(providedKind, exclude, include) {
    if (!exclude.contains(providedKind)) {
        return false;
    }
    if (include && exclude.contains(include)) {
        // The include is more specific, don't filter out
        return false;
    }
    return true;
}
export class CodeActionCommandArgs {
    static fromUser(arg, defaults) {
        if (!arg || typeof arg !== 'object') {
            return new CodeActionCommandArgs(defaults.kind, defaults.apply, false);
        }
        return new CodeActionCommandArgs(CodeActionCommandArgs.getKindFromUser(arg, defaults.kind), CodeActionCommandArgs.getApplyFromUser(arg, defaults.apply), CodeActionCommandArgs.getPreferredUser(arg));
    }
    static getApplyFromUser(arg, defaultAutoApply) {
        switch (typeof arg.apply === 'string' ? arg.apply.toLowerCase() : '') {
            case 'first': return "first" /* CodeActionAutoApply.First */;
            case 'never': return "never" /* CodeActionAutoApply.Never */;
            case 'ifsingle': return "ifSingle" /* CodeActionAutoApply.IfSingle */;
            default: return defaultAutoApply;
        }
    }
    static getKindFromUser(arg, defaultKind) {
        return typeof arg.kind === 'string'
            ? new HierarchicalKind(arg.kind)
            : defaultKind;
    }
    static getPreferredUser(arg) {
        return typeof arg.preferred === 'boolean'
            ? arg.preferred
            : false;
    }
    constructor(kind, apply, preferred) {
        this.kind = kind;
        this.apply = apply;
        this.preferred = preferred;
    }
}
export class CodeActionItem {
    constructor(action, provider, highlightRange) {
        this.action = action;
        this.provider = provider;
        this.highlightRange = highlightRange;
    }
    async resolve(token) {
        if (this.provider?.resolveCodeAction && !this.action.edit) {
            let action;
            try {
                action = await this.provider.resolveCodeAction(this.action, token);
            }
            catch (err) {
                onUnexpectedExternalError(err);
            }
            if (action) {
                this.action.edit = action.edit;
            }
        }
        return this;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUsvRSxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsSUFBSTtJQUFBO1FBQ2pCLGFBQVEsR0FBRyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTVDLGFBQVEsR0FBRyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzVDLG9CQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEQsbUJBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoRCxpQkFBWSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLG9CQUFlLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbEQsYUFBUSxHQUFHLElBQUksZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFNUMsV0FBTSxHQUFHLElBQUksZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEMsMEJBQXFCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM5RCxpQkFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLGlCQUFZLEdBQUcsSUFB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