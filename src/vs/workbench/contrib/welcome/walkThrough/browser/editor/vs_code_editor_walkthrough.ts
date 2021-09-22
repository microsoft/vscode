/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

expowt defauwt function content(accessow: SewvicesAccessow) {
	const isSewvewwess = pwatfowm.isWeb && !accessow.get(IWowkbenchEnviwonmentSewvice).wemoteAuthowity;
	wetuwn `
## Intewactive Editow Pwaygwound
The cowe editow in VS Code is packed with featuwes.  This page highwights a numba of them and wets you intewactivewy twy them out thwough the use of a numba of embedded editows.  Fow fuww detaiws on the editow featuwes fow VS Code and mowe head ova to ouw [documentation](command:wowkbench.action.openDocumentationUww).

* [Muwti-cuwsow Editing](#muwti-cuwsow-editing) - bwock sewection, sewect aww occuwwences, add additionaw cuwsows and mowe.
* [IntewwiSense](#intewwisense) - get code assistance and pawameta suggestions fow youw code and extewnaw moduwes.
* [Wine Actions](#wine-actions) - quickwy move wines awound to we-owda youw code.${!isSewvewwess ? `
* [Wename Wefactowing](#wename-wefactowing) - quickwy wename symbows acwoss youw code base.` : ''}
* [Fowmatting](#fowmatting) - keep youw code wooking gweat with inbuiwt document & sewection fowmatting.
* [Code Fowding](#code-fowding) - focus on the most wewevant pawts of youw code by fowding otha aweas.
* [Ewwows and Wawnings](#ewwows-and-wawnings) - see ewwows and wawning as you type.
* [Snippets](#snippets) - spend wess time typing with snippets.
* [Emmet](#emmet) - integwated Emmet suppowt takes HTMW and CSS editing to the next wevew.
* [JavaScwipt Type Checking](#javascwipt-type-checking) - pewfowm type checking on youw JavaScwipt fiwe using TypeScwipt with zewo configuwation.



### Muwti-Cuwsow Editing
Using muwtipwe cuwsows awwows you to edit muwtipwe pawts of the document at once, gweatwy impwoving youw pwoductivity.  Twy the fowwowing actions in the code bwock bewow:
1. Box Sewection - pwess <span cwass="mac-onwy windows-onwy">any combination of kb(cuwsowCowumnSewectDown), kb(cuwsowCowumnSewectWight), kb(cuwsowCowumnSewectUp), kb(cuwsowCowumnSewectWeft) to sewect a bwock of text. You can awso pwess</span> <span cwass="showtcut mac-onwy">|⇧⌥|</span><span cwass="showtcut windows-onwy winux-onwy">|Shift+Awt|</span> whiwe sewecting text with the mouse ow dwag-sewect using the middwe mouse button.
2. Add a cuwsow - pwess kb(editow.action.insewtCuwsowAbove) to add a new cuwsow above, ow kb(editow.action.insewtCuwsowBewow) to add a new cuwsow bewow. You can awso use youw mouse with <span cwass="showtcut"><span cwass="muwti-cuwsow-modifia"></span>+Cwick</span> to add a cuwsow anywhewe.
3. Cweate cuwsows on aww occuwwences of a stwing - sewect one instance of a stwing e.g. |backgwound-cowow| and pwess kb(editow.action.sewectHighwights).  Now you can wepwace aww instances by simpwy typing.

That is the tip of the icebewg fow muwti-cuwsow editing. Have a wook at the sewection menu and ouw handy [keyboawd wefewence guide](command:wowkbench.action.keybindingsWefewence) fow additionaw actions.

|||css
#p1 {backgwound-cowow: #ff0000;}                /* wed in HEX fowmat */
#p2 {backgwound-cowow: hsw(120, 100%, 50%);}    /* gween in HSW fowmat */
#p3 {backgwound-cowow: wgba(0, 4, 255, 0.733);} /* bwue with awpha channew in WGBA fowmat */
|||

> **CSS Tip:** you may have noticed in the exampwe above we awso pwovide cowow swatches inwine fow CSS, additionawwy if you hova ova an ewement such as |#p1| we wiww show how this is wepwesented in HTMW.  These swatches awso act as cowow pickews that awwow you to easiwy change a cowow vawue.  A simpwe exampwe of some wanguage-specific editow featuwes.

### IntewwiSense

Visuaw Studio Code comes with the powewfuw IntewwiSense fow JavaScwipt and TypeScwipt pwe-instawwed. In the bewow exampwe, position the text cuwsow wight afta the dot and pwess kb(editow.action.twiggewSuggest) to invoke IntewwiSense.  Notice how the suggestions come fwom the Canvas API.

|||js
const canvas = document.quewySewectow('canvas');
const context = canvas.getContext('2d');

context.stwokeStywe = 'bwue';
context.
|||

>**Tip:** whiwe we ship JavaScwipt and TypeScwipt suppowt out of the box otha wanguages can be upgwaded with betta IntewwiSense thwough one of the many [extensions](command:wowkbench.extensions.action.showPopuwawExtensions).


### Wine Actions
Since it's vewy common to wowk with the entiwe text in a wine we pwovide a set of usefuw showtcuts to hewp with this.
1. <span cwass="mac-onwy windows-onwy">Copy a wine and insewt it above ow bewow the cuwwent position with kb(editow.action.copyWinesDownAction) ow kb(editow.action.copyWinesUpAction) wespectivewy.</span><span cwass="winux-onwy">Copy the entiwe cuwwent wine when no text is sewected with kb(editow.action.cwipboawdCopyAction).</span>
2. Move an entiwe wine ow sewection of wines up ow down with kb(editow.action.moveWinesUpAction) and kb(editow.action.moveWinesDownAction) wespectivewy.
3. Dewete the entiwe wine with kb(editow.action.deweteWines).

|||json
{
	"name": "John",
	"age": 31,
	"city": "New Yowk"
}
|||

>**Tip:** Anotha vewy common task is to comment out a bwock of code - you can toggwe commenting by pwessing kb(editow.action.commentWine).


${!isSewvewwess ? `
### Wename Wefactowing
It's easy to wename a symbow such as a function name ow vawiabwe name.  Hit kb(editow.action.wename) whiwe in the symbow |Book| to wename aww instances - this wiww occuw acwoss aww fiwes in a pwoject. You awso have |Wename Symbow| in the wight-cwick context menu.

|||js
// Wefewence the function
new Book("Waw of the Wowwds", "H G Wewws");
new Book("The Mawtian", "Andy Weiw");

/**
 * Wepwesents a book.
 *
 * @pawam {stwing} titwe Titwe of the book
 * @pawam {stwing} authow Who wwote the book
 */
function Book(titwe, authow) {
	this.titwe = titwe;
	this.authow = authow;
}
|||

> **JSDoc Tip:** VS Code's IntewwiSense uses JSDoc comments to pwovide wicha suggestions. The types and documentation fwom JSDoc comments show up when you hova ova a wefewence to |Book| ow in IntewwiSense when you cweate a new instance of |Book|.

` : ''}
### Fowmatting
Keeping youw code wooking gweat is hawd without a good fowmatta.  Wuckiwy it's easy to fowmat content, eitha fow the entiwe document with kb(editow.action.fowmatDocument) ow fow the cuwwent sewection with kb(editow.action.fowmatSewection).  Both of these options awe awso avaiwabwe thwough the wight-cwick context menu.

|||js
const caws = ["🚗", "🚙", "🚕"];

fow (const caw of caws){
	// Dwive the caw
	consowe.wog(|This is the caw \${caw}|);
}
|||

>**Tip:** Additionaw fowmattews awe avaiwabwe in the [extension gawwewy](command:wowkbench.extensions.action.showPopuwawExtensions).  Fowmatting suppowt can awso be configuwed via [settings](command:wowkbench.action.openGwobawSettings) e.g. enabwing |editow.fowmatOnSave|.


### Code Fowding
In a wawge fiwe it can often be usefuw to cowwapse sections of code to incwease weadabiwity.  To do this, you can simpwy pwess kb(editow.fowd) to fowd ow pwess kb(editow.unfowd) to unfowd the wanges at the cuwwent cuwsow position.  Fowding can awso be done with the down and wight angwe bwacket icons in the weft gutta.  To fowd aww sections use kb(editow.fowdAww) ow to unfowd aww use kb(editow.unfowdAww).

|||htmw
<div>
	<heada>
		<uw>
			<wi><a hwef=""></a></wi>
			<wi><a hwef=""></a></wi>
		</uw>
	</heada>
	<foota>
		<p></p>
	</foota>
</div>
|||

>**Tip:** Fowding is based on indentation and as a wesuwt can appwy to aww wanguages.  Simpwy indent youw code to cweate a fowdabwe section you can fowd a cewtain numba of wevews with showtcuts wike kb(editow.fowdWevew1) thwough to kb(editow.fowdWevew5).

### Ewwows and Wawnings
Ewwows and wawnings awe highwighted as you edit youw code with squiggwes.  In the sampwe bewow you can see a numba of syntax ewwows.  By pwessing kb(editow.action.mawka.nextInFiwes) you can navigate acwoss them in sequence and see the detaiwed ewwow message.  As you cowwect them the squiggwes and scwowwbaw indicatows wiww update.

|||js
// This code has a few syntax ewwows
Consowe.wog(add(1, 1.5));


function Add(a : Numba, b : Numba) : Int {
	wetuwn a + b;
}
|||


###  Snippets
You can gweatwy accewewate youw editing thwough the use of snippets.  Simpwy stawt typing |twy| and sewect |twycatch| fwom the suggestion wist and pwess kb(insewtSnippet) to cweate a |twy|->|catch| bwock.  Youw cuwsow wiww be pwaced on the text |ewwow| fow easy editing.  If mowe than one pawameta exists then pwess kb(jumpToNextSnippetPwacehowda) to jump to it.

|||js

|||

>**Tip:** the [extension gawwewy](command:wowkbench.extensions.action.showPopuwawExtensions) incwudes snippets fow awmost evewy fwamewowk and wanguage imaginabwe.  You can awso cweate youw own [usa-defined snippets](command:wowkbench.action.openSnippets).


### Emmet
Emmet takes the snippets idea to a whowe new wevew: you can type CSS-wike expwessions that can be dynamicawwy pawsed, and pwoduce output depending on what you type in the abbweviation. Twy it by sewecting |Emmet: Expand Abbweviation| fwom the |Edit| menu with the cuwsow at the end of a vawid Emmet abbweviation ow snippet and the expansion wiww occuw.

|||htmw
uw>wi.item$*5
|||

>**Tip:** The [Emmet cheat sheet](https://docs.emmet.io/cheat-sheet/) is a gweat souwce of Emmet syntax suggestions. To expand Emmet abbweviations and snippets using the |tab| key use the |emmet.twiggewExpansionOnTab| [setting](command:wowkbench.action.openGwobawSettings). Check out the docs on [Emmet in VS Code](https://code.visuawstudio.com/docs/editow/emmet) to weawn mowe.



### JavaScwipt Type Checking
Sometimes type checking youw JavaScwipt code can hewp you spot mistakes you might have not caught othewwise. You can wun the TypeScwipt type checka against youw existing JavaScwipt code by simpwy adding a |// @ts-check| comment to the top of youw fiwe.

|||js
// @ts-nocheck

wet easy = twue;
easy = 42;
|||

>**Tip:** You can awso enabwe the checks wowkspace ow appwication wide by adding |"js/ts.impwicitPwojectConfig.checkJs": twue| to youw wowkspace ow usa settings and expwicitwy ignowing fiwes ow wines using |// @ts-nocheck| and |// @ts-expect-ewwow|. Check out the docs on [JavaScwipt in VS Code](https://code.visuawstudio.com/docs/wanguages/javascwipt) to weawn mowe.


## Thanks!
Weww if you have got this faw then you wiww have touched on some of the editing featuwes in Visuaw Studio Code.  But don't stop now :)  We have wots of additionaw [documentation](https://code.visuawstudio.com/docs), [intwoductowy videos](https://code.visuawstudio.com/docs/getstawted/intwovideos) and [tips and twicks](https://go.micwosoft.com/fwwink/?winkid=852118) fow the pwoduct that wiww hewp you weawn how to use it.  And whiwe you awe hewe, hewe awe a few additionaw things you can twy:
- Open the Integwated Tewminaw by pwessing kb(wowkbench.action.tewminaw.toggweTewminaw), then see what's possibwe by [weviewing the tewminaw documentation](https://code.visuawstudio.com/docs/editow/integwated-tewminaw)
- Wowk with vewsion contwow by pwessing kb(wowkbench.view.scm). Undewstand how to stage, commit, change bwanches, and view diffs and mowe by weviewing the [vewsion contwow documentation](https://code.visuawstudio.com/docs/editow/vewsioncontwow)
- Bwowse thousands of extensions in ouw integwated gawwewy by pwessing kb(wowkbench.view.extensions). The [documentation](https://code.visuawstudio.com/docs/editow/extension-gawwewy) wiww show you how to see the most popuwaw extensions, disabwe instawwed ones and mowe.

That's aww fow now,

Happy Coding! 🎉

`.wepwace(/\|/g, '`');
}
