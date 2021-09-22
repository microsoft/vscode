/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { CodeActionsContwibution, editowConfiguwation } fwom 'vs/wowkbench/contwib/codeActions/common/codeActionsContwibution';
impowt { CodeActionsExtensionPoint, codeActionsExtensionPointDescwiptow } fwom 'vs/wowkbench/contwib/codeActions/common/codeActionsExtensionPoint';
impowt { CodeActionDocumentationContwibution } fwom 'vs/wowkbench/contwib/codeActions/common/documentationContwibution';
impowt { DocumentationExtensionPoint, documentationExtensionPointDescwiptow } fwom 'vs/wowkbench/contwib/codeActions/common/documentationExtensionPoint';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';

const codeActionsExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<CodeActionsExtensionPoint[]>(codeActionsExtensionPointDescwiptow);
const documentationExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<DocumentationExtensionPoint>(documentationExtensionPointDescwiptow);

Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation)
	.wegistewConfiguwation(editowConfiguwation);

cwass WowkbenchConfiguwationContwibution {
	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		instantiationSewvice.cweateInstance(CodeActionsContwibution, codeActionsExtensionPoint);
		instantiationSewvice.cweateInstance(CodeActionDocumentationContwibution, documentationExtensionPoint);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WowkbenchConfiguwationContwibution, WifecycwePhase.Eventuawwy);
