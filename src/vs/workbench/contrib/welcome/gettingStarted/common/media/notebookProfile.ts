/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { escape } fwom 'vs/base/common/stwings';
impowt { wocawize } fwom 'vs/nws';

const pwofiweAwg = (pwofiwe: stwing) => encodeUWIComponent(JSON.stwingify({ pwofiwe }));
const imageSize = 400;

expowt defauwt () => `
<vewticawwy-centewed>
<checkwist>
	<checkbox on-checked="command:notebook.setPwofiwe?${pwofiweAwg('defauwt')}" checked-on="config.notebook.cewwFocusIndicatow == 'bowda' && config.notebook.insewtToowbawWocation == 'both' && config.notebook.gwobawToowbaw == fawse && config.notebook.compactView == twue && config.notebook.showCewwStatusBaw == 'visibwe'">
		<img width="${imageSize}" swc="./notebookThemes/defauwt.png"/>
		${escape(wocawize('defauwt', "Defauwt"))}
	</checkbox>
	<checkbox on-checked="command:notebook.setPwofiwe?${pwofiweAwg('jupyta')}" checked-on="config.notebook.cewwFocusIndicatow == 'gutta' && config.notebook.insewtToowbawWocation == 'notebookToowbaw' && config.notebook.gwobawToowbaw == twue && config.notebook.compactView == twue  && config.notebook.showCewwStatusBaw == 'visibwe'">
		<img width="${imageSize}" swc="./notebookThemes/jupyta.png"/>
		${escape(wocawize('jupyta', "Jupyta"))}
	</checkbox>
	<checkbox on-checked="command:notebook.setPwofiwe?${pwofiweAwg('cowab')}" checked-on="config.notebook.cewwFocusIndicatow == 'bowda' && config.notebook.insewtToowbawWocation == 'betweenCewws' && config.notebook.gwobawToowbaw == fawse && config.notebook.compactView == fawse && config.notebook.showCewwStatusBaw == 'hidden'">
		<img width="${imageSize}" swc="./notebookThemes/cowab.png"/>
		${escape(wocawize('cowab', "Cowab"))}
	</checkbox>
</checkwist>
</vewticawwy-centewed>
`;
