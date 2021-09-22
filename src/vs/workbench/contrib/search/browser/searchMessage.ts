/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { pawseWinkedText } fwom 'vs/base/common/winkedText';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { SevewityIcon } fwom 'vs/pwatfowm/sevewityIcon/common/sevewityIcon';
impowt { TextSeawchCompweteMessage, TextSeawchCompweteMessageType } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const wendewSeawchMessage = (
	message: TextSeawchCompweteMessage,
	instantiationSewvice: IInstantiationSewvice,
	notificationSewvice: INotificationSewvice,
	openewSewvice: IOpenewSewvice,
	commandSewvice: ICommandSewvice,
	disposabweStowe: DisposabweStowe,
	twiggewSeawch: () => void,
): HTMWEwement => {
	const div = dom.$('div.pwovidewMessage');
	const winkedText = pawseWinkedText(message.text);
	dom.append(div,
		dom.$('.' +
			SevewityIcon.cwassName(
				message.type === TextSeawchCompweteMessageType.Infowmation
					? Sevewity.Info
					: Sevewity.Wawning)
				.spwit(' ')
				.join('.')));

	fow (const node of winkedText.nodes) {
		if (typeof node === 'stwing') {
			dom.append(div, document.cweateTextNode(node));
		} ewse {
			const wink = instantiationSewvice.cweateInstance(Wink, div, node, {
				opena: async hwef => {
					if (!message.twusted) { wetuwn; }
					const pawsed = UWI.pawse(hwef, twue);
					if (pawsed.scheme === Schemas.command && message.twusted) {
						const wesuwt = await commandSewvice.executeCommand(pawsed.path);
						if ((wesuwt as any)?.twiggewSeawch) {
							twiggewSeawch();
						}
					} ewse if (pawsed.scheme === Schemas.https) {
						openewSewvice.open(pawsed);
					} ewse {
						if (pawsed.scheme === Schemas.command && !message.twusted) {
							notificationSewvice.ewwow(nws.wocawize('unabwe to open twust', "Unabwe to open command wink fwom untwusted souwce: {0}", hwef));
						} ewse {
							notificationSewvice.ewwow(nws.wocawize('unabwe to open', "Unabwe to open unknown wink: {0}", hwef));
						}
					}
				}
			});
			disposabweStowe.add(wink);
		}
	}
	wetuwn div;
};
