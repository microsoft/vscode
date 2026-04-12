/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class TestEditorWorkerService {
    canComputeUnicodeHighlights(uri) { return false; }
    async computedUnicodeHighlights(uri) { return { ranges: [], hasMore: false, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 }; }
    async computeDiff(original, modified, options, algorithm) { return null; }
    canComputeDirtyDiff(original, modified) { return false; }
    async computeDirtyDiff(original, modified, ignoreTrimWhitespace) { return null; }
    async computeMoreMinimalEdits(resource, edits) { return undefined; }
    async computeHumanReadableDiff(resource, edits) { return undefined; }
    canComputeWordRanges(resource) { return false; }
    async computeWordRanges(resource, range) { return null; }
    canNavigateValueSet(resource) { return false; }
    async navigateValueSet(resource, range, up) { return null; }
    async findSectionHeaders(uri) { return []; }
    async computeDefaultDocumentColors(uri) { return null; }
    computeStringEditFromDiff(original, modified, options, algorithm) {
        throw new Error('Method not implemented.');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdEVkaXRvcldvcmtlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdEVkaXRvcldvcmtlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFXaEcsTUFBTSxPQUFPLHVCQUF1QjtJQUluQywyQkFBMkIsQ0FBQyxHQUFRLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxHQUFRLElBQXVDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxFQUFFLHVCQUF1QixFQUFFLENBQUMsRUFBRSwyQkFBMkIsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDL00sS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFhLEVBQUUsUUFBYSxFQUFFLE9BQXFDLEVBQUUsU0FBNEIsSUFBbUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BLLG1CQUFtQixDQUFDLFFBQWEsRUFBRSxRQUFhLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzVFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFhLEVBQUUsUUFBYSxFQUFFLG9CQUE2QixJQUErQixPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0gsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFFBQWEsRUFBRSxLQUFvQyxJQUFxQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDekksS0FBSyxDQUFDLHdCQUF3QixDQUFDLFFBQWEsRUFBRSxLQUFvQyxJQUFxQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDMUksb0JBQW9CLENBQUMsUUFBYSxJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM5RCxLQUFLLENBQUMsaUJBQWlCLENBQUMsUUFBYSxFQUFFLEtBQWEsSUFBa0QsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BILG1CQUFtQixDQUFDLFFBQWEsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDN0QsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQWEsRUFBRSxLQUFhLEVBQUUsRUFBVyxJQUFrRCxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDaEksS0FBSyxDQUFDLGtCQUFrQixDQUFDLEdBQVEsSUFBOEIsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNFLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxHQUFRLElBQXlDLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUVsRyx5QkFBeUIsQ0FBQyxRQUFnQixFQUFFLFFBQWdCLEVBQUUsT0FBeUMsRUFBRSxTQUE0QjtRQUNwSSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUNEIn0=