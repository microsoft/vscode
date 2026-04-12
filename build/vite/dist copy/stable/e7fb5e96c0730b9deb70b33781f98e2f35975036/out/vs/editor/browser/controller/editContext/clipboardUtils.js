import { isWindows } from '../../../../base/common/platform.js';
import { Mimes } from '../../../../base/common/mime.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { toExternalVSDataTransfer } from '../../dataTransfer.js';
export function generateDataToCopyAndStoreInMemory(viewModel, id, isFirefox) {
    const { dataToCopy, metadata } = generateDataToCopy(viewModel);
    storeMetadataInMemory(dataToCopy.text, metadata, isFirefox);
    return { dataToCopy, metadata };
}
function storeMetadataInMemory(textToCopy, metadata, isFirefox) {
    InMemoryClipboardMetadataManager.INSTANCE.set(
    // When writing "LINE\r\n" to the clipboard and then pasting,
    // Firefox pastes "LINE\n", so let's work around this quirk
    (isFirefox ? textToCopy.replace(/\r\n/g, '\n') : textToCopy), metadata);
}
function generateDataToCopy(viewModel) {
    const emptySelectionClipboard = viewModel.getEditorOption(45 /* EditorOption.emptySelectionClipboard */);
    const copyWithSyntaxHighlighting = viewModel.getEditorOption(31 /* EditorOption.copyWithSyntaxHighlighting */);
    const selections = viewModel.getCursorStates().map(cursorState => cursorState.modelState.selection);
    const dataToCopy = getDataToCopy(viewModel, selections, emptySelectionClipboard, copyWithSyntaxHighlighting);
    const metadata = {
        version: 1,
        id: generateUuid(),
        isFromEmptySelection: dataToCopy.isFromEmptySelection,
        multicursorText: dataToCopy.multicursorText,
        mode: dataToCopy.mode
    };
    return { dataToCopy, metadata };
}
function getDataToCopy(viewModel, modelSelections, emptySelectionClipboard, copyWithSyntaxHighlighting) {
    const { sourceRanges, sourceText } = viewModel.getPlainTextToCopy(modelSelections, emptySelectionClipboard, isWindows);
    const newLineCharacter = viewModel.model.getEOL();
    const isFromEmptySelection = (emptySelectionClipboard && modelSelections.length === 1 && modelSelections[0].isEmpty());
    const multicursorText = (Array.isArray(sourceText) ? sourceText : null);
    const text = (Array.isArray(sourceText) ? sourceText.join(newLineCharacter) : sourceText);
    let html = undefined;
    let mode = null;
    if (CopyOptions.forceCopyWithSyntaxHighlighting || (copyWithSyntaxHighlighting && sourceText.length < 65536)) {
        const richText = viewModel.getRichTextToCopy(modelSelections, emptySelectionClipboard);
        if (richText) {
            html = richText.html;
            mode = richText.mode;
        }
    }
    const dataToCopy = {
        isFromEmptySelection,
        sourceRanges,
        multicursorText,
        text,
        html,
        mode
    };
    return dataToCopy;
}
/**
 * Every time we write to the clipboard, we record a bit of extra metadata here.
 * Every time we read from the cipboard, if the text matches our last written text,
 * we can fetch the previous metadata.
 */
