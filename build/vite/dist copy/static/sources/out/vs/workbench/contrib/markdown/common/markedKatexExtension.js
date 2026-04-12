import { htmlAttributeEncodeValue } from '../../../../base/common/strings.js';
export const mathInlineRegExp = /(?<![a-zA-Z0-9])(?<dollars>\${1,2})(?!\.|\(["'])((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\k<dollars>(?![a-zA-Z0-9])/; // Non-standard, but ensure opening $ is not preceded and closing $ is not followed by word/number characters, opening $ not followed by ., (", ('
export const katexContainerClassName = 'vscode-katex-container';
export const katexContainerLatexAttributeName = 'data-latex';
const inlineRule = new RegExp('^' + mathInlineRegExp.source);
export var MarkedKatexExtension;
(function (MarkedKatexExtension) {
    const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;
    function extension(katex, options = {}) {
        return {
            extensions: [
                inlineKatex(options, createRenderer(katex, options, false)),
                blockKatex(options, createRenderer(katex, options, true)),
            ],
        };
    }
    MarkedKatexExtension.extension = extension;
    function createRenderer(katex, options, isBlock) {
        return (token) => {
            let out;
            try {
                const html = katex.renderToString(token.text, {
                    ...options,
                    throwOnError: true,
                    displayMode: token.displayMode,
                });
                // Wrap in a container with attribute as a fallback for extracting the original LaTeX source
                // This ensures we can always retrieve the source even if the annotation element is not present
                out = `<span class="${katexContainerClassName}" ${katexContainerLatexAttributeName}="${htmlAttributeEncodeValue(token.text)}">${html}</span>`;
            }
            catch {
                // On failure, just use the original text including the wrapping $ or $$
                out = token.raw;
            }
            return out + (isBlock ? '\n' : '');
        };
    }
    function inlineKatex(options, renderer) {
        const ruleReg = inlineRule;
        return {
            name: 'inlineKatex',
            level: 'inline',
            start(src) {
                let index;
                let indexSrc = src;
                while (indexSrc) {
                    index = indexSrc.indexOf('$');
                    if (index === -1) {
                        return;
                    }
                    const possibleKatex = indexSrc.substring(index);
                    if (possibleKatex.match(ruleReg)) {
                        return index;
                    }
                    indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
                }
                return;
            },
            tokenizer(src, tokens) {
                const match = src.match(ruleReg);
                if (match) {
                    return {
                        type: 'inlineKatex',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2,
                    };
                }
                return;
            },
            renderer,
        };
    }
    function blockKatex(options, renderer) {
        return {
            name: 'blockKatex',
            level: 'block',
            start(src) {
                return src.match(new RegExp(blockRule.source, 'm'))?.index;
            },
            tokenizer(src, tokens) {
                const match = src.match(blockRule);
                if (match) {
                    return {
                        type: 'blockKatex',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2,
                    };
                }
                return;
            },
            renderer,
        };
    }
})(MarkedKatexExtension || (MarkedKatexExtension = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2VkS2F0ZXhFeHRlbnNpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tYXJrZG93bi9jb21tb24vbWFya2VkS2F0ZXhFeHRlbnNpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBS0EsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFOUUsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsZ0hBQWdILENBQUMsQ0FBQyxrSkFBa0o7QUFDcFMsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsd0JBQXdCLENBQUM7QUFDaEUsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsWUFBWSxDQUFDO0FBRTdELE1BQU0sVUFBVSxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUU3RCxNQUFNLEtBQVcsb0JBQW9CLENBcUdwQztBQXJHRCxXQUFpQixvQkFBb0I7SUFPcEMsTUFBTSxTQUFTLEdBQUcsNkNBQTZDLENBQUM7SUFFaEUsU0FBZ0IsU0FBUyxDQUFDLEtBQXFDLEVBQUUsVUFBOEIsRUFBRTtRQUNoRyxPQUFPO1lBQ04sVUFBVSxFQUFFO2dCQUNYLFdBQVcsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQzNELFVBQVUsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDekQ7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQVBlLDhCQUFTLFlBT3hCLENBQUE7SUFFRCxTQUFTLGNBQWMsQ0FBQyxLQUFxQyxFQUFFLE9BQTJCLEVBQUUsT0FBZ0I7UUFDM0csT0FBTyxDQUFDLEtBQTRCLEVBQUUsRUFBRTtZQUN2QyxJQUFJLEdBQVcs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