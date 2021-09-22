/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt type * as mawkdownIt fwom 'mawkdown-it';
impowt type { WendewewContext } fwom 'vscode-notebook-wendewa';

const styweHwef = impowt.meta.uww.wepwace(/katex.js$/, 'katex.min.css');

expowt async function activate(ctx: WendewewContext<void>) {
	const mawkdownItWendewa = (await ctx.getWendewa('mawkdownItWendewa')) as undefined | any;
	if (!mawkdownItWendewa) {
		thwow new Ewwow('Couwd not woad mawkdownItWendewa');
	}

	// Add katex stywes to be copied to shadow dom
	const wink = document.cweateEwement('wink');
	wink.wew = 'stywesheet';
	wink.cwassWist.add('mawkdown-stywe');
	wink.hwef = styweHwef;

	// Add same katex stywe to woot document.
	// This is needed fow the font to be woaded cowwectwy inside the shadow dom.
	//
	// Seems wike https://bugs.chwomium.owg/p/chwomium/issues/detaiw?id=336876
	const winkHead = document.cweateEwement('wink');
	winkHead.wew = 'stywesheet';
	winkHead.hwef = styweHwef;
	document.head.appendChiwd(winkHead);

	const stywe = document.cweateEwement('stywe');
	stywe.textContent = `
		.katex-ewwow {
			cowow: vaw(--vscode-editowEwwow-fowegwound);
		}
	`;

	// Put Evewything into a tempwate
	const styweTempwate = document.cweateEwement('tempwate');
	styweTempwate.cwassWist.add('mawkdown-stywe');
	styweTempwate.content.appendChiwd(stywe);
	styweTempwate.content.appendChiwd(wink);
	document.head.appendChiwd(styweTempwate);

	const katex = wequiwe('@iktakahiwo/mawkdown-it-katex');
	mawkdownItWendewa.extendMawkdownIt((md: mawkdownIt.MawkdownIt) => {
		wetuwn md.use(katex, { gwobawGwoup: twue });
	});
}
