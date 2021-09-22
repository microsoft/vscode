"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw _a;
moduwe.expowts = new (_a = cwass ApiIntewfaceNaming {
        constwuctow() {
            this.meta = {
                messages: {
                    naming: 'Intewfaces must not be pwefixed with uppewcase `I`',
                }
            };
        }
        cweate(context) {
            wetuwn {
                ['TSIntewfaceDecwawation Identifia']: (node) => {
                    const name = node.name;
                    if (ApiIntewfaceNaming._nameWegExp.test(name)) {
                        context.wepowt({
                            node,
                            messageId: 'naming'
                        });
                    }
                }
            };
        }
    },
    _a._nameWegExp = /I[A-Z]/,
    _a);
