/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { sumBy } from '../../base/common/arrays.js';
import { prefixedUuid } from '../../base/common/uuid.js';
import { LineEdit } from './core/edits/lineEdit.js';
import { TextLength } from './core/text/textLength.js';
const privateSymbol = Symbol('TextModelEditSource');
export class TextModelEditSource {
    constructor(metadata, _privateCtorGuard) {
        this.metadata = metadata;
    }
    toString() {
        return `${this.metadata.source}`;
    }
    getType() {
        const metadata = this.metadata;
        switch (metadata.source) {
            case 'cursor':
                return metadata.kind;
            case 'inlineCompletionAccept':
                return metadata.source + (metadata.$nes ? ':nes' : '');
            case 'unknown':
                return metadata.name || 'unknown';
            default:
                return metadata.source;
        }
    }
    /**
     * Converts the metadata to a key string.
     * Only includes properties/values that have `level` many `$` prefixes or less.
    */
    toKey(level, filter = {}) {
        const metadata = this.metadata;
        const keys = Object.entries(metadata).filter(([key, value]) => {
            const filterVal = filter[key];
            if (filterVal !== undefined) {
                return filterVal;
            }
            const prefixCount = (key.match(/\$/g) || []).length;
            return prefixCount <= level && value !== undefined && value !== null && value !== '';
        }).map(([key, value]) => `${key}:${value}`);
        return keys.join('-');
    }
    get props() {
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        return this.metadata;
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createEditSource(metadata) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return new TextModelEditSource(metadata, privateSymbol);
}
export function isAiEdit(source) {
    switch (source.metadata.source) {
        case 'inlineCompletionAccept':
        case 'inlineCompletionPartialAccept':
        case 'inlineChat.applyEdits':
        case 'Chat.applyEdits':
            return true;
    }
    return false;
}
export function isUserEdit(source) {
    switch (source.metadata.source) {
        case 'cursor':
            return source.metadata.kind === 'type';
    }
    return false;
}
export const EditSources = {
    unknown(data) {
        return createEditSource({
            source: 'unknown',
            name: data.name,
        });
    },
    rename: (oldName, newName) => createEditSource({ source: 'rename', $$$oldName: oldName, $$$newName: newName }),
    chatApplyEdits(data) {
        return createEditSource({
            source: 'Chat.applyEdits',
            $modelId: avoidPathRedaction(data.modelId),
            $extensionId: data.extensionId?.extensionId,
            $extensionVersion: data.extensionId?.version,
            $$languageId: data.languageId,
            $$sessionId: data.sessionId,
            $$requestId: data.requestId,
            $$mode: data.mode,
            $$codeBlockSuggestionId: data.codeBlockSuggestionId,
        });
    },
    chatUndoEdits: () => createEditSource({ source: 'Chat.undoEdits' }),
    chatReset: () => createEditSource({ source: 'Chat.reset' }),
    inlineCompletionAccept(data) {
        return createEditSource({
            source: 'inlineCompletionAccept',
            $nes: data.nes,
            ...toProperties(data.providerId),
            $$correlationId: data.correlationId,
            $$requestUuid: data.requestUuid,
            $$languageId: data.languageId,
        });
    },
    inlineCompletionPartialAccept(data) {
        return createEditSource({
            source: 'inlineCompletionPartialAccept',
            type: data.type,
            $nes: data.nes,
            ...toProperties(data.providerId),
            $$correlationId: data.correlationId,
            $$requestUuid: data.requestUuid,
            $$languageId: data.languageId,
        });
    },
    inlineChatApplyEdit(data) {
        return createEditSource({
            source: 'inlineChat.applyEdits',
            $modelId: avoidPathRedaction(data.modelId),
            $extensionId: data.extensionId?.extensionId,
            $extensionVersion: data.extensionId?.version,
            $$sessionId: data.sessionId,
            $$requestId: data.requestId,
            $$languageId: data.languageId,
        });
    },
    reloadFromDisk: () => createEditSource({ source: 'reloadFromDisk' }),
    cursor(data) {
        return createEditSource({
            source: 'cursor',
            kind: data.kind,
            detailedSource: data.detailedSource,
        });
    },
    setValue: () => createEditSource({ source: 'setValue' }),
    eolChange: () => createEditSource({ source: 'eolChange' }),
    applyEdits: () => createEditSource({ source: 'applyEdits' }),
    snippet: () => createEditSource({ source: 'snippet' }),
    suggest: (data) => createEditSource({ source: 'suggest', ...toProperties(data.providerId) }),
    codeAction: (data) => createEditSource({ source: 'codeAction', $kind: data.kind, ...toProperties(data.providerId) })
};
function toProperties(version) {
    if (!version) {
        return {};
    }
    return {
        $extensionId: version.extensionId,
        $extensionVersion: version.extensionVersion,
        $providerId: version.providerId,
    };
}
function avoidPathRedaction(str) {
    if (str === undefined) {
        return undefined;
    }
    // To avoid false-positive file path redaction.
    return str.replaceAll('/', '|');
}
export class EditDeltaInfo {
    static fromText(text) {
        const linesAdded = TextLength.ofText(text).lineCount;
        const charsAdded = text.length;
        return new EditDeltaInfo(linesAdded, 0, charsAdded, 0);
    }
    /** @internal */
    static fromEdit(edit, originalString) {
        const lineEdit = LineEdit.fromStringEdit(edit, originalString);
        const linesAdded = sumBy(lineEdit.replacements, r => r.newLines.length);
        const linesRemoved = sumBy(lineEdit.replacements, r => r.lineRange.length);
        const charsAdded = sumBy(edit.replacements, r => r.getNewLength());
        const charsRemoved = sumBy(edit.replacements, r => r.replaceRange.length);
        return new EditDeltaInfo(linesAdded, linesRemoved, charsAdded, charsRemoved);
    }
    static tryCreate(linesAdded, linesRemoved, charsAdded, charsRemoved) {
        if (linesAdded === undefined || linesRemoved === undefined || charsAdded === undefined || charsRemoved === undefined) {
            return undefined;
        }
        return new EditDeltaInfo(linesAdded, linesRemoved, charsAdded, charsRemoved);
    }
    constructor(linesAdded, linesRemoved, charsAdded, charsRemoved) {
        this.linesAdded = linesAdded;
        this.linesRemoved = linesRemoved;
        this.charsAdded = charsAdded;
        this.charsRemoved = charsRemoved;
    }
}
export var EditSuggestionId;
(function (EditSuggestionId) {
    /**
     * Use AiEditTelemetryServiceImpl to create a new id!
    */
    function newId(genPrefixedUuid) {
        const id = genPrefixedUuid ? genPrefixedUuid('sgt') : prefixedUuid('sgt');
        return toEditIdentity(id);
    }
    EditSuggestionId.newId = newId;
})(EditSuggestionId || (EditSuggestionId = {}));
function toEditIdentity(id) {
    return id;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsRWRpdFNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUdwRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFHdkQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFFcEQsTUFBTSxPQUFPLG1CQUFtQjtJQUMvQixZQUNpQixRQUFzQyxFQUN0RCxpQkFBdUM7UUFEdkIsYUFBUSxHQUFSLFFBQVEsQ0FBOEI7SUFFbkQsQ0FBQztJQUVFLFFBQVE7UUFDZCxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRU0sT0FBTztRQUNiLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDL0IsUUFBUSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDekIsS0FBSyxRQUFRO2dCQUNaLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQztZQUN0QixLQUFLLHdCQUF3QjtnQkFDNUIsT0FBTyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4RCxLQUFLLFNBQVM7Z0JBQ2IsT0FBTyxRQUFRLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQztZQUNuQztnQkFDQyxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDekIsQ0FBQztJQUNGLENBQUM7SUFFRDs7O01BR0U7SUFDSyxLQUFLLENBQUMsS0FBYSxFQUFFLFNBQW1FLEVBQUU7UUFDaEcsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUMvQixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUU7WUFDN0QsTUFBTSxTQUFTLEdBQUksTUFBa0MsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMzRCxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDcEQsT0FBTyxXQUFXLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxTQUFTLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssRUFBRSxDQUFDO1FBQ3RGLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBVyxLQUFLO1FBQ2YsdUZBQXVGO1FBQ3ZGLE9BQU8sSUFBSSxDQUFDLFFBQWUsQ0FBQztJQUM3QixDQUFDO0NBQ0Q7QUFNRCw4REFBOEQ7QUFDOUQsU0FBUyxnQkFBZ0IsQ0FBZ0MsUUFBVztJQUNuRSx1RkFBdUY7SUFDdkYsT0FBTyxJQUFJLG1CQUFtQixDQUFDLFFBQWUsRUFBRSxhQUFhLENBQVEsQ0FBQztBQUN2RSxDQUFDO0FBRUQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxNQUEyQjtJQUNuRCxRQUFRLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDaEMsS0FBSyx3QkFBd0IsQ0FBQztRQUM5QixLQUFLLCtCQUErQixDQUFDO1FBQ3JDLEtBQUssdUJBQXVCLENBQUM7UUFDN0IsS0FBSyxpQkFBaUI7WUFDckIsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsTUFBTSxVQUFVLFVBQVUsQ0FBQyxNQUEyQjtJQUNyRCxRQUFRLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDaEMsS0FBSyxRQUFRO1lBQ1osT0FBTyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUM7SUFDekMsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRztJQUMxQixPQUFPLENBQUMsSUFBOEI7UUFDckMsT0FBTyxnQkFBZ0IsQ0FBQztZQUN2QixNQUFNLEVBQUUsU0FBUztZQUNqQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7U0FDTixDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTSxFQUFFLENBQUMsT0FBMkIsRUFBRSxPQUFlLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQVcsQ0FBQztJQUVuSixjQUFjLENBQUMsSUFRZDtRQUNBLE9BQU8sZ0JBQWdCLENBQUM7WUFDdkIsTUFBTSxFQUFFLGlCQUFpQjtZQUN6QixRQUFRLEVBQUUsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztZQUMxQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxXQUFXO1lBQzNDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsT0FBTztZQUM1QyxZQUFZLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDN0IsV0FBVyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQzNCLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUztZQUMzQixNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDakIsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQjtTQUMxQyxDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsYUFBYSxFQUFFLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFXLENBQUM7SUFDNUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBVyxDQUFDO0lBRXBFLHNCQUFzQixDQUFDLElBQTJIO1FBQ2pKLE9BQU8sZ0JBQWdCLENBQUM7WUFDdkIsTUFBTSxFQUFFLHdCQUF3QjtZQUNoQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDZCxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1lBQ2hDLGVBQWUsRUFBRSxJQUFJLENBQUMsYUFBYTtZQUNuQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDL0IsWUFBWSxFQUFFLElBQUksQ0FBQyxVQUFVO1NBQ3BCLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCw2QkFBNkIsQ0FBQyxJQUFrSjtRQUMvSyxPQUFPLGdCQUFnQixDQUFDO1lBQ3ZCLE1BQU0sRUFBRSwrQkFBK0I7WUFDdkMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2QsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUNoQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDbkMsYUFBYSxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQy9CLFlBQVksRUFBRSxJQUFJLENBQUMsVUFBVTtTQUNwQixDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsbUJBQW1CLENBQUMsSUFBc0s7UUFDekwsT0FBTyxnQkFBZ0IsQ0FBQztZQUN2QixNQUFNLEVBQUUsdUJBQXVCO1lBQy9CLFFBQVEsRUFBRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1lBQzFDLFlBQVksRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLFdBQVc7WUFDM0MsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPO1lBQzVDLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUztZQUMzQixXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDM0IsWUFBWSxFQUFFLElBQUksQ0FBQyxVQUFVO1NBQ3BCLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQVcsQ0FBQztJQUU3RSxNQUFNLENBQUMsSUFBc0o7UUFDNUosT0FBTyxnQkFBZ0IsQ0FBQztZQUN2QixNQUFNLEVBQUUsUUFBUTtZQUNoQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWM7U0FDMUIsQ0FBQyxDQUFDO0lBQ2IsQ0FBQztJQUVELFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQVcsQ0FBQztJQUNqRSxTQUFTLEVBQUUsR0FBRyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFXLENBQUM7SUFDbkUsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBVyxDQUFDO0lBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQVcsQ0FBQztJQUMvRCxPQUFPLEVBQUUsQ0FBQyxJQUE0QyxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFXLENBQUM7SUFFN0ksVUFBVSxFQUFFLENBQUMsSUFBc0UsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBVyxDQUFDO0NBQy9MLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxPQUErQjtJQUNwRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFDRCxPQUFPO1FBQ04sWUFBWSxFQUFFLE9BQU8sQ0FBQyxXQUFXO1FBQ2pDLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0I7UUFDM0MsV0FBVyxFQUFFLE9BQU8sQ0FBQyxVQUFVO0tBQy9CLENBQUM7QUFDSCxDQUFDO0FBT0QsU0FBUyxrQkFBa0IsQ0FBQyxHQUF1QjtJQUNsRCxJQUFJLEdBQUcsS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUN2QixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsK0NBQStDO0lBQy9DLE9BQU8sR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUdELE1BQU0sT0FBTyxhQUFhO0lBQ2xCLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBWTtRQUNsQyxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNyRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQy9CLE9BQU8sSUFBSSxhQUFhLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELGdCQUFnQjtJQUNULE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBb0IsRUFBRSxjQUEwQjtRQUN0RSxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUMvRCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEUsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzNFLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7UUFDbkUsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFFLE9BQU8sSUFBSSxhQUFhLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVNLE1BQU0sQ0FBQyxTQUFTLENBQ3RCLFVBQThCLEVBQzlCLFlBQWdDLEVBQ2hDLFVBQThCLEVBQzlCLFlBQWdDO1FBRWhDLElBQUksVUFBVSxLQUFLLFNBQVMsSUFBSSxZQUFZLEtBQUssU0FBUyxJQUFJLFVBQVUsS0FBSyxTQUFTLElBQUksWUFBWSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3RILE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksYUFBYSxDQUFDLFVBQVUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFRCxZQUNpQixVQUFrQixFQUNsQixZQUFvQixFQUNwQixVQUFrQixFQUNsQixZQUFvQjtRQUhwQixlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ2xCLGlCQUFZLEdBQVosWUFBWSxDQUFRO1FBQ3BCLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDbEIsaUJBQVksR0FBWixZQUFZLENBQVE7SUFDakMsQ0FBQztDQUNMO0FBVUQsTUFBTSxLQUFXLGdCQUFnQixDQVFoQztBQVJELFdBQWlCLGdCQUFnQjtJQUNoQzs7TUFFRTtJQUNGLFNBQWdCLEtBQUssQ0FBQyxlQUF3QztRQUM3RCxNQUFNLEVBQUUsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFFLE9BQU8sY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFIZSxzQkFBSyxRQUdwQixDQUFBO0FBQ0YsQ0FBQyxFQVJnQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBUWhDO0FBRUQsU0FBUyxjQUFjLENBQUMsRUFBVTtJQUNqQyxPQUFPLEVBQWlDLENBQUM7QUFDMUMsQ0FBQyJ9