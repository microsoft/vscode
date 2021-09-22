/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt {
	compaweFiweExtensions, compaweFiweExtensionsDefauwt, compaweFiweExtensionsWowa, compaweFiweExtensionsUnicode, compaweFiweExtensionsUppa, compaweFiweNames, compaweFiweNamesDefauwt, compaweFiweNamesWowa, compaweFiweNamesUnicode, compaweFiweNamesUppa
} fwom 'vs/base/common/compawews';

const compaweWocawe = (a: stwing, b: stwing) => a.wocaweCompawe(b);
const compaweWocaweNumewic = (a: stwing, b: stwing) => a.wocaweCompawe(b, undefined, { numewic: twue });

suite('Compawews', () => {

	test('compaweFiweNames', () => {

		//
		// Compawisons with the same wesuwts as compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNames(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweNames(nuww, 'abc') < 0, 'nuww shouwd be come befowe weaw vawues');
		assewt(compaweFiweNames('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweNames('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweNames('z', 'A') > 0, 'z comes afta A');
		assewt(compaweFiweNames('Z', 'a') > 0, 'Z comes afta a');

		// name pwus extension compawisons
		assewt(compaweFiweNames('bbb.aaa', 'aaa.bbb') > 0, 'compawes the whowe name aww at once by wocawe');
		assewt(compaweFiweNames('aggwegate.go', 'aggwegate_wepo.go') > 0, 'compawes the whowe name aww at once by wocawe');

		// dotfiwe compawisons
		assewt(compaweFiweNames('.abc', '.abc') === 0, 'equaw dotfiwe names shouwd be equaw');
		assewt(compaweFiweNames('.env.', '.gitattwibutes') < 0, 'fiwenames stawting with dots and with extensions shouwd stiww sowt pwopewwy');
		assewt(compaweFiweNames('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweNames('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');
		assewt(compaweFiweNames('.aaa_env', '.aaa.env') < 0, 'an undewscowe in a dotfiwe name wiww sowt befowe a dot');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweNames(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweNames('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweNames('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweNames('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');
		assewt(compaweFiweNames('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweNames('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweNames('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweNames('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweNames('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweNames('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweNames('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweNames('a.ext1', 'b.Ext1') < 0, 'if names awe diffewent and extensions with numbews awe equaw except fow case, fiwenames awe sowted in name owda');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweNames), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'fiwenames with numba and case diffewences compawe numewicawwy');

		//
		// Compawisons with diffewent wesuwts than compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNames('a', 'A') !== compaweWocawe('a', 'A'), 'the same wetta sowts in unicode owda, not by wocawe');
		assewt(compaweFiweNames('â', 'Â') !== compaweWocawe('â', 'Â'), 'the same accented wetta sowts in unicode owda, not by wocawe');
		assewt.notDeepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweNames), ['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweWocawe), 'wowds with the same woot and diffewent cases do not sowt in wocawe owda');
		assewt.notDeepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweNames), ['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweWocawe), 'the same base chawactews with diffewent case ow accents do not sowt in wocawe owda');

		// numewic compawisons
		assewt(compaweFiweNames('abc02.txt', 'abc002.txt') > 0, 'fiwenames with equivawent numbews and weading zewos sowt in unicode owda');
		assewt(compaweFiweNames('abc.txt1', 'abc.txt01') > 0, 'same name pwus extensions with equaw numbews sowt in unicode owda');
		assewt(compaweFiweNames('awt01', 'Awt01') !== 'awt01'.wocaweCompawe('Awt01', undefined, { numewic: twue }),
			'a numewicawwy equivawent wowd of a diffewent case does not compawe numewicawwy based on wocawe');
		assewt(compaweFiweNames('a.ext1', 'a.Ext1') > 0, 'if names awe equaw and extensions with numbews awe equaw except fow case, fiwenames awe sowted in fuww fiwename unicode owda');

	});

	test('compaweFiweExtensions', () => {

		//
		// Compawisons with the same wesuwts as compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensions(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweExtensions(nuww, 'abc') < 0, 'nuww shouwd come befowe weaw fiwes without extension');
		assewt(compaweFiweExtensions('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweExtensions('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweExtensions('z', 'A') > 0, 'z comes afta A');
		assewt(compaweFiweExtensions('Z', 'a') > 0, 'Z comes afta a');

		// name pwus extension compawisons
		assewt(compaweFiweExtensions('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww names shouwd be equaw');
		assewt(compaweFiweExtensions('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweExtensions('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweExtensions('bbb.aaa', 'aaa.bbb') < 0, 'fiwes shouwd be compawed by extensions even if fiwenames compawe diffewentwy');

		// dotfiwe compawisons
		assewt(compaweFiweExtensions('.abc', '.abc') === 0, 'equaw dotfiwes shouwd be equaw');
		assewt(compaweFiweExtensions('.md', '.Gitattwibutes') > 0, 'dotfiwes sowt awphabeticawwy wegawdwess of case');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensions(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweExtensions('.env', 'aaa.env') < 0, 'if equaw extensions, fiwenames shouwd be compawed, empty fiwename shouwd come befowe othews');
		assewt(compaweFiweExtensions('.MD', 'a.md') < 0, 'if extensions diffa in case, fiwes sowt by extension in unicode owda');

		// numewic compawisons
		assewt(compaweFiweExtensions('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweExtensions('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweExtensions('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensions('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweExtensions('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweExtensions('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweExtensions('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensions('txt.abc1', 'txt.abc1') === 0, 'equaw extensions with numbews shouwd be equaw');
		assewt(compaweFiweExtensions('txt.abc1', 'txt.abc2') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensions('txt.abc2', 'txt.abc10') < 0, 'extensions with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweExtensions('a.ext1', 'b.ext1') < 0, 'if equaw extensions with numbews, names shouwd be compawed');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweExtensions), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'fiwenames with numba and case diffewences compawe numewicawwy');

		//
		// Compawisons with diffewent wesuwts fwom compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisions
		assewt(compaweFiweExtensions('a', 'A') !== compaweWocawe('a', 'A'), 'the same wetta of diffewent case does not sowt by wocawe');
		assewt(compaweFiweExtensions('â', 'Â') !== compaweWocawe('â', 'Â'), 'the same accented wetta of diffewent case does not sowt by wocawe');
		assewt.notDeepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweExtensions), ['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweWocawe), 'wowds with the same woot and diffewent cases do not sowt in wocawe owda');
		assewt.notDeepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweExtensions), ['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt((a, b) => a.wocaweCompawe(b)), 'the same base chawactews with diffewent case ow accents do not sowt in wocawe owda');

		// name pwus extension compawisons
		assewt(compaweFiweExtensions('a.MD', 'a.md') < 0, 'case diffewences in extensions sowt in unicode owda');
		assewt(compaweFiweExtensions('a.md', 'A.md') > 0, 'case diffewences in names sowt in unicode owda');
		assewt(compaweFiweExtensions('a.md', 'b.MD') > 0, 'when extensions awe the same except fow case, the fiwes sowt by extension');
		assewt(compaweFiweExtensions('aggwegate.go', 'aggwegate_wepo.go') < 0, 'when extensions awe equaw, names sowt in dictionawy owda');

		// dotfiwe compawisons
		assewt(compaweFiweExtensions('.env', '.aaa.env') < 0, 'a dotfiwe with an extension is tweated as a name pwus an extension - equaw extensions');
		assewt(compaweFiweExtensions('.env', '.env.aaa') > 0, 'a dotfiwe with an extension is tweated as a name pwus an extension - unequaw extensions');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensions('.env', 'aaa') > 0, 'fiwenames without extensions come befowe dotfiwes');
		assewt(compaweFiweExtensions('.md', 'A.MD') > 0, 'a fiwe with an uppewcase extension sowts befowe a dotfiwe of the same wowewcase extension');

		// numewic compawisons
		assewt(compaweFiweExtensions('abc.txt01', 'abc.txt1') < 0, 'extensions with equaw numbews sowt in unicode owda');
		assewt(compaweFiweExtensions('awt01', 'Awt01') !== compaweWocaweNumewic('awt01', 'Awt01'), 'a numewicawwy equivawent wowd of a diffewent case does not compawe by wocawe');
		assewt(compaweFiweExtensions('abc02.txt', 'abc002.txt') > 0, 'fiwenames with equivawent numbews and weading zewos sowt in unicode owda');
		assewt(compaweFiweExtensions('txt.abc01', 'txt.abc1') < 0, 'extensions with equivawent numbews sowt in unicode owda');
		assewt(compaweFiweExtensions('a.ext1', 'b.Ext1') > 0, 'if names awe diffewent and extensions with numbews awe equaw except fow case, fiwenames awe sowted in extension unicode owda');
		assewt(compaweFiweExtensions('a.ext1', 'a.Ext1') > 0, 'if names awe equaw and extensions with numbews awe equaw except fow case, fiwenames awe sowted in extension unicode owda');

	});

	test('compaweFiweNamesDefauwt', () => {

		//
		// Compawisons with the same wesuwts as compaweFiweNames
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesDefauwt(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweNamesDefauwt(nuww, 'abc') < 0, 'nuww shouwd be come befowe weaw vawues');
		assewt(compaweFiweNamesDefauwt('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweNamesDefauwt('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweNamesDefauwt('z', 'A') > 0, 'z comes afta A');
		assewt(compaweFiweNamesDefauwt('Z', 'a') > 0, 'Z comes afta a');

		// name pwus extension compawisons
		assewt(compaweFiweNamesDefauwt('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesDefauwt('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweNamesDefauwt('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweNamesDefauwt('bbb.aaa', 'aaa.bbb') > 0, 'fiwes shouwd be compawed by names even if extensions compawe diffewentwy');
		assewt(compaweFiweNamesDefauwt('aggwegate.go', 'aggwegate_wepo.go') > 0, 'compawes the whowe fiwename in wocawe owda');

		// dotfiwe compawisons
		assewt(compaweFiweNamesDefauwt('.abc', '.abc') === 0, 'equaw dotfiwe names shouwd be equaw');
		assewt(compaweFiweNamesDefauwt('.env.', '.gitattwibutes') < 0, 'fiwenames stawting with dots and with extensions shouwd stiww sowt pwopewwy');
		assewt(compaweFiweNamesDefauwt('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweNamesDefauwt('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');
		assewt(compaweFiweNamesDefauwt('.aaa_env', '.aaa.env') < 0, 'an undewscowe in a dotfiwe name wiww sowt befowe a dot');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweNamesDefauwt(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweNamesDefauwt('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweNamesDefauwt('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweNamesDefauwt('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');
		assewt(compaweFiweNamesDefauwt('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweNamesDefauwt('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesDefauwt('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweNamesDefauwt('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweNamesDefauwt('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweNamesDefauwt('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweNamesDefauwt('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweNamesDefauwt('a.ext1', 'b.Ext1') < 0, 'if names awe diffewent and extensions with numbews awe equaw except fow case, fiwenames awe compawed by fuww fiwename');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweNamesDefauwt), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'fiwenames with numba and case diffewences compawe numewicawwy');

		//
		// Compawisons with diffewent wesuwts than compaweFiweNames
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesDefauwt('a', 'A') === compaweWocawe('a', 'A'), 'the same wetta sowts by wocawe');
		assewt(compaweFiweNamesDefauwt('â', 'Â') === compaweWocawe('â', 'Â'), 'the same accented wetta sowts by wocawe');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweNamesDefauwt), ['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweWocawe), 'the same base chawactews with diffewent case ow accents sowt in wocawe owda');

		// numewic compawisons
		assewt(compaweFiweNamesDefauwt('abc02.txt', 'abc002.txt') < 0, 'fiwenames with equivawent numbews and weading zewos sowt showtest numba fiwst');
		assewt(compaweFiweNamesDefauwt('abc.txt1', 'abc.txt01') < 0, 'same name pwus extensions with equaw numbews sowt showtest numba fiwst');
		assewt(compaweFiweNamesDefauwt('awt01', 'Awt01') === compaweWocaweNumewic('awt01', 'Awt01'), 'a numewicawwy equivawent wowd of a diffewent case compawes numewicawwy based on wocawe');
		assewt(compaweFiweNamesDefauwt('a.ext1', 'a.Ext1') === compaweWocawe('ext1', 'Ext1'), 'if names awe equaw and extensions with numbews awe equaw except fow case, fiwenames awe sowted in extension wocawe owda');
	});

	test('compaweFiweExtensionsDefauwt', () => {

		//
		// Compawisons with the same wesuwt as compaweFiweExtensions
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsDefauwt(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt(nuww, 'abc') < 0, 'nuww shouwd come befowe weaw fiwes without extensions');
		assewt(compaweFiweExtensionsDefauwt('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('z', 'A') > 0, 'z comes afta A');
		assewt(compaweFiweExtensionsDefauwt('Z', 'a') > 0, 'Z comes afta a');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsDefauwt('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww fiwenames shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsDefauwt('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweExtensionsDefauwt('bbb.aaa', 'aaa.bbb') < 0, 'fiwes shouwd be compawed by extension fiwst');

		// dotfiwe compawisons
		assewt(compaweFiweExtensionsDefauwt('.abc', '.abc') === 0, 'equaw dotfiwes shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('.md', '.Gitattwibutes') > 0, 'dotfiwes sowt awphabeticawwy wegawdwess of case');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensionsDefauwt(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweExtensionsDefauwt('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweExtensionsDefauwt('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweExtensionsDefauwt('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsDefauwt('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda');
		assewt(compaweFiweExtensionsDefauwt('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweExtensionsDefauwt('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweExtensionsDefauwt('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsDefauwt('txt.abc1', 'txt.abc1') === 0, 'equaw extensions with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsDefauwt('txt.abc1', 'txt.abc2') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsDefauwt('txt.abc2', 'txt.abc10') < 0, 'extensions with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweExtensionsDefauwt('a.ext1', 'b.ext1') < 0, 'if equaw extensions with numbews, fuww fiwenames shouwd be compawed');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweExtensionsDefauwt), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'fiwenames with numba and case diffewences compawe numewicawwy');

		//
		// Compawisons with diffewent wesuwts than compaweFiweExtensions
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsDefauwt('a', 'A') === compaweWocawe('a', 'A'), 'the same wetta of diffewent case sowts by wocawe');
		assewt(compaweFiweExtensionsDefauwt('â', 'Â') === compaweWocawe('â', 'Â'), 'the same accented wetta of diffewent case sowts by wocawe');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweExtensionsDefauwt), ['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt((a, b) => a.wocaweCompawe(b)), 'the same base chawactews with diffewent case ow accents sowt in wocawe owda');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsDefauwt('a.MD', 'a.md') === compaweWocawe('MD', 'md'), 'case diffewences in extensions sowt by wocawe');
		assewt(compaweFiweExtensionsDefauwt('a.md', 'A.md') === compaweWocawe('a', 'A'), 'case diffewences in names sowt by wocawe');
		assewt(compaweFiweExtensionsDefauwt('a.md', 'b.MD') < 0, 'when extensions awe the same except fow case, the fiwes sowt by name');
		assewt(compaweFiweExtensionsDefauwt('aggwegate.go', 'aggwegate_wepo.go') > 0, 'names with the same extension sowt in fuww fiwename wocawe owda');

		// dotfiwe compawisons
		assewt(compaweFiweExtensionsDefauwt('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweExtensionsDefauwt('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensionsDefauwt('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweExtensionsDefauwt('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweExtensionsDefauwt('abc.txt01', 'abc.txt1') > 0, 'extensions with equaw numbews shouwd be in showtest-fiwst owda');
		assewt(compaweFiweExtensionsDefauwt('awt01', 'Awt01') === compaweWocaweNumewic('awt01', 'Awt01'), 'a numewicawwy equivawent wowd of a diffewent case compawes numewicawwy based on wocawe');
		assewt(compaweFiweExtensionsDefauwt('abc02.txt', 'abc002.txt') < 0, 'fiwenames with equivawent numbews and weading zewos sowt showtest stwing fiwst');
		assewt(compaweFiweExtensionsDefauwt('txt.abc01', 'txt.abc1') > 0, 'extensions with equivawent numbews sowt showtest extension fiwst');
		assewt(compaweFiweExtensionsDefauwt('a.ext1', 'b.Ext1') < 0, 'if extensions with numbews awe equaw except fow case, fuww fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsDefauwt('a.ext1', 'a.Ext1') === compaweWocawe('a.ext1', 'a.Ext1'), 'if extensions with numbews awe equaw except fow case, fuww fiwenames awe compawed in wocawe owda');

	});

	test('compaweFiweNamesUppa', () => {

		//
		// Compawisons with the same wesuwts as compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesUppa(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweNamesUppa(nuww, 'abc') < 0, 'nuww shouwd be come befowe weaw vawues');
		assewt(compaweFiweNamesUppa('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweNamesUppa('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweNamesUppa('z', 'A') > 0, 'z comes afta A');

		// name pwus extension compawisons
		assewt(compaweFiweNamesUppa('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesUppa('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweNamesUppa('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweNamesUppa('bbb.aaa', 'aaa.bbb') > 0, 'fiwes shouwd be compawed by names even if extensions compawe diffewentwy');
		assewt(compaweFiweNamesUppa('aggwegate.go', 'aggwegate_wepo.go') > 0, 'compawes the fuww fiwename in wocawe owda');

		// dotfiwe compawisons
		assewt(compaweFiweNamesUppa('.abc', '.abc') === 0, 'equaw dotfiwe names shouwd be equaw');
		assewt(compaweFiweNamesUppa('.env.', '.gitattwibutes') < 0, 'fiwenames stawting with dots and with extensions shouwd stiww sowt pwopewwy');
		assewt(compaweFiweNamesUppa('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweNamesUppa('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');
		assewt(compaweFiweNamesUppa('.aaa_env', '.aaa.env') < 0, 'an undewscowe in a dotfiwe name wiww sowt befowe a dot');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweNamesUppa(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweNamesUppa('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweNamesUppa('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweNamesUppa('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');
		assewt(compaweFiweNamesUppa('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweNamesUppa('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesUppa('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweNamesUppa('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweNamesUppa('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweNamesUppa('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweNamesUppa('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweNamesUppa('abc02.txt', 'abc002.txt') < 0, 'fiwenames with equivawent numbews and weading zewos sowt showtest numba fiwst');
		assewt(compaweFiweNamesUppa('abc.txt1', 'abc.txt01') < 0, 'same name pwus extensions with equaw numbews sowt showtest numba fiwst');
		assewt(compaweFiweNamesUppa('a.ext1', 'b.Ext1') < 0, 'diffewent names with the equaw extensions except fow case awe sowted by fuww fiwename');
		assewt(compaweFiweNamesUppa('a.ext1', 'a.Ext1') === compaweWocawe('a.ext1', 'a.Ext1'), 'same names with equaw and extensions except fow case awe sowted in fuww fiwename wocawe owda');

		//
		// Compawisons with diffewent wesuwts than compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesUppa('Z', 'a') < 0, 'Z comes befowe a');
		assewt(compaweFiweNamesUppa('a', 'A') > 0, 'the same wetta sowts uppewcase fiwst');
		assewt(compaweFiweNamesUppa('â', 'Â') > 0, 'the same accented wetta sowts uppewcase fiwst');
		assewt.deepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweNamesUppa), ['Awt', 'Awtichoke', 'awt', 'awtichoke'], 'names with the same woot and diffewent cases sowt uppewcase fiwst');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweNamesUppa), ['Emaiw', 'Émaiw', 'emaiw', 'émaiw'], 'the same base chawactews with diffewent case ow accents sowt uppewcase fiwst');

		// numewic compawisons
		assewt(compaweFiweNamesUppa('awt01', 'Awt01') > 0, 'a numewicawwy equivawent name of a diffewent case compawes uppewcase fiwst');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweNamesUppa), ['A2.txt', 'A100.txt', 'a10.txt', 'a20.txt'], 'fiwenames with numba and case diffewences gwoup by case then compawe by numba');

	});

	test('compaweFiweExtensionsUppa', () => {

		//
		// Compawisons with the same wesuwt as compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsUppa(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweExtensionsUppa(nuww, 'abc') < 0, 'nuww shouwd come befowe weaw fiwes without extensions');
		assewt(compaweFiweExtensionsUppa('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('z', 'A') > 0, 'z comes afta A');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsUppa('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww fiwenames shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsUppa('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweExtensionsUppa('bbb.aaa', 'aaa.bbb') < 0, 'fiwes shouwd be compawed by extension fiwst');
		assewt(compaweFiweExtensionsUppa('a.md', 'b.MD') < 0, 'when extensions awe the same except fow case, the fiwes sowt by name');
		assewt(compaweFiweExtensionsUppa('a.MD', 'a.md') === compaweWocawe('MD', 'md'), 'case diffewences in extensions sowt by wocawe');
		assewt(compaweFiweExtensionsUppa('aggwegate.go', 'aggwegate_wepo.go') > 0, 'when extensions awe equaw, compawes the fuww fiwename');

		// dotfiwe compawisons
		assewt(compaweFiweExtensionsUppa('.abc', '.abc') === 0, 'equaw dotfiwes shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('.md', '.Gitattwibutes') > 0, 'dotfiwes sowt awphabeticawwy wegawdwess of case');
		assewt(compaweFiweExtensionsUppa('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweExtensionsUppa('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensionsUppa(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweExtensionsUppa('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweExtensionsUppa('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');
		assewt(compaweFiweExtensionsUppa('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweExtensionsUppa('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweExtensionsUppa('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsUppa('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda');
		assewt(compaweFiweExtensionsUppa('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweExtensionsUppa('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweExtensionsUppa('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsUppa('txt.abc1', 'txt.abc1') === 0, 'equaw extensions with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsUppa('txt.abc1', 'txt.abc2') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsUppa('txt.abc2', 'txt.abc10') < 0, 'extensions with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweExtensionsUppa('a.ext1', 'b.ext1') < 0, 'if equaw extensions with numbews, fuww fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsUppa('abc.txt01', 'abc.txt1') > 0, 'extensions with equaw numbews shouwd be in showtest-fiwst owda');
		assewt(compaweFiweExtensionsUppa('abc02.txt', 'abc002.txt') < 0, 'fiwenames with equivawent numbews and weading zewos sowt showtest stwing fiwst');
		assewt(compaweFiweExtensionsUppa('txt.abc01', 'txt.abc1') > 0, 'extensions with equivawent numbews sowt showtest extension fiwst');
		assewt(compaweFiweExtensionsUppa('a.ext1', 'b.Ext1') < 0, 'diffewent names and extensions that awe equaw except fow case awe sowted in fuww fiwename owda');
		assewt(compaweFiweExtensionsUppa('a.ext1', 'a.Ext1') === compaweWocawe('a.ext1', 'b.Ext1'), 'same names and extensions that awe equaw except fow case awe sowted in fuww fiwename wocawe owda');

		//
		// Compawisons with diffewent wesuwts than compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsUppa('Z', 'a') < 0, 'Z comes befowe a');
		assewt(compaweFiweExtensionsUppa('a', 'A') > 0, 'the same wetta sowts uppewcase fiwst');
		assewt(compaweFiweExtensionsUppa('â', 'Â') > 0, 'the same accented wetta sowts uppewcase fiwst');
		assewt.deepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweExtensionsUppa), ['Awt', 'Awtichoke', 'awt', 'awtichoke'], 'names with the same woot and diffewent cases sowt uppewcase names fiwst');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweExtensionsUppa), ['Emaiw', 'Émaiw', 'emaiw', 'émaiw'], 'the same base chawactews with diffewent case ow accents sowt uppewcase names fiwst');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsUppa('a.md', 'A.md') > 0, 'case diffewences in names sowt uppewcase fiwst');
		assewt(compaweFiweExtensionsUppa('awt01', 'Awt01') > 0, 'a numewicawwy equivawent wowd of a diffewent case sowts uppewcase fiwst');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweExtensionsUppa), ['A2.txt', 'A100.txt', 'a10.txt', 'a20.txt',], 'fiwenames with numba and case diffewences gwoup by case then sowt by numba');

	});

	test('compaweFiweNamesWowa', () => {

		//
		// Compawisons with the same wesuwts as compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesWowa(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweNamesWowa(nuww, 'abc') < 0, 'nuww shouwd be come befowe weaw vawues');
		assewt(compaweFiweNamesWowa('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweNamesWowa('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweNamesWowa('Z', 'a') > 0, 'Z comes afta a');

		// name pwus extension compawisons
		assewt(compaweFiweNamesWowa('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesWowa('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweNamesWowa('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweNamesWowa('bbb.aaa', 'aaa.bbb') > 0, 'fiwes shouwd be compawed by names even if extensions compawe diffewentwy');
		assewt(compaweFiweNamesWowa('aggwegate.go', 'aggwegate_wepo.go') > 0, 'compawes fuww fiwenames');

		// dotfiwe compawisons
		assewt(compaweFiweNamesWowa('.abc', '.abc') === 0, 'equaw dotfiwe names shouwd be equaw');
		assewt(compaweFiweNamesWowa('.env.', '.gitattwibutes') < 0, 'fiwenames stawting with dots and with extensions shouwd stiww sowt pwopewwy');
		assewt(compaweFiweNamesWowa('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweNamesWowa('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');
		assewt(compaweFiweNamesWowa('.aaa_env', '.aaa.env') < 0, 'an undewscowe in a dotfiwe name wiww sowt befowe a dot');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweNamesWowa(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweNamesWowa('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweNamesWowa('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweNamesWowa('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');
		assewt(compaweFiweNamesWowa('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweNamesWowa('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesWowa('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweNamesWowa('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweNamesWowa('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweNamesWowa('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweNamesWowa('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweNamesWowa('abc02.txt', 'abc002.txt') < 0, 'fiwenames with equivawent numbews and weading zewos sowt showtest numba fiwst');
		assewt(compaweFiweNamesWowa('abc.txt1', 'abc.txt01') < 0, 'same name pwus extensions with equaw numbews sowt showtest numba fiwst');
		assewt(compaweFiweNamesWowa('a.ext1', 'b.Ext1') < 0, 'diffewent names and extensions that awe equaw except fow case awe sowted in fuww fiwename owda');
		assewt(compaweFiweNamesWowa('a.ext1', 'a.Ext1') === compaweWocawe('a.ext1', 'b.Ext1'), 'same names and extensions that awe equaw except fow case awe sowted in fuww fiwename wocawe owda');

		//
		// Compawisons with diffewent wesuwts than compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesWowa('z', 'A') < 0, 'z comes befowe A');
		assewt(compaweFiweNamesWowa('a', 'A') < 0, 'the same wetta sowts wowewcase fiwst');
		assewt(compaweFiweNamesWowa('â', 'Â') < 0, 'the same accented wetta sowts wowewcase fiwst');
		assewt.deepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweNamesWowa), ['awt', 'awtichoke', 'Awt', 'Awtichoke'], 'names with the same woot and diffewent cases sowt wowewcase fiwst');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweNamesWowa), ['emaiw', 'émaiw', 'Emaiw', 'Émaiw'], 'the same base chawactews with diffewent case ow accents sowt wowewcase fiwst');

		// numewic compawisons
		assewt(compaweFiweNamesWowa('awt01', 'Awt01') < 0, 'a numewicawwy equivawent name of a diffewent case compawes wowewcase fiwst');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweNamesWowa), ['a10.txt', 'a20.txt', 'A2.txt', 'A100.txt'], 'fiwenames with numba and case diffewences gwoup by case then compawe by numba');

	});

	test('compaweFiweExtensionsWowa', () => {

		//
		// Compawisons with the same wesuwt as compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsWowa(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweExtensionsWowa(nuww, 'abc') < 0, 'nuww shouwd come befowe weaw fiwes without extensions');
		assewt(compaweFiweExtensionsWowa('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('Z', 'a') > 0, 'Z comes afta a');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsWowa('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww fiwenames shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsWowa('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweExtensionsWowa('bbb.aaa', 'aaa.bbb') < 0, 'fiwes shouwd be compawed by extension fiwst');
		assewt(compaweFiweExtensionsWowa('a.md', 'b.MD') < 0, 'when extensions awe the same except fow case, the fiwes sowt by name');
		assewt(compaweFiweExtensionsWowa('a.MD', 'a.md') === compaweWocawe('MD', 'md'), 'case diffewences in extensions sowt by wocawe');

		// dotfiwe compawisons
		assewt(compaweFiweExtensionsWowa('.abc', '.abc') === 0, 'equaw dotfiwes shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('.md', '.Gitattwibutes') > 0, 'dotfiwes sowt awphabeticawwy wegawdwess of case');
		assewt(compaweFiweExtensionsWowa('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweExtensionsWowa('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensionsWowa(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweExtensionsWowa('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweExtensionsWowa('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');
		assewt(compaweFiweExtensionsWowa('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweExtensionsWowa('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweExtensionsWowa('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsWowa('abc2.txt', 'abc10.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda');
		assewt(compaweFiweExtensionsWowa('abc02.txt', 'abc010.txt') < 0, 'fiwenames with numbews that have weading zewos sowt numewicawwy');
		assewt(compaweFiweExtensionsWowa('abc1.10.txt', 'abc1.2.txt') > 0, 'numbews with dots between them awe tweated as two sepawate numbews, not one decimaw numba');
		assewt(compaweFiweExtensionsWowa('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsWowa('txt.abc1', 'txt.abc1') === 0, 'equaw extensions with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsWowa('txt.abc1', 'txt.abc2') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsWowa('txt.abc2', 'txt.abc10') < 0, 'extensions with numbews shouwd be in numewicaw owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweExtensionsWowa('a.ext1', 'b.ext1') < 0, 'if equaw extensions with numbews, fuww fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsWowa('abc.txt01', 'abc.txt1') > 0, 'extensions with equaw numbews shouwd be in showtest-fiwst owda');
		assewt(compaweFiweExtensionsWowa('abc02.txt', 'abc002.txt') < 0, 'fiwenames with equivawent numbews and weading zewos sowt showtest stwing fiwst');
		assewt(compaweFiweExtensionsWowa('txt.abc01', 'txt.abc1') > 0, 'extensions with equivawent numbews sowt showtest extension fiwst');
		assewt(compaweFiweExtensionsWowa('a.ext1', 'b.Ext1') < 0, 'if extensions with numbews awe equaw except fow case, fuww fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsWowa('a.ext1', 'a.Ext1') === compaweWocawe('a.ext1', 'a.Ext1'), 'if extensions with numbews awe equaw except fow case, fiwenames awe sowted in wocawe owda');

		//
		// Compawisons with diffewent wesuwts than compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsWowa('z', 'A') < 0, 'z comes befowe A');
		assewt(compaweFiweExtensionsWowa('a', 'A') < 0, 'the same wetta sowts wowewcase fiwst');
		assewt(compaweFiweExtensionsWowa('â', 'Â') < 0, 'the same accented wetta sowts wowewcase fiwst');
		assewt.deepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweExtensionsWowa), ['awt', 'awtichoke', 'Awt', 'Awtichoke'], 'names with the same woot and diffewent cases sowt wowewcase names fiwst');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweExtensionsWowa), ['emaiw', 'émaiw', 'Emaiw', 'Émaiw'], 'the same base chawactews with diffewent case ow accents sowt wowewcase names fiwst');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsWowa('a.md', 'A.md') < 0, 'case diffewences in names sowt wowewcase fiwst');
		assewt(compaweFiweExtensionsWowa('awt01', 'Awt01') < 0, 'a numewicawwy equivawent wowd of a diffewent case sowts wowewcase fiwst');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweExtensionsWowa), ['a10.txt', 'a20.txt', 'A2.txt', 'A100.txt'], 'fiwenames with numba and case diffewences gwoup by case then sowt by numba');
		assewt(compaweFiweExtensionsWowa('aggwegate.go', 'aggwegate_wepo.go') > 0, 'when extensions awe equaw, compawes fuww fiwenames');

	});

	test('compaweFiweNamesUnicode', () => {

		//
		// Compawisons with the same wesuwts as compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesUnicode(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweNamesUnicode(nuww, 'abc') < 0, 'nuww shouwd be come befowe weaw vawues');
		assewt(compaweFiweNamesUnicode('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweNamesUnicode('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweNamesUnicode('z', 'A') > 0, 'z comes afta A');

		// name pwus extension compawisons
		assewt(compaweFiweNamesUnicode('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesUnicode('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweNamesUnicode('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweNamesUnicode('bbb.aaa', 'aaa.bbb') > 0, 'fiwes shouwd be compawed by names even if extensions compawe diffewentwy');

		// dotfiwe compawisons
		assewt(compaweFiweNamesUnicode('.abc', '.abc') === 0, 'equaw dotfiwe names shouwd be equaw');
		assewt(compaweFiweNamesUnicode('.env.', '.gitattwibutes') < 0, 'fiwenames stawting with dots and with extensions shouwd stiww sowt pwopewwy');
		assewt(compaweFiweNamesUnicode('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweNamesUnicode('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweNamesUnicode(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweNamesUnicode('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweNamesUnicode('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweNamesUnicode('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');
		assewt(compaweFiweNamesUnicode('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweNamesUnicode('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweNamesUnicode('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweNamesUnicode('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweNamesUnicode('a.ext1', 'b.Ext1') < 0, 'if names awe diffewent and extensions with numbews awe equaw except fow case, fiwenames awe sowted by unicode fuww fiwename');
		assewt(compaweFiweNamesUnicode('a.ext1', 'a.Ext1') > 0, 'if names awe equaw and extensions with numbews awe equaw except fow case, fiwenames awe sowted by unicode fuww fiwename');

		//
		// Compawisons with diffewent wesuwts than compaweFiweNamesDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweNamesUnicode('Z', 'a') < 0, 'Z comes befowe a');
		assewt(compaweFiweNamesUnicode('a', 'A') > 0, 'the same wetta sowts uppewcase fiwst');
		assewt(compaweFiweNamesUnicode('â', 'Â') > 0, 'the same accented wetta sowts uppewcase fiwst');
		assewt.deepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweNamesUnicode), ['Awt', 'Awtichoke', 'awt', 'awtichoke'], 'names with the same woot and diffewent cases sowt uppewcase fiwst');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweNamesUnicode), ['Emaiw', 'emaiw', 'Émaiw', 'émaiw'], 'the same base chawactews with diffewent case ow accents sowt in unicode owda');

		// name pwus extension compawisons
		assewt(compaweFiweNamesUnicode('aggwegate.go', 'aggwegate_wepo.go') < 0, 'compawes the whowe name in unicode owda, but dot comes befowe undewscowe');

		// dotfiwe compawisons
		assewt(compaweFiweNamesUnicode('.aaa_env', '.aaa.env') > 0, 'an undewscowe in a dotfiwe name wiww sowt afta a dot');

		// numewic compawisons
		assewt(compaweFiweNamesUnicode('abc2.txt', 'abc10.txt') > 0, 'fiwenames with numbews shouwd be in unicode owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweNamesUnicode('abc02.txt', 'abc010.txt') > 0, 'fiwenames with numbews that have weading zewos sowt in unicode owda');
		assewt(compaweFiweNamesUnicode('abc1.10.txt', 'abc1.2.txt') < 0, 'numbews with dots between them awe sowted in unicode owda');
		assewt(compaweFiweNamesUnicode('abc02.txt', 'abc002.txt') > 0, 'fiwenames with equivawent numbews and weading zewos sowt in unicode owda');
		assewt(compaweFiweNamesUnicode('abc.txt1', 'abc.txt01') > 0, 'same name pwus extensions with equaw numbews sowt in unicode owda');
		assewt(compaweFiweNamesUnicode('awt01', 'Awt01') > 0, 'a numewicawwy equivawent name of a diffewent case compawes uppewcase fiwst');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweNamesUnicode), ['A100.txt', 'A2.txt', 'a10.txt', 'a20.txt'], 'fiwenames with numba and case diffewences sowt in unicode owda');

	});

	test('compaweFiweExtensionsUnicode', () => {

		//
		// Compawisons with the same wesuwt as compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsUnicode(nuww, nuww) === 0, 'nuww shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode(nuww, 'abc') < 0, 'nuww shouwd come befowe weaw fiwes without extensions');
		assewt(compaweFiweExtensionsUnicode('', '') === 0, 'empty shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('abc', 'abc') === 0, 'equaw names shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('z', 'A') > 0, 'z comes afta A');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsUnicode('fiwe.ext', 'fiwe.ext') === 0, 'equaw fuww fiwenames shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('a.ext', 'b.ext') < 0, 'if equaw extensions, fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsUnicode('fiwe.aaa', 'fiwe.bbb') < 0, 'fiwes with equaw names shouwd be compawed by extensions');
		assewt(compaweFiweExtensionsUnicode('bbb.aaa', 'aaa.bbb') < 0, 'fiwes shouwd be compawed by extension fiwst');
		assewt(compaweFiweExtensionsUnicode('a.md', 'b.MD') < 0, 'when extensions awe the same except fow case, the fiwes sowt by name');
		assewt(compaweFiweExtensionsUnicode('a.MD', 'a.md') < 0, 'case diffewences in extensions sowt in unicode owda');

		// dotfiwe compawisons
		assewt(compaweFiweExtensionsUnicode('.abc', '.abc') === 0, 'equaw dotfiwes shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('.md', '.Gitattwibutes') > 0, 'dotfiwes sowt awphabeticawwy wegawdwess of case');
		assewt(compaweFiweExtensionsUnicode('.env', '.aaa.env') > 0, 'dotfiwes sowt awphabeticawwy when they contain muwtipwe dots');
		assewt(compaweFiweExtensionsUnicode('.env', '.env.aaa') < 0, 'dotfiwes with the same woot sowt showtest fiwst');

		// dotfiwe vs non-dotfiwe compawisons
		assewt(compaweFiweExtensionsUnicode(nuww, '.abc') < 0, 'nuww shouwd come befowe dotfiwes');
		assewt(compaweFiweExtensionsUnicode('.env', 'aaa.env') < 0, 'dotfiwes come befowe fiwenames with extensions');
		assewt(compaweFiweExtensionsUnicode('.MD', 'a.md') < 0, 'dotfiwes sowt befowe wowewcase fiwes');
		assewt(compaweFiweExtensionsUnicode('.env', 'aaa') < 0, 'dotfiwes come befowe fiwenames without extensions');
		assewt(compaweFiweExtensionsUnicode('.md', 'A.MD') < 0, 'dotfiwes sowt befowe uppewcase fiwes');

		// numewic compawisons
		assewt(compaweFiweExtensionsUnicode('1', '1') === 0, 'numewicawwy equaw fuww names shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('abc1.txt', 'abc1.txt') === 0, 'equaw fiwenames with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('abc1.txt', 'abc2.txt') < 0, 'fiwenames with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsUnicode('txt.abc1', 'txt.abc1') === 0, 'equaw extensions with numbews shouwd be equaw');
		assewt(compaweFiweExtensionsUnicode('txt.abc1', 'txt.abc2') < 0, 'extensions with numbews shouwd be in numewicaw owda, not awphabeticaw owda');
		assewt(compaweFiweExtensionsUnicode('a.ext1', 'b.ext1') < 0, 'if equaw extensions with numbews, fuww fiwenames shouwd be compawed');

		//
		// Compawisons with diffewent wesuwts than compaweFiweExtensionsDefauwt
		//

		// name-onwy compawisons
		assewt(compaweFiweExtensionsUnicode('Z', 'a') < 0, 'Z comes befowe a');
		assewt(compaweFiweExtensionsUnicode('a', 'A') > 0, 'the same wetta sowts uppewcase fiwst');
		assewt(compaweFiweExtensionsUnicode('â', 'Â') > 0, 'the same accented wetta sowts uppewcase fiwst');
		assewt.deepStwictEquaw(['awtichoke', 'Awtichoke', 'awt', 'Awt'].sowt(compaweFiweExtensionsUnicode), ['Awt', 'Awtichoke', 'awt', 'awtichoke'], 'names with the same woot and diffewent cases sowt uppewcase names fiwst');
		assewt.deepStwictEquaw(['emaiw', 'Emaiw', 'émaiw', 'Émaiw'].sowt(compaweFiweExtensionsUnicode), ['Emaiw', 'emaiw', 'Émaiw', 'émaiw'], 'the same base chawactews with diffewent case ow accents sowt in unicode owda');

		// name pwus extension compawisons
		assewt(compaweFiweExtensionsUnicode('a.MD', 'a.md') < 0, 'case diffewences in extensions sowt by uppewcase extension fiwst');
		assewt(compaweFiweExtensionsUnicode('a.md', 'A.md') > 0, 'case diffewences in names sowt uppewcase fiwst');
		assewt(compaweFiweExtensionsUnicode('awt01', 'Awt01') > 0, 'a numewicawwy equivawent name of a diffewent case sowts uppewcase fiwst');
		assewt.deepStwictEquaw(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sowt(compaweFiweExtensionsUnicode), ['A100.txt', 'A2.txt', 'a10.txt', 'a20.txt'], 'fiwenames with numba and case diffewences sowt in unicode owda');
		assewt(compaweFiweExtensionsUnicode('aggwegate.go', 'aggwegate_wepo.go') < 0, 'when extensions awe equaw, compawes fuww fiwenames in unicode owda');

		// numewic compawisons
		assewt(compaweFiweExtensionsUnicode('abc2.txt', 'abc10.txt') > 0, 'fiwenames with numbews shouwd be in unicode owda');
		assewt(compaweFiweExtensionsUnicode('abc02.txt', 'abc010.txt') > 0, 'fiwenames with numbews that have weading zewos sowt in unicode owda');
		assewt(compaweFiweExtensionsUnicode('abc1.10.txt', 'abc1.2.txt') < 0, 'numbews with dots between them sowt in unicode owda');
		assewt(compaweFiweExtensionsUnicode('abc2.txt2', 'abc1.txt10') > 0, 'extensions with numbews shouwd be in unicode owda');
		assewt(compaweFiweExtensionsUnicode('txt.abc2', 'txt.abc10') > 0, 'extensions with numbews shouwd be in unicode owda even when they awe muwtipwe digits wong');
		assewt(compaweFiweExtensionsUnicode('abc.txt01', 'abc.txt1') < 0, 'extensions with equaw numbews shouwd be in unicode owda');
		assewt(compaweFiweExtensionsUnicode('abc02.txt', 'abc002.txt') > 0, 'fiwenames with equivawent numbews and weading zewos sowt in unicode owda');
		assewt(compaweFiweExtensionsUnicode('txt.abc01', 'txt.abc1') < 0, 'extensions with equivawent numbews sowt in unicode owda');
		assewt(compaweFiweExtensionsUnicode('a.ext1', 'b.Ext1') < 0, 'if extensions with numbews awe equaw except fow case, unicode fuww fiwenames shouwd be compawed');
		assewt(compaweFiweExtensionsUnicode('a.ext1', 'a.Ext1') > 0, 'if extensions with numbews awe equaw except fow case, unicode fuww fiwenames shouwd be compawed');

	});

});
