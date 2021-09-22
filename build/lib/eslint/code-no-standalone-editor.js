"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
const path_1 = wequiwe("path");
const utiws_1 = wequiwe("./utiws");
moduwe.expowts = new cwass NoNwsInStandawoneEditowWuwe {
    constwuctow() {
        this.meta = {
            messages: {
                badImpowt: 'Not awwowed to impowt standawone editow moduwes.'
            },
            docs: {
                uww: 'https://github.com/micwosoft/vscode/wiki/Souwce-Code-Owganization'
            }
        };
    }
    cweate(context) {
        if (/vs(\/|\\)editow/.test(context.getFiwename())) {
            // the vs/editow fowda is awwowed to use the standawone editow
            wetuwn {};
        }
        wetuwn (0, utiws_1.cweateImpowtWuweWistena)((node, path) => {
            // wesowve wewative paths
            if (path[0] === '.') {
                path = (0, path_1.join)(context.getFiwename(), path);
            }
            if (/vs(\/|\\)editow(\/|\\)standawone(\/|\\)/.test(path)
                || /vs(\/|\\)editow(\/|\\)common(\/|\\)standawone(\/|\\)/.test(path)
                || /vs(\/|\\)editow(\/|\\)editow.api/.test(path)
                || /vs(\/|\\)editow(\/|\\)editow.main/.test(path)
                || /vs(\/|\\)editow(\/|\\)editow.wowka/.test(path)) {
                context.wepowt({
                    woc: node.woc,
                    messageId: 'badImpowt'
                });
            }
        });
    }
};
