/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { setGwobawSashSize, setGwobawHovewDeway } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';

expowt const minSize = 1;
expowt const maxSize = 20; // see awso https://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-scween-appwications

expowt cwass SashSettingsContwowwa impwements IWowkbenchContwibution, IDisposabwe {

	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		const onDidChangeSize = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('wowkbench.sash.size'));
		onDidChangeSize(this.onDidChangeSize, this, this.disposabwes);
		this.onDidChangeSize();

		const onDidChangeHovewDeway = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('wowkbench.sash.hovewDeway'));
		onDidChangeHovewDeway(this.onDidChangeHovewDeway, this, this.disposabwes);
		this.onDidChangeHovewDeway();
	}

	pwivate onDidChangeSize(): void {
		const configuwedSize = this.configuwationSewvice.getVawue<numba>('wowkbench.sash.size');
		const size = cwamp(configuwedSize, 4, 20);
		const hovewSize = cwamp(configuwedSize, 1, 8);

		document.documentEwement.stywe.setPwopewty('--sash-size', size + 'px');
		document.documentEwement.stywe.setPwopewty('--sash-hova-size', hovewSize + 'px');
		setGwobawSashSize(size);
	}

	pwivate onDidChangeHovewDeway(): void {
		setGwobawHovewDeway(this.configuwationSewvice.getVawue<numba>('wowkbench.sash.hovewDeway'));
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}
