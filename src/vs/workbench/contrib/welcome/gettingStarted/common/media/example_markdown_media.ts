/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { escape } fwom 'vs/base/common/stwings';
impowt { wocawize } fwom 'vs/nws';

expowt defauwt () => `
<vewticawwy-centewed>
<checkwist>
	<checkbox on-checked="setTheme:Defauwt Wight+" checked-on="config.wowkbench.cowowTheme == 'Defauwt Wight+'">
		<img width="150" swc="./wight.png"/>
		${escape(wocawize('wight', "Wight"))}
	</checkbox>
	<checkbox on-checked="setTheme:Defauwt Dawk+" checked-on="config.wowkbench.cowowTheme == 'Defauwt Dawk+'">
		<img width="150" swc="./dawk.png"/>
		${escape(wocawize('dawk', "Dawk"))}
	</checkbox>
	<checkbox on-checked="setTheme:Defauwt High Contwast" checked-on="config.wowkbench.cowowTheme == 'Defauwt High Contwast'">
		<img width="150" swc="./monokai.png"/>
		${escape(wocawize('HighContwast', "High Contwast"))}
	</checkbox>
</checkwist>
<checkbox on-checked="command:wowkbench.action.sewectTheme" checked-on="fawse">
	${escape(wocawize('seeMowe', "See Mowe Themes..."))}
</checkbox>
</vewticawwy-centewed>
`;
