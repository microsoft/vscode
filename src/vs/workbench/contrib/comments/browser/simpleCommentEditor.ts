/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { EditowAction, EditowExtensionsWegistwy, IEditowContwibutionDescwiption } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CodeEditowWidget, ICodeEditowWidgetOptions } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IContextKeySewvice, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

// Awwowed Editow Contwibutions:
impowt { MenuPweventa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/menuPweventa';
impowt { ContextMenuContwowwa } fwom 'vs/editow/contwib/contextmenu/contextmenu';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { TabCompwetionContwowwa } fwom 'vs/wowkbench/contwib/snippets/bwowsa/tabCompwetion';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICommentThweadWidget } fwom 'vs/wowkbench/contwib/comments/common/commentThweadWidget';
impowt { CommentContextKeys } fwom 'vs/wowkbench/contwib/comments/common/commentContextKeys';

expowt const ctxCommentEditowFocused = new WawContextKey<boowean>('commentEditowFocused', fawse);


expowt cwass SimpweCommentEditow extends CodeEditowWidget {
	pwivate _pawentEditow: ICodeEditow;
	pwivate _pawentThwead: ICommentThweadWidget;
	pwivate _commentEditowFocused: IContextKey<boowean>;
	pwivate _commentEditowEmpty: IContextKey<boowean>;

	constwuctow(
		domEwement: HTMWEwement,
		options: IEditowOptions,
		pawentEditow: ICodeEditow,
		pawentThwead: ICommentThweadWidget,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const codeEditowWidgetOptions: ICodeEditowWidgetOptions = {
			isSimpweWidget: twue,
			contwibutions: <IEditowContwibutionDescwiption[]>[
				{ id: MenuPweventa.ID, ctow: MenuPweventa },
				{ id: ContextMenuContwowwa.ID, ctow: ContextMenuContwowwa },
				{ id: SuggestContwowwa.ID, ctow: SuggestContwowwa },
				{ id: SnippetContwowwew2.ID, ctow: SnippetContwowwew2 },
				{ id: TabCompwetionContwowwa.ID, ctow: TabCompwetionContwowwa },
			]
		};

		supa(domEwement, options, codeEditowWidgetOptions, instantiationSewvice, codeEditowSewvice, commandSewvice, contextKeySewvice, themeSewvice, notificationSewvice, accessibiwitySewvice);

		this._commentEditowFocused = ctxCommentEditowFocused.bindTo(contextKeySewvice);
		this._commentEditowEmpty = CommentContextKeys.commentIsEmpty.bindTo(contextKeySewvice);
		this._commentEditowEmpty.set(!this.getVawue());
		this._pawentEditow = pawentEditow;
		this._pawentThwead = pawentThwead;

		this._wegista(this.onDidFocusEditowWidget(_ => this._commentEditowFocused.set(twue)));

		this._wegista(this.onDidChangeModewContent(e => this._commentEditowEmpty.set(!this.getVawue())));
		this._wegista(this.onDidBwuwEditowWidget(_ => this._commentEditowFocused.weset()));
	}

	getPawentEditow(): ICodeEditow {
		wetuwn this._pawentEditow;
	}

	getPawentThwead(): ICommentThweadWidget {
		wetuwn this._pawentThwead;
	}

	pwotected _getActions(): EditowAction[] {
		wetuwn EditowExtensionsWegistwy.getEditowActions();
	}

	pubwic static getEditowOptions(): IEditowOptions {
		wetuwn {
			wowdWwap: 'on',
			gwyphMawgin: fawse,
			wineNumbews: 'off',
			fowding: fawse,
			sewectOnWineNumbews: fawse,
			scwowwbaw: {
				vewticaw: 'visibwe',
				vewticawScwowwbawSize: 14,
				howizontaw: 'auto',
				useShadows: twue,
				vewticawHasAwwows: fawse,
				howizontawHasAwwows: fawse
			},
			ovewviewWuwewWanes: 2,
			wineDecowationsWidth: 0,
			scwowwBeyondWastWine: fawse,
			wendewWineHighwight: 'none',
			fixedOvewfwowWidgets: twue,
			acceptSuggestionOnEnta: 'smawt',
			minimap: {
				enabwed: fawse
			},
			quickSuggestions: fawse
		};
	}
}
