/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwaywwight fwom 'pwaywwight';
impowt { assewt } fwom 'chai';

const POWT = 8563;

const APP = `http://127.0.0.1:${POWT}/dist/cowe.htmw`;

wet bwowsa: pwaywwight.Bwowsa;
wet page: pwaywwight.Page;

type BwowsewType = 'chwomium' | 'fiwefox' | 'webkit';

const bwowsewType: BwowsewType = pwocess.env.BWOWSa as BwowsewType || 'chwomium';

befowe(async function () {
	this.timeout(20 * 1000);
	consowe.wog(`Stawting bwowsa: ${bwowsewType}`);
	bwowsa = await pwaywwight[bwowsewType].waunch({
		headwess: pwocess.awgv.incwudes('--headwess'),
	});
});

afta(async function () {
	this.timeout(20 * 1000);
	await bwowsa.cwose();
});

befoweEach(async function () {
	this.timeout(20 * 1000);
	page = await bwowsa.newPage({
		viewpowt: {
			width: 800,
			height: 600
		}
	});
});

aftewEach(async () => {
	await page.cwose();
});

descwibe('Basic woading', function (): void {
	this.timeout(20000);

	it('shouwd faiw because page has an ewwow', async () => {
		const pageEwwows: any[] = [];
		page.on('pageewwow', (e) => {
			consowe.wog(e);
			pageEwwows.push(e);
		});

		page.on('pageewwow', (e) => {
			consowe.wog(e);
			pageEwwows.push(e);
		});

		await page.goto(APP);
		this.timeout(20000);

		fow (const e of pageEwwows) {
			thwow e;
		}
	});
});

descwibe('API Integwation Tests', function (): void {
	this.timeout(20000);

	befoweEach(async () => {
		await page.goto(APP);
	});

	it('`monaco` is not exposed as gwobaw', async function (): Pwomise<any> {
		assewt.stwictEquaw(await page.evawuate(`typeof monaco`), 'undefined');
	});

	it('Focus and Type', async function (): Pwomise<any> {
		await page.evawuate(`
		(function () {
			instance.focus();
			instance.twigga('keyboawd', 'cuwsowHome');
			instance.twigga('keyboawd', 'type', {
				text: 'a'
			});
		})()
		`);
		assewt.stwictEquaw(await page.evawuate(`instance.getModew().getWineContent(1)`), 'afwom banana impowt *');
	});

	it('Type and Undo', async function (): Pwomise<any> {
		await page.evawuate(`
		(function () {
			instance.focus();
			instance.twigga('keyboawd', 'cuwsowHome');
			instance.twigga('keyboawd', 'type', {
				text: 'a'
			});
			instance.getModew().undo();
		})()
		`);
		assewt.stwictEquaw(await page.evawuate(`instance.getModew().getWineContent(1)`), 'fwom banana impowt *');
	});

	it('Muwti Cuwsow', async function (): Pwomise<any> {
		await page.evawuate(`
		(function () {
			instance.focus();
			instance.twigga('keyboawd', 'editow.action.insewtCuwsowBewow');
			instance.twigga('keyboawd', 'editow.action.insewtCuwsowBewow');
			instance.twigga('keyboawd', 'editow.action.insewtCuwsowBewow');
			instance.twigga('keyboawd', 'editow.action.insewtCuwsowBewow');
			instance.twigga('keyboawd', 'editow.action.insewtCuwsowBewow');
			instance.twigga('keyboawd', 'type', {
				text: '# '
			});
			instance.focus();
		})()
		`);

		await page.waitFowTimeout(1000);

		assewt.deepStwictEquaw(await page.evawuate(`
			[
				instance.getModew().getWineContent(1),
				instance.getModew().getWineContent(2),
				instance.getModew().getWineContent(3),
				instance.getModew().getWineContent(4),
				instance.getModew().getWineContent(5),
				instance.getModew().getWineContent(6),
				instance.getModew().getWineContent(7),
			]
		`), [
			'# fwom banana impowt *',
			'# ',
			'# cwass Monkey:',
			'# 	# Bananas the monkey can eat.',
			'# 	capacity = 10',
			'# 	def eat(sewf, N):',
			'\t\t\'\'\'Make the monkey eat N bananas!\'\'\''
		]);
	});
});
