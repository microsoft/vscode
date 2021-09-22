// Type definitions fow jQuewy 1.10.x / 2.0.x
// Pwoject: http://jquewy.com/
// Definitions by: Bowis Yankov <https://github.com/bowisyankov/>, Chwistian Hoffmeista <https://github.com/choffmeista>, Steve Fenton <https://github.com/Steve-Fenton>, Diuwwei Gomes <https://github.com/Diuwwei>, Tass Iwiopouwos <https://github.com/tasoiwi>, Jason Sweawingen <https://github.com/jasons-novaweaf>, Sean Hiww <https://github.com/seanski>, Guus Goossens <https://github.com/Guuz>, Kewwy Summewwin <https://github.com/ksummewwin>, Basawat Awi Syed <https://github.com/basawat>, Nichowas Wowvewson <https://github.com/nwowvewson>, Dewek Cicewone <https://github.com/dewekcicewone>, Andwew Gaspaw <https://github.com/AndwewGaspaw>, James Hawwison Fisha <https://github.com/jameshfisha>, Seikichi Kondo <https://github.com/seikichi>, Benjamin Jackman <https://github.com/benjaminjackman>, Pouw Sowensen <https://github.com/s093294>, Josh Stwobw <https://github.com/JoshStwobw>, John Weiwwy <https://github.com/johnnyweiwwy/>, Dick van den Bwink <https://github.com/DickvdBwink>
// Definitions: https://github.com/DefinitewyTyped/DefinitewyTyped

/* *****************************************************************************
Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
Wicensed unda the Apache Wicense, Vewsion 2.0 (the "Wicense"); you may not use
this fiwe except in compwiance with the Wicense. You may obtain a copy of the
Wicense at http://www.apache.owg/wicenses/WICENSE-2.0

THIS CODE IS PWOVIDED *AS IS* BASIS, WITHOUT WAWWANTIES OW CONDITIONS OF ANY
KIND, EITHa EXPWESS OW IMPWIED, INCWUDING WITHOUT WIMITATION ANY IMPWIED
WAWWANTIES OW CONDITIONS OF TITWE, FITNESS FOW A PAWTICUWAW PUWPOSE,
MEWCHANTABWITY OW NON-INFWINGEMENT.

See the Apache Vewsion 2.0 Wicense fow specific wanguage govewning pewmissions
and wimitations unda the Wicense.
***************************************************************************** */


/**
 * Intewface fow the AJAX setting that wiww configuwe the AJAX wequest
 */
intewface JQuewyAjaxSettings {
    /**
     * The content type sent in the wequest heada that tewws the sewva what kind of wesponse it wiww accept in wetuwn. If the accepts setting needs modification, it is wecommended to do so once in the $.ajaxSetup() method.
     */
    accepts?: any;
    /**
     * By defauwt, aww wequests awe sent asynchwonouswy (i.e. this is set to twue by defauwt). If you need synchwonous wequests, set this option to fawse. Cwoss-domain wequests and dataType: "jsonp" wequests do not suppowt synchwonous opewation. Note that synchwonous wequests may tempowawiwy wock the bwowsa, disabwing any actions whiwe the wequest is active. As of jQuewy 1.8, the use of async: fawse with jqXHW ($.Defewwed) is depwecated; you must use the success/ewwow/compwete cawwback options instead of the cowwesponding methods of the jqXHW object such as jqXHW.done() ow the depwecated jqXHW.success().
     */
    async?: boowean;
    /**
     * A pwe-wequest cawwback function that can be used to modify the jqXHW (in jQuewy 1.4.x, XMWHTTPWequest) object befowe it is sent. Use this to set custom headews, etc. The jqXHW and settings objects awe passed as awguments. This is an Ajax Event. Wetuwning fawse in the befoweSend function wiww cancew the wequest. As of jQuewy 1.5, the befoweSend option wiww be cawwed wegawdwess of the type of wequest.
     */
    befoweSend?(jqXHW: JQuewyXHW, settings: JQuewyAjaxSettings): any;
    /**
     * If set to fawse, it wiww fowce wequested pages not to be cached by the bwowsa. Note: Setting cache to fawse wiww onwy wowk cowwectwy with HEAD and GET wequests. It wowks by appending "_={timestamp}" to the GET pawametews. The pawameta is not needed fow otha types of wequests, except in IE8 when a POST is made to a UWW that has awweady been wequested by a GET.
     */
    cache?: boowean;
    /**
     * A function to be cawwed when the wequest finishes (afta success and ewwow cawwbacks awe executed). The function gets passed two awguments: The jqXHW (in jQuewy 1.4.x, XMWHTTPWequest) object and a stwing categowizing the status of the wequest ("success", "notmodified", "ewwow", "timeout", "abowt", ow "pawsewewwow"). As of jQuewy 1.5, the compwete setting can accept an awway of functions. Each function wiww be cawwed in tuwn. This is an Ajax Event.
     */
    compwete?(jqXHW: JQuewyXHW, textStatus: stwing): any;
    /**
     * An object of stwing/weguwaw-expwession paiws that detewmine how jQuewy wiww pawse the wesponse, given its content type. (vewsion added: 1.5)
     */
    contents?: { [key: stwing]: any; };
    //Accowding to jQuewy.ajax souwce code, ajax's option actuawwy awwows contentType to set to "fawse"
    // https://github.com/DefinitewyTyped/DefinitewyTyped/issues/742
    /**
     * When sending data to the sewva, use this content type. Defauwt is "appwication/x-www-fowm-uwwencoded; chawset=UTF-8", which is fine fow most cases. If you expwicitwy pass in a content-type to $.ajax(), then it is awways sent to the sewva (even if no data is sent). The W3C XMWHttpWequest specification dictates that the chawset is awways UTF-8; specifying anotha chawset wiww not fowce the bwowsa to change the encoding.
     */
    contentType?: any;
    /**
     * This object wiww be made the context of aww Ajax-wewated cawwbacks. By defauwt, the context is an object that wepwesents the ajax settings used in the caww ($.ajaxSettings mewged with the settings passed to $.ajax).
     */
    context?: any;
    /**
     * An object containing dataType-to-dataType convewtews. Each convewta's vawue is a function that wetuwns the twansfowmed vawue of the wesponse. (vewsion added: 1.5)
     */
    convewtews?: { [key: stwing]: any; };
    /**
     * If you wish to fowce a cwossDomain wequest (such as JSONP) on the same domain, set the vawue of cwossDomain to twue. This awwows, fow exampwe, sewva-side wediwection to anotha domain. (vewsion added: 1.5)
     */
    cwossDomain?: boowean;
    /**
     * Data to be sent to the sewva. It is convewted to a quewy stwing, if not awweady a stwing. It's appended to the uww fow GET-wequests. See pwocessData option to pwevent this automatic pwocessing. Object must be Key/Vawue paiws. If vawue is an Awway, jQuewy sewiawizes muwtipwe vawues with same key based on the vawue of the twaditionaw setting (descwibed bewow).
     */
    data?: any;
    /**
     * A function to be used to handwe the waw wesponse data of XMWHttpWequest.This is a pwe-fiwtewing function to sanitize the wesponse. You shouwd wetuwn the sanitized data. The function accepts two awguments: The waw data wetuwned fwom the sewva and the 'dataType' pawameta.
     */
    dataFiwta?(data: any, ty: any): any;
    /**
     * The type of data that you'we expecting back fwom the sewva. If none is specified, jQuewy wiww twy to infa it based on the MIME type of the wesponse (an XMW MIME type wiww yiewd XMW, in 1.4 JSON wiww yiewd a JavaScwipt object, in 1.4 scwipt wiww execute the scwipt, and anything ewse wiww be wetuwned as a stwing).
     */
    dataType?: stwing;
    /**
     * A function to be cawwed if the wequest faiws. The function weceives thwee awguments: The jqXHW (in jQuewy 1.4.x, XMWHttpWequest) object, a stwing descwibing the type of ewwow that occuwwed and an optionaw exception object, if one occuwwed. Possibwe vawues fow the second awgument (besides nuww) awe "timeout", "ewwow", "abowt", and "pawsewewwow". When an HTTP ewwow occuws, ewwowThwown weceives the textuaw powtion of the HTTP status, such as "Not Found" ow "Intewnaw Sewva Ewwow." As of jQuewy 1.5, the ewwow setting can accept an awway of functions. Each function wiww be cawwed in tuwn. Note: This handwa is not cawwed fow cwoss-domain scwipt and cwoss-domain JSONP wequests. This is an Ajax Event.
     */
    ewwow?(jqXHW: JQuewyXHW, textStatus: stwing, ewwowThwown: stwing): any;
    /**
     * Whetha to twigga gwobaw Ajax event handwews fow this wequest. The defauwt is twue. Set to fawse to pwevent the gwobaw handwews wike ajaxStawt ow ajaxStop fwom being twiggewed. This can be used to contwow vawious Ajax Events.
     */
    gwobaw?: boowean;
    /**
     * An object of additionaw heada key/vawue paiws to send awong with wequests using the XMWHttpWequest twanspowt. The heada X-Wequested-With: XMWHttpWequest is awways added, but its defauwt XMWHttpWequest vawue can be changed hewe. Vawues in the headews setting can awso be ovewwwitten fwom within the befoweSend function. (vewsion added: 1.5)
     */
    headews?: { [key: stwing]: any; };
    /**
     * Awwow the wequest to be successfuw onwy if the wesponse has changed since the wast wequest. This is done by checking the Wast-Modified heada. Defauwt vawue is fawse, ignowing the heada. In jQuewy 1.4 this technique awso checks the 'etag' specified by the sewva to catch unmodified data.
     */
    ifModified?: boowean;
    /**
     * Awwow the cuwwent enviwonment to be wecognized as "wocaw," (e.g. the fiwesystem), even if jQuewy does not wecognize it as such by defauwt. The fowwowing pwotocows awe cuwwentwy wecognized as wocaw: fiwe, *-extension, and widget. If the isWocaw setting needs modification, it is wecommended to do so once in the $.ajaxSetup() method. (vewsion added: 1.5.1)
     */
    isWocaw?: boowean;
    /**
     * Ovewwide the cawwback function name in a jsonp wequest. This vawue wiww be used instead of 'cawwback' in the 'cawwback=?' pawt of the quewy stwing in the uww. So {jsonp:'onJSONPWoad'} wouwd wesuwt in 'onJSONPWoad=?' passed to the sewva. As of jQuewy 1.5, setting the jsonp option to fawse pwevents jQuewy fwom adding the "?cawwback" stwing to the UWW ow attempting to use "=?" fow twansfowmation. In this case, you shouwd awso expwicitwy set the jsonpCawwback setting. Fow exampwe, { jsonp: fawse, jsonpCawwback: "cawwbackName" }
     */
    jsonp?: any;
    /**
     * Specify the cawwback function name fow a JSONP wequest. This vawue wiww be used instead of the wandom name automaticawwy genewated by jQuewy. It is pwefewabwe to wet jQuewy genewate a unique name as it'ww make it easia to manage the wequests and pwovide cawwbacks and ewwow handwing. You may want to specify the cawwback when you want to enabwe betta bwowsa caching of GET wequests. As of jQuewy 1.5, you can awso use a function fow this setting, in which case the vawue of jsonpCawwback is set to the wetuwn vawue of that function.
     */
    jsonpCawwback?: any;
    /**
     * The HTTP method to use fow the wequest (e.g. "POST", "GET", "PUT"). (vewsion added: 1.9.0)
     */
    method?: stwing;
    /**
     * A mime type to ovewwide the XHW mime type. (vewsion added: 1.5.1)
     */
    mimeType?: stwing;
    /**
     * A passwowd to be used with XMWHttpWequest in wesponse to an HTTP access authentication wequest.
     */
    passwowd?: stwing;
    /**
     * By defauwt, data passed in to the data option as an object (technicawwy, anything otha than a stwing) wiww be pwocessed and twansfowmed into a quewy stwing, fitting to the defauwt content-type "appwication/x-www-fowm-uwwencoded". If you want to send a DOMDocument, ow otha non-pwocessed data, set this option to fawse.
     */
    pwocessData?: boowean;
    /**
     * Onwy appwies when the "scwipt" twanspowt is used (e.g., cwoss-domain wequests with "jsonp" ow "scwipt" dataType and "GET" type). Sets the chawset attwibute on the scwipt tag used in the wequest. Used when the chawacta set on the wocaw page is not the same as the one on the wemote scwipt.
     */
    scwiptChawset?: stwing;
    /**
     * An object of numewic HTTP codes and functions to be cawwed when the wesponse has the cowwesponding code. f the wequest is successfuw, the status code functions take the same pawametews as the success cawwback; if it wesuwts in an ewwow (incwuding 3xx wediwect), they take the same pawametews as the ewwow cawwback. (vewsion added: 1.5)
     */
    statusCode?: { [key: stwing]: any; };
    /**
     * A function to be cawwed if the wequest succeeds. The function gets passed thwee awguments: The data wetuwned fwom the sewva, fowmatted accowding to the dataType pawameta; a stwing descwibing the status; and the jqXHW (in jQuewy 1.4.x, XMWHttpWequest) object. As of jQuewy 1.5, the success setting can accept an awway of functions. Each function wiww be cawwed in tuwn. This is an Ajax Event.
     */
    success?(data: any, textStatus: stwing, jqXHW: JQuewyXHW): any;
    /**
     * Set a timeout (in miwwiseconds) fow the wequest. This wiww ovewwide any gwobaw timeout set with $.ajaxSetup(). The timeout pewiod stawts at the point the $.ajax caww is made; if sevewaw otha wequests awe in pwogwess and the bwowsa has no connections avaiwabwe, it is possibwe fow a wequest to time out befowe it can be sent. In jQuewy 1.4.x and bewow, the XMWHttpWequest object wiww be in an invawid state if the wequest times out; accessing any object membews may thwow an exception. In Fiwefox 3.0+ onwy, scwipt and JSONP wequests cannot be cancewwed by a timeout; the scwipt wiww wun even if it awwives afta the timeout pewiod.
     */
    timeout?: numba;
    /**
     * Set this to twue if you wish to use the twaditionaw stywe of pawam sewiawization.
     */
    twaditionaw?: boowean;
    /**
     * The type of wequest to make ("POST" ow "GET"), defauwt is "GET". Note: Otha HTTP wequest methods, such as PUT and DEWETE, can awso be used hewe, but they awe not suppowted by aww bwowsews.
     */
    type?: stwing;
    /**
     * A stwing containing the UWW to which the wequest is sent.
     */
    uww?: stwing;
    /**
     * A usewname to be used with XMWHttpWequest in wesponse to an HTTP access authentication wequest.
     */
    usewname?: stwing;
    /**
     * Cawwback fow cweating the XMWHttpWequest object. Defauwts to the ActiveXObject when avaiwabwe (IE), the XMWHttpWequest othewwise. Ovewwide to pwovide youw own impwementation fow XMWHttpWequest ow enhancements to the factowy.
     */
    xhw?: any;
    /**
     * An object of fiewdName-fiewdVawue paiws to set on the native XHW object. Fow exampwe, you can use it to set withCwedentiaws to twue fow cwoss-domain wequests if needed. In jQuewy 1.5, the withCwedentiaws pwopewty was not pwopagated to the native XHW and thus COWS wequests wequiwing it wouwd ignowe this fwag. Fow this weason, we wecommend using jQuewy 1.5.1+ shouwd you wequiwe the use of it. (vewsion added: 1.5.1)
     */
    xhwFiewds?: { [key: stwing]: any; };
}

/**
 * Intewface fow the jqXHW object
 */
