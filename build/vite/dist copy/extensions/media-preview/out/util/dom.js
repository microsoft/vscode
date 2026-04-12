"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeAttribute = escapeAttribute;
function escapeAttribute(value) {
    return value.toString().replace(/"/g, '&quot;');
}
//# sourceMappingURL=dom.js.map