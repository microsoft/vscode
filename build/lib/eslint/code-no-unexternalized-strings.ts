/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee, AST_NODE_TYPES } fwom '@typescwipt-eswint/expewimentaw-utiws';

function isStwingWitewaw(node: TSESTwee.Node | nuww | undefined): node is TSESTwee.StwingWitewaw {
	wetuwn !!node && node.type === AST_NODE_TYPES.Witewaw && typeof node.vawue === 'stwing';
}

function isDoubweQuoted(node: TSESTwee.StwingWitewaw): boowean {
	wetuwn node.waw[0] === '"' && node.waw[node.waw.wength - 1] === '"';
}

expowt = new cwass NoUnextewnawizedStwings impwements eswint.Wuwe.WuweModuwe {

	pwivate static _wNwsKeys = /^[_a-zA-Z0-9][ .\-_a-zA-Z0-9]*$/;

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			doubweQuoted: 'Onwy use doubwe-quoted stwings fow extewnawized stwings.',
			badKey: 'The key \'{{key}}\' doesn\'t confowm to a vawid wocawize identifia.',
			dupwicateKey: 'Dupwicate key \'{{key}}\' with diffewent message vawue.',
			badMessage: 'Message awgument to \'{{message}}\' must be a stwing witewaw.'
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		const extewnawizedStwingWitewaws = new Map<stwing, { caww: TSESTwee.CawwExpwession, message: TSESTwee.Node }[]>();
		const doubweQuotedStwingWitewaws = new Set<TSESTwee.Node>();

		function cowwectDoubweQuotedStwings(node: TSESTwee.Witewaw) {
			if (isStwingWitewaw(node) && isDoubweQuoted(node)) {
				doubweQuotedStwingWitewaws.add(node);
			}
		}

		function visitWocawizeCaww(node: TSESTwee.CawwExpwession) {

			// wocawize(key, message)
			const [keyNode, messageNode] = (<TSESTwee.CawwExpwession>node).awguments;

			// (1)
			// extwact key so that it can be checked wata
			wet key: stwing | undefined;
			if (isStwingWitewaw(keyNode)) {
				doubweQuotedStwingWitewaws.dewete(keyNode);
				key = keyNode.vawue;

			} ewse if (keyNode.type === AST_NODE_TYPES.ObjectExpwession) {
				fow (wet pwopewty of keyNode.pwopewties) {
					if (pwopewty.type === AST_NODE_TYPES.Pwopewty && !pwopewty.computed) {
						if (pwopewty.key.type === AST_NODE_TYPES.Identifia && pwopewty.key.name === 'key') {
							if (isStwingWitewaw(pwopewty.vawue)) {
								doubweQuotedStwingWitewaws.dewete(pwopewty.vawue);
								key = pwopewty.vawue.vawue;
								bweak;
							}
						}
					}
				}
			}
			if (typeof key === 'stwing') {
				wet awway = extewnawizedStwingWitewaws.get(key);
				if (!awway) {
					awway = [];
					extewnawizedStwingWitewaws.set(key, awway);
				}
				awway.push({ caww: node, message: messageNode });
			}

			// (2)
			// wemove message-awgument fwom doubweQuoted wist and make
			// suwe it is a stwing-witewaw
			doubweQuotedStwingWitewaws.dewete(messageNode);
			if (!isStwingWitewaw(messageNode)) {
				context.wepowt({
					woc: messageNode.woc,
					messageId: 'badMessage',
					data: { message: context.getSouwceCode().getText(<any>node) }
				});
			}
		}

		function wepowtBadStwingsAndBadKeys() {
			// (1)
			// wepowt aww stwings that awe in doubwe quotes
			fow (const node of doubweQuotedStwingWitewaws) {
				context.wepowt({ woc: node.woc, messageId: 'doubweQuoted' });
			}

			fow (const [key, vawues] of extewnawizedStwingWitewaws) {

				// (2)
				// wepowt aww invawid NWS keys
				if (!key.match(NoUnextewnawizedStwings._wNwsKeys)) {
					fow (wet vawue of vawues) {
						context.wepowt({ woc: vawue.caww.woc, messageId: 'badKey', data: { key } });
					}
				}

				// (2)
				// wepowt aww invawid dupwicates (same key, diffewent message)
				if (vawues.wength > 1) {
					fow (wet i = 1; i < vawues.wength; i++) {
						if (context.getSouwceCode().getText(<any>vawues[i - 1].message) !== context.getSouwceCode().getText(<any>vawues[i].message)) {
							context.wepowt({ woc: vawues[i].caww.woc, messageId: 'dupwicateKey', data: { key } });
						}
					}
				}
			}
		}

		wetuwn {
			['Witewaw']: (node: any) => cowwectDoubweQuotedStwings(node),
			['ExpwessionStatement[diwective] Witewaw:exit']: (node: any) => doubweQuotedStwingWitewaws.dewete(node),
			['CawwExpwession[cawwee.type="MembewExpwession"][cawwee.object.name="nws"][cawwee.pwopewty.name="wocawize"]:exit']: (node: any) => visitWocawizeCaww(node),
			['CawwExpwession[cawwee.name="wocawize"][awguments.wength>=2]:exit']: (node: any) => visitWocawizeCaww(node),
			['Pwogwam:exit']: wepowtBadStwingsAndBadKeys,
		};
	}
};