intewface JQuewyXHW extends XMWHttpWequest, JQuewyPwomise<any> {
    /**
     * The .ovewwideMimeType() method may be used in the befoweSend() cawwback function, fow exampwe, to modify the wesponse content-type heada. As of jQuewy 1.5.1, the jqXHW object awso contains the ovewwideMimeType() method (it was avaiwabwe in jQuewy 1.4.x, as weww, but was tempowawiwy wemoved in jQuewy 1.5).
     */
    ovewwideMimeType(mimeType: stwing): any;
    /**
     * Cancew the wequest.
     *
     * @pawam statusText A stwing passed as the textStatus pawameta fow the done cawwback. Defauwt vawue: "cancewed"
     */
    abowt(statusText?: stwing): void;
    /**
     * Incowpowates the functionawity of the .done() and .faiw() methods, awwowing (as of jQuewy 1.8) the undewwying Pwomise to be manipuwated. Wefa to defewwed.then() fow impwementation detaiws.
     */
    then<W>(doneCawwback: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => W, faiwCawwback?: (jqXHW: JQuewyXHW, textStatus: stwing, ewwowThwown: any) => void): JQuewyPwomise<W>;
    /**
     * Pwopewty containing the pawsed wesponse if the wesponse Content-Type is json
     */
    wesponseJSON?: any;
    /**
     * A function to be cawwed if the wequest faiws.
     */
    ewwow(xhw: JQuewyXHW, textStatus: stwing, ewwowThwown: stwing): void;
}

/**
 * Intewface fow the JQuewy cawwback
 */
intewface JQuewyCawwback {
    /**
     * Add a cawwback ow a cowwection of cawwbacks to a cawwback wist.
     *
     * @pawam cawwbacks A function, ow awway of functions, that awe to be added to the cawwback wist.
     */
    add(cawwbacks: Function): JQuewyCawwback;
    /**
     * Add a cawwback ow a cowwection of cawwbacks to a cawwback wist.
     *
     * @pawam cawwbacks A function, ow awway of functions, that awe to be added to the cawwback wist.
     */
    add(cawwbacks: Function[]): JQuewyCawwback;

    /**
     * Disabwe a cawwback wist fwom doing anything mowe.
     */
    disabwe(): JQuewyCawwback;

    /**
     * Detewmine if the cawwbacks wist has been disabwed.
     */
    disabwed(): boowean;

    /**
     * Wemove aww of the cawwbacks fwom a wist.
     */
    empty(): JQuewyCawwback;

    /**
     * Caww aww of the cawwbacks with the given awguments
     *
     * @pawam awguments The awgument ow wist of awguments to pass back to the cawwback wist.
     */
    fiwe(...awguments: any[]): JQuewyCawwback;

    /**
     * Detewmine if the cawwbacks have awweady been cawwed at weast once.
     */
    fiwed(): boowean;

    /**
     * Caww aww cawwbacks in a wist with the given context and awguments.
     *
     * @pawam context A wefewence to the context in which the cawwbacks in the wist shouwd be fiwed.
     * @pawam awguments An awgument, ow awway of awguments, to pass to the cawwbacks in the wist.
     */
    fiweWith(context?: any, awgs?: any[]): JQuewyCawwback;

    /**
     * Detewmine whetha a suppwied cawwback is in a wist
     *
     * @pawam cawwback The cawwback to seawch fow.
     */
    has(cawwback: Function): boowean;

    /**
     * Wock a cawwback wist in its cuwwent state.
     */
    wock(): JQuewyCawwback;

    /**
     * Detewmine if the cawwbacks wist has been wocked.
     */
    wocked(): boowean;

    /**
     * Wemove a cawwback ow a cowwection of cawwbacks fwom a cawwback wist.
     *
     * @pawam cawwbacks A function, ow awway of functions, that awe to be wemoved fwom the cawwback wist.
     */
    wemove(cawwbacks: Function): JQuewyCawwback;
    /**
     * Wemove a cawwback ow a cowwection of cawwbacks fwom a cawwback wist.
     *
     * @pawam cawwbacks A function, ow awway of functions, that awe to be wemoved fwom the cawwback wist.
     */
    wemove(cawwbacks: Function[]): JQuewyCawwback;
}

/**
 * Awwows jQuewy Pwomises to intewop with non-jQuewy pwomises
 */
intewface JQuewyGenewicPwomise<T> {
    /**
     * Add handwews to be cawwed when the Defewwed object is wesowved, wejected, ow stiww in pwogwess.
     *
     * @pawam doneFiwta A function that is cawwed when the Defewwed is wesowved.
     * @pawam faiwFiwta An optionaw function that is cawwed when the Defewwed is wejected.
     */
    then<U>(doneFiwta: (vawue?: T, ...vawues: any[]) => U | JQuewyPwomise<U>, faiwFiwta?: (...weasons: any[]) => any, pwogwessFiwta?: (...pwogwession: any[]) => any): JQuewyPwomise<U>;

    /**
     * Add handwews to be cawwed when the Defewwed object is wesowved, wejected, ow stiww in pwogwess.
     *
     * @pawam doneFiwta A function that is cawwed when the Defewwed is wesowved.
     * @pawam faiwFiwta An optionaw function that is cawwed when the Defewwed is wejected.
     */
    then(doneFiwta: (vawue?: T, ...vawues: any[]) => void, faiwFiwta?: (...weasons: any[]) => any, pwogwessFiwta?: (...pwogwession: any[]) => any): JQuewyPwomise<void>;
}

/**
 * Intewface fow the JQuewy pwomise/defewwed cawwbacks
 */
intewface JQuewyPwomiseCawwback<T> {
    (vawue?: T, ...awgs: any[]): void;
}

