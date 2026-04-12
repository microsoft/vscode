/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import './blockDecorations.css';
import { ViewPart } from '../../view/viewPart.js';
export class BlockDecorations extends ViewPart {
    constructor(context) {
        super(context);
        this.blocks = [];
        this.contentWidth = -1;
        this.contentLeft = 0;
        this.domNode = createFastDomNode(document.createElement('div'));
        this.domNode.setAttribute('role', 'presentation');
        this.domNode.setAttribute('aria-hidden', 'true');
        this.domNode.setClassName('blockDecorations-container');
        this.update();
    }
    update() {
        let didChange = false;
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const newContentWidth = layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth;
        if (this.contentWidth !== newContentWidth) {
            this.contentWidth = newContentWidth;
            didChange = true;
        }
        const newContentLeft = layoutInfo.contentLeft;
        if (this.contentLeft !== newContentLeft) {
            this.contentLeft = newContentLeft;
            didChange = true;
        }
        return didChange;
    }
    dispose() {
        super.dispose();
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        return this.update();
    }
    onScrollChanged(e) {
        return e.scrollTopChanged || e.scrollLeftChanged;
    }
    onDecorationsChanged(e) {
        return true;
    }
    onZonesChanged(e) {
        return true;
    }
    // --- end event handlers
    prepareRender(ctx) {
        // Nothing to read
    }
    render(ctx) {
        let count = 0;
        const decorations = ctx.getDecorationsInViewport();
        for (const decoration of decorations) {
            if (!decoration.options.blockClassName) {
                continue;
            }
            let block = this.blocks[count];
            if (!block) {
                block = this.blocks[count] = createFastDomNode(document.createElement('div'));
                this.domNode.appendChild(block);
            }
            let top;
            let bottom;
            if (decoration.options.blockIsAfterEnd) {
                // range must be empty
                top = ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, false);
                bottom = ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, true);
            }
            else {
                top = ctx.getVerticalOffsetForLineNumber(decoration.range.startLineNumber, true);
                bottom = decoration.range.isEmpty() && !decoration.options.blockDoesNotCollapse
                    ? ctx.getVerticalOffsetForLineNumber(decoration.range.startLineNumber, false)
                    : ctx.getVerticalOffsetAfterLineNumber(decoration.range.endLineNumber, true);
            }
            const [paddingTop, paddingRight, paddingBottom, paddingLeft] = decoration.options.blockPadding ?? [0, 0, 0, 0];
            block.setClassName('blockDecorations-block ' + decoration.options.blockClassName);
            block.setLeft(this.contentLeft - paddingLeft);
            block.setWidth(this.contentWidth + paddingLeft + paddingRight);
            block.setTop(top - ctx.scrollTop - paddingTop);
            block.setHeight(bottom - top + paddingTop + paddingBottom);
            count++;
        }
        for (let i = count; i < this.blocks.length; i++) {
            this.blocks[i].domNode.remove();
        }
        this.blocks.length = count;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvY2tEZWNvcmF0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9ibG9ja0RlY29yYXRpb25zL2Jsb2NrRGVjb3JhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDekYsT0FBTyx3QkFBd0IsQ0FBQztBQUVoQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFLbEQsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFFBQVE7SUFTN0MsWUFBWSxPQUFvQjtRQUMvQixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFOQyxXQUFNLEdBQStCLEVBQUUsQ0FBQztRQUVqRCxpQkFBWSxHQUFXLENBQUMsQ0FBQyxDQUFDO1FBQzFCLGdCQUFXLEdBQVcsQ0FBQyxDQUFDO1FBSy9CLElBQUksQ0FBQyxPQUFPLEdBQUcsaUJBQWlCLENBQWMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzdFLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUV4RCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDZixDQUFDO0lBRU8sTUFBTTtRQUNiLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN0QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7UUFDcEQsTUFBTSxVQUFV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