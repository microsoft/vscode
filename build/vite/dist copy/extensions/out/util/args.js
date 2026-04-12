"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageServiceMode = void 0;
exports.hasArgument = hasArgument;
exports.findArgument = findArgument;
exports.findArgumentStringArray = findArgumentStringArray;
exports.parseServerMode = parseServerMode;
function hasArgument(args, name) {
    return args.indexOf(name) >= 0;
}
function findArgument(args, name) {
    const index = args.indexOf(name);
    return 0 <= index && index < args.length - 1
        ? args[index + 1]
        : undefined;
}
function findArgumentStringArray(args, name) {
    const arg = findArgument(args, name);
    return arg === undefined ? [] : arg.split(',').filter(name => name !== '');
}
/**
 * Copied from `ts.LanguageServiceMode` to avoid direct dependency.
 */
var LanguageServiceMode;
(function (LanguageServiceMode) {
    LanguageServiceMode[LanguageServiceMode["Semantic"] = 0] = "Semantic";
    LanguageServiceMode[LanguageServiceMode["PartialSemantic"] = 1] = "PartialSemantic";
    LanguageServiceMode[LanguageServiceMode["Syntactic"] = 2] = "Syntactic";
})(LanguageServiceMode || (exports.LanguageServiceMode = LanguageServiceMode = {}));
function parseServerMode(args) {
    const mode = findArgument(args, '--serverMode');
    if (!mode) {
        return undefined;
    }
    switch (mode.toLowerCase()) {
        case 'semantic': return LanguageServiceMode.Semantic;
        case 'partialsemantic': return LanguageServiceMode.PartialSemantic;
        case 'syntactic': return LanguageServiceMode.Syntactic;
        default: return mode;
    }
}
//# sourceMappingURL=args.js.map