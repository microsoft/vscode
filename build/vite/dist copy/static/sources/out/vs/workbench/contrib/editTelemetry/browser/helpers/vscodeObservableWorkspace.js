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
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { derived, mapObservableArrayCached, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { offsetEditFromContentChanges } from '../../../../../editor/common/model/textModelStringEdit.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ObservableWorkspace, StringEditWithReason } from './observableWorkspace.js';
let VSCodeWorkspace = class VSCodeWorkspace extends ObservableWorkspace {
    get documents() { return this._documents; }
    constructor(_textModelService) {
        super();
        this._textModelService = _textModelService;
        this._store = new DisposableStore();
        const onModelAdded = observableSignalFromEvent(this, this._textModelService.onModelAdded);
        const onModelRemoved = observableSignalFromEvent(this, this._textModelService.onModelRemoved);
        const models = derived(this, reader => {
            onModelAdded.read(reader);
            onModelRemoved.read(reader);
            const models = this._textModelService.getModels();
            return models;
        });
        const documents = mapObservableArrayCached(this, models, (m, store) => {
            if (m.isTooLargeForSyncing()) {
                return undefined;
            }
            return store.add(new VSCodeDocument(m));
        }).recomputeInitiallyAndOnChange(this._store).map(d => d.filter(isDefined));
        this._documents = documents;
    }
    dispose() {
        this._store.dispose();
    }
};
VSCodeWorkspace = __decorate([
    __param(0, IModelService)
], VSCodeWorkspace);
export { VSCodeWorkspace };
export class VSCodeDocument extends Disposable {
    get uri() { return this.textModel.uri; }
    get value() { return this._value; }
    get version() { return this._version; }
    get languageId() { return this._languageId; }
    constructor(textModel) {
        super();
        this.textModel = textModel;
        this._value = observableValue(this, new StringText(this.textModel.getValue()));
        this._version = observableValue(this, this.textModel.getVersionId());
        this._languageId = observableValue(this, this.textModel.getLanguageId());
        this._register(this.textModel.onDidChangeContent((e) => {
            transaction(tx => {
                const edit = offsetEditFromContentChanges(e.changes);
                if (e.detailedReasons.length !== 1) {
                    onUnexpectedError(new Error(`Unexpected number of detailed reasons: ${e.detailedReasons.length}`));
                }
                const change = new StringEditWithReason(edit.replacements, e.detailedReasons[0]);
                this._value.set(new StringText(this.textModel.getValue()), tx, change);
                this._version.set(this.textModel.getVersionId(), tx);
            });
        }));
        this._register(this.textModel.onDidChangeLanguage(e => {
            transaction(tx => {
                this._languageId.set(this.textModel.getLanguageId(), tx);
            });
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnNjb2RlT2JzZXJ2YWJsZVdvcmtzcGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci9oZWxwZXJzL3ZzY29kZU9ic2VydmFibGVXb3Jrc3BhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFzQyx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDMUwsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUVwRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUF1QixtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRW5HLElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWdCLFNBQVEsbUJBQW1CO0lBRXZELElBQVcsU0FBUyxLQUFLLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFJbEQsWUFDZ0IsaUJBQWlEO1FBRWhFLEtBQUssRUFBRSxDQUFDO1FBRndCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBZTtRQUhoRCxXQUFNLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQU8vQyxNQUFNLFlBQVksR0FBRyx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzFGLE1BQU0sY0FBYyxHQUFHLHlCQUF5QixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFOUYsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRTtZQUNyQyxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFCLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDNUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xELE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLFNBQVMsR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsQ0FBQztnQkFDOUIsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUNELE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFFNUUsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7SUFDN0IsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUM7Q0FDRCxDQUFBO0FBbENZLGVBQWU7SUFPekIsV0FBQSxhQUFhLENBQUE7R0FQSCxlQUFlLENBa0MzQjs7QUFFRCxNQUFNLE9BQU8sY0FBZSxTQUFRLFVBQVU7SUFDN0MsSUFBSSxHQUFHLEtBQVUsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFJN0MsSUFBSSxLQUFLLEtBQThELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDNUYsSUFBSSxPQUFPLEtBQTBCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDNUQsSUFBSSxVQUFVLEtBQTBCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFFbEUsWUFDaUIsU0FBcUI7UUFFckMsS0FBSyxFQUFFLENBQUM7UUFGUSxjQUFTLEdBQVQsU0FBUyxDQUFZO1FBSXJDLElBQUksQ0FBQyxNQUFNLEdBQUcsZUFBZSxDQUFtQyxJQUFJLEVBQUUsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakgsSUFBSSxDQUFDLFFBQVEsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsV0FBVyxHQUFHLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBRXpFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3RELFdBQVcsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDaEIsTUFBTSxJQUFJLEdBQUcsNEJBQTRCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRCxJQUFJLENBQUMsQ0FBQyxlQUFlLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNwQyxpQkFBaUIsQ0FBQyxJQUFJLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BHLENBQUM7Z0JBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFakYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDdkUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN0RCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDckQsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUNoQixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzFELENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRCJ9