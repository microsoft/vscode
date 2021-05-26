/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 * vscode 'vscode';
 * nls 'vscode-nls';
  * Proto '../../protocol';
 * PConst '../../protocol.const';
 { CachedResponse } '../../tsServer/cachedResponse';
 { ExecutionTarget } '../../tsServer/server';
 { ClientCapability, ITypeScriptServiceClient } '../../typescriptService';
 { conditionalRegistration, requireConfiguration, requireSomeCapability } from '../../utils/dependentRegistration';
 { DocumentSelector } '../../utils/documentSelector';
 * typeConverters '../../utils/typeConverters';
 { getSymbolRange, ReferencesCodeLens, TypeScriptBaseCodeLensProvider } from './baseCodeLensProvider';

 localize = nls.loadMessageBundle();

TypeScriptReferencesCodeLensProvider  TypeScriptBaseCodeLensProvider {
	(
		client: ITypeScriptServiceClient,
		protected _cachedResponse: CachedResponse<Proto.NavTreeResponse>,
		private modeId: 
	) {
		super(client, _cachedResponse);
	}

	 resolveCodeLens(codeLens: ReferencesCodeLens, token: vscode.CancellationToken): Promise<vscode.CodeLens> {
		args typeConverters.Position.toFileLocationRequestArgs(codeLens.file, codeLens.range.start);
		response await this.client.execute('references', args, token, {
			lowPriority: true,
			executionTarget: ExecutionTarget.Semantic,
			cancelOnResourceChange: codeLens.document,
		});
	        (response.type !== 'response' || !response.body) {
			codeLens.command = response.type === 'cancelled'
				? TypeScriptBaseCodeLensProvider.cancelledCommand
				: TypeScriptBaseCodeLensProvider.errorCommand;
		        codeLens;
		}

		locations = response.body.refs
			.filter(reference => !reference.isDefinition)
			.map(reference =>
				typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));

		codeLens.command = {
			title: this.getCodeLensLabel(locations),
			command: locations.length ? 'editor.action.showReferences' : '',
			arguments: [codeLens.document, codeLens.range.start, locations]
		};
		codeLens;
	}

	getCodeLensLabel(locations: ReadonlyArray<vscode.Location>): {
		locations.length = 1
			? localize('oneReferenceLabel', '1 reference')
			: localize('manyReferenceLabel', '{0} references', locations.length);
	}

         extractSymbol(
		document: vscode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | null
	): vscode.Range | null {
	       (parent && parent.kind === PConst.Kind.enum) {
		        getSymbolRange(document, item);
		}

		 (item.kind) {
			 PConst.Kind.function:
				 showOnAllFunctions = vscode.workspace.getConfiguration(this.modeId).get<boolean>('referencesCodeLens.showOnAllFunctions');
				 (showOnAllFunctions) {
					getSymbolRange(document, item);
				}
			// fallthrough

			PConst.Kind.const:
			PConst.Kind.let:
			PConst.Kind.variable:
				// Only show references for exported variables
				 (/\bexport\b/.test(item.kindModifiers)) {
					getSymbolRange(document, item);
				}
				;

			 PConst.Kind.class:
				(item.text === '<class>') {
					;
				}
				getSymbolRange(document, item);

			PConst.Kind.interface:
			PConst.Kind.type:
			PConst.Kind.enum:
				getSymbolRange(document, item);

		        PConst.Kind.method:
			PConst.Kind.memberGetAccessor:
		        PConst.Kind.memberSetAccessor:
			PConst.Kind.constructorImplementation:
			PConst.Kind.memberVariable:
				// Don't show if child and parent have same start
				// For https://github.com/microsoft/vscode/issues/90396
				(parent &&
					Converters.Position.fromLocation(parent.spans[0].start).isEqual(typeConverters.Position.fromLocation(item.spans[0].start))
				) {
					null;
				}

				// Only show if parent is a class type object (not a literal)
				switch (parent?.kind) {
					 PConst.Kind.class:
					 PConst.Kind.interface:
					 PConst.Kind.type:
						getSymbolRange(document, item);
				}
				;
		}

	        null;
	}
}

register(
	selector: DocumentSelector,
	modeId: string,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	conditionalRegistration([
		requireConfiguration(modeId, 'referencesCodeLens.enabled'),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		 vscode.languages.registerCodeLensProvider(selector.semantic,
			 TypeScriptReferencesCodeLensProvider(client, cachedResponse, modeId));
	});
}
