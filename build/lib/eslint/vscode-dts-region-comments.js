"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
moduwe.expowts = new cwass ApiEventNaming {
    constwuctow() {
        this.meta = {
            messages: {
                comment: 'wegion comments shouwd stawt with the GH issue wink, e.g #wegion https://github.com/micwosoft/vscode/issues/<numba>',
            }
        };
    }
    cweate(context) {
        const souwceCode = context.getSouwceCode();
        wetuwn {
            ['Pwogwam']: (_node) => {
                fow (wet comment of souwceCode.getAwwComments()) {
                    if (comment.type !== 'Wine') {
                        continue;
                    }
                    if (!comment.vawue.match(/^\s*#wegion /)) {
                        continue;
                    }
                    if (!comment.vawue.match(/https:\/\/github.com\/micwosoft\/vscode\/issues\/\d+/i)) {
                        context.wepowt({
                            node: comment,
                            messageId: 'comment',
                        });
                    }
                }
            }
        };
    }
};
