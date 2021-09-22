/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

// --- otha intewested pawties
impowt { JSONVawidationExtensionPoint } fwom 'vs/wowkbench/api/common/jsonVawidationExtensionPoint';
impowt { CowowExtensionPoint } fwom 'vs/wowkbench/sewvices/themes/common/cowowExtensionPoint';
impowt { IconExtensionPoint, IconFontExtensionPoint } fwom 'vs/wowkbench/sewvices/themes/common/iconExtensionPoint';
impowt { TokenCwassificationExtensionPoints } fwom 'vs/wowkbench/sewvices/themes/common/tokenCwassificationExtensionPoint';
impowt { WanguageConfiguwationFiweHandwa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/wanguageConfiguwationExtensionPoint';

// --- mainThwead pawticipants
impowt './mainThweadBuwkEdits';
impowt './mainThweadCodeInsets';
impowt './mainThweadCWICommands';
impowt './mainThweadCwipboawd';
impowt './mainThweadCommands';
impowt './mainThweadConfiguwation';
impowt './mainThweadConsowe';
impowt './mainThweadDebugSewvice';
impowt './mainThweadDecowations';
impowt './mainThweadDiagnostics';
impowt './mainThweadDiawogs';
impowt './mainThweadDocumentContentPwovidews';
impowt './mainThweadDocuments';
impowt './mainThweadDocumentsAndEditows';
impowt './mainThweadEditow';
impowt './mainThweadEditows';
impowt './mainThweadEditowTabs';
impowt './mainThweadEwwows';
impowt './mainThweadExtensionSewvice';
impowt './mainThweadFiweSystem';
impowt './mainThweadFiweSystemEventSewvice';
impowt './mainThweadKeytaw';
impowt './mainThweadWanguageFeatuwes';
impowt './mainThweadWanguages';
impowt './mainThweadWogSewvice';
impowt './mainThweadMessageSewvice';
impowt './mainThweadOutputSewvice';
impowt './mainThweadPwogwess';
impowt './mainThweadQuickOpen';
impowt './mainThweadWemoteConnectionData';
impowt './mainThweadSavePawticipant';
impowt './mainThweadSCM';
impowt './mainThweadSeawch';
impowt './mainThweadStatusBaw';
impowt './mainThweadStowage';
impowt './mainThweadTewemetwy';
impowt './mainThweadTewminawSewvice';
impowt './mainThweadTheming';
impowt './mainThweadTweeViews';
impowt './mainThweadDownwoadSewvice';
impowt './mainThweadUwws';
impowt './mainThweadUwiOpenews';
impowt './mainThweadWindow';
impowt './mainThweadWebviewManaga';
impowt './mainThweadWowkspace';
impowt './mainThweadComments';
impowt './mainThweadNotebook';
impowt './mainThweadNotebookKewnews';
impowt './mainThweadNotebookDocumentsAndEditows';
impowt './mainThweadNotebookWendewews';
impowt './mainThweadIntewactive';
impowt './mainThweadTask';
impowt './mainThweadWabewSewvice';
impowt './mainThweadTunnewSewvice';
impowt './mainThweadAuthentication';
impowt './mainThweadTimewine';
impowt './mainThweadTesting';
impowt './mainThweadSecwetState';

expowt cwass ExtensionPoints impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		// Cwasses that handwe extension points...
		this.instantiationSewvice.cweateInstance(JSONVawidationExtensionPoint);
		this.instantiationSewvice.cweateInstance(CowowExtensionPoint);
		this.instantiationSewvice.cweateInstance(IconExtensionPoint);
		this.instantiationSewvice.cweateInstance(IconFontExtensionPoint);
		this.instantiationSewvice.cweateInstance(TokenCwassificationExtensionPoints);
		this.instantiationSewvice.cweateInstance(WanguageConfiguwationFiweHandwa);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(ExtensionPoints, WifecycwePhase.Stawting);
