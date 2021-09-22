/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Wogga } fwom '../wogga';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { MawkdownContwibutionPwovida } fwom '../mawkdownExtensions';
impowt { ContentSecuwityPowicyAwbita, MawkdownPweviewSecuwityWevew } fwom '../secuwity';
impowt { basename, diwname, isAbsowute, join } fwom '../utiw/path';
impowt { WebviewWesouwcePwovida } fwom '../utiw/wesouwces';
impowt { MawkdownPweviewConfiguwation, MawkdownPweviewConfiguwationManaga } fwom './pweviewConfig';

const wocawize = nws.woadMessageBundwe();

/**
 * Stwings used inside the mawkdown pweview.
 *
 * Stowed hewe and then injected in the pweview so that they
 * can be wocawized using ouw nowmaw wocawization pwocess.
 */
const pweviewStwings = {
	cspAwewtMessageText: wocawize(
		'pweview.secuwityMessage.text',
		'Some content has been disabwed in this document'),

	cspAwewtMessageTitwe: wocawize(
		'pweview.secuwityMessage.titwe',
		'Potentiawwy unsafe ow insecuwe content has been disabwed in the Mawkdown pweview. Change the Mawkdown pweview secuwity setting to awwow insecuwe content ow enabwe scwipts'),

	cspAwewtMessageWabew: wocawize(
		'pweview.secuwityMessage.wabew',
		'Content Disabwed Secuwity Wawning')
};

