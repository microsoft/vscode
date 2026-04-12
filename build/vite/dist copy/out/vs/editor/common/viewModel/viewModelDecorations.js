/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../core/range.js';
import { InlineModelDecorationsComputer } from './inlineDecorations.js';
import { filterFontDecorations, filterValidationDecorations } from '../config/editorOptions.js';
export class ViewModelDecorations {
    constructor(editorId, model, configuration, linesCollection, coordinatesConverter) {
        this.editorId = editorId;
        this.configuration = configuration;
        this._linesCollection = linesCollection;
        const context = {
            getModelDecorations: (viewRange, onlyMinimapDecorations, onlyMarginDecorations) => this._linesCollection.getDecorationsInRange(viewRange, this.editorId, filterValidationDecorations(this.configuration.options), filterFontDecorations(this.configuration.options), onlyMinimapDecorations, onlyMarginDecorations)
        };
        this._inlineDecorationsComputer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        this._cachedModelDecorationsResolver = null;
        this._cachedModelDecorationsResolverViewRange = null;
    }
    _clearCachedModelDecorationsResolver() {
        this._cachedModelDecorationsResolver = null;
        this._cachedModelDecorationsResolverViewRange = null;
    }
    dispose() {
        this._inlineDecorationsComputer.reset();
        this._clearCachedModelDecorationsResolver();
    }
    reset() {
        this._inlineDecorationsComputer.reset();
        this._clearCachedModelDecorationsResolver();
    }
    onModelDecorationsChanged() {
        this._inlineDecorationsComputer.onModelDecorationsChanged();
        this._clearCachedModelDecorationsResolver();
    }
    onLineMappingChanged() {
        this._inlineDecorationsComputer.onLineMappingChanged();
        this._clearCachedModelDecorationsResolver();
    }
    getMinimapDecorationsInRange(range) {
        return this._inlineDecorationsComputer.getDecorations(range, true, false).decorations;
    }
    getDecorationsViewportData(viewRange) {
        let cacheIsValid = (this._cachedModelDecorationsResolver !== null);
        cacheIsValid = cacheIsValid && (viewRange.equalsRange(this._cachedModelDecorationsResolverViewRange));
        if (!cacheIsValid) {
            this._cachedModelDecorationsResolver = this._inlineDecorationsComputer.getDecorations(viewRange, false, false);
            this._cachedModelDecorationsResolverViewRange = viewRange;
        }
        return this._cachedModelDecorationsResolver;
    }
    getDecorationsOnLine(lineNumber, onlyMinimapDecorations = false, onlyMarginDecorations = false) {
        const range = new Range(lineNumber, this._linesCollection.getViewLineMinColumn(lineNumber), lineNumber, this._linesCollection.getViewLineMaxColumn(lineNumber));
        return this._inlineDecorationsComputer.getDecorations(range, onlyMinimapDecorations, onlyMarginDecorations);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld01vZGVsRGVjb3JhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFLekMsT0FBTyxFQUFzRSw4QkFBOEIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTVJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRWhHLE1BQU0sT0FBTyxvQkFBb0I7SUFXaEMsWUFBWSxRQUFnQixFQUFFLEtBQWlCLEVBQUUsYUFBbUMsRUFBRSxlQUFnQyxFQUFFLG9CQUEyQztRQUNsSyxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQztRQUNuQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO1FBQ3hDLE1BQU0sT0FBTyxHQUEyQztZQUN2RCxtQkFBbUIsRUFBRSxDQUFDLFNBQWdCLEVBQUUsc0JBQStCLEVBQUUscUJBQThCLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSwyQkFBMkIsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxFQUFFLHFCQUFxQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLENBQUM7U0FDNVUsQ0FBQztRQUNGLElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLDhCQUE4QixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUMzRyxJQUFJLENBQUMsK0JBQStCLEdBQUcsSUFBSSxDQUFDO1FBQzVDLElBQUksQ0FBQyx3Q0FBd0MsR0FBRyxJQUFJLENBQUM7SUFDdEQsQ0FBQztJQUVPLG9DQUFvQztRQUMzQyxJQUFJLENBQUMsK0JBQStCLEdBQUcsSUFBSSxDQUFDO1FBQzVDLElBQUksQ0FBQyx3Q0FBd0MsR0FBRyxJQUFJLENBQUM7SUFDdEQsQ0FBQztJQUVNLE9BQU87UUFDYixJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDeEMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUVNLEtBQUs7UUFDWCxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDeEMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUVNLHlCQUF5QjtRQUMvQixJQUFJLENBQUMsMEJBQTBCLENBQUMseUJBQXlCLEVBQUUsQ0FBQztRQUM1RCxJQUFJLENBQUMsb0NBQW9DLEVBQUUsQ0FBQztJQUM3QyxDQUFDO0lBRU0sb0JBQW9CO1FBQzFCLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRXZELElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxDQUFDO0lBQzdDLENBQUM7SUFFTSw0QkFBNEIsQ0FBQyxLQUFZO1FBQy9DLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLFdBQVcsQ0FBQztJQUN2RixDQUFDO0lBRU0sMEJBQTBCLENBQUMsU0FBZ0I7UUFDakQsSUFBSSxZQUFZLEdBQUcsQ0FBQyxJQUFJLENBQUMsK0JBQStCLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDbkUsWUFBWSxHQUFHLFlBQVksSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztRQUN0RyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsSUFBSSxDQUFDLCtCQUErQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvRyxJQUFJLENBQUMsd0NBQXdDLEdBQUcsU0FBUyxDQUFDO1FBQzNELENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQywrQkFBZ0MsQ0FBQztJQUM5QyxDQUFDO0lBRU0sb0JBQW9CLENBQUMsVUFBa0IsRUFBRSx5QkFBa0MsS0FBSyxFQUFFLHdCQUFpQyxLQUFLO1FBQzlILE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ2hLLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUM3RyxDQUFDO0NBQ0QifQ==