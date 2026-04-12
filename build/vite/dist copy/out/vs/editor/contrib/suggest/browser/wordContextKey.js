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
var WordContextKey_1;
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../nls.js';
let WordContextKey = class WordContextKey {
    static { WordContextKey_1 = this; }
    static { this.AtEnd = new RawContextKey('atEndOfWord', false, { type: 'boolean', description: localize('desc', "A context key that is true when at the end of a word. Note that this is only defined when tab-completions are enabled") }); }
    constructor(_editor, contextKeyService) {
        this._editor = _editor;
        this._enabled = false;
        this._ckAtEnd = WordContextKey_1.AtEnd.bindTo(contextKeyService);
        this._configListener = this._editor.onDidChangeConfiguration(e => e.hasChanged(139 /* EditorOption.tabCompletion */) && this._update());
        this._update();
    }
    dispose() {
        this._configListener.dispose();
        this._selectionListener?.dispose();
        this._ckAtEnd.reset();
    }
    _update() {
        // only update this when tab completions are enabled
        const enabled = this._editor.getOption(139 /* EditorOption.tabCompletion */) === 'on';
        if (this._enabled === enabled) {
            return;
        }
        this._enabled = enabled;
        if (this._enabled) {
            const checkForWordEnd = () => {
                if (!this._editor.hasModel()) {
                    this._ckAtEnd.set(false);
                    return;
                }
                const model = this._editor.getModel();
                const selection = this._editor.getSelection();
                const word = model.getWordAtPosition(selection.getStartPosition());
                if (!word) {
                    this._ckAtEnd.set(false);
                    return;
                }
                this._ckAtEnd.set(word.endColumn === selection.getStartPosition().column && selection.getStartPosition().lineNumber === selection.getEndPosition().lineNumber);
            };
            this._selectionListener = this._editor.onDidChangeCursorSelection(checkForWordEnd);
            checkForWordEnd();
        }
        else if (this._selectionListener) {
            this._ckAtEnd.reset();
            this._selectionListener.dispose();
            this._selectionListener = undefined;
        }
    }
};
WordContextKey = WordContextKey_1 = __decorate([
    __param(1, IContextKeyService)
], WordContextKey);
export { WordContextKey };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZENvbnRleHRLZXkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvd29yZENvbnRleHRLZXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBS2hHLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFdkMsSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBYzs7YUFFVixVQUFLLEdBQUcsSUFBSSxhQUFhLENBQVUsYUFBYSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsdUhBQXVILENBQUMsRUFBRSxDQUFDLEFBQWhPLENBQWlPO0lBUXRQLFlBQ2tCLE9BQW9CLEVBQ2pCLGlCQUFxQztRQUR4QyxZQUFPLEdBQVAsT0FBTyxDQUFhO1FBSjlCLGFBQVEsR0FBWSxLQUFLLENBQUM7UUFRakMsSUFBSSxDQUFDLFFBQVEsR0FBRyxnQkFBYyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxzQ0FBNEIsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUM5SCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFTyxPQUFPO1FBQ2Qsb0RBQW9EO1FBQ3BELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxzQ0FBNEIsS0FBSyxJQUFJLENBQUM7UUFDNUUsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQy9CLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFFeEIsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkIsTUFBTSxlQUFlLEdBQUcsR0FBRyxFQUFFO2dCQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO29CQUM5QixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDekIsT0FBTztnQkFDUixDQUFDO2dCQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3RDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQzlDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ1gsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3pCLE9BQU87Z0JBQ1IsQ0FBQztnQkFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxLQUFLLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLE1BQU0sSUFBSSxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxVQUFVLEtBQUssU0FBUyxDQUFDLGNBQWMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2hLLENBQUMsQ0FBQztZQUNGLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ25GLGVBQWUsRUFBRSxDQUFDO1FBRW5CLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxTQUFTLENBQUM7UUFDckMsQ0FBQztJQUNGLENBQUM7O0FBekRXLGNBQWM7SUFZeEIsV0FBQSxrQkFBa0IsQ0FBQTtHQVpSLGNBQWMsQ0EwRDFCIn0=