export class InMemoryClipboardMetadataManager {
    static { this.INSTANCE = new InMemoryClipboardMetadataManager(); }
    constructor() {
        this._lastState = null;
    }
    set(lastCopiedValue, data) {
        this._lastState = { lastCopiedValue, data };
    }
    get(pastedText) {
        if (this._lastState && this._lastState.lastCopiedValue === pastedText) {
            // match!
            return this._lastState.data;
        }
        this._lastState = null;
        return null;
    }
}
export const CopyOptions = {
    forceCopyWithSyntaxHighlighting: false,
    electronBugWorkaroundCopyEventHasFired: false
};
const ClipboardEventUtils = {
    getTextData(clipboardData) {
        const text = clipboardData.getData(Mimes.text);
        let metadata = null;
        const rawmetadata = clipboardData.getData('vscode-editor-data');
        if (typeof rawmetadata === 'string') {
            try {
                metadata = JSON.parse(rawmetadata);
                if (metadata.version !== 1) {
                    metadata = null;
                }
            }
            catch (err) {
                // no problem!
            }
        }
        if (text.length === 0 && metadata === null && clipboardData.files.length > 0) {
            // no textual data pasted, generate text from file names
            const files = Array.prototype.slice.call(clipboardData.files, 0);
            return [files.map(file => file.name).join('\n'), null];
        }
        return [text, metadata];
    },
    setTextData(clipboardData, text, html, metadata) {
        clipboardData.setData(Mimes.text, text);
        if (typeof html === 'string') {
            clipboardData.setData('text/html', html);
        }
        clipboardData.setData('vscode-editor-data', JSON.stringify(metadata));
    }
};
/**
 * Creates an IClipboardCopyEvent from a DOM ClipboardEvent.
 */
export function createClipboardCopyEvent(e, isCut, context, logService, isFirefox) {
    const { dataToCopy, metadata } = generateDataToCopy(context.viewModel);
    let handled = false;
    return {
        isCut,
        clipboardData: {
            setData: (type, value) => {
                e.clipboardData?.setData(type, value);
            },
        },
        dataToCopy,
        ensureClipboardGetsEditorData: () => {
            e.preventDefault();
            if (e.clipboardData) {
                ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, metadata);
            }
            storeMetadataInMemory(dataToCopy.text, metadata, isFirefox);
            logService.trace('ensureClipboardGetsEditorSelection with id : ', metadata.id, ' with text.length: ', dataToCopy.text.length);
        },
        setHandled: () => {
            handled = true;
            e.preventDefault();
            e.stopImmediatePropagation();
        },
        get isHandled() { return handled; },
    };
}
/**
 * Creates an IClipboardPasteEvent from a DOM ClipboardEvent.
 */
export function createClipboardPasteEvent(e) {
    let handled = false;
    let [text, metadata] = e.clipboardData ? ClipboardEventUtils.getTextData(e.clipboardData) : ['', null];
    metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
    return {
        clipboardData: createReadableClipboardData(e.clipboardData),
        metadata,
        text,
        toExternalVSDataTransfer: () => e.clipboardData ? toExternalVSDataTransfer(e.clipboardData) : undefined,
        browserEvent: e,
        setHandled: () => {
            handled = true;
            e.preventDefault();
            e.stopImmediatePropagation();
        },
        get isHandled() { return handled; },
    };
}
export function createReadableClipboardData(dataTransfer) {
    return {
        types: Array.from(dataTransfer?.types ?? []),
        files: Array.prototype.slice.call(dataTransfer?.files ?? [], 0),
        getData: (type) => dataTransfer?.getData(type) ?? '',
    };
}
export function createWritableClipboardData(dataTransfer) {
    return {
        setData: (type, value) => dataTransfer?.setData(type, value),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpcGJvYXJkVXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L2NsaXBib2FyZFV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQU1BLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFJeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWpFLE1BQU0sVUFBVSxrQ0FBa0MsQ0FBQyxTQUFxQixFQUFFLEVBQXNCLEVBQUUsU0FBa0I7SUFDbkgsTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUMvRCxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQ2pDLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLFVBQWtCLEVBQUUsUUFBaUMsRUFBRSxTQUFrQjtJQUN2RyxnQ0FBZ0MsQ0FBQyxRQUFRLENBQUMsR0FBRztJQUM1Qyw2REFBNkQ7SUFDN0QsMkRBQTJEO0lBQzNELENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQzVELFFBQVEsQ0FDUixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsU0FBcUI7SUFDaEQsTUFBTSx1QkFBdUIsR0FBRyxTQUFTLENBQUMs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