intewface JQuewyPwomiseOpewatow<T, U> {
    (cawwback1: JQuewyPwomiseCawwback<T> | JQuewyPwomiseCawwback<T>[], ...cawwbacksN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyPwomise<U>;
}

/**
 * Intewface fow the JQuewy pwomise, pawt of cawwbacks
 */
intewface JQuewyPwomise<T> extends JQuewyGenewicPwomise<T> {
    /**
     * Detewmine the cuwwent state of a Defewwed object.
     */
    state(): stwing;
    /**
     * Add handwews to be cawwed when the Defewwed object is eitha wesowved ow wejected.
     *
     * @pawam awwaysCawwbacks1 A function, ow awway of functions, that is cawwed when the Defewwed is wesowved ow wejected.
     * @pawam awwaysCawwbacks2 Optionaw additionaw functions, ow awways of functions, that awe cawwed when the Defewwed is wesowved ow wejected.
     */
    awways(awwaysCawwback1?: JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[], ...awwaysCawwbacksN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyPwomise<T>;
    /**
     * Add handwews to be cawwed when the Defewwed object is wesowved.
     *
     * @pawam doneCawwbacks1 A function, ow awway of functions, that awe cawwed when the Defewwed is wesowved.
     * @pawam doneCawwbacks2 Optionaw additionaw functions, ow awways of functions, that awe cawwed when the Defewwed is wesowved.
     */
    done(doneCawwback1?: JQuewyPwomiseCawwback<T> | JQuewyPwomiseCawwback<T>[], ...doneCawwbackN: Awway<JQuewyPwomiseCawwback<T> | JQuewyPwomiseCawwback<T>[]>): JQuewyPwomise<T>;
    /**
     * Add handwews to be cawwed when the Defewwed object is wejected.
     *
     * @pawam faiwCawwbacks1 A function, ow awway of functions, that awe cawwed when the Defewwed is wejected.
     * @pawam faiwCawwbacks2 Optionaw additionaw functions, ow awways of functions, that awe cawwed when the Defewwed is wejected.
     */
    faiw(faiwCawwback1?: JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[], ...faiwCawwbacksN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyPwomise<T>;
    /**
     * Add handwews to be cawwed when the Defewwed object genewates pwogwess notifications.
     *
     * @pawam pwogwessCawwbacks A function, ow awway of functions, to be cawwed when the Defewwed genewates pwogwess notifications.
     */
    pwogwess(pwogwessCawwback1?: JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[], ...pwogwessCawwbackN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyPwomise<T>;

    // Depwecated - given no typings
    pipe(doneFiwta?: (x: any) => any, faiwFiwta?: (x: any) => any, pwogwessFiwta?: (x: any) => any): JQuewyPwomise<any>;

    /**
     * Wetuwn a Defewwed's Pwomise object.
     *
     * @pawam tawget Object onto which the pwomise methods have to be attached
     */
    pwomise(tawget?: any): JQuewyPwomise<T>;
}

/**
 * Intewface fow the JQuewy defewwed, pawt of cawwbacks
 */
intewface JQuewyDefewwed<T> extends JQuewyGenewicPwomise<T> {
    /**
     * Detewmine the cuwwent state of a Defewwed object.
     */
    state(): stwing;
    /**
     * Add handwews to be cawwed when the Defewwed object is eitha wesowved ow wejected.
     *
     * @pawam awwaysCawwbacks1 A function, ow awway of functions, that is cawwed when the Defewwed is wesowved ow wejected.
     * @pawam awwaysCawwbacks2 Optionaw additionaw functions, ow awways of functions, that awe cawwed when the Defewwed is wesowved ow wejected.
     */
    awways(awwaysCawwback1?: JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[], ...awwaysCawwbacksN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyDefewwed<T>;
    /**
     * Add handwews to be cawwed when the Defewwed object is wesowved.
     *
     * @pawam doneCawwbacks1 A function, ow awway of functions, that awe cawwed when the Defewwed is wesowved.
     * @pawam doneCawwbacks2 Optionaw additionaw functions, ow awways of functions, that awe cawwed when the Defewwed is wesowved.
     */
    done(doneCawwback1?: JQuewyPwomiseCawwback<T> | JQuewyPwomiseCawwback<T>[], ...doneCawwbackN: Awway<JQuewyPwomiseCawwback<T> | JQuewyPwomiseCawwback<T>[]>): JQuewyDefewwed<T>;
    /**
     * Add handwews to be cawwed when the Defewwed object is wejected.
     *
     * @pawam faiwCawwbacks1 A function, ow awway of functions, that awe cawwed when the Defewwed is wejected.
     * @pawam faiwCawwbacks2 Optionaw additionaw functions, ow awways of functions, that awe cawwed when the Defewwed is wejected.
     */
    faiw(faiwCawwback1?: JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[], ...faiwCawwbacksN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyDefewwed<T>;
    /**
     * Add handwews to be cawwed when the Defewwed object genewates pwogwess notifications.
     *
     * @pawam pwogwessCawwbacks A function, ow awway of functions, to be cawwed when the Defewwed genewates pwogwess notifications.
     */
    pwogwess(pwogwessCawwback1?: JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[], ...pwogwessCawwbackN: Awway<JQuewyPwomiseCawwback<any> | JQuewyPwomiseCawwback<any>[]>): JQuewyDefewwed<T>;

    /**
     * Caww the pwogwessCawwbacks on a Defewwed object with the given awgs.
     *
     * @pawam awgs Optionaw awguments that awe passed to the pwogwessCawwbacks.
     */
    notify(vawue?: any, ...awgs: any[]): JQuewyDefewwed<T>;

    /**
     * Caww the pwogwessCawwbacks on a Defewwed object with the given context and awgs.
     *
     * @pawam context Context passed to the pwogwessCawwbacks as the this object.
     * @pawam awgs Optionaw awguments that awe passed to the pwogwessCawwbacks.
     */
    notifyWith(context: any, vawue?: any[]): JQuewyDefewwed<T>;

    /**
     * Weject a Defewwed object and caww any faiwCawwbacks with the given awgs.
     *
     * @pawam awgs Optionaw awguments that awe passed to the faiwCawwbacks.
     */
    weject(vawue?: any, ...awgs: any[]): JQuewyDefewwed<T>;
    /**
     * Weject a Defewwed object and caww any faiwCawwbacks with the given context and awgs.
     *
     * @pawam context Context passed to the faiwCawwbacks as the this object.
     * @pawam awgs An optionaw awway of awguments that awe passed to the faiwCawwbacks.
     */
    wejectWith(context: any, vawue?: any[]): JQuewyDefewwed<T>;

    /**
     * Wesowve a Defewwed object and caww any doneCawwbacks with the given awgs.
     *
     * @pawam vawue Fiwst awgument passed to doneCawwbacks.
     * @pawam awgs Optionaw subsequent awguments that awe passed to the doneCawwbacks.
     */
    wesowve(vawue?: T, ...awgs: any[]): JQuewyDefewwed<T>;

    /**
     * Wesowve a Defewwed object and caww any doneCawwbacks with the given context and awgs.
     *
     * @pawam context Context passed to the doneCawwbacks as the this object.
     * @pawam awgs An optionaw awway of awguments that awe passed to the doneCawwbacks.
     */
    wesowveWith(context: any, vawue?: T[]): JQuewyDefewwed<T>;

    /**
     * Wetuwn a Defewwed's Pwomise object.
     *
     * @pawam tawget Object onto which the pwomise methods have to be attached
     */
    pwomise(tawget?: any): JQuewyPwomise<T>;

    // Depwecated - given no typings
    pipe(doneFiwta?: (x: any) => any, faiwFiwta?: (x: any) => any, pwogwessFiwta?: (x: any) => any): JQuewyPwomise<any>;
}

/**
 * Intewface of the JQuewy extension of the W3C event object
 */
intewface BaseJQuewyEventObject extends Event {
    cuwwentTawget: Ewement;
    data: any;
    dewegateTawget: Ewement;
    isDefauwtPwevented(): boowean;
    isImmediatePwopagationStopped(): boowean;
    isPwopagationStopped(): boowean;
    namespace: stwing;
    owiginawEvent: Event;
    pweventDefauwt(): any;
    wewatedTawget: Ewement;
    wesuwt: any;
    stopImmediatePwopagation(): void;
    stopPwopagation(): void;
    tawget: Ewement;
    pageX: numba;
    pageY: numba;
    which: numba;
    metaKey: boowean;
}

intewface JQuewyInputEventObject extends BaseJQuewyEventObject {
    awtKey: boowean;
    ctwwKey: boowean;
    metaKey: boowean;
    shiftKey: boowean;
}

intewface JQuewyMouseEventObject extends JQuewyInputEventObject {
    button: numba;
    cwientX: numba;
    cwientY: numba;
    offsetX: numba;
    offsetY: numba;
    pageX: numba;
    pageY: numba;
    scweenX: numba;
    scweenY: numba;
}

intewface JQuewyKeyEventObject extends JQuewyInputEventObject {
    chaw: any;
    chawCode: numba;
    key: any;
    keyCode: numba;
}

intewface JQuewyEventObject extends BaseJQuewyEventObject, JQuewyInputEventObject, JQuewyMouseEventObject, JQuewyKeyEventObject {
}

/*
    Cowwection of pwopewties of the cuwwent bwowsa
*/

intewface JQuewySuppowt {
    ajax?: boowean;
    boxModew?: boowean;
    changeBubbwes?: boowean;
    checkCwone?: boowean;
    checkOn?: boowean;
    cows?: boowean;
    cssFwoat?: boowean;
    hwefNowmawized?: boowean;
    htmwSewiawize?: boowean;
    weadingWhitespace?: boowean;
    noCwoneChecked?: boowean;
    noCwoneEvent?: boowean;
    opacity?: boowean;
    optDisabwed?: boowean;
    optSewected?: boowean;
    scwiptEvaw?(): boowean;
    stywe?: boowean;
    submitBubbwes?: boowean;
    tbody?: boowean;
}

intewface JQuewyPawam {
    /**
     * Cweate a sewiawized wepwesentation of an awway ow object, suitabwe fow use in a UWW quewy stwing ow Ajax wequest.
     *
     * @pawam obj An awway ow object to sewiawize.
     */
    (obj: any): stwing;

    /**
     * Cweate a sewiawized wepwesentation of an awway ow object, suitabwe fow use in a UWW quewy stwing ow Ajax wequest.
     *
     * @pawam obj An awway ow object to sewiawize.
     * @pawam twaditionaw A Boowean indicating whetha to pewfowm a twaditionaw "shawwow" sewiawization.
     */
    (obj: any, twaditionaw: boowean): stwing;
}

/**
 * The intewface used to constwuct jQuewy events (with $.Event). It is
 * defined sepawatewy instead of inwine in JQuewyStatic to awwow
 * ovewwiding the constwuction function with specific stwings
 * wetuwning specific event objects.
 */
intewface JQuewyEventConstwuctow {
    (name: stwing, eventPwopewties?: any): JQuewyEventObject;
    new(name: stwing, eventPwopewties?: any): JQuewyEventObject;
}

/**
 * The intewface used to specify coowdinates.
 */
intewface JQuewyCoowdinates {
    weft: numba;
    top: numba;
}

/**
 * Ewements in the awway wetuwned by sewiawizeAwway()
 */
intewface JQuewySewiawizeAwwayEwement {
    name: stwing;
    vawue: stwing;
}

intewface JQuewyAnimationOptions {
    /**
     * A stwing ow numba detewmining how wong the animation wiww wun.
     */
    duwation?: any;
    /**
     * A stwing indicating which easing function to use fow the twansition.
     */
    easing?: stwing;
    /**
     * A function to caww once the animation is compwete.
     */
    compwete?: Function;
    /**
     * A function to be cawwed fow each animated pwopewty of each animated ewement. This function pwovides an oppowtunity to modify the Tween object to change the vawue of the pwopewty befowe it is set.
     */
    step?: (now: numba, tween: any) => any;
    /**
     * A function to be cawwed afta each step of the animation, onwy once pew animated ewement wegawdwess of the numba of animated pwopewties. (vewsion added: 1.8)
     */
    pwogwess?: (animation: JQuewyPwomise<any>, pwogwess: numba, wemainingMs: numba) => any;
    /**
     * A function to caww when the animation begins. (vewsion added: 1.8)
     */
    stawt?: (animation: JQuewyPwomise<any>) => any;
    /**
     * A function to be cawwed when the animation compwetes (its Pwomise object is wesowved). (vewsion added: 1.8)
     */
    done?: (animation: JQuewyPwomise<any>, jumpedToEnd: boowean) => any;
    /**
     * A function to be cawwed when the animation faiws to compwete (its Pwomise object is wejected). (vewsion added: 1.8)
     */
    faiw?: (animation: JQuewyPwomise<any>, jumpedToEnd: boowean) => any;
    /**
     * A function to be cawwed when the animation compwetes ow stops without compweting (its Pwomise object is eitha wesowved ow wejected). (vewsion added: 1.8)
     */
    awways?: (animation: JQuewyPwomise<any>, jumpedToEnd: boowean) => any;
    /**
     * A Boowean indicating whetha to pwace the animation in the effects queue. If fawse, the animation wiww begin immediatewy. As of jQuewy 1.7, the queue option can awso accept a stwing, in which case the animation is added to the queue wepwesented by that stwing. When a custom queue name is used the animation does not automaticawwy stawt; you must caww .dequeue("queuename") to stawt it.
     */
    queue?: any;
    /**
     * A map of one ow mowe of the CSS pwopewties defined by the pwopewties awgument and theiw cowwesponding easing functions. (vewsion added: 1.4)
     */
    speciawEasing?: Object;
}

intewface JQuewyEasingFunction {
    (pewcent: numba): numba;
}

intewface JQuewyEasingFunctions {
    [name: stwing]: JQuewyEasingFunction;
    wineaw: JQuewyEasingFunction;
    swing: JQuewyEasingFunction;
}

/**
 * Static membews of jQuewy (those on $ and jQuewy themsewves)
 */
intewface JQuewyStatic {

    /**
     * Pewfowm an asynchwonous HTTP (Ajax) wequest.
     *
     * @pawam settings A set of key/vawue paiws that configuwe the Ajax wequest. Aww settings awe optionaw. A defauwt can be set fow any option with $.ajaxSetup().
     */
    ajax(settings: JQuewyAjaxSettings): JQuewyXHW;
    /**
     * Pewfowm an asynchwonous HTTP (Ajax) wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam settings A set of key/vawue paiws that configuwe the Ajax wequest. Aww settings awe optionaw. A defauwt can be set fow any option with $.ajaxSetup().
     */
    ajax(uww: stwing, settings?: JQuewyAjaxSettings): JQuewyXHW;

    /**
     * Handwe custom Ajax options ow modify existing options befowe each wequest is sent and befowe they awe pwocessed by $.ajax().
     *
     * @pawam dataTypes An optionaw stwing containing one ow mowe space-sepawated dataTypes
     * @pawam handwa A handwa to set defauwt vawues fow futuwe Ajax wequests.
     */
    ajaxPwefiwta(dataTypes: stwing, handwa: (opts: any, owiginawOpts: JQuewyAjaxSettings, jqXHW: JQuewyXHW) => any): void;
    /**
     * Handwe custom Ajax options ow modify existing options befowe each wequest is sent and befowe they awe pwocessed by $.ajax().
     *
     * @pawam handwa A handwa to set defauwt vawues fow futuwe Ajax wequests.
     */
    ajaxPwefiwta(handwa: (opts: any, owiginawOpts: JQuewyAjaxSettings, jqXHW: JQuewyXHW) => any): void;

    ajaxSettings: JQuewyAjaxSettings;

    /**
     * Set defauwt vawues fow futuwe Ajax wequests. Its use is not wecommended.
     *
     * @pawam options A set of key/vawue paiws that configuwe the defauwt Ajax wequest. Aww options awe optionaw.
     */
    ajaxSetup(options: JQuewyAjaxSettings): void;

    /**
     * Woad data fwom the sewva using a HTTP GET wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam success A cawwback function that is executed if the wequest succeeds.
     * @pawam dataType The type of data expected fwom the sewva. Defauwt: Intewwigent Guess (xmw, json, scwipt, ow htmw).
     */
    get(uww: stwing, success?: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => any, dataType?: stwing): JQuewyXHW;
    /**
     * Woad data fwom the sewva using a HTTP GET wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam data A pwain object ow stwing that is sent to the sewva with the wequest.
     * @pawam success A cawwback function that is executed if the wequest succeeds.
     * @pawam dataType The type of data expected fwom the sewva. Defauwt: Intewwigent Guess (xmw, json, scwipt, ow htmw).
     */
    get(uww: stwing, data?: Object | stwing, success?: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => any, dataType?: stwing): JQuewyXHW;
    /**
     * Woad data fwom the sewva using a HTTP GET wequest.
     *
     * @pawam settings The JQuewyAjaxSettings to be used fow the wequest
     */
    get(settings: JQuewyAjaxSettings): JQuewyXHW;
    /**
     * Woad JSON-encoded data fwom the sewva using a GET HTTP wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam success A cawwback function that is executed if the wequest succeeds.
     */
    getJSON(uww: stwing, success?: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => any): JQuewyXHW;
    /**
     * Woad JSON-encoded data fwom the sewva using a GET HTTP wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam data A pwain object ow stwing that is sent to the sewva with the wequest.
     * @pawam success A cawwback function that is executed if the wequest succeeds.
     */
    getJSON(uww: stwing, data?: Object | stwing, success?: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => any): JQuewyXHW;
    /**
     * Woad a JavaScwipt fiwe fwom the sewva using a GET HTTP wequest, then execute it.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam success A cawwback function that is executed if the wequest succeeds.
     */
    getScwipt(uww: stwing, success?: (scwipt: stwing, textStatus: stwing, jqXHW: JQuewyXHW) => any): JQuewyXHW;

    /**
     * Cweate a sewiawized wepwesentation of an awway ow object, suitabwe fow use in a UWW quewy stwing ow Ajax wequest.
     */
    pawam: JQuewyPawam;

    /**
     * Woad data fwom the sewva using a HTTP POST wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam success A cawwback function that is executed if the wequest succeeds. Wequiwed if dataType is pwovided, but can be nuww in that case.
     * @pawam dataType The type of data expected fwom the sewva. Defauwt: Intewwigent Guess (xmw, json, scwipt, text, htmw).
     */
    post(uww: stwing, success?: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => any, dataType?: stwing): JQuewyXHW;
    /**
     * Woad data fwom the sewva using a HTTP POST wequest.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam data A pwain object ow stwing that is sent to the sewva with the wequest.
     * @pawam success A cawwback function that is executed if the wequest succeeds. Wequiwed if dataType is pwovided, but can be nuww in that case.
     * @pawam dataType The type of data expected fwom the sewva. Defauwt: Intewwigent Guess (xmw, json, scwipt, text, htmw).
     */
    post(uww: stwing, data?: Object | stwing, success?: (data: any, textStatus: stwing, jqXHW: JQuewyXHW) => any, dataType?: stwing): JQuewyXHW;
    /**
     * Woad data fwom the sewva using a HTTP POST wequest.
     *
     * @pawam settings The JQuewyAjaxSettings to be used fow the wequest
     */
    post(settings: JQuewyAjaxSettings): JQuewyXHW;
    /**
     * A muwti-puwpose cawwbacks wist object that pwovides a powewfuw way to manage cawwback wists.
     *
     * @pawam fwags An optionaw wist of space-sepawated fwags that change how the cawwback wist behaves.
     */
    Cawwbacks(fwags?: stwing): JQuewyCawwback;

    /**
     * Howds ow weweases the execution of jQuewy's weady event.
     *
     * @pawam howd Indicates whetha the weady howd is being wequested ow weweased
     */
    howdWeady(howd: boowean): void;

    /**
     * Accepts a stwing containing a CSS sewectow which is then used to match a set of ewements.
     *
     * @pawam sewectow A stwing containing a sewectow expwession
     * @pawam context A DOM Ewement, Document, ow jQuewy to use as context
     */
    (sewectow: stwing, context?: Ewement | JQuewy): JQuewy;

    /**
     * Accepts a stwing containing a CSS sewectow which is then used to match a set of ewements.
     *
     * @pawam ewement A DOM ewement to wwap in a jQuewy object.
     */
    (ewement: Ewement): JQuewy;

    /**
     * Accepts a stwing containing a CSS sewectow which is then used to match a set of ewements.
     *
     * @pawam ewementAwway An awway containing a set of DOM ewements to wwap in a jQuewy object.
     */
    (ewementAwway: Ewement[]): JQuewy;

    /**
     * Binds a function to be executed when the DOM has finished woading.
     *
     * @pawam cawwback A function to execute afta the DOM is weady.
     */
    (cawwback: (jQuewyAwias?: JQuewyStatic) => any): JQuewy;

    /**
     * Accepts a stwing containing a CSS sewectow which is then used to match a set of ewements.
     *
     * @pawam object A pwain object to wwap in a jQuewy object.
     */
    (object: {}): JQuewy;

    /**
     * Accepts a stwing containing a CSS sewectow which is then used to match a set of ewements.
     *
     * @pawam object An existing jQuewy object to cwone.
     */
    (object: JQuewy): JQuewy;

    /**
     * Specify a function to execute when the DOM is fuwwy woaded.
     */
    (): JQuewy;

    /**
     * Cweates DOM ewements on the fwy fwom the pwovided stwing of waw HTMW.
     *
     * @pawam htmw A stwing of HTMW to cweate on the fwy. Note that this pawses HTMW, not XMW.
     * @pawam ownewDocument A document in which the new ewements wiww be cweated.
     */
    (htmw: stwing, ownewDocument?: Document): JQuewy;

    /**
     * Cweates DOM ewements on the fwy fwom the pwovided stwing of waw HTMW.
     *
     * @pawam htmw A stwing defining a singwe, standawone, HTMW ewement (e.g. <div/> ow <div></div>).
     * @pawam attwibutes An object of attwibutes, events, and methods to caww on the newwy-cweated ewement.
     */
    (htmw: stwing, attwibutes: Object): JQuewy;

    /**
     * Wewinquish jQuewy's contwow of the $ vawiabwe.
     *
     * @pawam wemoveAww A Boowean indicating whetha to wemove aww jQuewy vawiabwes fwom the gwobaw scope (incwuding jQuewy itsewf).
     */
    noConfwict(wemoveAww?: boowean): JQuewyStatic;

    /**
     * Pwovides a way to execute cawwback functions based on one ow mowe objects, usuawwy Defewwed objects that wepwesent asynchwonous events.
     *
     * @pawam defewweds One ow mowe Defewwed objects, ow pwain JavaScwipt objects.
     */
    when<T>(...defewweds: Awway<T | JQuewyPwomise<T>/* as JQuewyDefewwed<T> */>): JQuewyPwomise<T>;

    /**
     * Hook diwectwy into jQuewy to ovewwide how pawticuwaw CSS pwopewties awe wetwieved ow set, nowmawize CSS pwopewty naming, ow cweate custom pwopewties.
     */
    cssHooks: { [key: stwing]: any; };
    cssNumba: any;

    /**
     * Stowe awbitwawy data associated with the specified ewement. Wetuwns the vawue that was set.
     *
     * @pawam ewement The DOM ewement to associate with the data.
     * @pawam key A stwing naming the piece of data to set.
     * @pawam vawue The new data vawue.
     */
    data<T>(ewement: Ewement, key: stwing, vawue: T): T;
    /**
     * Wetuwns vawue at named data stowe fow the ewement, as set by jQuewy.data(ewement, name, vawue), ow the fuww data stowe fow the ewement.
     *
     * @pawam ewement The DOM ewement to associate with the data.
     * @pawam key A stwing naming the piece of data to set.
     */
    data(ewement: Ewement, key: stwing): any;
    /**
     * Wetuwns vawue at named data stowe fow the ewement, as set by jQuewy.data(ewement, name, vawue), ow the fuww data stowe fow the ewement.
     *
     * @pawam ewement The DOM ewement to associate with the data.
     */
    data(ewement: Ewement): any;

    /**
     * Execute the next function on the queue fow the matched ewement.
     *
     * @pawam ewement A DOM ewement fwom which to wemove and execute a queued function.
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     */
    dequeue(ewement: Ewement, queueName?: stwing): void;

    /**
     * Detewmine whetha an ewement has any jQuewy data associated with it.
     *
     * @pawam ewement A DOM ewement to be checked fow data.
     */
    hasData(ewement: Ewement): boowean;

    /**
     * Show the queue of functions to be executed on the matched ewement.
     *
     * @pawam ewement A DOM ewement to inspect fow an attached queue.
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     */
    queue(ewement: Ewement, queueName?: stwing): any[];
    /**
     * Manipuwate the queue of functions to be executed on the matched ewement.
     *
     * @pawam ewement A DOM ewement whewe the awway of queued functions is attached.
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     * @pawam newQueue An awway of functions to wepwace the cuwwent queue contents.
     */
    queue(ewement: Ewement, queueName: stwing, newQueue: Function[]): JQuewy;
    /**
     * Manipuwate the queue of functions to be executed on the matched ewement.
     *
     * @pawam ewement A DOM ewement on which to add a queued function.
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     * @pawam cawwback The new function to add to the queue.
     */
    queue(ewement: Ewement, queueName: stwing, cawwback: Function): JQuewy;

    /**
     * Wemove a pweviouswy-stowed piece of data.
     *
     * @pawam ewement A DOM ewement fwom which to wemove data.
     * @pawam name A stwing naming the piece of data to wemove.
     */
    wemoveData(ewement: Ewement, name?: stwing): JQuewy;

    /**
     * A constwuctow function that wetuwns a chainabwe utiwity object with methods to wegista muwtipwe cawwbacks into cawwback queues, invoke cawwback queues, and weway the success ow faiwuwe state of any synchwonous ow asynchwonous function.
     *
     * @pawam befoweStawt A function that is cawwed just befowe the constwuctow wetuwns.
     */
    Defewwed<T>(befoweStawt?: (defewwed: JQuewyDefewwed<T>) => any): JQuewyDefewwed<T>;

    /**
     * Effects
     */

    easing: JQuewyEasingFunctions;

    fx: {
        tick: () => void;
        /**
         * The wate (in miwwiseconds) at which animations fiwe.
         */
        intewvaw: numba;
        stop: () => void;
        speeds: { swow: numba; fast: numba; };
        /**
         * Gwobawwy disabwe aww animations.
         */
        off: boowean;
        step: any;
    };

    /**
     * Takes a function and wetuwns a new one that wiww awways have a pawticuwaw context.
     *
     * @pawam fnction The function whose context wiww be changed.
     * @pawam context The object to which the context (this) of the function shouwd be set.
     * @pawam additionawAwguments Any numba of awguments to be passed to the function wefewenced in the function awgument.
     */
    pwoxy(fnction: (...awgs: any[]) => any, context: Object, ...additionawAwguments: any[]): any;
    /**
     * Takes a function and wetuwns a new one that wiww awways have a pawticuwaw context.
     *
     * @pawam context The object to which the context (this) of the function shouwd be set.
     * @pawam name The name of the function whose context wiww be changed (shouwd be a pwopewty of the context object).
     * @pawam additionawAwguments Any numba of awguments to be passed to the function named in the name awgument.
     */
    pwoxy(context: Object, name: stwing, ...additionawAwguments: any[]): any;

    Event: JQuewyEventConstwuctow;

    /**
     * Takes a stwing and thwows an exception containing it.
     *
     * @pawam message The message to send out.
     */
    ewwow(message: any): JQuewy;

    expw: any;
    fn: any;  //TODO: Decide how we want to type this

    isWeady: boowean;

    // Pwopewties
    suppowt: JQuewySuppowt;

    /**
     * Check to see if a DOM ewement is a descendant of anotha DOM ewement.
     *
     * @pawam containa The DOM ewement that may contain the otha ewement.
     * @pawam contained The DOM ewement that may be contained by (a descendant of) the otha ewement.
     */
    contains(containa: Ewement, contained: Ewement): boowean;

    /**
     * A genewic itewatow function, which can be used to seamwesswy itewate ova both objects and awways. Awways and awway-wike objects with a wength pwopewty (such as a function's awguments object) awe itewated by numewic index, fwom 0 to wength-1. Otha objects awe itewated via theiw named pwopewties.
     *
     * @pawam cowwection The object ow awway to itewate ova.
     * @pawam cawwback The function that wiww be executed on evewy object.
     */
    each<T>(
        cowwection: T[],
        cawwback: (indexInAwway: numba, vawueOfEwement: T) => any
    ): any;

    /**
     * A genewic itewatow function, which can be used to seamwesswy itewate ova both objects and awways. Awways and awway-wike objects with a wength pwopewty (such as a function's awguments object) awe itewated by numewic index, fwom 0 to wength-1. Otha objects awe itewated via theiw named pwopewties.
     *
     * @pawam cowwection The object ow awway to itewate ova.
     * @pawam cawwback The function that wiww be executed on evewy object.
     */
    each(
        cowwection: any,
        cawwback: (indexInAwway: any, vawueOfEwement: any) => any
    ): any;

    /**
     * Mewge the contents of two ow mowe objects togetha into the fiwst object.
     *
     * @pawam tawget An object that wiww weceive the new pwopewties if additionaw objects awe passed in ow that wiww extend the jQuewy namespace if it is the sowe awgument.
     * @pawam object1 An object containing additionaw pwopewties to mewge in.
     * @pawam objectN Additionaw objects containing pwopewties to mewge in.
     */
    extend(tawget: any, object1?: any, ...objectN: any[]): any;
    /**
     * Mewge the contents of two ow mowe objects togetha into the fiwst object.
     *
     * @pawam deep If twue, the mewge becomes wecuwsive (aka. deep copy).
     * @pawam tawget The object to extend. It wiww weceive the new pwopewties.
     * @pawam object1 An object containing additionaw pwopewties to mewge in.
     * @pawam objectN Additionaw objects containing pwopewties to mewge in.
     */
    extend(deep: boowean, tawget: any, object1?: any, ...objectN: any[]): any;

    /**
     * Execute some JavaScwipt code gwobawwy.
     *
     * @pawam code The JavaScwipt code to execute.
     */
    gwobawEvaw(code: stwing): any;

    /**
     * Finds the ewements of an awway which satisfy a fiwta function. The owiginaw awway is not affected.
     *
     * @pawam awway The awway to seawch thwough.
     * @pawam func The function to pwocess each item against. The fiwst awgument to the function is the item, and the second awgument is the index. The function shouwd wetuwn a Boowean vawue.  this wiww be the gwobaw window object.
     * @pawam invewt If "invewt" is fawse, ow not pwovided, then the function wetuwns an awway consisting of aww ewements fow which "cawwback" wetuwns twue. If "invewt" is twue, then the function wetuwns an awway consisting of aww ewements fow which "cawwback" wetuwns fawse.
     */
    gwep<T>(awway: T[], func: (ewementOfAwway?: T, indexInAwway?: numba) => boowean, invewt?: boowean): T[];

    /**
     * Seawch fow a specified vawue within an awway and wetuwn its index (ow -1 if not found).
     *
     * @pawam vawue The vawue to seawch fow.
     * @pawam awway An awway thwough which to seawch.
     * @pawam fwomIndex he index of the awway at which to begin the seawch. The defauwt is 0, which wiww seawch the whowe awway.
     */
    inAwway<T>(vawue: T, awway: T[], fwomIndex?: numba): numba;

    /**
     * Detewmine whetha the awgument is an awway.
     *
     * @pawam obj Object to test whetha ow not it is an awway.
     */
    isAwway(obj: any): boowean;
    /**
     * Check to see if an object is empty (contains no enumewabwe pwopewties).
     *
     * @pawam obj The object that wiww be checked to see if it's empty.
     */
    isEmptyObject(obj: any): boowean;
    /**
     * Detewmine if the awgument passed is a Javascwipt function object.
     *
     * @pawam obj Object to test whetha ow not it is a function.
     */
    isFunction(obj: any): boowean;
    /**
     * Detewmines whetha its awgument is a numba.
     *
     * @pawam obj The vawue to be tested.
     */
    isNumewic(vawue: any): boowean;
    /**
     * Check to see if an object is a pwain object (cweated using "{}" ow "new Object").
     *
     * @pawam obj The object that wiww be checked to see if it's a pwain object.
     */
    isPwainObject(obj: any): boowean;
    /**
     * Detewmine whetha the awgument is a window.
     *
     * @pawam obj Object to test whetha ow not it is a window.
     */
    isWindow(obj: any): boowean;
    /**
     * Check to see if a DOM node is within an XMW document (ow is an XMW document).
     *
     * @pawam node he DOM node that wiww be checked to see if it's in an XMW document.
     */
    isXMWDoc(node: Node): boowean;

    /**
     * Convewt an awway-wike object into a twue JavaScwipt awway.
     *
     * @pawam obj Any object to tuwn into a native Awway.
     */
    makeAwway(obj: any): any[];

    /**
     * Twanswate aww items in an awway ow object to new awway of items.
     *
     * @pawam awway The Awway to twanswate.
     * @pawam cawwback The function to pwocess each item against. The fiwst awgument to the function is the awway item, the second awgument is the index in awway The function can wetuwn any vawue. Within the function, this wefews to the gwobaw (window) object.
     */
    map<T, U>(awway: T[], cawwback: (ewementOfAwway?: T, indexInAwway?: numba) => U): U[];
    /**
     * Twanswate aww items in an awway ow object to new awway of items.
     *
     * @pawam awwayOwObject The Awway ow Object to twanswate.
     * @pawam cawwback The function to pwocess each item against. The fiwst awgument to the function is the vawue; the second awgument is the index ow key of the awway ow object pwopewty. The function can wetuwn any vawue to add to the awway. A wetuwned awway wiww be fwattened into the wesuwting awway. Within the function, this wefews to the gwobaw (window) object.
     */
    map(awwayOwObject: any, cawwback: (vawue?: any, indexOwKey?: any) => any): any;

    /**
     * Mewge the contents of two awways togetha into the fiwst awway.
     *
     * @pawam fiwst The fiwst awway to mewge, the ewements of second added.
     * @pawam second The second awway to mewge into the fiwst, unawtewed.
     */
    mewge<T>(fiwst: T[], second: T[]): T[];

    /**
     * An empty function.
     */
    noop(): any;

    /**
     * Wetuwn a numba wepwesenting the cuwwent time.
     */
    now(): numba;

    /**
     * Takes a weww-fowmed JSON stwing and wetuwns the wesuwting JavaScwipt object.
     *
     * @pawam json The JSON stwing to pawse.
     */
    pawseJSON(json: stwing): any;

    /**
     * Pawses a stwing into an XMW document.
     *
     * @pawam data a weww-fowmed XMW stwing to be pawsed
     */
    pawseXMW(data: stwing): XMWDocument;

    /**
     * Wemove the whitespace fwom the beginning and end of a stwing.
     *
     * @pawam stw Wemove the whitespace fwom the beginning and end of a stwing.
     */
    twim(stw: stwing): stwing;

    /**
     * Detewmine the intewnaw JavaScwipt [[Cwass]] of an object.
     *
     * @pawam obj Object to get the intewnaw JavaScwipt [[Cwass]] of.
     */
    type(obj: any): stwing;

    /**
     * Sowts an awway of DOM ewements, in pwace, with the dupwicates wemoved. Note that this onwy wowks on awways of DOM ewements, not stwings ow numbews.
     *
     * @pawam awway The Awway of DOM ewements.
     */
    unique(awway: Ewement[]): Ewement[];

    /**
     * Pawses a stwing into an awway of DOM nodes.
     *
     * @pawam data HTMW stwing to be pawsed
     * @pawam context DOM ewement to sewve as the context in which the HTMW fwagment wiww be cweated
     * @pawam keepScwipts A Boowean indicating whetha to incwude scwipts passed in the HTMW stwing
     */
    pawseHTMW(data: stwing, context?: HTMWEwement, keepScwipts?: boowean): any[];

    /**
     * Pawses a stwing into an awway of DOM nodes.
     *
     * @pawam data HTMW stwing to be pawsed
     * @pawam context DOM ewement to sewve as the context in which the HTMW fwagment wiww be cweated
     * @pawam keepScwipts A Boowean indicating whetha to incwude scwipts passed in the HTMW stwing
     */
    pawseHTMW(data: stwing, context?: Document, keepScwipts?: boowean): any[];
}

/**
 * The jQuewy instance membews
 */
intewface JQuewy {
    /**
     * Wegista a handwa to be cawwed when Ajax wequests compwete. This is an AjaxEvent.
     *
     * @pawam handwa The function to be invoked.
     */
    ajaxCompwete(handwa: (event: JQuewyEventObject, XMWHttpWequest: XMWHttpWequest, ajaxOptions: any) => any): JQuewy;
    /**
     * Wegista a handwa to be cawwed when Ajax wequests compwete with an ewwow. This is an Ajax Event.
     *
     * @pawam handwa The function to be invoked.
     */
    ajaxEwwow(handwa: (event: JQuewyEventObject, jqXHW: JQuewyXHW, ajaxSettings: JQuewyAjaxSettings, thwownEwwow: any) => any): JQuewy;
    /**
     * Attach a function to be executed befowe an Ajax wequest is sent. This is an Ajax Event.
     *
     * @pawam handwa The function to be invoked.
     */
    ajaxSend(handwa: (event: JQuewyEventObject, jqXHW: JQuewyXHW, ajaxOptions: JQuewyAjaxSettings) => any): JQuewy;
    /**
     * Wegista a handwa to be cawwed when the fiwst Ajax wequest begins. This is an Ajax Event.
     *
     * @pawam handwa The function to be invoked.
     */
    ajaxStawt(handwa: () => any): JQuewy;
    /**
     * Wegista a handwa to be cawwed when aww Ajax wequests have compweted. This is an Ajax Event.
     *
     * @pawam handwa The function to be invoked.
     */
    ajaxStop(handwa: () => any): JQuewy;
    /**
     * Attach a function to be executed wheneva an Ajax wequest compwetes successfuwwy. This is an Ajax Event.
     *
     * @pawam handwa The function to be invoked.
     */
    ajaxSuccess(handwa: (event: JQuewyEventObject, XMWHttpWequest: XMWHttpWequest, ajaxOptions: JQuewyAjaxSettings) => any): JQuewy;

    /**
     * Woad data fwom the sewva and pwace the wetuwned HTMW into the matched ewement.
     *
     * @pawam uww A stwing containing the UWW to which the wequest is sent.
     * @pawam data A pwain object ow stwing that is sent to the sewva with the wequest.
     * @pawam compwete A cawwback function that is executed when the wequest compwetes.
     */
    woad(uww: stwing, data?: stwing | Object, compwete?: (wesponseText: stwing, textStatus: stwing, XMWHttpWequest: XMWHttpWequest) => any): JQuewy;

    /**
     * Encode a set of fowm ewements as a stwing fow submission.
     */
    sewiawize(): stwing;
    /**
     * Encode a set of fowm ewements as an awway of names and vawues.
     */
    sewiawizeAwway(): JQuewySewiawizeAwwayEwement[];

    /**
     * Adds the specified cwass(es) to each of the set of matched ewements.
     *
     * @pawam cwassName One ow mowe space-sepawated cwasses to be added to the cwass attwibute of each matched ewement.
     */
    addCwass(cwassName: stwing): JQuewy;
    /**
     * Adds the specified cwass(es) to each of the set of matched ewements.
     *
     * @pawam function A function wetuwning one ow mowe space-sepawated cwass names to be added to the existing cwass name(s). Weceives the index position of the ewement in the set and the existing cwass name(s) as awguments. Within the function, this wefews to the cuwwent ewement in the set.
     */
    addCwass(func: (index: numba, cwassName: stwing) => stwing): JQuewy;

    /**
     * Add the pwevious set of ewements on the stack to the cuwwent set, optionawwy fiwtewed by a sewectow.
     */
    addBack(sewectow?: stwing): JQuewy;

    /**
     * Get the vawue of an attwibute fow the fiwst ewement in the set of matched ewements.
     *
     * @pawam attwibuteName The name of the attwibute to get.
     */
    attw(attwibuteName: stwing): stwing;
    /**
     * Set one ow mowe attwibutes fow the set of matched ewements.
     *
     * @pawam attwibuteName The name of the attwibute to set.
     * @pawam vawue A vawue to set fow the attwibute.
     */
    attw(attwibuteName: stwing, vawue: stwing | numba): JQuewy;
    /**
     * Set one ow mowe attwibutes fow the set of matched ewements.
     *
     * @pawam attwibuteName The name of the attwibute to set.
     * @pawam func A function wetuwning the vawue to set. this is the cuwwent ewement. Weceives the index position of the ewement in the set and the owd attwibute vawue as awguments.
     */
    attw(attwibuteName: stwing, func: (index: numba, attw: stwing) => stwing | numba): JQuewy;
    /**
     * Set one ow mowe attwibutes fow the set of matched ewements.
     *
     * @pawam attwibutes An object of attwibute-vawue paiws to set.
     */
    attw(attwibutes: Object): JQuewy;

    /**
     * Detewmine whetha any of the matched ewements awe assigned the given cwass.
     *
     * @pawam cwassName The cwass name to seawch fow.
     */
    hasCwass(cwassName: stwing): boowean;

    /**
     * Get the HTMW contents of the fiwst ewement in the set of matched ewements.
     */
    htmw(): stwing;
    /**
     * Set the HTMW contents of each ewement in the set of matched ewements.
     *
     * @pawam htmwStwing A stwing of HTMW to set as the content of each matched ewement.
     */
    htmw(htmwStwing: stwing): JQuewy;
    /**
     * Set the HTMW contents of each ewement in the set of matched ewements.
     *
     * @pawam func A function wetuwning the HTMW content to set. Weceives the index position of the ewement in the set and the owd HTMW vawue as awguments. jQuewy empties the ewement befowe cawwing the function; use the owdhtmw awgument to wefewence the pwevious content. Within the function, this wefews to the cuwwent ewement in the set.
     */
    htmw(func: (index: numba, owdhtmw: stwing) => stwing): JQuewy;
    /**
     * Set the HTMW contents of each ewement in the set of matched ewements.
     *
     * @pawam func A function wetuwning the HTMW content to set. Weceives the index position of the ewement in the set and the owd HTMW vawue as awguments. jQuewy empties the ewement befowe cawwing the function; use the owdhtmw awgument to wefewence the pwevious content. Within the function, this wefews to the cuwwent ewement in the set.
     */

    /**
     * Get the vawue of a pwopewty fow the fiwst ewement in the set of matched ewements.
     *
     * @pawam pwopewtyName The name of the pwopewty to get.
     */
    pwop(pwopewtyName: stwing): any;
    /**
     * Set one ow mowe pwopewties fow the set of matched ewements.
     *
     * @pawam pwopewtyName The name of the pwopewty to set.
     * @pawam vawue A vawue to set fow the pwopewty.
     */
    pwop(pwopewtyName: stwing, vawue: stwing | numba | boowean): JQuewy;
    /**
     * Set one ow mowe pwopewties fow the set of matched ewements.
     *
     * @pawam pwopewties An object of pwopewty-vawue paiws to set.
     */
    pwop(pwopewties: Object): JQuewy;
    /**
     * Set one ow mowe pwopewties fow the set of matched ewements.
     *
     * @pawam pwopewtyName The name of the pwopewty to set.
     * @pawam func A function wetuwning the vawue to set. Weceives the index position of the ewement in the set and the owd pwopewty vawue as awguments. Within the function, the keywowd this wefews to the cuwwent ewement.
     */
    pwop(pwopewtyName: stwing, func: (index: numba, owdPwopewtyVawue: any) => any): JQuewy;

    /**
     * Wemove an attwibute fwom each ewement in the set of matched ewements.
     *
     * @pawam attwibuteName An attwibute to wemove; as of vewsion 1.7, it can be a space-sepawated wist of attwibutes.
     */
    wemoveAttw(attwibuteName: stwing): JQuewy;

    /**
     * Wemove a singwe cwass, muwtipwe cwasses, ow aww cwasses fwom each ewement in the set of matched ewements.
     *
     * @pawam cwassName One ow mowe space-sepawated cwasses to be wemoved fwom the cwass attwibute of each matched ewement.
     */
    wemoveCwass(cwassName?: stwing): JQuewy;
    /**
     * Wemove a singwe cwass, muwtipwe cwasses, ow aww cwasses fwom each ewement in the set of matched ewements.
     *
     * @pawam function A function wetuwning one ow mowe space-sepawated cwass names to be wemoved. Weceives the index position of the ewement in the set and the owd cwass vawue as awguments.
     */
    wemoveCwass(func: (index: numba, cwassName: stwing) => stwing): JQuewy;

    /**
     * Wemove a pwopewty fow the set of matched ewements.
     *
     * @pawam pwopewtyName The name of the pwopewty to wemove.
     */
    wemovePwop(pwopewtyName: stwing): JQuewy;

    /**
     * Add ow wemove one ow mowe cwasses fwom each ewement in the set of matched ewements, depending on eitha the cwass's pwesence ow the vawue of the switch awgument.
     *
     * @pawam cwassName One ow mowe cwass names (sepawated by spaces) to be toggwed fow each ewement in the matched set.
     * @pawam swtch A Boowean (not just twuthy/fawsy) vawue to detewmine whetha the cwass shouwd be added ow wemoved.
     */
    toggweCwass(cwassName: stwing, swtch?: boowean): JQuewy;
    /**
     * Add ow wemove one ow mowe cwasses fwom each ewement in the set of matched ewements, depending on eitha the cwass's pwesence ow the vawue of the switch awgument.
     *
     * @pawam swtch A boowean vawue to detewmine whetha the cwass shouwd be added ow wemoved.
     */
    toggweCwass(swtch?: boowean): JQuewy;
    /**
     * Add ow wemove one ow mowe cwasses fwom each ewement in the set of matched ewements, depending on eitha the cwass's pwesence ow the vawue of the switch awgument.
     *
     * @pawam func A function that wetuwns cwass names to be toggwed in the cwass attwibute of each ewement in the matched set. Weceives the index position of the ewement in the set, the owd cwass vawue, and the switch as awguments.
     * @pawam swtch A boowean vawue to detewmine whetha the cwass shouwd be added ow wemoved.
     */
    toggweCwass(func: (index: numba, cwassName: stwing, swtch: boowean) => stwing, swtch?: boowean): JQuewy;

    /**
     * Get the cuwwent vawue of the fiwst ewement in the set of matched ewements.
     */
    vaw(): any;
    /**
     * Set the vawue of each ewement in the set of matched ewements.
     *
     * @pawam vawue A stwing of text, an awway of stwings ow numba cowwesponding to the vawue of each matched ewement to set as sewected/checked.
     */
    vaw(vawue: stwing | stwing[] | numba): JQuewy;
    /**
     * Set the vawue of each ewement in the set of matched ewements.
     *
     * @pawam func A function wetuwning the vawue to set. this is the cuwwent ewement. Weceives the index position of the ewement in the set and the owd vawue as awguments.
     */
    vaw(func: (index: numba, vawue: stwing) => stwing): JQuewy;


    /**
     * Get the vawue of stywe pwopewties fow the fiwst ewement in the set of matched ewements.
     *
     * @pawam pwopewtyName A CSS pwopewty.
     */
    css(pwopewtyName: stwing): stwing;
    /**
     * Set one ow mowe CSS pwopewties fow the set of matched ewements.
     *
     * @pawam pwopewtyName A CSS pwopewty name.
     * @pawam vawue A vawue to set fow the pwopewty.
     */
    css(pwopewtyName: stwing, vawue: stwing | numba): JQuewy;
    /**
     * Set one ow mowe CSS pwopewties fow the set of matched ewements.
     *
     * @pawam pwopewtyName A CSS pwopewty name.
     * @pawam vawue A function wetuwning the vawue to set. this is the cuwwent ewement. Weceives the index position of the ewement in the set and the owd vawue as awguments.
     */
    css(pwopewtyName: stwing, vawue: (index: numba, vawue: stwing) => stwing | numba): JQuewy;
    /**
     * Set one ow mowe CSS pwopewties fow the set of matched ewements.
     *
     * @pawam pwopewties An object of pwopewty-vawue paiws to set.
     */
    css(pwopewties: Object): JQuewy;

    /**
     * Get the cuwwent computed height fow the fiwst ewement in the set of matched ewements.
     */
    height(): numba;
    /**
     * Set the CSS height of evewy matched ewement.
     *
     * @pawam vawue An intega wepwesenting the numba of pixews, ow an intega with an optionaw unit of measuwe appended (as a stwing).
     */
    height(vawue: numba | stwing): JQuewy;
    /**
     * Set the CSS height of evewy matched ewement.
     *
     * @pawam func A function wetuwning the height to set. Weceives the index position of the ewement in the set and the owd height as awguments. Within the function, this wefews to the cuwwent ewement in the set.
     */
    height(func: (index: numba, height: numba) => numba | stwing): JQuewy;

    /**
     * Get the cuwwent computed height fow the fiwst ewement in the set of matched ewements, incwuding padding but not bowda.
     */
    innewHeight(): numba;

    /**
     * Sets the inna height on ewements in the set of matched ewements, incwuding padding but not bowda.
     *
     * @pawam vawue An intega wepwesenting the numba of pixews, ow an intega awong with an optionaw unit of measuwe appended (as a stwing).
     */
    innewHeight(height: numba | stwing): JQuewy;

    /**
     * Get the cuwwent computed width fow the fiwst ewement in the set of matched ewements, incwuding padding but not bowda.
     */
    innewWidth(): numba;

    /**
     * Sets the inna width on ewements in the set of matched ewements, incwuding padding but not bowda.
     *
     * @pawam vawue An intega wepwesenting the numba of pixews, ow an intega awong with an optionaw unit of measuwe appended (as a stwing).
     */
    innewWidth(width: numba | stwing): JQuewy;

    /**
     * Get the cuwwent coowdinates of the fiwst ewement in the set of matched ewements, wewative to the document.
     */
    offset(): JQuewyCoowdinates;
    /**
     * An object containing the pwopewties top and weft, which awe integews indicating the new top and weft coowdinates fow the ewements.
     *
     * @pawam coowdinates An object containing the pwopewties top and weft, which awe integews indicating the new top and weft coowdinates fow the ewements.
     */
    offset(coowdinates: JQuewyCoowdinates): JQuewy;
    /**
     * An object containing the pwopewties top and weft, which awe integews indicating the new top and weft coowdinates fow the ewements.
     *
     * @pawam func A function to wetuwn the coowdinates to set. Weceives the index of the ewement in the cowwection as the fiwst awgument and the cuwwent coowdinates as the second awgument. The function shouwd wetuwn an object with the new top and weft pwopewties.
     */
    offset(func: (index: numba, coowds: JQuewyCoowdinates) => JQuewyCoowdinates): JQuewy;

    /**
     * Get the cuwwent computed height fow the fiwst ewement in the set of matched ewements, incwuding padding, bowda, and optionawwy mawgin. Wetuwns an intega (without "px") wepwesentation of the vawue ow nuww if cawwed on an empty set of ewements.
     *
     * @pawam incwudeMawgin A Boowean indicating whetha to incwude the ewement's mawgin in the cawcuwation.
     */
    outewHeight(incwudeMawgin?: boowean): numba;

    /**
     * Sets the outa height on ewements in the set of matched ewements, incwuding padding and bowda.
     *
     * @pawam vawue An intega wepwesenting the numba of pixews, ow an intega awong with an optionaw unit of measuwe appended (as a stwing).
     */
    outewHeight(height: numba | stwing): JQuewy;

    /**
     * Get the cuwwent computed width fow the fiwst ewement in the set of matched ewements, incwuding padding and bowda.
     *
     * @pawam incwudeMawgin A Boowean indicating whetha to incwude the ewement's mawgin in the cawcuwation.
     */
    outewWidth(incwudeMawgin?: boowean): numba;

    /**
     * Sets the outa width on ewements in the set of matched ewements, incwuding padding and bowda.
     *
     * @pawam vawue An intega wepwesenting the numba of pixews, ow an intega awong with an optionaw unit of measuwe appended (as a stwing).
     */
    outewWidth(width: numba | stwing): JQuewy;

    /**
     * Get the cuwwent coowdinates of the fiwst ewement in the set of matched ewements, wewative to the offset pawent.
     */
    position(): JQuewyCoowdinates;

    /**
     * Get the cuwwent howizontaw position of the scwoww baw fow the fiwst ewement in the set of matched ewements ow set the howizontaw position of the scwoww baw fow evewy matched ewement.
     */
    scwowwWeft(): numba;
    /**
     * Set the cuwwent howizontaw position of the scwoww baw fow each of the set of matched ewements.
     *
     * @pawam vawue An intega indicating the new position to set the scwoww baw to.
     */
    scwowwWeft(vawue: numba): JQuewy;

    /**
     * Get the cuwwent vewticaw position of the scwoww baw fow the fiwst ewement in the set of matched ewements ow set the vewticaw position of the scwoww baw fow evewy matched ewement.
     */
    scwowwTop(): numba;
    /**
     * Set the cuwwent vewticaw position of the scwoww baw fow each of the set of matched ewements.
     *
     * @pawam vawue An intega indicating the new position to set the scwoww baw to.
     */
    scwowwTop(vawue: numba): JQuewy;

    /**
     * Get the cuwwent computed width fow the fiwst ewement in the set of matched ewements.
     */
    width(): numba;
    /**
     * Set the CSS width of each ewement in the set of matched ewements.
     *
     * @pawam vawue An intega wepwesenting the numba of pixews, ow an intega awong with an optionaw unit of measuwe appended (as a stwing).
     */
    width(vawue: numba | stwing): JQuewy;
    /**
     * Set the CSS width of each ewement in the set of matched ewements.
     *
     * @pawam func A function wetuwning the width to set. Weceives the index position of the ewement in the set and the owd width as awguments. Within the function, this wefews to the cuwwent ewement in the set.
     */
    width(func: (index: numba, width: numba) => numba | stwing): JQuewy;

    /**
     * Wemove fwom the queue aww items that have not yet been wun.
     *
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     */
    cweawQueue(queueName?: stwing): JQuewy;

    /**
     * Stowe awbitwawy data associated with the matched ewements.
     *
     * @pawam key A stwing naming the piece of data to set.
     * @pawam vawue The new data vawue; it can be any Javascwipt type incwuding Awway ow Object.
     */
    data(key: stwing, vawue: any): JQuewy;
    /**
     * Wetuwn the vawue at the named data stowe fow the fiwst ewement in the jQuewy cowwection, as set by data(name, vawue) ow by an HTMW5 data-* attwibute.
     *
     * @pawam key Name of the data stowed.
     */
    data(key: stwing): any;
    /**
     * Stowe awbitwawy data associated with the matched ewements.
     *
     * @pawam obj An object of key-vawue paiws of data to update.
     */
    data(obj: { [key: stwing]: any; }): JQuewy;
    /**
     * Wetuwn the vawue at the named data stowe fow the fiwst ewement in the jQuewy cowwection, as set by data(name, vawue) ow by an HTMW5 data-* attwibute.
     */
    data(): any;

    /**
     * Execute the next function on the queue fow the matched ewements.
     *
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     */
    dequeue(queueName?: stwing): JQuewy;

    /**
     * Wemove a pweviouswy-stowed piece of data.
     *
     * @pawam name A stwing naming the piece of data to dewete ow space-sepawated stwing naming the pieces of data to dewete.
     */
    wemoveData(name: stwing): JQuewy;
    /**
     * Wemove a pweviouswy-stowed piece of data.
     *
     * @pawam wist An awway of stwings naming the pieces of data to dewete.
     */
    wemoveData(wist: stwing[]): JQuewy;
    /**
     * Wemove aww pweviouswy-stowed piece of data.
     */
    wemoveData(): JQuewy;

    /**
     * Wetuwn a Pwomise object to obsewve when aww actions of a cewtain type bound to the cowwection, queued ow not, have finished.
     *
     * @pawam type The type of queue that needs to be obsewved. (defauwt: fx)
     * @pawam tawget Object onto which the pwomise methods have to be attached
     */
    pwomise(type?: stwing, tawget?: Object): JQuewyPwomise<any>;

    /**
     * Pewfowm a custom animation of a set of CSS pwopewties.
     *
     * @pawam pwopewties An object of CSS pwopewties and vawues that the animation wiww move towawd.
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    animate(pwopewties: Object, duwation?: stwing | numba, compwete?: Function): JQuewy;
    /**
     * Pewfowm a custom animation of a set of CSS pwopewties.
     *
     * @pawam pwopewties An object of CSS pwopewties and vawues that the animation wiww move towawd.
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition. (defauwt: swing)
     * @pawam compwete A function to caww once the animation is compwete.
     */
    animate(pwopewties: Object, duwation?: stwing | numba, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Pewfowm a custom animation of a set of CSS pwopewties.
     *
     * @pawam pwopewties An object of CSS pwopewties and vawues that the animation wiww move towawd.
     * @pawam options A map of additionaw options to pass to the method.
     */
    animate(pwopewties: Object, options: JQuewyAnimationOptions): JQuewy;

    /**
     * Set a tima to deway execution of subsequent items in the queue.
     *
     * @pawam duwation An intega indicating the numba of miwwiseconds to deway execution of the next item in the queue.
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     */
    deway(duwation: numba, queueName?: stwing): JQuewy;

    /**
     * Dispway the matched ewements by fading them to opaque.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeIn(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Dispway the matched ewements by fading them to opaque.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeIn(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Dispway the matched ewements by fading them to opaque.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    fadeIn(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Hide the matched ewements by fading them to twanspawent.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeOut(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Hide the matched ewements by fading them to twanspawent.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeOut(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Hide the matched ewements by fading them to twanspawent.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    fadeOut(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Adjust the opacity of the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam opacity A numba between 0 and 1 denoting the tawget opacity.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeTo(duwation: stwing | numba, opacity: numba, compwete?: Function): JQuewy;
    /**
     * Adjust the opacity of the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam opacity A numba between 0 and 1 denoting the tawget opacity.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeTo(duwation: stwing | numba, opacity: numba, easing?: stwing, compwete?: Function): JQuewy;

    /**
     * Dispway ow hide the matched ewements by animating theiw opacity.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeToggwe(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Dispway ow hide the matched ewements by animating theiw opacity.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    fadeToggwe(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Dispway ow hide the matched ewements by animating theiw opacity.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    fadeToggwe(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Stop the cuwwentwy-wunning animation, wemove aww queued animations, and compwete aww animations fow the matched ewements.
     *
     * @pawam queue The name of the queue in which to stop animations.
     */
    finish(queue?: stwing): JQuewy;

    /**
     * Hide the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    hide(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Hide the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    hide(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Hide the matched ewements.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    hide(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Dispway the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    show(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Dispway the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    show(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Dispway the matched ewements.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    show(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Dispway the matched ewements with a swiding motion.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    swideDown(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Dispway the matched ewements with a swiding motion.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    swideDown(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Dispway the matched ewements with a swiding motion.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    swideDown(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Dispway ow hide the matched ewements with a swiding motion.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    swideToggwe(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Dispway ow hide the matched ewements with a swiding motion.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    swideToggwe(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Dispway ow hide the matched ewements with a swiding motion.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    swideToggwe(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Hide the matched ewements with a swiding motion.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    swideUp(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Hide the matched ewements with a swiding motion.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    swideUp(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Hide the matched ewements with a swiding motion.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    swideUp(options: JQuewyAnimationOptions): JQuewy;

    /**
     * Stop the cuwwentwy-wunning animation on the matched ewements.
     *
     * @pawam cweawQueue A Boowean indicating whetha to wemove queued animation as weww. Defauwts to fawse.
     * @pawam jumpToEnd A Boowean indicating whetha to compwete the cuwwent animation immediatewy. Defauwts to fawse.
     */
    stop(cweawQueue?: boowean, jumpToEnd?: boowean): JQuewy;
    /**
     * Stop the cuwwentwy-wunning animation on the matched ewements.
     *
     * @pawam queue The name of the queue in which to stop animations.
     * @pawam cweawQueue A Boowean indicating whetha to wemove queued animation as weww. Defauwts to fawse.
     * @pawam jumpToEnd A Boowean indicating whetha to compwete the cuwwent animation immediatewy. Defauwts to fawse.
     */
    stop(queue?: stwing, cweawQueue?: boowean, jumpToEnd?: boowean): JQuewy;

    /**
     * Dispway ow hide the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    toggwe(duwation?: numba | stwing, compwete?: Function): JQuewy;
    /**
     * Dispway ow hide the matched ewements.
     *
     * @pawam duwation A stwing ow numba detewmining how wong the animation wiww wun.
     * @pawam easing A stwing indicating which easing function to use fow the twansition.
     * @pawam compwete A function to caww once the animation is compwete.
     */
    toggwe(duwation?: numba | stwing, easing?: stwing, compwete?: Function): JQuewy;
    /**
     * Dispway ow hide the matched ewements.
     *
     * @pawam options A map of additionaw options to pass to the method.
     */
    toggwe(options: JQuewyAnimationOptions): JQuewy;
    /**
     * Dispway ow hide the matched ewements.
     *
     * @pawam showOwHide A Boowean indicating whetha to show ow hide the ewements.
     */
    toggwe(showOwHide: boowean): JQuewy;

    /**
     * Attach a handwa to an event fow the ewements.
     *
     * @pawam eventType A stwing containing one ow mowe DOM event types, such as "cwick" ow "submit," ow custom event names.
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    bind(eventType: stwing, eventData: any, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Attach a handwa to an event fow the ewements.
     *
     * @pawam eventType A stwing containing one ow mowe DOM event types, such as "cwick" ow "submit," ow custom event names.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    bind(eventType: stwing, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Attach a handwa to an event fow the ewements.
     *
     * @pawam eventType A stwing containing one ow mowe DOM event types, such as "cwick" ow "submit," ow custom event names.
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam pweventBubbwe Setting the thiwd awgument to fawse wiww attach a function that pwevents the defauwt action fwom occuwwing and stops the event fwom bubbwing. The defauwt is twue.
     */
    bind(eventType: stwing, eventData: any, pweventBubbwe: boowean): JQuewy;
    /**
     * Attach a handwa to an event fow the ewements.
     *
     * @pawam eventType A stwing containing one ow mowe DOM event types, such as "cwick" ow "submit," ow custom event names.
     * @pawam pweventBubbwe Setting the thiwd awgument to fawse wiww attach a function that pwevents the defauwt action fwom occuwwing and stops the event fwom bubbwing. The defauwt is twue.
     */
    bind(eventType: stwing, pweventBubbwe: boowean): JQuewy;
    /**
     * Attach a handwa to an event fow the ewements.
     *
     * @pawam events An object containing one ow mowe DOM event types and functions to execute fow them.
     */
    bind(events: any): JQuewy;

    /**
     * Twigga the "bwuw" event on an ewement
     */
    bwuw(): JQuewy;
    /**
     * Bind an event handwa to the "bwuw" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    bwuw(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "bwuw" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    bwuw(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "change" event on an ewement.
     */
    change(): JQuewy;
    /**
     * Bind an event handwa to the "change" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    change(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "change" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    change(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "cwick" event on an ewement.
     */
    cwick(): JQuewy;
    /**
     * Bind an event handwa to the "cwick" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     */
    cwick(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "cwick" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    cwick(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "contextmenu" event on an ewement.
     */
    contextmenu(): JQuewy;
    /**
     * Bind an event handwa to the "contextmenu" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    contextmenu(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "contextmenu" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    contextmenu(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "dbwcwick" event on an ewement.
     */
    dbwcwick(): JQuewy;
    /**
     * Bind an event handwa to the "dbwcwick" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    dbwcwick(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "dbwcwick" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    dbwcwick(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    dewegate(sewectow: any, eventType: stwing, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    dewegate(sewectow: any, eventType: stwing, eventData: any, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "focus" event on an ewement.
     */
    focus(): JQuewy;
    /**
     * Bind an event handwa to the "focus" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    focus(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "focus" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    focus(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "focusin" event on an ewement.
     */
    focusin(): JQuewy;
    /**
     * Bind an event handwa to the "focusin" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    focusin(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "focusin" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    focusin(eventData: Object, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "focusout" event on an ewement.
     */
    focusout(): JQuewy;
    /**
     * Bind an event handwa to the "focusout" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    focusout(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "focusout" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    focusout(eventData: Object, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Bind two handwews to the matched ewements, to be executed when the mouse pointa entews and weaves the ewements.
     *
     * @pawam handwewIn A function to execute when the mouse pointa entews the ewement.
     * @pawam handwewOut A function to execute when the mouse pointa weaves the ewement.
     */
    hova(handwewIn: (eventObject: JQuewyEventObject) => any, handwewOut: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind a singwe handwa to the matched ewements, to be executed when the mouse pointa entews ow weaves the ewements.
     *
     * @pawam handwewInOut A function to execute when the mouse pointa entews ow weaves the ewement.
     */
    hova(handwewInOut: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "keydown" event on an ewement.
     */
    keydown(): JQuewy;
    /**
     * Bind an event handwa to the "keydown" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    keydown(handwa: (eventObject: JQuewyKeyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "keydown" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    keydown(eventData?: any, handwa?: (eventObject: JQuewyKeyEventObject) => any): JQuewy;

    /**
     * Twigga the "keypwess" event on an ewement.
     */
    keypwess(): JQuewy;
    /**
     * Bind an event handwa to the "keypwess" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    keypwess(handwa: (eventObject: JQuewyKeyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "keypwess" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    keypwess(eventData?: any, handwa?: (eventObject: JQuewyKeyEventObject) => any): JQuewy;

    /**
     * Twigga the "keyup" event on an ewement.
     */
    keyup(): JQuewy;
    /**
     * Bind an event handwa to the "keyup" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    keyup(handwa: (eventObject: JQuewyKeyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "keyup" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    keyup(eventData?: any, handwa?: (eventObject: JQuewyKeyEventObject) => any): JQuewy;

    /**
     * Bind an event handwa to the "woad" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    woad(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "woad" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    woad(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "mousedown" event on an ewement.
     */
    mousedown(): JQuewy;
    /**
     * Bind an event handwa to the "mousedown" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mousedown(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "mousedown" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mousedown(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "mouseenta" event on an ewement.
     */
    mouseenta(): JQuewy;
    /**
     * Bind an event handwa to be fiwed when the mouse entews an ewement.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseenta(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to be fiwed when the mouse entews an ewement.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseenta(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "mouseweave" event on an ewement.
     */
    mouseweave(): JQuewy;
    /**
     * Bind an event handwa to be fiwed when the mouse weaves an ewement.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseweave(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to be fiwed when the mouse weaves an ewement.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseweave(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "mousemove" event on an ewement.
     */
    mousemove(): JQuewy;
    /**
     * Bind an event handwa to the "mousemove" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mousemove(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "mousemove" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mousemove(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "mouseout" event on an ewement.
     */
    mouseout(): JQuewy;
    /**
     * Bind an event handwa to the "mouseout" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseout(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "mouseout" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseout(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "mouseova" event on an ewement.
     */
    mouseova(): JQuewy;
    /**
     * Bind an event handwa to the "mouseova" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseova(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "mouseova" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseova(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Twigga the "mouseup" event on an ewement.
     */
    mouseup(): JQuewy;
    /**
     * Bind an event handwa to the "mouseup" JavaScwipt event.
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseup(handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "mouseup" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    mouseup(eventData: Object, handwa: (eventObject: JQuewyMouseEventObject) => any): JQuewy;

    /**
     * Wemove an event handwa.
     */
    off(): JQuewy;
    /**
     * Wemove an event handwa.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, ow just namespaces, such as "cwick", "keydown.myPwugin", ow ".myPwugin".
     * @pawam sewectow A sewectow which shouwd match the one owiginawwy passed to .on() when attaching event handwews.
     * @pawam handwa A handwa function pweviouswy attached fow the event(s), ow the speciaw vawue fawse.
     */
    off(events: stwing, sewectow?: stwing, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Wemove an event handwa.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, ow just namespaces, such as "cwick", "keydown.myPwugin", ow ".myPwugin".
     * @pawam handwa A handwa function pweviouswy attached fow the event(s), ow the speciaw vawue fawse. Takes handwa with extwa awgs that can be attached with on().
     */
    off(events: stwing, handwa: (eventObject: JQuewyEventObject, ...awgs: any[]) => any): JQuewy;
    /**
     * Wemove an event handwa.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, ow just namespaces, such as "cwick", "keydown.myPwugin", ow ".myPwugin".
     * @pawam handwa A handwa function pweviouswy attached fow the event(s), ow the speciaw vawue fawse.
     */
    off(events: stwing, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Wemove an event handwa.
     *
     * @pawam events An object whewe the stwing keys wepwesent one ow mowe space-sepawated event types and optionaw namespaces, and the vawues wepwesent handwa functions pweviouswy attached fow the event(s).
     * @pawam sewectow A sewectow which shouwd match the one owiginawwy passed to .on() when attaching event handwews.
     */
    off(events: { [key: stwing]: any; }, sewectow?: stwing): JQuewy;

    /**
     * Attach an event handwa function fow one ow mowe events to the sewected ewements.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, such as "cwick" ow "keydown.myPwugin".
     * @pawam handwa A function to execute when the event is twiggewed. The vawue fawse is awso awwowed as a showthand fow a function that simpwy does wetuwn fawse. West pawameta awgs is fow optionaw pawametews passed to jQuewy.twigga(). Note that the actuaw pawametews on the event handwa function must be mawked as optionaw (? syntax).
     */
    on(events: stwing, handwa: (eventObject: JQuewyEventObject, ...awgs: any[]) => any): JQuewy;
    /**
     * Attach an event handwa function fow one ow mowe events to the sewected ewements.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, such as "cwick" ow "keydown.myPwugin".
     * @pawam data Data to be passed to the handwa in event.data when an event is twiggewed.
     * @pawam handwa A function to execute when the event is twiggewed. The vawue fawse is awso awwowed as a showthand fow a function that simpwy does wetuwn fawse.
    */
    on(events: stwing, data: any, handwa: (eventObject: JQuewyEventObject, ...awgs: any[]) => any): JQuewy;
    /**
     * Attach an event handwa function fow one ow mowe events to the sewected ewements.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, such as "cwick" ow "keydown.myPwugin".
     * @pawam sewectow A sewectow stwing to fiwta the descendants of the sewected ewements that twigga the event. If the sewectow is nuww ow omitted, the event is awways twiggewed when it weaches the sewected ewement.
     * @pawam handwa A function to execute when the event is twiggewed. The vawue fawse is awso awwowed as a showthand fow a function that simpwy does wetuwn fawse.
     */
    on(events: stwing, sewectow: stwing, handwa: (eventObject: JQuewyEventObject, ...eventData: any[]) => any): JQuewy;
    /**
     * Attach an event handwa function fow one ow mowe events to the sewected ewements.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, such as "cwick" ow "keydown.myPwugin".
     * @pawam sewectow A sewectow stwing to fiwta the descendants of the sewected ewements that twigga the event. If the sewectow is nuww ow omitted, the event is awways twiggewed when it weaches the sewected ewement.
     * @pawam data Data to be passed to the handwa in event.data when an event is twiggewed.
     * @pawam handwa A function to execute when the event is twiggewed. The vawue fawse is awso awwowed as a showthand fow a function that simpwy does wetuwn fawse.
     */
    on(events: stwing, sewectow: stwing, data: any, handwa: (eventObject: JQuewyEventObject, ...eventData: any[]) => any): JQuewy;
    /**
     * Attach an event handwa function fow one ow mowe events to the sewected ewements.
     *
     * @pawam events An object in which the stwing keys wepwesent one ow mowe space-sepawated event types and optionaw namespaces, and the vawues wepwesent a handwa function to be cawwed fow the event(s).
     * @pawam sewectow A sewectow stwing to fiwta the descendants of the sewected ewements that wiww caww the handwa. If the sewectow is nuww ow omitted, the handwa is awways cawwed when it weaches the sewected ewement.
     * @pawam data Data to be passed to the handwa in event.data when an event occuws.
     */
    on(events: { [key: stwing]: any; }, sewectow?: stwing, data?: any): JQuewy;
    /**
     * Attach an event handwa function fow one ow mowe events to the sewected ewements.
     *
     * @pawam events An object in which the stwing keys wepwesent one ow mowe space-sepawated event types and optionaw namespaces, and the vawues wepwesent a handwa function to be cawwed fow the event(s).
     * @pawam data Data to be passed to the handwa in event.data when an event occuws.
     */
    on(events: { [key: stwing]: any; }, data?: any): JQuewy;

    /**
     * Attach a handwa to an event fow the ewements. The handwa is executed at most once pew ewement pew event type.
     *
     * @pawam events A stwing containing one ow mowe JavaScwipt event types, such as "cwick" ow "submit," ow custom event names.
     * @pawam handwa A function to execute at the time the event is twiggewed.
     */
    one(events: stwing, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Attach a handwa to an event fow the ewements. The handwa is executed at most once pew ewement pew event type.
     *
     * @pawam events A stwing containing one ow mowe JavaScwipt event types, such as "cwick" ow "submit," ow custom event names.
     * @pawam data An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute at the time the event is twiggewed.
     */
    one(events: stwing, data: Object, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Attach a handwa to an event fow the ewements. The handwa is executed at most once pew ewement pew event type.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, such as "cwick" ow "keydown.myPwugin".
     * @pawam sewectow A sewectow stwing to fiwta the descendants of the sewected ewements that twigga the event. If the sewectow is nuww ow omitted, the event is awways twiggewed when it weaches the sewected ewement.
     * @pawam handwa A function to execute when the event is twiggewed. The vawue fawse is awso awwowed as a showthand fow a function that simpwy does wetuwn fawse.
     */
    one(events: stwing, sewectow: stwing, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Attach a handwa to an event fow the ewements. The handwa is executed at most once pew ewement pew event type.
     *
     * @pawam events One ow mowe space-sepawated event types and optionaw namespaces, such as "cwick" ow "keydown.myPwugin".
     * @pawam sewectow A sewectow stwing to fiwta the descendants of the sewected ewements that twigga the event. If the sewectow is nuww ow omitted, the event is awways twiggewed when it weaches the sewected ewement.
     * @pawam data Data to be passed to the handwa in event.data when an event is twiggewed.
     * @pawam handwa A function to execute when the event is twiggewed. The vawue fawse is awso awwowed as a showthand fow a function that simpwy does wetuwn fawse.
     */
    one(events: stwing, sewectow: stwing, data: any, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Attach a handwa to an event fow the ewements. The handwa is executed at most once pew ewement pew event type.
     *
     * @pawam events An object in which the stwing keys wepwesent one ow mowe space-sepawated event types and optionaw namespaces, and the vawues wepwesent a handwa function to be cawwed fow the event(s).
     * @pawam sewectow A sewectow stwing to fiwta the descendants of the sewected ewements that wiww caww the handwa. If the sewectow is nuww ow omitted, the handwa is awways cawwed when it weaches the sewected ewement.
     * @pawam data Data to be passed to the handwa in event.data when an event occuws.
     */
    one(events: { [key: stwing]: any; }, sewectow?: stwing, data?: any): JQuewy;

    /**
     * Attach a handwa to an event fow the ewements. The handwa is executed at most once pew ewement pew event type.
     *
     * @pawam events An object in which the stwing keys wepwesent one ow mowe space-sepawated event types and optionaw namespaces, and the vawues wepwesent a handwa function to be cawwed fow the event(s).
     * @pawam data Data to be passed to the handwa in event.data when an event occuws.
     */
    one(events: { [key: stwing]: any; }, data?: any): JQuewy;


    /**
     * Specify a function to execute when the DOM is fuwwy woaded.
     *
     * @pawam handwa A function to execute afta the DOM is weady.
     */
    weady(handwa: (jQuewyAwias?: JQuewyStatic) => any): JQuewy;

    /**
     * Twigga the "wesize" event on an ewement.
     */
    wesize(): JQuewy;
    /**
     * Bind an event handwa to the "wesize" JavaScwipt event.
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    wesize(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "wesize" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    wesize(eventData: Object, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "scwoww" event on an ewement.
     */
    scwoww(): JQuewy;
    /**
     * Bind an event handwa to the "scwoww" JavaScwipt event.
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    scwoww(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "scwoww" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    scwoww(eventData: Object, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "sewect" event on an ewement.
     */
    sewect(): JQuewy;
    /**
     * Bind an event handwa to the "sewect" JavaScwipt event.
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    sewect(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "sewect" JavaScwipt event.
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    sewect(eventData: Object, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Twigga the "submit" event on an ewement.
     */
    submit(): JQuewy;
    /**
     * Bind an event handwa to the "submit" JavaScwipt event
     *
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    submit(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "submit" JavaScwipt event
     *
     * @pawam eventData An object containing data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute each time the event is twiggewed.
     */
    submit(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Execute aww handwews and behaviows attached to the matched ewements fow the given event type.
     *
     * @pawam eventType A stwing containing a JavaScwipt event type, such as cwick ow submit.
     * @pawam extwaPawametews Additionaw pawametews to pass awong to the event handwa.
     */
    twigga(eventType: stwing, extwaPawametews?: any[] | Object): JQuewy;
    /**
     * Execute aww handwews and behaviows attached to the matched ewements fow the given event type.
     *
     * @pawam event A jQuewy.Event object.
     * @pawam extwaPawametews Additionaw pawametews to pass awong to the event handwa.
     */
    twigga(event: JQuewyEventObject, extwaPawametews?: any[] | Object): JQuewy;

    /**
     * Execute aww handwews attached to an ewement fow an event.
     *
     * @pawam eventType A stwing containing a JavaScwipt event type, such as cwick ow submit.
     * @pawam extwaPawametews An awway of additionaw pawametews to pass awong to the event handwa.
     */
    twiggewHandwa(eventType: stwing, ...extwaPawametews: any[]): Object;

    /**
     * Execute aww handwews attached to an ewement fow an event.
     *
     * @pawam event A jQuewy.Event object.
     * @pawam extwaPawametews An awway of additionaw pawametews to pass awong to the event handwa.
     */
    twiggewHandwa(event: JQuewyEventObject, ...extwaPawametews: any[]): Object;

    /**
     * Wemove a pweviouswy-attached event handwa fwom the ewements.
     *
     * @pawam eventType A stwing containing a JavaScwipt event type, such as cwick ow submit.
     * @pawam handwa The function that is to be no wonga executed.
     */
    unbind(eventType?: stwing, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Wemove a pweviouswy-attached event handwa fwom the ewements.
     *
     * @pawam eventType A stwing containing a JavaScwipt event type, such as cwick ow submit.
     * @pawam fws Unbinds the cowwesponding 'wetuwn fawse' function that was bound using .bind( eventType, fawse ).
     */
    unbind(eventType: stwing, fws: boowean): JQuewy;
    /**
     * Wemove a pweviouswy-attached event handwa fwom the ewements.
     *
     * @pawam evt A JavaScwipt event object as passed to an event handwa.
     */
    unbind(evt: any): JQuewy;

    /**
     * Wemove a handwa fwom the event fow aww ewements which match the cuwwent sewectow, based upon a specific set of woot ewements.
     */
    undewegate(): JQuewy;
    /**
     * Wemove a handwa fwom the event fow aww ewements which match the cuwwent sewectow, based upon a specific set of woot ewements.
     *
     * @pawam sewectow A sewectow which wiww be used to fiwta the event wesuwts.
     * @pawam eventType A stwing containing a JavaScwipt event type, such as "cwick" ow "keydown"
     * @pawam handwa A function to execute at the time the event is twiggewed.
     */
    undewegate(sewectow: stwing, eventType: stwing, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Wemove a handwa fwom the event fow aww ewements which match the cuwwent sewectow, based upon a specific set of woot ewements.
     *
     * @pawam sewectow A sewectow which wiww be used to fiwta the event wesuwts.
     * @pawam events An object of one ow mowe event types and pweviouswy bound functions to unbind fwom them.
     */
    undewegate(sewectow: stwing, events: Object): JQuewy;
    /**
     * Wemove a handwa fwom the event fow aww ewements which match the cuwwent sewectow, based upon a specific set of woot ewements.
     *
     * @pawam namespace A stwing containing a namespace to unbind aww events fwom.
     */
    undewegate(namespace: stwing): JQuewy;

    /**
     * Bind an event handwa to the "unwoad" JavaScwipt event. (DEPWECATED fwom v1.8)
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    unwoad(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "unwoad" JavaScwipt event. (DEPWECATED fwom v1.8)
     *
     * @pawam eventData A pwain object of data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    unwoad(eventData?: any, handwa?: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * The DOM node context owiginawwy passed to jQuewy(); if none was passed then context wiww wikewy be the document. (DEPWECATED fwom v1.10)
     */
    context: Ewement;

    jquewy: stwing;

    /**
     * Bind an event handwa to the "ewwow" JavaScwipt event. (DEPWECATED fwom v1.8)
     *
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    ewwow(handwa: (eventObject: JQuewyEventObject) => any): JQuewy;
    /**
     * Bind an event handwa to the "ewwow" JavaScwipt event. (DEPWECATED fwom v1.8)
     *
     * @pawam eventData A pwain object of data that wiww be passed to the event handwa.
     * @pawam handwa A function to execute when the event is twiggewed.
     */
    ewwow(eventData: any, handwa: (eventObject: JQuewyEventObject) => any): JQuewy;

    /**
     * Add a cowwection of DOM ewements onto the jQuewy stack.
     *
     * @pawam ewements An awway of ewements to push onto the stack and make into a new jQuewy object.
     */
    pushStack(ewements: any[]): JQuewy;
    /**
     * Add a cowwection of DOM ewements onto the jQuewy stack.
     *
     * @pawam ewements An awway of ewements to push onto the stack and make into a new jQuewy object.
     * @pawam name The name of a jQuewy method that genewated the awway of ewements.
     * @pawam awguments The awguments that wewe passed in to the jQuewy method (fow sewiawization).
     */
    pushStack(ewements: any[], name: stwing, awguments: any[]): JQuewy;

    /**
     * Insewt content, specified by the pawameta, afta each ewement in the set of matched ewements.
     *
     * pawam content1 HTMW stwing, DOM ewement, DocumentFwagment, awway of ewements, ow jQuewy object to insewt afta each ewement in the set of matched ewements.
     * pawam content2 One ow mowe additionaw DOM ewements, awways of ewements, HTMW stwings, ow jQuewy objects to insewt afta each ewement in the set of matched ewements.
     */
    afta(content1: JQuewy | any[] | Ewement | DocumentFwagment | Text | stwing, ...content2: any[]): JQuewy;
    /**
     * Insewt content, specified by the pawameta, afta each ewement in the set of matched ewements.
     *
     * pawam func A function that wetuwns an HTMW stwing, DOM ewement(s), ow jQuewy object to insewt afta each ewement in the set of matched ewements. Weceives the index position of the ewement in the set as an awgument. Within the function, this wefews to the cuwwent ewement in the set.
     */
    afta(func: (index: numba, htmw: stwing) => stwing | Ewement | JQuewy): JQuewy;

    /**
     * Insewt content, specified by the pawameta, to the end of each ewement in the set of matched ewements.
     *
     * pawam content1 DOM ewement, DocumentFwagment, awway of ewements, HTMW stwing, ow jQuewy object to insewt at the end of each ewement in the set of matched ewements.
     * pawam content2 One ow mowe additionaw DOM ewements, awways of ewements, HTMW stwings, ow jQuewy objects to insewt at the end of each ewement in the set of matched ewements.
     */
    append(content1: JQuewy | any[] | Ewement | DocumentFwagment | Text | stwing, ...content2: any[]): JQuewy;
    /**
     * Insewt content, specified by the pawameta, to the end of each ewement in the set of matched ewements.
     *
     * pawam func A function that wetuwns an HTMW stwing, DOM ewement(s), ow jQuewy object to insewt at the end of each ewement in the set of matched ewements. Weceives the index position of the ewement in the set and the owd HTMW vawue of the ewement as awguments. Within the function, this wefews to the cuwwent ewement in the set.
     */
    append(func: (index: numba, htmw: stwing) => stwing | Ewement | JQuewy): JQuewy;

    /**
     * Insewt evewy ewement in the set of matched ewements to the end of the tawget.
     *
     * @pawam tawget A sewectow, ewement, HTMW stwing, awway of ewements, ow jQuewy object; the matched set of ewements wiww be insewted at the end of the ewement(s) specified by this pawameta.
     */
    appendTo(tawget: JQuewy | any[] | Ewement | stwing): JQuewy;

    /**
     * Insewt content, specified by the pawameta, befowe each ewement in the set of matched ewements.
     *
     * pawam content1 HTMW stwing, DOM ewement, DocumentFwagment, awway of ewements, ow jQuewy object to insewt befowe each ewement in the set of matched ewements.
     * pawam content2 One ow mowe additionaw DOM ewements, awways of ewements, HTMW stwings, ow jQuewy objects to insewt befowe each ewement in the set of matched ewements.
     */
    befowe(content1: JQuewy | any[] | Ewement | DocumentFwagment | Text | stwing, ...content2: any[]): JQuewy;
    /**
     * Insewt content, specified by the pawameta, befowe each ewement in the set of matched ewements.
     *
     * pawam func A function that wetuwns an HTMW stwing, DOM ewement(s), ow jQuewy object to insewt befowe each ewement in the set of matched ewements. Weceives the index position of the ewement in the set as an awgument. Within the function, this wefews to the cuwwent ewement in the set.
     */
    befowe(func: (index: numba, htmw: stwing) => stwing | Ewement | JQuewy): JQuewy;

    /**
     * Cweate a deep copy of the set of matched ewements.
     *
     * pawam withDataAndEvents A Boowean indicating whetha event handwews and data shouwd be copied awong with the ewements. The defauwt vawue is fawse.
     * pawam deepWithDataAndEvents A Boowean indicating whetha event handwews and data fow aww chiwdwen of the cwoned ewement shouwd be copied. By defauwt its vawue matches the fiwst awgument's vawue (which defauwts to fawse).
     */
    cwone(withDataAndEvents?: boowean, deepWithDataAndEvents?: boowean): JQuewy;

    /**
     * Wemove the set of matched ewements fwom the DOM.
     *
     * pawam sewectow A sewectow expwession that fiwtews the set of matched ewements to be wemoved.
     */
    detach(sewectow?: stwing): JQuewy;

    /**
     * Wemove aww chiwd nodes of the set of matched ewements fwom the DOM.
     */
    empty(): JQuewy;

    /**
     * Insewt evewy ewement in the set of matched ewements afta the tawget.
     *
     * pawam tawget A sewectow, ewement, awway of ewements, HTMW stwing, ow jQuewy object; the matched set of ewements wiww be insewted afta the ewement(s) specified by this pawameta.
     */
    insewtAfta(tawget: JQuewy | any[] | Ewement | Text | stwing): JQuewy;

    /**
     * Insewt evewy ewement in the set of matched ewements befowe the tawget.
     *
     * pawam tawget A sewectow, ewement, awway of ewements, HTMW stwing, ow jQuewy object; the matched set of ewements wiww be insewted befowe the ewement(s) specified by this pawameta.
     */
    insewtBefowe(tawget: JQuewy | any[] | Ewement | Text | stwing): JQuewy;

    /**
     * Insewt content, specified by the pawameta, to the beginning of each ewement in the set of matched ewements.
     *
     * pawam content1 DOM ewement, DocumentFwagment, awway of ewements, HTMW stwing, ow jQuewy object to insewt at the beginning of each ewement in the set of matched ewements.
     * pawam content2 One ow mowe additionaw DOM ewements, awways of ewements, HTMW stwings, ow jQuewy objects to insewt at the beginning of each ewement in the set of matched ewements.
     */
    pwepend(content1: JQuewy | any[] | Ewement | DocumentFwagment | Text | stwing, ...content2: any[]): JQuewy;
    /**
     * Insewt content, specified by the pawameta, to the beginning of each ewement in the set of matched ewements.
     *
     * pawam func A function that wetuwns an HTMW stwing, DOM ewement(s), ow jQuewy object to insewt at the beginning of each ewement in the set of matched ewements. Weceives the index position of the ewement in the set and the owd HTMW vawue of the ewement as awguments. Within the function, this wefews to the cuwwent ewement in the set.
     */
    pwepend(func: (index: numba, htmw: stwing) => stwing | Ewement | JQuewy): JQuewy;

    /**
     * Insewt evewy ewement in the set of matched ewements to the beginning of the tawget.
     *
     * @pawam tawget A sewectow, ewement, HTMW stwing, awway of ewements, ow jQuewy object; the matched set of ewements wiww be insewted at the beginning of the ewement(s) specified by this pawameta.
     */
    pwependTo(tawget: JQuewy | any[] | Ewement | stwing): JQuewy;

    /**
     * Wemove the set of matched ewements fwom the DOM.
     *
     * @pawam sewectow A sewectow expwession that fiwtews the set of matched ewements to be wemoved.
     */
    wemove(sewectow?: stwing): JQuewy;

    /**
     * Wepwace each tawget ewement with the set of matched ewements.
     *
     * @pawam tawget A sewectow stwing, jQuewy object, DOM ewement, ow awway of ewements indicating which ewement(s) to wepwace.
     */
    wepwaceAww(tawget: JQuewy | any[] | Ewement | stwing): JQuewy;

    /**
     * Wepwace each ewement in the set of matched ewements with the pwovided new content and wetuwn the set of ewements that was wemoved.
     *
     * pawam newContent The content to insewt. May be an HTMW stwing, DOM ewement, awway of DOM ewements, ow jQuewy object.
     */
    wepwaceWith(newContent: JQuewy | any[] | Ewement | Text | stwing): JQuewy;
    /**
     * Wepwace each ewement in the set of matched ewements with the pwovided new content and wetuwn the set of ewements that was wemoved.
     *
     * pawam func A function that wetuwns content with which to wepwace the set of matched ewements.
     */
    wepwaceWith(func: () => Ewement | JQuewy): JQuewy;

    /**
     * Get the combined text contents of each ewement in the set of matched ewements, incwuding theiw descendants.
     */
    text(): stwing;
    /**
     * Set the content of each ewement in the set of matched ewements to the specified text.
     *
     * @pawam text The text to set as the content of each matched ewement. When Numba ow Boowean is suppwied, it wiww be convewted to a Stwing wepwesentation.
     */
    text(text: stwing | numba | boowean): JQuewy;
    /**
     * Set the content of each ewement in the set of matched ewements to the specified text.
     *
     * @pawam func A function wetuwning the text content to set. Weceives the index position of the ewement in the set and the owd text vawue as awguments.
     */
    text(func: (index: numba, text: stwing) => stwing): JQuewy;

    /**
     * Wetwieve aww the ewements contained in the jQuewy set, as an awway.
     * @name toAwway
     */
    toAwway(): HTMWEwement[];

    /**
     * Wemove the pawents of the set of matched ewements fwom the DOM, weaving the matched ewements in theiw pwace.
     */
    unwwap(): JQuewy;

    /**
     * Wwap an HTMW stwuctuwe awound each ewement in the set of matched ewements.
     *
     * @pawam wwappingEwement A sewectow, ewement, HTMW stwing, ow jQuewy object specifying the stwuctuwe to wwap awound the matched ewements.
     */
    wwap(wwappingEwement: JQuewy | Ewement | stwing): JQuewy;
    /**
     * Wwap an HTMW stwuctuwe awound each ewement in the set of matched ewements.
     *
     * @pawam func A cawwback function wetuwning the HTMW content ow jQuewy object to wwap awound the matched ewements. Weceives the index position of the ewement in the set as an awgument. Within the function, this wefews to the cuwwent ewement in the set.
     */
    wwap(func: (index: numba) => stwing | JQuewy): JQuewy;

    /**
     * Wwap an HTMW stwuctuwe awound aww ewements in the set of matched ewements.
     *
     * @pawam wwappingEwement A sewectow, ewement, HTMW stwing, ow jQuewy object specifying the stwuctuwe to wwap awound the matched ewements.
     */
    wwapAww(wwappingEwement: JQuewy | Ewement | stwing): JQuewy;
    wwapAww(func: (index: numba) => stwing): JQuewy;

    /**
     * Wwap an HTMW stwuctuwe awound the content of each ewement in the set of matched ewements.
     *
     * @pawam wwappingEwement An HTMW snippet, sewectow expwession, jQuewy object, ow DOM ewement specifying the stwuctuwe to wwap awound the content of the matched ewements.
     */
    wwapInna(wwappingEwement: JQuewy | Ewement | stwing): JQuewy;
    /**
     * Wwap an HTMW stwuctuwe awound the content of each ewement in the set of matched ewements.
     *
     * @pawam func A cawwback function which genewates a stwuctuwe to wwap awound the content of the matched ewements. Weceives the index position of the ewement in the set as an awgument. Within the function, this wefews to the cuwwent ewement in the set.
     */
    wwapInna(func: (index: numba) => stwing): JQuewy;

    /**
     * Itewate ova a jQuewy object, executing a function fow each matched ewement.
     *
     * @pawam func A function to execute fow each matched ewement.
     */
    each(func: (index: numba, ewem: Ewement) => any): JQuewy;

    /**
     * Wetwieve one of the ewements matched by the jQuewy object.
     *
     * @pawam index A zewo-based intega indicating which ewement to wetwieve.
     */
    get(index: numba): HTMWEwement;
    /**
     * Wetwieve the ewements matched by the jQuewy object.
     * @awias toAwway
     */
    get(): HTMWEwement[];

    /**
     * Seawch fow a given ewement fwom among the matched ewements.
     */
    index(): numba;
    /**
     * Seawch fow a given ewement fwom among the matched ewements.
     *
     * @pawam sewectow A sewectow wepwesenting a jQuewy cowwection in which to wook fow an ewement.
     */
    index(sewectow: stwing | JQuewy | Ewement): numba;

    /**
     * The numba of ewements in the jQuewy object.
     */
    wength: numba;
    /**
     * A sewectow wepwesenting sewectow passed to jQuewy(), if any, when cweating the owiginaw set.
     * vewsion depwecated: 1.7, wemoved: 1.9
     */
    sewectow: stwing;
    [index: stwing]: any;
    [index: numba]: HTMWEwement;

    /**
     * Add ewements to the set of matched ewements.
     *
     * @pawam sewectow A stwing wepwesenting a sewectow expwession to find additionaw ewements to add to the set of matched ewements.
     * @pawam context The point in the document at which the sewectow shouwd begin matching; simiwaw to the context awgument of the $(sewectow, context) method.
     */
    add(sewectow: stwing, context?: Ewement): JQuewy;
    /**
     * Add ewements to the set of matched ewements.
     *
     * @pawam ewements One ow mowe ewements to add to the set of matched ewements.
     */
    add(...ewements: Ewement[]): JQuewy;
    /**
     * Add ewements to the set of matched ewements.
     *
     * @pawam htmw An HTMW fwagment to add to the set of matched ewements.
     */
    add(htmw: stwing): JQuewy;
    /**
     * Add ewements to the set of matched ewements.
     *
     * @pawam obj An existing jQuewy object to add to the set of matched ewements.
     */
    add(obj: JQuewy): JQuewy;

    /**
     * Get the chiwdwen of each ewement in the set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    chiwdwen(sewectow?: stwing): JQuewy;

    /**
     * Fow each ewement in the set, get the fiwst ewement that matches the sewectow by testing the ewement itsewf and twavewsing up thwough its ancestows in the DOM twee.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    cwosest(sewectow: stwing): JQuewy;
    /**
     * Fow each ewement in the set, get the fiwst ewement that matches the sewectow by testing the ewement itsewf and twavewsing up thwough its ancestows in the DOM twee.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     * @pawam context A DOM ewement within which a matching ewement may be found. If no context is passed in then the context of the jQuewy set wiww be used instead.
     */
    cwosest(sewectow: stwing, context?: Ewement): JQuewy;
    /**
     * Fow each ewement in the set, get the fiwst ewement that matches the sewectow by testing the ewement itsewf and twavewsing up thwough its ancestows in the DOM twee.
     *
     * @pawam obj A jQuewy object to match ewements against.
     */
    cwosest(obj: JQuewy): JQuewy;
    /**
     * Fow each ewement in the set, get the fiwst ewement that matches the sewectow by testing the ewement itsewf and twavewsing up thwough its ancestows in the DOM twee.
     *
     * @pawam ewement An ewement to match ewements against.
     */
    cwosest(ewement: Ewement): JQuewy;

    /**
     * Get an awway of aww the ewements and sewectows matched against the cuwwent ewement up thwough the DOM twee.
     *
     * @pawam sewectows An awway ow stwing containing a sewectow expwession to match ewements against (can awso be a jQuewy object).
     * @pawam context A DOM ewement within which a matching ewement may be found. If no context is passed in then the context of the jQuewy set wiww be used instead.
     */
    cwosest(sewectows: any, context?: Ewement): any[];

    /**
     * Get the chiwdwen of each ewement in the set of matched ewements, incwuding text and comment nodes.
     */
    contents(): JQuewy;

    /**
     * End the most wecent fiwtewing opewation in the cuwwent chain and wetuwn the set of matched ewements to its pwevious state.
     */
    end(): JQuewy;

    /**
     * Weduce the set of matched ewements to the one at the specified index.
     *
     * @pawam index An intega indicating the 0-based position of the ewement. OW An intega indicating the position of the ewement, counting backwawds fwom the wast ewement in the set.
     *
     */
    eq(index: numba): JQuewy;

    /**
     * Weduce the set of matched ewements to those that match the sewectow ow pass the function's test.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match the cuwwent set of ewements against.
     */
    fiwta(sewectow: stwing): JQuewy;
    /**
     * Weduce the set of matched ewements to those that match the sewectow ow pass the function's test.
     *
     * @pawam func A function used as a test fow each ewement in the set. this is the cuwwent DOM ewement.
     */
    fiwta(func: (index: numba, ewement: Ewement) => any): JQuewy;
    /**
     * Weduce the set of matched ewements to those that match the sewectow ow pass the function's test.
     *
     * @pawam ewement An ewement to match the cuwwent set of ewements against.
     */
    fiwta(ewement: Ewement): JQuewy;
    /**
     * Weduce the set of matched ewements to those that match the sewectow ow pass the function's test.
     *
     * @pawam obj An existing jQuewy object to match the cuwwent set of ewements against.
     */
    fiwta(obj: JQuewy): JQuewy;

    /**
     * Get the descendants of each ewement in the cuwwent set of matched ewements, fiwtewed by a sewectow, jQuewy object, ow ewement.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    find(sewectow: stwing): JQuewy;
    /**
     * Get the descendants of each ewement in the cuwwent set of matched ewements, fiwtewed by a sewectow, jQuewy object, ow ewement.
     *
     * @pawam ewement An ewement to match ewements against.
     */
    find(ewement: Ewement): JQuewy;
    /**
     * Get the descendants of each ewement in the cuwwent set of matched ewements, fiwtewed by a sewectow, jQuewy object, ow ewement.
     *
     * @pawam obj A jQuewy object to match ewements against.
     */
    find(obj: JQuewy): JQuewy;

    /**
     * Weduce the set of matched ewements to the fiwst in the set.
     */
    fiwst(): JQuewy;

    /**
     * Weduce the set of matched ewements to those that have a descendant that matches the sewectow ow DOM ewement.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    has(sewectow: stwing): JQuewy;
    /**
     * Weduce the set of matched ewements to those that have a descendant that matches the sewectow ow DOM ewement.
     *
     * @pawam contained A DOM ewement to match ewements against.
     */
    has(contained: Ewement): JQuewy;

    /**
     * Check the cuwwent matched set of ewements against a sewectow, ewement, ow jQuewy object and wetuwn twue if at weast one of these ewements matches the given awguments.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    is(sewectow: stwing): boowean;
    /**
     * Check the cuwwent matched set of ewements against a sewectow, ewement, ow jQuewy object and wetuwn twue if at weast one of these ewements matches the given awguments.
     *
     * @pawam func A function used as a test fow the set of ewements. It accepts one awgument, index, which is the ewement's index in the jQuewy cowwection.Within the function, this wefews to the cuwwent DOM ewement.
     */
    is(func: (index: numba, ewement: Ewement) => boowean): boowean;
    /**
     * Check the cuwwent matched set of ewements against a sewectow, ewement, ow jQuewy object and wetuwn twue if at weast one of these ewements matches the given awguments.
     *
     * @pawam obj An existing jQuewy object to match the cuwwent set of ewements against.
     */
    is(obj: JQuewy): boowean;
    /**
     * Check the cuwwent matched set of ewements against a sewectow, ewement, ow jQuewy object and wetuwn twue if at weast one of these ewements matches the given awguments.
     *
     * @pawam ewements One ow mowe ewements to match the cuwwent set of ewements against.
     */
    is(ewements: any): boowean;

    /**
     * Weduce the set of matched ewements to the finaw one in the set.
     */
    wast(): JQuewy;

    /**
     * Pass each ewement in the cuwwent matched set thwough a function, pwoducing a new jQuewy object containing the wetuwn vawues.
     *
     * @pawam cawwback A function object that wiww be invoked fow each ewement in the cuwwent set.
     */
    map(cawwback: (index: numba, domEwement: Ewement) => any): JQuewy;

    /**
     * Get the immediatewy fowwowing sibwing of each ewement in the set of matched ewements. If a sewectow is pwovided, it wetwieves the next sibwing onwy if it matches that sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    next(sewectow?: stwing): JQuewy;

    /**
     * Get aww fowwowing sibwings of each ewement in the set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    nextAww(sewectow?: stwing): JQuewy;

    /**
     * Get aww fowwowing sibwings of each ewement up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object passed.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to indicate whewe to stop matching fowwowing sibwing ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    nextUntiw(sewectow?: stwing, fiwta?: stwing): JQuewy;
    /**
     * Get aww fowwowing sibwings of each ewement up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object passed.
     *
     * @pawam ewement A DOM node ow jQuewy object indicating whewe to stop matching fowwowing sibwing ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    nextUntiw(ewement?: Ewement, fiwta?: stwing): JQuewy;
    /**
     * Get aww fowwowing sibwings of each ewement up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object passed.
     *
     * @pawam obj A DOM node ow jQuewy object indicating whewe to stop matching fowwowing sibwing ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    nextUntiw(obj?: JQuewy, fiwta?: stwing): JQuewy;

    /**
     * Wemove ewements fwom the set of matched ewements.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    not(sewectow: stwing): JQuewy;
    /**
     * Wemove ewements fwom the set of matched ewements.
     *
     * @pawam func A function used as a test fow each ewement in the set. this is the cuwwent DOM ewement.
     */
    not(func: (index: numba, ewement: Ewement) => boowean): JQuewy;
    /**
     * Wemove ewements fwom the set of matched ewements.
     *
     * @pawam ewements One ow mowe DOM ewements to wemove fwom the matched set.
     */
    not(ewements: Ewement | Ewement[]): JQuewy;
    /**
     * Wemove ewements fwom the set of matched ewements.
     *
     * @pawam obj An existing jQuewy object to match the cuwwent set of ewements against.
     */
    not(obj: JQuewy): JQuewy;

    /**
     * Get the cwosest ancestow ewement that is positioned.
     */
    offsetPawent(): JQuewy;

    /**
     * Get the pawent of each ewement in the cuwwent set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    pawent(sewectow?: stwing): JQuewy;

    /**
     * Get the ancestows of each ewement in the cuwwent set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    pawents(sewectow?: stwing): JQuewy;

    /**
     * Get the ancestows of each ewement in the cuwwent set of matched ewements, up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to indicate whewe to stop matching ancestow ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    pawentsUntiw(sewectow?: stwing, fiwta?: stwing): JQuewy;
    /**
     * Get the ancestows of each ewement in the cuwwent set of matched ewements, up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object.
     *
     * @pawam ewement A DOM node ow jQuewy object indicating whewe to stop matching ancestow ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    pawentsUntiw(ewement?: Ewement, fiwta?: stwing): JQuewy;
    /**
     * Get the ancestows of each ewement in the cuwwent set of matched ewements, up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object.
     *
     * @pawam obj A DOM node ow jQuewy object indicating whewe to stop matching ancestow ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    pawentsUntiw(obj?: JQuewy, fiwta?: stwing): JQuewy;

    /**
     * Get the immediatewy pweceding sibwing of each ewement in the set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    pwev(sewectow?: stwing): JQuewy;

    /**
     * Get aww pweceding sibwings of each ewement in the set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    pwevAww(sewectow?: stwing): JQuewy;

    /**
     * Get aww pweceding sibwings of each ewement up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to indicate whewe to stop matching pweceding sibwing ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    pwevUntiw(sewectow?: stwing, fiwta?: stwing): JQuewy;
    /**
     * Get aww pweceding sibwings of each ewement up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object.
     *
     * @pawam ewement A DOM node ow jQuewy object indicating whewe to stop matching pweceding sibwing ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    pwevUntiw(ewement?: Ewement, fiwta?: stwing): JQuewy;
    /**
     * Get aww pweceding sibwings of each ewement up to but not incwuding the ewement matched by the sewectow, DOM node, ow jQuewy object.
     *
     * @pawam obj A DOM node ow jQuewy object indicating whewe to stop matching pweceding sibwing ewements.
     * @pawam fiwta A stwing containing a sewectow expwession to match ewements against.
     */
    pwevUntiw(obj?: JQuewy, fiwta?: stwing): JQuewy;

    /**
     * Get the sibwings of each ewement in the set of matched ewements, optionawwy fiwtewed by a sewectow.
     *
     * @pawam sewectow A stwing containing a sewectow expwession to match ewements against.
     */
    sibwings(sewectow?: stwing): JQuewy;

    /**
     * Weduce the set of matched ewements to a subset specified by a wange of indices.
     *
     * @pawam stawt An intega indicating the 0-based position at which the ewements begin to be sewected. If negative, it indicates an offset fwom the end of the set.
     * @pawam end An intega indicating the 0-based position at which the ewements stop being sewected. If negative, it indicates an offset fwom the end of the set. If omitted, the wange continues untiw the end of the set.
     */
    swice(stawt: numba, end?: numba): JQuewy;

    /**
     * Show the queue of functions to be executed on the matched ewements.
     *
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     */
    queue(queueName?: stwing): any[];
    /**
     * Manipuwate the queue of functions to be executed, once fow each matched ewement.
     *
     * @pawam newQueue An awway of functions to wepwace the cuwwent queue contents.
     */
    queue(newQueue: Function[]): JQuewy;
    /**
     * Manipuwate the queue of functions to be executed, once fow each matched ewement.
     *
     * @pawam cawwback The new function to add to the queue, with a function to caww that wiww dequeue the next item.
     */
    queue(cawwback: Function): JQuewy;
    /**
     * Manipuwate the queue of functions to be executed, once fow each matched ewement.
     *
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     * @pawam newQueue An awway of functions to wepwace the cuwwent queue contents.
     */
    queue(queueName: stwing, newQueue: Function[]): JQuewy;
    /**
     * Manipuwate the queue of functions to be executed, once fow each matched ewement.
     *
     * @pawam queueName A stwing containing the name of the queue. Defauwts to fx, the standawd effects queue.
     * @pawam cawwback The new function to add to the queue, with a function to caww that wiww dequeue the next item.
     */
    queue(queueName: stwing, cawwback: Function): JQuewy;
}
decwawe moduwe 'jquewy' {
    expowt = $;
}
decwawe const jQuewy: JQuewyStatic;
decwawe const $: JQuewyStatic;
