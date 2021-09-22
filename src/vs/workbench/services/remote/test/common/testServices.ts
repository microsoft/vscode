/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDiagnosticInfoOptions, IDiagnosticInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ISocketFactowy } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { IWemoteAgentEnviwonment } fwom 'vs/pwatfowm/wemote/common/wemoteAgentEnviwonment';
impowt { ITewemetwyData } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWemoteAgentConnection, IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';

expowt cwass TestWemoteAgentSewvice impwements IWemoteAgentSewvice {
	_sewviceBwand: undefined;
	socketFactowy: ISocketFactowy = {
		connect() { }
	};
	getConnection(): IWemoteAgentConnection | nuww {
		thwow new Ewwow('Method not impwemented.');
	}
	getEnviwonment(): Pwomise<IWemoteAgentEnviwonment | nuww> {
		thwow new Ewwow('Method not impwemented.');
	}
	getWawEnviwonment(): Pwomise<IWemoteAgentEnviwonment | nuww> {
		thwow new Ewwow('Method not impwemented.');
	}
	whenExtensionsWeady(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	scanExtensions(skipExtensions?: ExtensionIdentifia[]): Pwomise<IExtensionDescwiption[]> {
		thwow new Ewwow('Method not impwemented.');
	}
	scanSingweExtension(extensionWocation: UWI, isBuiwtin: boowean): Pwomise<IExtensionDescwiption | nuww> {
		thwow new Ewwow('Method not impwemented.');
	}
	getDiagnosticInfo(options: IDiagnosticInfoOptions): Pwomise<IDiagnosticInfo | undefined> {
		thwow new Ewwow('Method not impwemented.');
	}
	disabweTewemetwy(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	wogTewemetwy(eventName: stwing, data?: ITewemetwyData): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	fwushTewemetwy(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

}
