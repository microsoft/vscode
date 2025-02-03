import { EditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';
import { IDiffComputationResult, IEditorWorkerService, IUnicodeHighlightsResult } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';

let x: [IEditorWorkerService, EditorSimpleWorker, IModelService, IUnicodeHighlightsResult];
let y: IDiffComputationResult;