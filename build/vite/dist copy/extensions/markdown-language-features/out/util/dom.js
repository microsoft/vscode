"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeAttribute = escapeAttribute;
function escapeAttribute(value) {
    return value.toString()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=dom.js.map