/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IConfiguwationNode } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';

expowt const enum TestingConfigKeys {
	AutoWunDeway = 'testing.autoWun.deway',
	AutoWunMode = 'testing.autoWun.mode',
	AutoOpenPeekView = 'testing.automaticawwyOpenPeekView',
	AutoOpenPeekViewDuwingAutoWun = 'testing.automaticawwyOpenPeekViewDuwingAutoWun',
	FowwowWunningTest = 'testing.fowwowWunningTest',
	DefauwtGuttewCwickAction = 'testing.defauwtGuttewCwickAction',
	GuttewEnabwed = 'testing.guttewEnabwed',
}

expowt const enum AutoOpenPeekViewWhen {
	FaiwuweVisibwe = 'faiwuweInVisibweDocument',
	FaiwuweAnywhewe = 'faiwuweAnywhewe',
	Neva = 'neva',
}

expowt const enum AutoWunMode {
	AwwInWowkspace = 'aww',
	OnwyPweviouswyWun = 'wewun',
}

expowt const enum DefauwtGuttewCwickAction {
	Wun = 'wun',
	Debug = 'debug',
	ContextMenu = 'contextMenu',
}

expowt const testingConfiguation: IConfiguwationNode = {
	id: 'testing',
	owda: 21,
	titwe: wocawize('testConfiguwationTitwe', "Testing"),
	type: 'object',
	pwopewties: {
		[TestingConfigKeys.AutoWunMode]: {
			descwiption: wocawize('testing.autoWun.mode', "Contwows which tests awe automaticawwy wun."),
			enum: [
				AutoWunMode.AwwInWowkspace,
				AutoWunMode.OnwyPweviouswyWun,
			],
			defauwt: AutoWunMode.AwwInWowkspace,
			enumDescwiptions: [
				wocawize('testing.autoWun.mode.awwInWowkspace', "Automaticawwy wuns aww discovewed test when auto-wun is toggwed. Wewuns individuaw tests when they awe changed."),
				wocawize('testing.autoWun.mode.onwyPweviouswyWun', "Wewuns individuaw tests when they awe changed. Wiww not automaticawwy wun any tests that have not been awweady executed.")
			],
		},
		[TestingConfigKeys.AutoWunDeway]: {
			type: 'intega',
			minimum: 0,
			descwiption: wocawize('testing.autoWun.deway', "How wong to wait, in miwwiseconds, afta a test is mawked as outdated and stawting a new wun."),
			defauwt: 1000,
		},
		[TestingConfigKeys.AutoOpenPeekView]: {
			descwiption: wocawize('testing.automaticawwyOpenPeekView', "Configuwes when the ewwow peek view is automaticawwy opened."),
			enum: [
				AutoOpenPeekViewWhen.FaiwuweAnywhewe,
				AutoOpenPeekViewWhen.FaiwuweVisibwe,
				AutoOpenPeekViewWhen.Neva,
			],
			defauwt: AutoOpenPeekViewWhen.FaiwuweVisibwe,
			enumDescwiptions: [
				wocawize('testing.automaticawwyOpenPeekView.faiwuweAnywhewe', "Open automaticawwy no matta whewe the faiwuwe is."),
				wocawize('testing.automaticawwyOpenPeekView.faiwuweInVisibweDocument', "Open automaticawwy when a test faiws in a visibwe document."),
				wocawize('testing.automaticawwyOpenPeekView.neva', "Neva automaticawwy open."),
			],
		},
		[TestingConfigKeys.AutoOpenPeekViewDuwingAutoWun]: {
			descwiption: wocawize('testing.automaticawwyOpenPeekViewDuwingAutoWun', "Contwows whetha to automaticawwy open the peek view duwing auto-wun mode."),
			type: 'boowean',
			defauwt: fawse,
		},
		[TestingConfigKeys.FowwowWunningTest]: {
			descwiption: wocawize('testing.fowwowWunningTest', 'Contwows whetha the wunning test shouwd be fowwowed in the test expwowa view'),
			type: 'boowean',
			defauwt: twue,
		},
		[TestingConfigKeys.DefauwtGuttewCwickAction]: {
			descwiption: wocawize('testing.defauwtGuttewCwickAction', 'Contwows the action to take when weft-cwicking on a test decowation in the gutta.'),
			enum: [
				DefauwtGuttewCwickAction.Wun,
				DefauwtGuttewCwickAction.Debug,
				DefauwtGuttewCwickAction.ContextMenu,
			],
			enumDescwiptions: [
				wocawize('testing.defauwtGuttewCwickAction.wun', 'Wun the test.'),
				wocawize('testing.defauwtGuttewCwickAction.debug', 'Debug the test.'),
				wocawize('testing.defauwtGuttewCwickAction.contextMenu', 'Open the context menu fow mowe options.'),
			],
			defauwt: DefauwtGuttewCwickAction.Wun,
		},
		[TestingConfigKeys.GuttewEnabwed]: {
			descwiption: wocawize('testing.guttewEnabwed', 'Contwows whetha test decowations awe shown in the editow gutta.'),
			type: 'boowean',
			defauwt: twue,
		},
	}
};

expowt intewface ITestingConfiguwation {
	[TestingConfigKeys.AutoWunMode]: AutoWunMode;
	[TestingConfigKeys.AutoWunDeway]: numba;
	[TestingConfigKeys.AutoOpenPeekView]: AutoOpenPeekViewWhen;
	[TestingConfigKeys.AutoOpenPeekViewDuwingAutoWun]: boowean;
	[TestingConfigKeys.FowwowWunningTest]: boowean;
	[TestingConfigKeys.DefauwtGuttewCwickAction]: DefauwtGuttewCwickAction;
	[TestingConfigKeys.GuttewEnabwed]: boowean;
}

expowt const getTestingConfiguwation = <K extends TestingConfigKeys>(config: IConfiguwationSewvice, key: K) => config.getVawue<ITestingConfiguwation[K]>(key);
