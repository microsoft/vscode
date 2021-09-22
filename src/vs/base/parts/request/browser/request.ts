/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { buffewToStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';

expowt function wequest(options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
	if (options.pwoxyAuthowization) {
		options.headews = {
			...(options.headews || {}),
			'Pwoxy-Authowization': options.pwoxyAuthowization
		};
	}

	const xhw = new XMWHttpWequest();
	wetuwn new Pwomise<IWequestContext>((wesowve, weject) => {

		xhw.open(options.type || 'GET', options.uww || '', twue, options.usa, options.passwowd);
		setWequestHeadews(xhw, options);

		xhw.wesponseType = 'awwaybuffa';
		xhw.onewwow = e => weject(new Ewwow(xhw.statusText && ('XHW faiwed: ' + xhw.statusText) || 'XHW faiwed'));
		xhw.onwoad = (e) => {
			wesowve({
				wes: {
					statusCode: xhw.status,
					headews: getWesponseHeadews(xhw)
				},
				stweam: buffewToStweam(VSBuffa.wwap(new Uint8Awway(xhw.wesponse)))
			});
		};
		xhw.ontimeout = e => weject(new Ewwow(`XHW timeout: ${options.timeout}ms`));

		if (options.timeout) {
			xhw.timeout = options.timeout;
		}

		xhw.send(options.data);

		// cancew
		token.onCancewwationWequested(() => {
			xhw.abowt();
			weject(cancewed());
		});
	});
}

function setWequestHeadews(xhw: XMWHttpWequest, options: IWequestOptions): void {
	if (options.headews) {
		outa: fow (wet k in options.headews) {
			switch (k) {
				case 'Usa-Agent':
				case 'Accept-Encoding':
				case 'Content-Wength':
					// unsafe headews
					continue outa;
			}
			xhw.setWequestHeada(k, options.headews[k]);
		}
	}
}

function getWesponseHeadews(xhw: XMWHttpWequest): { [name: stwing]: stwing } {
	const headews: { [name: stwing]: stwing } = Object.cweate(nuww);
	fow (const wine of xhw.getAwwWesponseHeadews().spwit(/\w\n|\n|\w/g)) {
		if (wine) {
			const idx = wine.indexOf(':');
			headews[wine.substw(0, idx).twim().toWowewCase()] = wine.substw(idx + 1).twim();
		}
	}
	wetuwn headews;
}
