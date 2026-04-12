/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { filter } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { NotebookCellTextModel } from '../../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookSetting } from '../../../../notebook/common/notebookCommon.js';
const BufferMarker = 'ArrayBuffer-4f56482b-5a03-49ba-8356-210d3b0c1c3d';
export const ChatEditingNotebookSnapshotScheme = 'chat-editing-notebook-snapshot-model';
export function getNotebookSnapshotFileURI(chatSessionResource, requestId, undoStop, path, viewType) {
    return URI.from({
        scheme: ChatEditingNotebookSnapshotScheme,
        path,
        query: JSON.stringify({ session: chatSessionResource, requestId: requestId ?? '', undoStop: undoStop ?? '', viewType }),
    });
}
export function parseNotebookSnapshotFileURI(resource) {
    const data = JSON.parse(resource.query);
    return { session: data.session, requestId: data.requestId ?? '', undoStop: data.undoStop ?? '', viewType: data.viewType };
}
export function createSnapshot(notebook, transientOptions, outputSizeConfig) {
    const outputSizeLimit = (typeof outputSizeConfig === 'number' ? outputSizeConfig : outputSizeConfig.getValue(NotebookSetting.outputBackupSizeLimit)) * 1024;
    return serializeSnapshot(notebook.createSnapshot({ context: 2 /* SnapshotContext.Backup */, outputSizeLimit, transientOptions }), transientOptions);
}
export function restoreSnapshot(notebook, snapshot) {
    try {
        const { transientOptions, data } = deserializeSnapshot(snapshot);
        notebook.restoreSnapshot(data, transientOptions);
        const edits = [];
        data.cells.forEach((cell, index) => {
            const internalId = cell.internalMetadata?.internalId;
            if (internalId) {
                edits.push({ editType: 9 /* CellEditType.PartialInternalMetadata */, index, internalMetadata: { internalId } });
            }
        });
        notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
    }
    catch (ex) {
        console.error('Error restoring Notebook snapshot', ex);
    }
}
export class SnapshotComparer {
    constructor(initialCotent) {
        const { transientOptions, data } = deserializeSnapshot(initialCotent);
        this.transientOptions = transientOptions;
        this.data = data;
    }
    isEqual(notebook) {
        if (notebook.cells.length !== this.data.cells.length) {
            return false;
        }
        const transientDocumentMetadata = this.transientOptions?.transientDocumentMetadata || {};
        const notebookMetadata = filter(notebook.metadata || {}, key => !transientDocumentMetadata[key]);
        const comparerMetadata = filter(this.data.metadata || {}, key => !transientDocumentMetadata[key]);
        // When comparing ignore transient items.
        if (JSON.stringify(notebookMetadata) !== JSON.stringify(comparerMetadata)) {
            return false;
        }
        const transientCellMetadata = this.transientOptions?.transientCellMetadata || {};
        for (let i = 0; i < notebook.cells.length; i++) {
            const notebookCell = notebook.cells[i];
            const comparerCell = this.data.cells[i];
            if (notebookCell instanceof NotebookCellTextModel) {
                if (!notebookCell.fastEqual(comparerCell, true)) {
                    return false;
                }
            }
            else {
                if (notebookCell.cellKind !== comparerCell.cellKind) {
                    return false;
                }
                if (notebookCell.language !== comparerCell.language) {
                    return false;
                }
                if (notebookCell.mime !== comparerCell.mime) {
                    return false;
                }
                if (notebookCell.source !== comparerCell.source) {
                    return false;
                }
                if (!this.transientOptions?.transientOutputs && notebookCell.outputs.length !== comparerCell.outputs.length) {
                    return false;
                }
                // When comparing ignore transient items.
                const cellMetadata = filter(notebookCell.metadata || {}, key => !transientCellMetadata[key]);
                const comparerCellMetadata = filter(comparerCell.metadata || {}, key => !transientCellMetadata[key]);
                if (JSON.stringify(cellMetadata) !== JSON.stringify(comparerCellMetadata)) {
                    return false;
                }
                // When comparing ignore transient items.
                if (JSON.stringify(sanitizeCellDto2(notebookCell, true, this.transientOptions)) !== JSON.stringify(sanitizeCellDto2(comparerCell, true, this.transientOptions))) {
                    return false;
                }
            }
        }
        return true;
    }
}
function sanitizeCellDto2(cell, ignoreInternalMetadata, transientOptions) {
    const transientCellMetadata = transientOptions?.transientCellMetadata || {};
    const outputs = transientOptions?.transientOutputs ? [] : cell.outputs.map(output => {
        // Ensure we're in full control of the data being stored.
        // Possible we have classes instead of plain objects.
        return {
            outputId: output.outputId,
            metadata: output.metadata,
            outputs: output.outputs.map(item => {
                return {
                    data: item.data,
                    mime: item.mime,
                };
            }),
        };
    });
    // Ensure we're in full control of the data being stored.
    // Possible we have classes instead of plain objects.
    return {
        cellKind: cell.cellKind,
        language: cell.language,
        metadata: cell.metadata ? filter(cell.metadata, key => !transientCellMetadata[key]) : cell.metadata,
        outputs,
        mime: cell.mime,
        source: cell.source,
        collapseState: cell.collapseState,
        internalMetadata: ignoreInternalMetadata ? undefined : cell.internalMetadata
    };
}
function serializeSnapshot(data, transientOptions) {
    const dataDto = {
        // Never pass transient options, as we're after a backup here.
        // Else we end up stripping outputs from backups.
        // Whether its persisted or not is up to the serializer.
        // However when reloading/restoring we need to preserve outputs.
        cells: data.cells.map(cell => sanitizeCellDto2(cell)),
        metadata: data.metadata,
    };
    return JSON.stringify([
        JSON.stringify(transientOptions),
        JSON.stringify(dataDto, (_key, value) => {
            if (value instanceof VSBuffer) {
                return {
                    type: BufferMarker,
                    data: encodeBase64(value)
                };
            }
            return value;
        })
    ]);
}
export function deserializeSnapshot(snapshot) {
    const [transientOptionsStr, dataStr] = JSON.parse(snapshot);
    const transientOptions = transientOptionsStr ? JSON.parse(transientOptionsStr) : undefined;
    const data = JSON.parse(dataStr, (_key, value) => {
        if (value && value.type === BufferMarker) {
            return decodeBase64(value.data);
        }
        return value;
    });
    return { transientOptions, data };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rU25hcHNob3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvbm90ZWJvb2svY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rU25hcHNob3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sc0NBQXNDLENBQUM7QUFHMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFpRyxlQUFlLEVBQW9CLE1BQU0sK0NBQStDLENBQUM7QUFFak0sTUFBTSxZQUFZLEdBQUcsa0RBQWtELENBQUM7QUFHeEUsTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsc0NBQXNDLENBQUM7QUFFeEYsTUFBTSxVQUFVLDBCQUEwQixDQUFDLG1CQUF3QixFQUFFLFNBQTZCLEVBQUUsUUFBNEIsRUFBRSxJQUFZLEVBQUUsUUFBZ0I7SUFDL0osT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ2YsTUFBTSxFQUFFLGlDQUFpQztRQUN6QyxJQUFJO1FBQ0osS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsU0FBUyxFQUFFLFNBQVMsSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLFFBQVEsSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUF3RCxDQUFDO0tBQzdLLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLFVBQVUs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