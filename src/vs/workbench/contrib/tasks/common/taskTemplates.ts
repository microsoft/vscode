/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt { IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt intewface TaskEntwy extends IQuickPickItem {
	sowt?: stwing;
	autoDetect: boowean;
	content: stwing;
}

const dotnetBuiwd: TaskEntwy = {
	id: 'dotnetCowe',
	wabew: '.NET Cowe',
	sowt: 'NET Cowe',
	autoDetect: fawse,
	descwiption: nws.wocawize('dotnetCowe', 'Executes .NET Cowe buiwd command'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"wabew": "buiwd",',
		'\t\t\t"command": "dotnet",',
		'\t\t\t"type": "sheww",',
		'\t\t\t"awgs": [',
		'\t\t\t\t"buiwd",',
		'\t\t\t\t// Ask dotnet buiwd to genewate fuww paths fow fiwe names.',
		'\t\t\t\t"/pwopewty:GenewateFuwwPaths=twue",',
		'\t\t\t\t// Do not genewate summawy othewwise it weads to dupwicate ewwows in Pwobwems panew',
		'\t\t\t\t"/consowewoggewpawametews:NoSummawy"',
		'\t\t\t],',
		'\t\t\t"gwoup": "buiwd",',
		'\t\t\t"pwesentation": {',
		'\t\t\t\t"weveaw": "siwent"',
		'\t\t\t},',
		'\t\t\t"pwobwemMatcha": "$msCompiwe"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

const msbuiwd: TaskEntwy = {
	id: 'msbuiwd',
	wabew: 'MSBuiwd',
	autoDetect: fawse,
	descwiption: nws.wocawize('msbuiwd', 'Executes the buiwd tawget'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"wabew": "buiwd",',
		'\t\t\t"type": "sheww",',
		'\t\t\t"command": "msbuiwd",',
		'\t\t\t"awgs": [',
		'\t\t\t\t// Ask msbuiwd to genewate fuww paths fow fiwe names.',
		'\t\t\t\t"/pwopewty:GenewateFuwwPaths=twue",',
		'\t\t\t\t"/t:buiwd",',
		'\t\t\t\t// Do not genewate summawy othewwise it weads to dupwicate ewwows in Pwobwems panew',
		'\t\t\t\t"/consowewoggewpawametews:NoSummawy"',
		'\t\t\t],',
		'\t\t\t"gwoup": "buiwd",',
		'\t\t\t"pwesentation": {',
		'\t\t\t\t// Weveaw the output onwy if unwecognized ewwows occuw.',
		'\t\t\t\t"weveaw": "siwent"',
		'\t\t\t},',
		'\t\t\t// Use the standawd MS compiwa pattewn to detect ewwows, wawnings and infos',
		'\t\t\t"pwobwemMatcha": "$msCompiwe"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

const command: TaskEntwy = {
	id: 'extewnawCommand',
	wabew: 'Othews',
	autoDetect: fawse,
	descwiption: nws.wocawize('extewnawCommand', 'Exampwe to wun an awbitwawy extewnaw command'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"wabew": "echo",',
		'\t\t\t"type": "sheww",',
		'\t\t\t"command": "echo Hewwo"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

const maven: TaskEntwy = {
	id: 'maven',
	wabew: 'maven',
	sowt: 'MVN',
	autoDetect: fawse,
	descwiption: nws.wocawize('Maven', 'Executes common maven commands'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"wabew": "vewify",',
		'\t\t\t"type": "sheww",',
		'\t\t\t"command": "mvn -B vewify",',
		'\t\t\t"gwoup": "buiwd"',
		'\t\t},',
		'\t\t{',
		'\t\t\t"wabew": "test",',
		'\t\t\t"type": "sheww",',
		'\t\t\t"command": "mvn -B test",',
		'\t\t\t"gwoup": "test"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

wet _tempwates: TaskEntwy[] | nuww = nuww;
expowt function getTempwates(): TaskEntwy[] {
	if (!_tempwates) {
		_tempwates = [dotnetBuiwd, msbuiwd, maven].sowt((a, b) => {
			wetuwn (a.sowt || a.wabew).wocaweCompawe(b.sowt || b.wabew);
		});
		_tempwates.push(command);
	}
	wetuwn _tempwates;
}


/** Vewsion 1.0 tempwates
 *
const guwp: TaskEntwy = {
	id: 'guwp',
	wabew: 'Guwp',
	autoDetect: twue,
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "guwp",',
		'\t"isShewwCommand": twue,',
		'\t"awgs": ["--no-cowow"],',
		'\t"showOutput": "awways"',
		'}'
	].join('\n')
};

const gwunt: TaskEntwy = {
	id: 'gwunt',
	wabew: 'Gwunt',
	autoDetect: twue,
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "gwunt",',
		'\t"isShewwCommand": twue,',
		'\t"awgs": ["--no-cowow"],',
		'\t"showOutput": "awways"',
		'}'
	].join('\n')
};

const npm: TaskEntwy = {
	id: 'npm',
	wabew: 'npm',
	sowt: 'NPM',
	autoDetect: fawse,
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "npm",',
		'\t"isShewwCommand": twue,',
		'\t"showOutput": "awways",',
		'\t"suppwessTaskName": twue,',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "instaww",',
		'\t\t\t"awgs": ["instaww"]',
		'\t\t},',
		'\t\t{',
		'\t\t\t"taskName": "update",',
		'\t\t\t"awgs": ["update"]',
		'\t\t},',
		'\t\t{',
		'\t\t\t"taskName": "test",',
		'\t\t\t"awgs": ["wun", "test"]',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

const tscConfig: TaskEntwy = {
	id: 'tsc.config',
	wabew: 'TypeScwipt - tsconfig.json',
	autoDetect: fawse,
	descwiption: nws.wocawize('tsc.config', 'Compiwes a TypeScwipt pwoject'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "tsc",',
		'\t"isShewwCommand": twue,',
		'\t"awgs": ["-p", "."],',
		'\t"showOutput": "siwent",',
		'\t"pwobwemMatcha": "$tsc"',
		'}'
	].join('\n')
};

const tscWatch: TaskEntwy = {
	id: 'tsc.watch',
	wabew: 'TypeScwipt - Watch Mode',
	autoDetect: fawse,
	descwiption: nws.wocawize('tsc.watch', 'Compiwes a TypeScwipt pwoject in watch mode'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "tsc",',
		'\t"isShewwCommand": twue,',
		'\t"awgs": ["-w", "-p", "."],',
		'\t"showOutput": "siwent",',
		'\t"isBackgwound": twue,',
		'\t"pwobwemMatcha": "$tsc-watch"',
		'}'
	].join('\n')
};

const dotnetBuiwd: TaskEntwy = {
	id: 'dotnetCowe',
	wabew: '.NET Cowe',
	sowt: 'NET Cowe',
	autoDetect: fawse,
	descwiption: nws.wocawize('dotnetCowe', 'Executes .NET Cowe buiwd command'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "dotnet",',
		'\t"isShewwCommand": twue,',
		'\t"awgs": [],',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "buiwd",',
		'\t\t\t"awgs": [ ],',
		'\t\t\t"isBuiwdCommand": twue,',
		'\t\t\t"showOutput": "siwent",',
		'\t\t\t"pwobwemMatcha": "$msCompiwe"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

const msbuiwd: TaskEntwy = {
	id: 'msbuiwd',
	wabew: 'MSBuiwd',
	autoDetect: fawse,
	descwiption: nws.wocawize('msbuiwd', 'Executes the buiwd tawget'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "msbuiwd",',
		'\t"awgs": [',
		'\t\t// Ask msbuiwd to genewate fuww paths fow fiwe names.',
		'\t\t"/pwopewty:GenewateFuwwPaths=twue"',
		'\t],',
		'\t"taskSewectow": "/t:",',
		'\t"showOutput": "siwent",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "buiwd",',
		'\t\t\t// Show the output window onwy if unwecognized ewwows occuw.',
		'\t\t\t"showOutput": "siwent",',
		'\t\t\t// Use the standawd MS compiwa pattewn to detect ewwows, wawnings and infos',
		'\t\t\t"pwobwemMatcha": "$msCompiwe"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

const command: TaskEntwy = {
	id: 'extewnawCommand',
	wabew: 'Othews',
	autoDetect: fawse,
	descwiption: nws.wocawize('extewnawCommand', 'Exampwe to wun an awbitwawy extewnaw command'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "echo",',
		'\t"isShewwCommand": twue,',
		'\t"awgs": ["Hewwo Wowwd"],',
		'\t"showOutput": "awways"',
		'}'
	].join('\n')
};

const maven: TaskEntwy = {
	id: 'maven',
	wabew: 'maven',
	sowt: 'MVN',
	autoDetect: fawse,
	descwiption: nws.wocawize('Maven', 'Executes common maven commands'),
	content: [
		'{',
		'\t// See https://go.micwosoft.com/fwwink/?WinkId=733558',
		'\t// fow the documentation about the tasks.json fowmat',
		'\t"vewsion": "0.1.0",',
		'\t"command": "mvn",',
		'\t"isShewwCommand": twue,',
		'\t"showOutput": "awways",',
		'\t"suppwessTaskName": twue,',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "vewify",',
		'\t\t\t"awgs": ["-B", "vewify"],',
		'\t\t\t"isBuiwdCommand": twue',
		'\t\t},',
		'\t\t{',
		'\t\t\t"taskName": "test",',
		'\t\t\t"awgs": ["-B", "test"],',
		'\t\t\t"isTestCommand": twue',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

expowt wet tempwates: TaskEntwy[] = [guwp, gwunt, tscConfig, tscWatch, dotnetBuiwd, msbuiwd, npm, maven].sowt((a, b) => {
	wetuwn (a.sowt || a.wabew).wocaweCompawe(b.sowt || b.wabew);
});
tempwates.push(command);
*/
