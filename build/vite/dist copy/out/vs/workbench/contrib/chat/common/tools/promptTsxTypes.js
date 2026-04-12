/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This is a subset of the types export from jsonTypes.d.ts in @vscode/prompt-tsx.
 * It's just the types needed to stringify prompt-tsx tool results.
 * It should be kept in sync with the types in that file.
 *
 * Note: do NOT use `declare` with const enums, esbuild doesn't inline them.
 * See https://github.com/evanw/esbuild/issues/4394
 */
export var PromptNodeType;
(function (PromptNodeType) {
    PromptNodeType[PromptNodeType["Piece"] = 1] = "Piece";
    PromptNodeType[PromptNodeType["Text"] = 2] = "Text";
})(PromptNodeType || (PromptNodeType = {}));
/**
 * Constructor kind of the node represented by {@link PieceJSON}. This is
 * less descriptive than the actual constructor, as we only care to preserve
 * the element data that the renderer cares about.
 */
export var PieceCtorKind;
(function (PieceCtorKind) {
    PieceCtorKind[PieceCtorKind["BaseChatMessage"] = 1] = "BaseChatMessage";
    PieceCtorKind[PieceCtorKind["Other"] = 2] = "Other";
    PieceCtorKind[PieceCtorKind["ImageChatMessage"] = 3] = "ImageChatMessage";
})(PieceCtorKind || (PieceCtorKind = {}));
export function stringifyPromptElementJSON(element) {
    const strs = [];
    stringifyPromptNodeJSON(element.node, strs);
    return strs.join('');
}
function stringifyPromptNodeJSON(node, strs) {
    if (node.type === 2 /* PromptNodeType.Text */) {
        if (node.lineBreakBefore) {
            strs.push('\n');
        }
        if (typeof node.text === 'string') {
            strs.push(node.text);
        }
    }
    else if (node.ctor === 3 /* PieceCtorKind.ImageChatMessage */) {
        // This case currently can't be hit by prompt-tsx
        strs.push('<image>');
    }
    else if (node.ctor === 1 /* PieceCtorKind.BaseChatMessage */ || node.ctor === 2 /* PieceCtorKind.Other */) {
        for (const child of node.children) {
            stringifyPromptNodeJSON(child, strs);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VHN4VHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9wcm9tcHRUc3hUeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRzs7Ozs7OztHQU9HO0FBRUgsTUFBTSxDQUFOLElBQWtCLGNBR2pCO0FBSEQsV0FBa0IsY0FBYztJQUMvQixxREFBUyxDQUFBO0lBQ1QsbURBQVEsQ0FBQTtBQUNULENBQUMsRUFIaUIsY0FBYyxLQUFkLGNBQWMsUUFHL0I7QUFNRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGFBSWpCO0FBSkQsV0FBa0IsYUFBYTtJQUM5Qix1RUFBbUIsQ0FBQTtJQUNuQixtREFBUyxDQUFBO0lBQ1QseUVBQW9CLENBQUE7QUFDckIsQ0FBQyxFQUppQixhQUFhLEtBQWIsYUFBYSxRQUk5QjtBQXFCRCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsT0FBMEI7SUFDcEUsTUFBTSxJQUFJLEdBQWEsRUFBRSxDQUFDO0lBQzFCLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDNUMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3RCLENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLElBQW9CLEVBQUUsSUFBYztJQUNwRSxJQUFJLElBQUksQ0FBQyxJQUFJLGdDQUF3QixFQUFFLENBQUM7UUFDdkMsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQixDQUFDO1FBRUQsSUFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEIsQ0FBQztJQUNGLENBQUM7U0FBTSxJQUFJLElBQUksQ0FBQyxJQUFJLDJDQUFtQyxFQUFFLENBQUM7UUFDekQsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEIsQ0FBQztTQUFNLElBQUksSUFBSSxDQUFDLElBQUksMENBQWtDLElBQUksSUFBSSxDQUFDLElBQUksZ0NBQXdCLEVBQUUsQ0FBQztRQUM3RixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuQyx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDIn0=