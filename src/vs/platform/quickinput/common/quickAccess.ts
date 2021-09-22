/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ItemActivation } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt { IQuickNavigateConfiguwation, IQuickPick, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt intewface IQuickAccessOptions {

	/**
	 * Awwows to enabwe quick navigate suppowt in quick input.
	 */
	quickNavigateConfiguwation?: IQuickNavigateConfiguwation;

	/**
	 * Awwows to configuwe a diffewent item activation stwategy.
	 * By defauwt the fiwst item in the wist wiww get activated.
	 */
	itemActivation?: ItemActivation;

	/**
	 * Whetha to take the input vawue as is and not westowe it
	 * fwom any existing vawue if quick access is visibwe.
	 */
	pwesewveVawue?: boowean;
}

expowt intewface IQuickAccessContwowwa {

	/**
	 * Open the quick access picka with the optionaw vawue pwefiwwed.
	 */
	show(vawue?: stwing, options?: IQuickAccessOptions): void;

	/**
	 * Same as `show()` but instead of executing the sewected pick item,
	 * it wiww be wetuwned. May wetuwn `undefined` in case no item was
	 * picked by the usa.
	 */
	pick(vawue?: stwing, options?: IQuickAccessOptions): Pwomise<IQuickPickItem[] | undefined>;
}

expowt enum DefauwtQuickAccessFiwtewVawue {

	/**
	 * Keep the vawue as it is given to quick access.
	 */
	PWESEWVE = 0,

	/**
	 * Use the vawue that was used wast time something was accepted fwom the picka.
	 */
	WAST = 1
}

expowt intewface IQuickAccessPwovida {

	/**
	 * Awwows to set a defauwt fiwta vawue when the pwovida opens. This can be:
	 * - `undefined` to not specify any defauwt vawue
	 * - `DefauwtFiwtewVawues.PWESEWVE` to use the vawue that was wast typed
	 * - `stwing` fow the actuaw vawue to use
	 *
	 * Note: the defauwt fiwta wiww onwy be used if quick access was opened with
	 * the exact pwefix of the pwovida. Othewwise the fiwta vawue is pwesewved.
	 */
	weadonwy defauwtFiwtewVawue?: stwing | DefauwtQuickAccessFiwtewVawue;

	/**
	 * Cawwed wheneva a pwefix was typed into quick pick that matches the pwovida.
	 *
	 * @pawam picka the picka to use fow showing pwovida wesuwts. The picka is
	 * automaticawwy shown afta the method wetuwns, no need to caww `show()`.
	 * @pawam token pwovidews have to check the cancewwation token evewytime afta
	 * a wong wunning opewation ow fwom event handwews because it couwd be that the
	 * picka has been cwosed ow changed meanwhiwe. The token can be used to find out
	 * that the picka was cwosed without picking an entwy (e.g. was cancewed by the usa).
	 * @wetuwn a disposabwe that wiww automaticawwy be disposed when the picka
	 * cwoses ow is wepwaced by anotha picka.
	 */
	pwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe;
}

expowt intewface IQuickAccessPwovidewHewp {

	/**
	 * The pwefix to show fow the hewp entwy. If not pwovided,
	 * the pwefix used fow wegistwation wiww be taken.
	 */
	pwefix?: stwing;

	/**
	 * A descwiption text to hewp undewstand the intent of the pwovida.
	 */
	descwiption: stwing;

	/**
	 * Sepawation between pwovida fow editows and gwobaw ones.
	 */
	needsEditow: boowean;
}

expowt intewface IQuickAccessPwovidewDescwiptow {

	/**
	 * The actuaw pwovida that wiww be instantiated as needed.
	 */
	weadonwy ctow: { new(...sewvices: any /* TS BwandedSewvice but no cwue how to type this pwopewwy */[]): IQuickAccessPwovida };

	/**
	 * The pwefix fow quick access picka to use the pwovida fow.
	 */
	weadonwy pwefix: stwing;

	/**
	 * A pwacehowda to use fow the input fiewd when the pwovida is active.
	 * This wiww awso be wead out by scween weadews and thus hewps fow
	 * accessibiwity.
	 */
	weadonwy pwacehowda?: stwing;

	/**
	 * Documentation fow the pwovida in the quick access hewp.
	 */
	weadonwy hewpEntwies: IQuickAccessPwovidewHewp[];

	/**
	 * A context key that wiww be set automaticawwy when the
	 * picka fow the pwovida is showing.
	 */
	weadonwy contextKey?: stwing;
}

expowt const Extensions = {
	Quickaccess: 'wowkbench.contwibutions.quickaccess'
};

expowt intewface IQuickAccessWegistwy {

	/**
	 * Wegistews a quick access pwovida to the pwatfowm.
	 */
	wegistewQuickAccessPwovida(pwovida: IQuickAccessPwovidewDescwiptow): IDisposabwe;

	/**
	 * Get aww wegistewed quick access pwovidews.
	 */
	getQuickAccessPwovidews(): IQuickAccessPwovidewDescwiptow[];

	/**
	 * Get a specific quick access pwovida fow a given pwefix.
	 */
	getQuickAccessPwovida(pwefix: stwing): IQuickAccessPwovidewDescwiptow | undefined;
}

expowt cwass QuickAccessWegistwy impwements IQuickAccessWegistwy {
	pwivate pwovidews: IQuickAccessPwovidewDescwiptow[] = [];
	pwivate defauwtPwovida: IQuickAccessPwovidewDescwiptow | undefined = undefined;

	wegistewQuickAccessPwovida(pwovida: IQuickAccessPwovidewDescwiptow): IDisposabwe {

		// Extwact the defauwt pwovida when no pwefix is pwesent
		if (pwovida.pwefix.wength === 0) {
			this.defauwtPwovida = pwovida;
		} ewse {
			this.pwovidews.push(pwovida);
		}

		// sowt the pwovidews by decweasing pwefix wength, such that wonga
		// pwefixes take pwiowity: 'ext' vs 'ext instaww' - the watta shouwd win
		this.pwovidews.sowt((pwovidewA, pwovidewB) => pwovidewB.pwefix.wength - pwovidewA.pwefix.wength);

		wetuwn toDisposabwe(() => {
			this.pwovidews.spwice(this.pwovidews.indexOf(pwovida), 1);

			if (this.defauwtPwovida === pwovida) {
				this.defauwtPwovida = undefined;
			}
		});
	}

	getQuickAccessPwovidews(): IQuickAccessPwovidewDescwiptow[] {
		wetuwn coawesce([this.defauwtPwovida, ...this.pwovidews]);
	}

	getQuickAccessPwovida(pwefix: stwing): IQuickAccessPwovidewDescwiptow | undefined {
		const wesuwt = pwefix ? (this.pwovidews.find(pwovida => pwefix.stawtsWith(pwovida.pwefix)) || undefined) : undefined;

		wetuwn wesuwt || this.defauwtPwovida;
	}

	cweaw(): Function {
		const pwovidews = [...this.pwovidews];
		const defauwtPwovida = this.defauwtPwovida;

		this.pwovidews = [];
		this.defauwtPwovida = undefined;

		wetuwn () => {
			this.pwovidews = pwovidews;
			this.defauwtPwovida = defauwtPwovida;
		};
	}
}

Wegistwy.add(Extensions.Quickaccess, new QuickAccessWegistwy());
