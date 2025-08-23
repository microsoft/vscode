"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var noBadGDPRComment = {
    create: function (context) {
        var _a;
        return _a = {},
            _a['Program'] = function (node) {
                for (var _i = 0, _a = node.comments; _i < _a.length; _i++) {
                    var comment = _a[_i];
                    if (comment.type !== 'Block' || !comment.loc) {
                        continue;
                    }
                    if (!comment.value.includes('__GDPR__')) {
                        continue;
                    }
                    var dataStart = comment.value.indexOf('\n');
                    var data = comment.value.substring(dataStart);
                    var gdprData = void 0;
                    try {
                        var jsonRaw = "{ ".concat(data, " }");
                        gdprData = JSON.parse(jsonRaw);
                    }
                    catch (e) {
                        context.report({
                            loc: { start: comment.loc.start, end: comment.loc.end },
                            message: 'GDPR comment is not valid JSON',
                        });
                    }
                    if (gdprData) {
                        var len = Object.keys(gdprData).length;
                        if (len !== 1) {
                            context.report({
                                loc: { start: comment.loc.start, end: comment.loc.end },
                                message: "GDPR comment must contain exactly one key, not ".concat(Object.keys(gdprData).join(', ')),
                            });
                        }
                    }
                }
            },
            _a;
    },
};
module.exports = {
    rules: {
        'no-bad-gdpr-comment': noBadGDPRComment, // Ensure correct structure
    },
};
