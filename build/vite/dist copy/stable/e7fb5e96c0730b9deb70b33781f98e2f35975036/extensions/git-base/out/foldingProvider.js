"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitCommitFoldingProvider = void 0;
const vscode = __importStar(require("vscode"));
class GitCommitFoldingProvider {
    provideFoldingRanges(document, _context, _token) {
        const ranges = [];
        let commentBlockStart;
        let currentDiffStart;
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const lineText = line.text;
            // Check for comment lines (lines starting with #)
            if (lineText.startsWith('#')) {
                // Close any active diff block when we encounter a comment
                if (currentDiffStart !== undefined) {
                    // Only create fold if there are at least 2 lines
                    if (i - currentDiffStart > 1) {
                        ranges.push(new vscode.FoldingRange(currentDiffStart, i - 1));
                    }
                    currentDiffStart = undefined;
                }
                if (commentBlockStart === undefined) {
                    commentBlockStart = i;
                }
            }
            else {
                // End of comment block
                if (commentBlockStart !== undefined) {
                    // Only create fold if there are at least 2 lines
                    if (i - commentBlockStart > 1) {
                        ranges.push(new vscode.FoldingRange(commentBlockStart, i - 1, vscode.FoldingRangeKind.Comment));
                    }
                    commentBlockStart = undefined;
                }
            }
            // Check for diff sections (lines starting with "diff --git")
            if (lineText.startsWith('diff --git ')) {
                // If there's a previous diff block, close it
                if (currentDiffStart !== undefined) {
                    // Only create fold if there are at least 2 lines
                    if (i - currentDiffStart > 1) {
                        ranges.push(new vscode.FoldingRange(currentDiffStart, i - 1));
                    }
                }
                // Start new diff block
                currentDiffStart = i;
            }
        }
        // Handle end-of-document cases
        // If comment block extends to end of document
        if (commentBlockStart !== undefined) {
            if (document.lineCount - commentBlockStart > 1) {
                ranges.push(new vscode.FoldingRange(commentBlockStart, document.lineCount - 1, vscode.FoldingRangeKind.Comment));
            }
        }
        // If diff block extends to end of document
        if (currentDiffStart !== undefined) {
            if (document.lineCount - currentDiffStart > 1) {
                ranges.push(new vscode.FoldingRange(currentDiffStart, document.lineCount - 1));
            }
        }
        return ranges;
    }
}
exports.GitCommitFoldingProvider = GitCommitFoldingProvider;
//# sourceMappingURL=foldingProvider.js.map