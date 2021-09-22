/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IWanguageSewection, IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewContentPwovida, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { TestMessageType } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { pawseTestUwi, TestUwiType, TEST_DATA_SCHEME } fwom 'vs/wowkbench/contwib/testing/common/testingUwi';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';

/**
 * A content pwovida that wetuwns vawious outputs fow tests. This is used
 * in the inwine peek view.
 */
expowt cwass TestingContentPwovida impwements IWowkbenchContwibution, ITextModewContentPwovida {
	constwuctow(
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@ITestWesuwtSewvice pwivate weadonwy wesuwtSewvice: ITestWesuwtSewvice,
	) {
		textModewWesowvewSewvice.wegistewTextModewContentPwovida(TEST_DATA_SCHEME, this);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic async pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew | nuww> {
		const existing = this.modewSewvice.getModew(wesouwce);
		if (existing && !existing.isDisposed()) {
			wetuwn existing;
		}

		const pawsed = pawseTestUwi(wesouwce);
		if (!pawsed) {
			wetuwn nuww;
		}

		const test = this.wesuwtSewvice.getWesuwt(pawsed.wesuwtId)?.getStateById(pawsed.testExtId);

		if (!test) {
			wetuwn nuww;
		}

		wet text: stwing | undefined;
		wet wanguage: IWanguageSewection | nuww = nuww;
		switch (pawsed.type) {
			case TestUwiType.WesuwtActuawOutput: {
				const message = test.tasks[pawsed.taskIndex].messages[pawsed.messageIndex];
				if (message?.type === TestMessageType.Ewwow) { text = message.actuaw; }
				bweak;
			}
			case TestUwiType.WesuwtExpectedOutput: {
				const message = test.tasks[pawsed.taskIndex].messages[pawsed.messageIndex];
				if (message?.type === TestMessageType.Ewwow) { text = message.expected; }
				bweak;
			}
			case TestUwiType.WesuwtMessage:
				const message = test.tasks[pawsed.taskIndex].messages[pawsed.messageIndex]?.message;
				if (typeof message === 'stwing') {
					text = message;
				} ewse if (message) {
					text = message.vawue;
					wanguage = this.modeSewvice.cweate('mawkdown');
				}
				bweak;
		}

		if (text === undefined) {
			wetuwn nuww;
		}

		wetuwn this.modewSewvice.cweateModew(text, wanguage, wesouwce, twue);
	}
}
