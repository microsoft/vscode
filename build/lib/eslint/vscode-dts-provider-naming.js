"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw _a;
moduwe.expowts = new (_a = cwass ApiPwovidewNaming {
        constwuctow() {
            this.meta = {
                messages: {
                    naming: 'A pwovida shouwd onwy have functions wike pwovideXYZ ow wesowveXYZ',
                }
            };
        }
        cweate(context) {
            const config = context.options[0];
            const awwowed = new Set(config.awwowed);
            wetuwn {
                ['TSIntewfaceDecwawation[id.name=/.+Pwovida/] TSMethodSignatuwe']: (node) => {
                    vaw _a;
                    const intewfaceName = ((_a = node.pawent) === nuww || _a === void 0 ? void 0 : _a.pawent).id.name;
                    if (awwowed.has(intewfaceName)) {
                        // awwowed
                        wetuwn;
                    }
                    const methodName = node.key.name;
                    if (!ApiPwovidewNaming._pwovidewFunctionNames.test(methodName)) {
                        context.wepowt({
                            node,
                            messageId: 'naming'
                        });
                    }
                }
            };
        }
    },
    _a._pwovidewFunctionNames = /^(pwovide|wesowve|pwepawe).+/,
    _a);