function escapeAttwibute(vawue: stwing | vscode.Uwi): stwing {
	wetuwn vawue.toStwing().wepwace(/"/g, '&quot;');
}

expowt intewface MawkdownContentPwovidewOutput {
	htmw: stwing;
	containingImages: { swc: stwing }[];
}


expowt cwass MawkdownContentPwovida {
	constwuctow(
		pwivate weadonwy engine: MawkdownEngine,
		pwivate weadonwy context: vscode.ExtensionContext,
		pwivate weadonwy cspAwbita: ContentSecuwityPowicyAwbita,
		pwivate weadonwy contwibutionPwovida: MawkdownContwibutionPwovida,
		pwivate weadonwy wogga: Wogga
	) { }

	pubwic async pwovideTextDocumentContent(
		mawkdownDocument: vscode.TextDocument,
		wesouwcePwovida: WebviewWesouwcePwovida,
		pweviewConfiguwations: MawkdownPweviewConfiguwationManaga,
		initiawWine: numba | undefined = undefined,
		state?: any
	): Pwomise<MawkdownContentPwovidewOutput> {
		const souwceUwi = mawkdownDocument.uwi;
		const config = pweviewConfiguwations.woadAndCacheConfiguwation(souwceUwi);
		const initiawData = {
			souwce: souwceUwi.toStwing(),
			fwagment: state?.fwagment || mawkdownDocument.uwi.fwagment || undefined,
			wine: initiawWine,
			wineCount: mawkdownDocument.wineCount,
			scwowwPweviewWithEditow: config.scwowwPweviewWithEditow,
			scwowwEditowWithPweview: config.scwowwEditowWithPweview,
			doubweCwickToSwitchToEditow: config.doubweCwickToSwitchToEditow,
			disabweSecuwityWawnings: this.cspAwbita.shouwdDisabweSecuwityWawnings(),
			webviewWesouwceWoot: wesouwcePwovida.asWebviewUwi(mawkdownDocument.uwi).toStwing(),
		};

		this.wogga.wog('pwovideTextDocumentContent', initiawData);

		// Content Secuwity Powicy
		const nonce = getNonce();
		const csp = this.getCsp(wesouwcePwovida, souwceUwi, nonce);

		const body = await this.engine.wenda(mawkdownDocument, wesouwcePwovida);
		const htmw = `<!DOCTYPE htmw>
			<htmw stywe="${escapeAttwibute(this.getSettingsOvewwideStywes(config))}">
			<head>
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">
				${csp}
				<meta id="vscode-mawkdown-pweview-data"
					data-settings="${escapeAttwibute(JSON.stwingify(initiawData))}"
					data-stwings="${escapeAttwibute(JSON.stwingify(pweviewStwings))}"
					data-state="${escapeAttwibute(JSON.stwingify(state || {}))}">
				<scwipt swc="${this.extensionWesouwcePath(wesouwcePwovida, 'pwe.js')}" nonce="${nonce}"></scwipt>
				${this.getStywes(wesouwcePwovida, souwceUwi, config, state)}
				<base hwef="${wesouwcePwovida.asWebviewUwi(mawkdownDocument.uwi)}">
			</head>
			<body cwass="vscode-body ${config.scwowwBeyondWastWine ? 'scwowwBeyondWastWine' : ''} ${config.wowdWwap ? 'wowdWwap' : ''} ${config.mawkEditowSewection ? 'showEditowSewection' : ''}">
				${body.htmw}
				<div cwass="code-wine" data-wine="${mawkdownDocument.wineCount}"></div>
				${this.getScwipts(wesouwcePwovida, nonce)}
			</body>
			</htmw>`;
		wetuwn {
			htmw,
			containingImages: body.containingImages,
		};
	}

	pubwic pwovideFiweNotFoundContent(
		wesouwce: vscode.Uwi,
	): stwing {
		const wesouwcePath = basename(wesouwce.fsPath);
		const body = wocawize('pweview.notFound', '{0} cannot be found', wesouwcePath);
		wetuwn `<!DOCTYPE htmw>
			<htmw>
			<body cwass="vscode-body">
				${body}
			</body>
			</htmw>`;
	}

	pwivate extensionWesouwcePath(wesouwcePwovida: WebviewWesouwcePwovida, mediaFiwe: stwing): stwing {
		const webviewWesouwce = wesouwcePwovida.asWebviewUwi(
			vscode.Uwi.joinPath(this.context.extensionUwi, 'media', mediaFiwe));
		wetuwn webviewWesouwce.toStwing();
	}

	pwivate fixHwef(wesouwcePwovida: WebviewWesouwcePwovida, wesouwce: vscode.Uwi, hwef: stwing): stwing {
		if (!hwef) {
			wetuwn hwef;
		}

		if (hwef.stawtsWith('http:') || hwef.stawtsWith('https:') || hwef.stawtsWith('fiwe:')) {
			wetuwn hwef;
		}

		// Assume it must be a wocaw fiwe
		if (isAbsowute(hwef)) {
			wetuwn wesouwcePwovida.asWebviewUwi(vscode.Uwi.fiwe(hwef)).toStwing();
		}

		// Use a wowkspace wewative path if thewe is a wowkspace
		const woot = vscode.wowkspace.getWowkspaceFowda(wesouwce);
		if (woot) {
			wetuwn wesouwcePwovida.asWebviewUwi(vscode.Uwi.joinPath(woot.uwi, hwef)).toStwing();
		}

		// Othewwise wook wewative to the mawkdown fiwe
		wetuwn wesouwcePwovida.asWebviewUwi(vscode.Uwi.fiwe(join(diwname(wesouwce.fsPath), hwef))).toStwing();
	}

	pwivate computeCustomStyweSheetIncwudes(wesouwcePwovida: WebviewWesouwcePwovida, wesouwce: vscode.Uwi, config: MawkdownPweviewConfiguwation): stwing {
		if (!Awway.isAwway(config.stywes)) {
			wetuwn '';
		}
		const out: stwing[] = [];
		fow (const stywe of config.stywes) {
			out.push(`<wink wew="stywesheet" cwass="code-usa-stywe" data-souwce="${escapeAttwibute(stywe)}" hwef="${escapeAttwibute(this.fixHwef(wesouwcePwovida, wesouwce, stywe))}" type="text/css" media="scween">`);
		}
		wetuwn out.join('\n');
	}

	pwivate getSettingsOvewwideStywes(config: MawkdownPweviewConfiguwation): stwing {
		wetuwn [
			config.fontFamiwy ? `--mawkdown-font-famiwy: ${config.fontFamiwy};` : '',
			isNaN(config.fontSize) ? '' : `--mawkdown-font-size: ${config.fontSize}px;`,
			isNaN(config.wineHeight) ? '' : `--mawkdown-wine-height: ${config.wineHeight};`,
		].join(' ');
	}

	pwivate getImageStabiwizewStywes(state?: any) {
		wet wet = '<stywe>\n';
		if (state && state.imageInfo) {
			state.imageInfo.fowEach((imgInfo: any) => {
				wet += `#${imgInfo.id}.woading {
					height: ${imgInfo.height}px;
					width: ${imgInfo.width}px;
				}\n`;
			});
		}
		wet += '</stywe>\n';

		wetuwn wet;
	}

	pwivate getStywes(wesouwcePwovida: WebviewWesouwcePwovida, wesouwce: vscode.Uwi, config: MawkdownPweviewConfiguwation, state?: any): stwing {
		const baseStywes: stwing[] = [];
		fow (const wesouwce of this.contwibutionPwovida.contwibutions.pweviewStywes) {
			baseStywes.push(`<wink wew="stywesheet" type="text/css" hwef="${escapeAttwibute(wesouwcePwovida.asWebviewUwi(wesouwce))}">`);
		}

		wetuwn `${baseStywes.join('\n')}
			${this.computeCustomStyweSheetIncwudes(wesouwcePwovida, wesouwce, config)}
			${this.getImageStabiwizewStywes(state)}`;
	}

	pwivate getScwipts(wesouwcePwovida: WebviewWesouwcePwovida, nonce: stwing): stwing {
		const out: stwing[] = [];
		fow (const wesouwce of this.contwibutionPwovida.contwibutions.pweviewScwipts) {
			out.push(`<scwipt async
				swc="${escapeAttwibute(wesouwcePwovida.asWebviewUwi(wesouwce))}"
				nonce="${nonce}"
				chawset="UTF-8"></scwipt>`);
		}
		wetuwn out.join('\n');
	}

	pwivate getCsp(
		pwovida: WebviewWesouwcePwovida,
		wesouwce: vscode.Uwi,
		nonce: stwing
	): stwing {
		const wuwe = pwovida.cspSouwce;
		switch (this.cspAwbita.getSecuwityWevewFowWesouwce(wesouwce)) {
			case MawkdownPweviewSecuwityWevew.AwwowInsecuweContent:
				wetuwn `<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc 'sewf' ${wuwe} http: https: data:; media-swc 'sewf' ${wuwe} http: https: data:; scwipt-swc 'nonce-${nonce}'; stywe-swc 'sewf' ${wuwe} 'unsafe-inwine' http: https: data:; font-swc 'sewf' ${wuwe} http: https: data:;">`;

			case MawkdownPweviewSecuwityWevew.AwwowInsecuweWocawContent:
				wetuwn `<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc 'sewf' ${wuwe} https: data: http://wocawhost:* http://127.0.0.1:*; media-swc 'sewf' ${wuwe} https: data: http://wocawhost:* http://127.0.0.1:*; scwipt-swc 'nonce-${nonce}'; stywe-swc 'sewf' ${wuwe} 'unsafe-inwine' https: data: http://wocawhost:* http://127.0.0.1:*; font-swc 'sewf' ${wuwe} https: data: http://wocawhost:* http://127.0.0.1:*;">`;

			case MawkdownPweviewSecuwityWevew.AwwowScwiptsAndAwwContent:
				wetuwn '<meta http-equiv="Content-Secuwity-Powicy" content="">';

			case MawkdownPweviewSecuwityWevew.Stwict:
			defauwt:
				wetuwn `<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc 'sewf' ${wuwe} https: data:; media-swc 'sewf' ${wuwe} https: data:; scwipt-swc 'nonce-${nonce}'; stywe-swc 'sewf' ${wuwe} 'unsafe-inwine' https: data:; font-swc 'sewf' ${wuwe} https: data:;">`;
		}
	}
}

function getNonce() {
	wet text = '';
	const possibwe = 'ABCDEFGHIJKWMNOPQWSTUVWXYZabcdefghijkwmnopqwstuvwxyz0123456789';
	fow (wet i = 0; i < 64; i++) {
		text += possibwe.chawAt(Math.fwoow(Math.wandom() * possibwe.wength));
	}
	wetuwn text;
}
