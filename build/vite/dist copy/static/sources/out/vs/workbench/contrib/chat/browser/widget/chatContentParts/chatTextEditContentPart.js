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
import * as dom from '../../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, RefCountedDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { assertType } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { DefaultModelSHA1Computer } from '../../../../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../../nls.js';
import { registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { isResponseVM } from '../../../common/model/chatViewModel.js';
const $ = dom.$;
const ICodeCompareModelService = createDecorator('ICodeCompareModelService');
let ChatTextEditContentPart = class ChatTextEditContentPart extends Disposable {
    constructor(chatTextEdit, context, rendererOptions, diffEditorPool, currentWidth, codeCompareModelService) {
        super();
        this.codeCompareModelService = codeCompareModelService;
        const element = context.element;
        assertType(isResponseVM(element));
        // TODO@jrieken move this into the CompareCodeBlock and properly say what kind of changes happen
        if (rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
            if (element.response.value.every(item => item.kind === 'textEditGroup')) {
                this.domNode = $('.interactive-edits-summary', undefined, !element.isComplete
                    ? ''
                    : element.isCanceled
                        ? localize('edits0', "Making changes was aborted.")
                        : localize('editsSummary', "Made changes."));
            }
            else {
                this.domNode = $('div');
            }
            // TODO@roblourens this case is now handled outside this Part in ChatListRenderer, but can it be cleaned up?
            // return;
        }
        else {
            const cts = new CancellationTokenSource();
            let isDisposed = false;
            this._register(toDisposable(() => {
                isDisposed = true;
                cts.dispose(true);
            }));
            this.comparePart = this._register(diffEditorPool.get());
            const data = {
                element,
                edit: chatTextEdit,
                diffData: (async () => {
                    const ref = await this.codeCompareModelService.createModel(element, chatTextEdit);
                    if (isDisposed) {
                        ref.dispose();
                        return;
                    }
                    this._register(ref);
                    return {
                        modified: ref.object.modified.textEditorModel,
                        original: ref.object.original.textEditorModel,
                        originalSha1: ref.object.originalSha1
                    };
                })()
            };
            this.comparePart.object.render(data, currentWidth, cts.token);
            this.domNode = this.comparePart.object.element;
        }
    }
    layout(width) {
        this.comparePart?.object.layout(width);
    }
    hasSameContent(other) {
        // No other change allowed for this content type
        return other.kind === 'textEditGroup';
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
};
ChatTextEditContentPart = __decorate([
    __param(5, ICodeCompareModelService)
], ChatTextEditContentPart);
export { ChatTextEditContentPart };
let CodeCompareModelService = class CodeCompareModelService {
    constructor(textModelService, modelService, chatService) {
        this.textModelService = textModelService;
        this.modelService = modelService;
        this.chatService = chatService;
    }
    async createModel(element, chatTextEdit) {
        const original = await this.textModelService.createModelReference(chatTextEdit.uri);
        const modified = await this.textModelService.createModelReference((this.modelService.createModel(createTextBufferFactoryFromSnapshot(original.object.textEditorModel.createSnapshot()), { languageId: original.object.textEditorModel.getLanguageId(), onDidChange: Event.None }, URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: chatTextEdit.uri.path, query: generateUuid() }), false)).uri);
        const d = new RefCountedDisposable(toDisposable(() => {
            original.dispose();
            modified.dispose();
        }));
        // compute the sha1 of the original model
        let originalSha1 = '';
        if (chatTextEdit.state) {
            originalSha1 = chatTextEdit.state.sha1;
        }
        else {
            const sha1 = new DefaultModelSHA1Computer();
            if (sha1.canComputeSHA1(original.object.textEditorModel)) {
                originalSha1 = sha1.computeSHA1(original.object.textEditorModel);
                chatTextEdit.state = { sha1: originalSha1, applied: 0 };
            }
        }
        // apply edits to the "modified" model
        const chatModel = this.chatService.getSession(element.sessionResource);
        const editGroups = [];
        for (const request of chatModel.getRequests()) {
            if (!request.response) {
                continue;
            }
            for (const item of request.response.response.value) {
                if (item.kind !== 'textEditGroup' || item.state?.applied || !isEqual(item.uri, chatTextEdit.uri)) {
                    continue;
                }
                for (const group of item.edits) {
                    const edits = group.map(TextEdit.asEditOperation);
                    editGroups.push(edits);
                }
            }
            if (request.response === element.model) {
                break;
            }
        }
        for (const edits of editGroups) {
            modified.object.textEditorModel.pushEditOperations(null, edits, () => null);
        }
        // self-acquire a reference to diff models for a short while
        // because streaming usually means we will be using the original-model
        // repeatedly and thereby also should reuse the modified-model and just
        // update it with more edits
        d.acquire();
        setTimeout(() => d.release(), 5000);
        return {
            object: {
                originalSha1,
                original: original.object,
                modified: modified.object
            },
            dispose() {
                d.release();
            },
        };
    }
};
CodeCompareModelService = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService),
    __param(2, IChatService)
], CodeCompareModelService);
registerSingleton(ICodeCompareModelService, CodeCompareModelService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRleHRFZGl0Q29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFRleHRFZGl0Q29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBMkIsb0JBQW9CLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDekcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3BHLE9BQU8sRUFBNEIsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUMxSCxPQUFPLEVBQUUsUUFBUSxF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