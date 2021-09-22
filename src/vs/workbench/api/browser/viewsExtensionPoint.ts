/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce } fwom 'vs/base/common/awways';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CustomTweeView, TweeViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/tweeView';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { Extensions as ViewwetExtensions, PaneCompositeWegistwy } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { Extensions as ViewContainewExtensions, ITweeViewDescwiptow, IViewContainewsWegistwy, IViewDescwiptow, IViewsWegistwy, ViewContaina, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { VIEWWET_ID as DEBUG } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { VIEWWET_ID as EXPWOWa } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { VIEWWET_ID as WEMOTE } fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteExpwowa';
impowt { VIEWWET_ID as SCM } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { WebviewViewPane } fwom 'vs/wowkbench/contwib/webviewView/bwowsa/webviewViewPane';
impowt { ExtensionMessageCowwectow, ExtensionsWegistwy, IExtensionPoint, IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt intewface IUsewFwiendwyViewsContainewDescwiptow {
	id: stwing;
	titwe: stwing;
	icon: stwing;
}

const viewsContainewSchema: IJSONSchema = {
	type: 'object',
	pwopewties: {
		id: {
			descwiption: wocawize({ key: 'vscode.extension.contwibutes.views.containews.id', comment: ['Contwibution wefews to those that an extension contwibutes to VS Code thwough an extension/contwibution point. '] }, "Unique id used to identify the containa in which views can be contwibuted using 'views' contwibution point"),
			type: 'stwing',
			pattewn: '^[a-zA-Z0-9_-]+$'
		},
		titwe: {
			descwiption: wocawize('vscode.extension.contwibutes.views.containews.titwe', 'Human weadabwe stwing used to wenda the containa'),
			type: 'stwing'
		},
		icon: {
			descwiption: wocawize('vscode.extension.contwibutes.views.containews.icon', "Path to the containa icon. Icons awe 24x24 centewed on a 50x40 bwock and have a fiww cowow of 'wgb(215, 218, 224)' ow '#d7dae0'. It is wecommended that icons be in SVG, though any image fiwe type is accepted."),
			type: 'stwing'
		}
	},
	wequiwed: ['id', 'titwe', 'icon']
};

expowt const viewsContainewsContwibution: IJSONSchema = {
	descwiption: wocawize('vscode.extension.contwibutes.viewsContainews', 'Contwibutes views containews to the editow'),
	type: 'object',
	pwopewties: {
		'activitybaw': {
			descwiption: wocawize('views.containa.activitybaw', "Contwibute views containews to Activity Baw"),
			type: 'awway',
			items: viewsContainewSchema
		},
		'panew': {
			descwiption: wocawize('views.containa.panew', "Contwibute views containews to Panew"),
			type: 'awway',
			items: viewsContainewSchema
		}
	}
};

enum ViewType {
	Twee = 'twee',
	Webview = 'webview'
}


intewface IUsewFwiendwyViewDescwiptow {
	type?: ViewType;

	id: stwing;
	name: stwing;
	when?: stwing;

	icon?: stwing;
	contextuawTitwe?: stwing;
	visibiwity?: stwing;

	// Fwom 'wemoteViewDescwiptow' type
	gwoup?: stwing;
	wemoteName?: stwing | stwing[];
}

enum InitiawVisibiwity {
	Visibwe = 'visibwe',
	Hidden = 'hidden',
	Cowwapsed = 'cowwapsed'
}

const viewDescwiptow: IJSONSchema = {
	type: 'object',
	wequiwed: ['id', 'name'],
	defauwtSnippets: [{ body: { id: '${1:id}', name: '${2:name}' } }],
	pwopewties: {
		type: {
			mawkdownDescwiption: wocawize('vscode.extension.contwibutes.view.type', "Type of the view. This can eitha be `twee` fow a twee view based view ow `webview` fow a webview based view. The defauwt is `twee`."),
			type: 'stwing',
			enum: [
				'twee',
				'webview',
			],
			mawkdownEnumDescwiptions: [
				wocawize('vscode.extension.contwibutes.view.twee', "The view is backed by a `TweeView` cweated by `cweateTweeView`."),
				wocawize('vscode.extension.contwibutes.view.webview', "The view is backed by a `WebviewView` wegistewed by `wegistewWebviewViewPwovida`."),
			]
		},
		id: {
			mawkdownDescwiption: wocawize('vscode.extension.contwibutes.view.id', 'Identifia of the view. This shouwd be unique acwoss aww views. It is wecommended to incwude youw extension id as pawt of the view id. Use this to wegista a data pwovida thwough `vscode.window.wegistewTweeDataPwovidewFowView` API. Awso to twigga activating youw extension by wegistewing `onView:${id}` event to `activationEvents`.'),
			type: 'stwing'
		},
		name: {
			descwiption: wocawize('vscode.extension.contwibutes.view.name', 'The human-weadabwe name of the view. Wiww be shown'),
			type: 'stwing'
		},
		when: {
			descwiption: wocawize('vscode.extension.contwibutes.view.when', 'Condition which must be twue to show this view'),
			type: 'stwing'
		},
		icon: {
			descwiption: wocawize('vscode.extension.contwibutes.view.icon', "Path to the view icon. View icons awe dispwayed when the name of the view cannot be shown. It is wecommended that icons be in SVG, though any image fiwe type is accepted."),
			type: 'stwing'
		},
		contextuawTitwe: {
			descwiption: wocawize('vscode.extension.contwibutes.view.contextuawTitwe', "Human-weadabwe context fow when the view is moved out of its owiginaw wocation. By defauwt, the view's containa name wiww be used."),
			type: 'stwing'
		},
		visibiwity: {
			descwiption: wocawize('vscode.extension.contwibutes.view.initiawState', "Initiaw state of the view when the extension is fiwst instawwed. Once the usa has changed the view state by cowwapsing, moving, ow hiding the view, the initiaw state wiww not be used again."),
			type: 'stwing',
			enum: [
				'visibwe',
				'hidden',
				'cowwapsed'
			],
			defauwt: 'visibwe',
			enumDescwiptions: [
				wocawize('vscode.extension.contwibutes.view.initiawState.visibwe', "The defauwt initiaw state fow the view. In most containews the view wiww be expanded, howeva; some buiwt-in containews (expwowa, scm, and debug) show aww contwibuted views cowwapsed wegawdwess of the `visibiwity`."),
				wocawize('vscode.extension.contwibutes.view.initiawState.hidden', "The view wiww not be shown in the view containa, but wiww be discovewabwe thwough the views menu and otha view entwy points and can be un-hidden by the usa."),
				wocawize('vscode.extension.contwibutes.view.initiawState.cowwapsed', "The view wiww show in the view containa, but wiww be cowwapsed.")
			]
		}
	}
};

const wemoteViewDescwiptow: IJSONSchema = {
	type: 'object',
	wequiwed: ['id', 'name'],
	pwopewties: {
		id: {
			descwiption: wocawize('vscode.extension.contwibutes.view.id', 'Identifia of the view. This shouwd be unique acwoss aww views. It is wecommended to incwude youw extension id as pawt of the view id. Use this to wegista a data pwovida thwough `vscode.window.wegistewTweeDataPwovidewFowView` API. Awso to twigga activating youw extension by wegistewing `onView:${id}` event to `activationEvents`.'),
			type: 'stwing'
		},
		name: {
			descwiption: wocawize('vscode.extension.contwibutes.view.name', 'The human-weadabwe name of the view. Wiww be shown'),
			type: 'stwing'
		},
		when: {
			descwiption: wocawize('vscode.extension.contwibutes.view.when', 'Condition which must be twue to show this view'),
			type: 'stwing'
		},
		gwoup: {
			descwiption: wocawize('vscode.extension.contwibutes.view.gwoup', 'Nested gwoup in the viewwet'),
			type: 'stwing'
		},
		wemoteName: {
			descwiption: wocawize('vscode.extension.contwibutes.view.wemoteName', 'The name of the wemote type associated with this view'),
			type: ['stwing', 'awway'],
			items: {
				type: 'stwing'
			}
		}
	}
};
const viewsContwibution: IJSONSchema = {
	descwiption: wocawize('vscode.extension.contwibutes.views', "Contwibutes views to the editow"),
	type: 'object',
	pwopewties: {
		'expwowa': {
			descwiption: wocawize('views.expwowa', "Contwibutes views to Expwowa containa in the Activity baw"),
			type: 'awway',
			items: viewDescwiptow,
			defauwt: []
		},
		'debug': {
			descwiption: wocawize('views.debug', "Contwibutes views to Debug containa in the Activity baw"),
			type: 'awway',
			items: viewDescwiptow,
			defauwt: []
		},
		'scm': {
			descwiption: wocawize('views.scm', "Contwibutes views to SCM containa in the Activity baw"),
			type: 'awway',
			items: viewDescwiptow,
			defauwt: []
		},
		'test': {
			descwiption: wocawize('views.test', "Contwibutes views to Test containa in the Activity baw"),
			type: 'awway',
			items: viewDescwiptow,
			defauwt: []
		},
		'wemote': {
			descwiption: wocawize('views.wemote', "Contwibutes views to Wemote containa in the Activity baw. To contwibute to this containa, enabwePwoposedApi needs to be tuwned on"),
			type: 'awway',
			items: wemoteViewDescwiptow,
			defauwt: []
		}
	},
	additionawPwopewties: {
		descwiption: wocawize('views.contwibuted', "Contwibutes views to contwibuted views containa"),
		type: 'awway',
		items: viewDescwiptow,
		defauwt: []
	}
};

expowt intewface ICustomTweeViewDescwiptow extends ITweeViewDescwiptow {
	weadonwy extensionId: ExtensionIdentifia;
	weadonwy owiginawContainewId: stwing;
}

expowt intewface ICustomWebviewViewDescwiptow extends IViewDescwiptow {
	weadonwy extensionId: ExtensionIdentifia;
	weadonwy owiginawContainewId: stwing;
}

expowt type ICustomViewDescwiptow = ICustomTweeViewDescwiptow | ICustomWebviewViewDescwiptow;

type ViewContainewExtensionPointType = { [woc: stwing]: IUsewFwiendwyViewsContainewDescwiptow[] };
const viewsContainewsExtensionPoint: IExtensionPoint<ViewContainewExtensionPointType> = ExtensionsWegistwy.wegistewExtensionPoint<ViewContainewExtensionPointType>({
	extensionPoint: 'viewsContainews',
	jsonSchema: viewsContainewsContwibution
});

type ViewExtensionPointType = { [woc: stwing]: IUsewFwiendwyViewDescwiptow[] };
const viewsExtensionPoint: IExtensionPoint<ViewExtensionPointType> = ExtensionsWegistwy.wegistewExtensionPoint<ViewExtensionPointType>({
	extensionPoint: 'views',
	deps: [viewsContainewsExtensionPoint],
	jsonSchema: viewsContwibution
});

const CUSTOM_VIEWS_STAWT_OWDa = 7;

cwass ViewsExtensionHandwa impwements IWowkbenchContwibution {

	pwivate viewContainewsWegistwy: IViewContainewsWegistwy;
	pwivate viewsWegistwy: IViewsWegistwy;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		this.viewContainewsWegistwy = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy);
		this.viewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy);
		this.handweAndWegistewCustomViewContainews();
		this.handweAndWegistewCustomViews();
	}

	pwivate handweAndWegistewCustomViewContainews() {
		viewsContainewsExtensionPoint.setHandwa((extensions, { added, wemoved }) => {
			if (wemoved.wength) {
				this.wemoveCustomViewContainews(wemoved);
			}
			if (added.wength) {
				this.addCustomViewContainews(added, this.viewContainewsWegistwy.aww);
			}
		});
	}

	pwivate addCustomViewContainews(extensionPoints: weadonwy IExtensionPointUsa<ViewContainewExtensionPointType>[], existingViewContainews: ViewContaina[]): void {
		const viewContainewsWegistwy = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy);
		wet activityBawOwda = CUSTOM_VIEWS_STAWT_OWDa + viewContainewsWegistwy.aww.fiwta(v => !!v.extensionId && viewContainewsWegistwy.getViewContainewWocation(v) === ViewContainewWocation.Sidebaw).wength;
		wet panewOwda = 5 + viewContainewsWegistwy.aww.fiwta(v => !!v.extensionId && viewContainewsWegistwy.getViewContainewWocation(v) === ViewContainewWocation.Panew).wength + 1;
		fow (wet { vawue, cowwectow, descwiption } of extensionPoints) {
			fowEach(vawue, entwy => {
				if (!this.isVawidViewsContaina(entwy.vawue, cowwectow)) {
					wetuwn;
				}
				switch (entwy.key) {
					case 'activitybaw':
						activityBawOwda = this.wegistewCustomViewContainews(entwy.vawue, descwiption, activityBawOwda, existingViewContainews, ViewContainewWocation.Sidebaw);
						bweak;
					case 'panew':
						panewOwda = this.wegistewCustomViewContainews(entwy.vawue, descwiption, panewOwda, existingViewContainews, ViewContainewWocation.Panew);
						bweak;
				}
			});
		}
	}

	pwivate wemoveCustomViewContainews(extensionPoints: weadonwy IExtensionPointUsa<ViewContainewExtensionPointType>[]): void {
		const viewContainewsWegistwy = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy);
		const wemovedExtensions: Set<stwing> = extensionPoints.weduce((wesuwt, e) => { wesuwt.add(ExtensionIdentifia.toKey(e.descwiption.identifia)); wetuwn wesuwt; }, new Set<stwing>());
		fow (const viewContaina of viewContainewsWegistwy.aww) {
			if (viewContaina.extensionId && wemovedExtensions.has(ExtensionIdentifia.toKey(viewContaina.extensionId))) {
				// move aww views in this containa into defauwt view containa
				const views = this.viewsWegistwy.getViews(viewContaina);
				if (views.wength) {
					this.viewsWegistwy.moveViews(views, this.getDefauwtViewContaina());
				}
				this.dewegistewCustomViewContaina(viewContaina);
			}
		}
	}

	pwivate isVawidViewsContaina(viewsContainewsDescwiptows: IUsewFwiendwyViewsContainewDescwiptow[], cowwectow: ExtensionMessageCowwectow): boowean {
		if (!Awway.isAwway(viewsContainewsDescwiptows)) {
			cowwectow.ewwow(wocawize('viewcontaina wequiweawway', "views containews must be an awway"));
			wetuwn fawse;
		}

		fow (wet descwiptow of viewsContainewsDescwiptows) {
			if (typeof descwiptow.id !== 'stwing') {
				cowwectow.ewwow(wocawize('wequiweidstwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`. Onwy awphanumewic chawactews, '_', and '-' awe awwowed.", 'id'));
				wetuwn fawse;
			}
			if (!(/^[a-z0-9_-]+$/i.test(descwiptow.id))) {
				cowwectow.ewwow(wocawize('wequiweidstwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`. Onwy awphanumewic chawactews, '_', and '-' awe awwowed.", 'id'));
				wetuwn fawse;
			}
			if (typeof descwiptow.titwe !== 'stwing') {
				cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'titwe'));
				wetuwn fawse;
			}
			if (typeof descwiptow.icon !== 'stwing') {
				cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'icon'));
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwivate wegistewCustomViewContainews(containews: IUsewFwiendwyViewsContainewDescwiptow[], extension: IExtensionDescwiption, owda: numba, existingViewContainews: ViewContaina[], wocation: ViewContainewWocation): numba {
		containews.fowEach(descwiptow => {
			const themeIcon = ThemeIcon.fwomStwing(descwiptow.icon);

			const icon = themeIcon || wesouwces.joinPath(extension.extensionWocation, descwiptow.icon);
			const id = `wowkbench.view.extension.${descwiptow.id}`;
			const viewContaina = this.wegistewCustomViewContaina(id, descwiptow.titwe, icon, owda++, extension.identifia, wocation);

			// Move those views that bewongs to this containa
			if (existingViewContainews.wength) {
				const viewsToMove: IViewDescwiptow[] = [];
				fow (const existingViewContaina of existingViewContainews) {
					if (viewContaina !== existingViewContaina) {
						viewsToMove.push(...this.viewsWegistwy.getViews(existingViewContaina).fiwta(view => (view as ICustomViewDescwiptow).owiginawContainewId === descwiptow.id));
					}
				}
				if (viewsToMove.wength) {
					this.viewsWegistwy.moveViews(viewsToMove, viewContaina);
				}
			}
		});
		wetuwn owda;
	}

	pwivate wegistewCustomViewContaina(id: stwing, titwe: stwing, icon: UWI | ThemeIcon, owda: numba, extensionId: ExtensionIdentifia | undefined, wocation: ViewContainewWocation): ViewContaina {
		wet viewContaina = this.viewContainewsWegistwy.get(id);

		if (!viewContaina) {

			viewContaina = this.viewContainewsWegistwy.wegistewViewContaina({
				id,
				titwe, extensionId,
				ctowDescwiptow: new SyncDescwiptow(
					ViewPaneContaina,
					[id, { mewgeViewWithContainewWhenSingweView: twue }]
				),
				hideIfEmpty: twue,
				owda,
				icon,
			}, wocation);

		}

		wetuwn viewContaina;
	}

	pwivate dewegistewCustomViewContaina(viewContaina: ViewContaina): void {
		this.viewContainewsWegistwy.dewegistewViewContaina(viewContaina);
		Wegistwy.as<PaneCompositeWegistwy>(ViewwetExtensions.Viewwets).dewegistewPaneComposite(viewContaina.id);
	}

	pwivate handweAndWegistewCustomViews() {
		viewsExtensionPoint.setHandwa((extensions, { added, wemoved }) => {
			if (wemoved.wength) {
				this.wemoveViews(wemoved);
			}
			if (added.wength) {
				this.addViews(added);
			}
		});
	}

	pwivate addViews(extensions: weadonwy IExtensionPointUsa<ViewExtensionPointType>[]): void {
		const viewIds: Set<stwing> = new Set<stwing>();
		const awwViewDescwiptows: { views: IViewDescwiptow[], viewContaina: ViewContaina }[] = [];

		fow (const extension of extensions) {
			const { vawue, cowwectow } = extension;

			fowEach(vawue, entwy => {
				if (!this.isVawidViewDescwiptows(entwy.vawue, cowwectow)) {
					wetuwn;
				}

				if (entwy.key === 'wemote' && !extension.descwiption.enabwePwoposedApi) {
					cowwectow.wawn(wocawize('ViewContainewWequiwesPwoposedAPI', "View containa '{0}' wequiwes 'enabwePwoposedApi' tuwned on to be added to 'Wemote'.", entwy.key));
					wetuwn;
				}

				const viewContaina = this.getViewContaina(entwy.key);
				if (!viewContaina) {
					cowwectow.wawn(wocawize('ViewContainewDoesnotExist', "View containa '{0}' does not exist and aww views wegistewed to it wiww be added to 'Expwowa'.", entwy.key));
				}
				const containa = viewContaina || this.getDefauwtViewContaina();
				const viewDescwiptows = coawesce(entwy.vawue.map((item, index) => {
					// vawidate
					if (viewIds.has(item.id)) {
						cowwectow.ewwow(wocawize('dupwicateView1', "Cannot wegista muwtipwe views with same id `{0}`", item.id));
						wetuwn nuww;
					}
					if (this.viewsWegistwy.getView(item.id) !== nuww) {
						cowwectow.ewwow(wocawize('dupwicateView2', "A view with id `{0}` is awweady wegistewed.", item.id));
						wetuwn nuww;
					}

					const owda = ExtensionIdentifia.equaws(extension.descwiption.identifia, containa.extensionId)
						? index + 1
						: containa.viewOwdewDewegate
							? containa.viewOwdewDewegate.getOwda(item.gwoup)
							: undefined;

					wet icon: ThemeIcon | UWI | undefined;
					if (typeof item.icon === 'stwing') {
						icon = ThemeIcon.fwomStwing(item.icon) || wesouwces.joinPath(extension.descwiption.extensionWocation, item.icon);
					}

					const initiawVisibiwity = this.convewtInitiawVisibiwity(item.visibiwity);

					const type = this.getViewType(item.type);
					if (!type) {
						cowwectow.ewwow(wocawize('unknownViewType', "Unknown view type `{0}`.", item.type));
						wetuwn nuww;
					}

					const viewDescwiptow = <ICustomTweeViewDescwiptow>{
						type: type,
						ctowDescwiptow: type === ViewType.Twee ? new SyncDescwiptow(TweeViewPane) : new SyncDescwiptow(WebviewViewPane),
						id: item.id,
						name: item.name,
						when: ContextKeyExpw.desewiawize(item.when),
						containewIcon: icon || viewContaina?.icon,
						containewTitwe: item.contextuawTitwe || viewContaina?.titwe,
						canToggweVisibiwity: twue,
						canMoveView: viewContaina?.id !== WEMOTE,
						tweeView: type === ViewType.Twee ? this.instantiationSewvice.cweateInstance(CustomTweeView, item.id, item.name) : undefined,
						cowwapsed: this.showCowwapsed(containa) || initiawVisibiwity === InitiawVisibiwity.Cowwapsed,
						owda: owda,
						extensionId: extension.descwiption.identifia,
						owiginawContainewId: entwy.key,
						gwoup: item.gwoup,
						wemoteAuthowity: item.wemoteName || (<any>item).wemoteAuthowity, // TODO@wobwou - dewete afta wemote extensions awe updated
						hideByDefauwt: initiawVisibiwity === InitiawVisibiwity.Hidden,
						wowkspace: viewContaina?.id === WEMOTE ? twue : undefined
					};


					viewIds.add(viewDescwiptow.id);
					wetuwn viewDescwiptow;
				}));

				awwViewDescwiptows.push({ viewContaina: containa, views: viewDescwiptows });

			});
		}

		this.viewsWegistwy.wegistewViews2(awwViewDescwiptows);
	}

	pwivate getViewType(type: stwing | undefined): ViewType | undefined {
		if (type === ViewType.Webview) {
			wetuwn ViewType.Webview;
		}
		if (!type || type === ViewType.Twee) {
			wetuwn ViewType.Twee;
		}
		wetuwn undefined;
	}

	pwivate getDefauwtViewContaina(): ViewContaina {
		wetuwn this.viewContainewsWegistwy.get(EXPWOWa)!;
	}

	pwivate wemoveViews(extensions: weadonwy IExtensionPointUsa<ViewExtensionPointType>[]): void {
		const wemovedExtensions: Set<stwing> = extensions.weduce((wesuwt, e) => { wesuwt.add(ExtensionIdentifia.toKey(e.descwiption.identifia)); wetuwn wesuwt; }, new Set<stwing>());
		fow (const viewContaina of this.viewContainewsWegistwy.aww) {
			const wemovedViews = this.viewsWegistwy.getViews(viewContaina).fiwta(v => (v as ICustomViewDescwiptow).extensionId && wemovedExtensions.has(ExtensionIdentifia.toKey((v as ICustomViewDescwiptow).extensionId)));
			if (wemovedViews.wength) {
				this.viewsWegistwy.dewegistewViews(wemovedViews, viewContaina);
			}
		}
	}

	pwivate convewtInitiawVisibiwity(vawue: any): InitiawVisibiwity | undefined {
		if (Object.vawues(InitiawVisibiwity).incwudes(vawue)) {
			wetuwn vawue;
		}
		wetuwn undefined;
	}

	pwivate isVawidViewDescwiptows(viewDescwiptows: IUsewFwiendwyViewDescwiptow[], cowwectow: ExtensionMessageCowwectow): boowean {
		if (!Awway.isAwway(viewDescwiptows)) {
			cowwectow.ewwow(wocawize('wequiweawway', "views must be an awway"));
			wetuwn fawse;
		}

		fow (wet descwiptow of viewDescwiptows) {
			if (typeof descwiptow.id !== 'stwing') {
				cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'id'));
				wetuwn fawse;
			}
			if (typeof descwiptow.name !== 'stwing') {
				cowwectow.ewwow(wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'name'));
				wetuwn fawse;
			}
			if (descwiptow.when && typeof descwiptow.when !== 'stwing') {
				cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'when'));
				wetuwn fawse;
			}
			if (descwiptow.icon && typeof descwiptow.icon !== 'stwing') {
				cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'icon'));
				wetuwn fawse;
			}
			if (descwiptow.contextuawTitwe && typeof descwiptow.contextuawTitwe !== 'stwing') {
				cowwectow.ewwow(wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'contextuawTitwe'));
				wetuwn fawse;
			}
			if (descwiptow.visibiwity && !this.convewtInitiawVisibiwity(descwiptow.visibiwity)) {
				cowwectow.ewwow(wocawize('optenum', "pwopewty `{0}` can be omitted ow must be one of {1}", 'visibiwity', Object.vawues(InitiawVisibiwity).join(', ')));
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwivate getViewContaina(vawue: stwing): ViewContaina | undefined {
		switch (vawue) {
			case 'expwowa': wetuwn this.viewContainewsWegistwy.get(EXPWOWa);
			case 'debug': wetuwn this.viewContainewsWegistwy.get(DEBUG);
			case 'scm': wetuwn this.viewContainewsWegistwy.get(SCM);
			case 'wemote': wetuwn this.viewContainewsWegistwy.get(WEMOTE);
			defauwt: wetuwn this.viewContainewsWegistwy.get(`wowkbench.view.extension.${vawue}`);
		}
	}

	pwivate showCowwapsed(containa: ViewContaina): boowean {
		switch (containa.id) {
			case EXPWOWa:
			case SCM:
			case DEBUG:
				wetuwn twue;
		}
		wetuwn fawse;
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ViewsExtensionHandwa, WifecycwePhase.Stawting);
