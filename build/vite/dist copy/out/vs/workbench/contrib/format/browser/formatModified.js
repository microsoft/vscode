/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { shouldSynchronizeModel } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { formatDocumentRangesWithSelectedProvider } from '../../../../editor/contrib/format/browser/format.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { IQuickDiffService } from '../../scm/common/quickDiff.js';
import { getOriginalResource } from '../../scm/common/quickDiffService.js';
registerEditorAction(class FormatModifiedAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.formatChanges',
            label: nls.localize2('formatChanges', "Format Modified Lines"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasDocumentSelectionFormattingProvider),
        });
    }
    async run(accessor, editor) {
        const instaService = accessor.get(IInstantiationService);
        if (!editor.hasModel()) {
            return;
        }
        const ranges = await instaService.invokeFunction(getModifiedRanges, editor.getModel());
        if (isNonEmptyArray(ranges)) {
            return instaService.invokeFunction(formatDocumentRangesWithSelectedProvider, editor, ranges, 1 /* FormattingMode.Explicit */, Progress.None, CancellationToken.None, true);
        }
    }
});
export async function getModifiedRanges(accessor, modified) {
    const quickDiffService = accessor.get(IQuickDiffService);
    const workerService = accessor.get(IEditorWorkerService);
    const modelService = accessor.get(ITextModelService);
    const original = await getOriginalResource(quickDiffService, modified.uri, modified.getLanguageId(), shouldSynchronizeModel(modified));
    if (!original) {
        return null; // let undefined signify no changes, null represents no source control (there's probably a better way, but I can't think of one rn)
    }
    const ranges = [];
    const ref = await modelService.createModelReference(original);
    try {
        if (!workerService.canComputeDirtyDiff(original, modified.uri)) {
            return undefined;
        }
        const changes = await workerService.computeDirtyDiff(original, modified.uri, false);
        if (!isNonEmptyArray(changes)) {
            return undefined;
        }
        for (const change of changes) {
            ranges.push(modified.validateRange(new Range(change.modifiedStartLineNumber, 1, change.modifiedEndLineNumber || change.modifiedStartLineNumber /*endLineNumber is 0 when things got deleted*/, Number.MAX_SAFE_INTEGER)));
        }
    }
    finally {
        ref.dispose();
    }
    return ranges;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0TW9kaWZpZWQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9mb3JtYXQvYnJvd3Nlci9mb3JtYXRNb2RpZmllZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFNUUsT0FBTyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBb0IsTUFBTSxnREFBZ0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFjLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDMUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLHdDQUF3QyxFQUFrQixNQUFNLHFEQUFxRCxDQUFDO0FBQy9ILE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRSxvQkFBb0IsQ0FBQyxNQUFNLG9CQUFx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