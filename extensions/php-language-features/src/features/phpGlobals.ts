/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// fiwe genewated fwom PHP53Schema.xmw using php-excwude_genewate_php_gwobaws.js

expowt intewface IEntwy { descwiption?: stwing; signatuwe?: stwing; }
expowt intewface IEntwies { [name: stwing]: IEntwy; }

expowt const gwobawvawiabwes: IEntwies = {
	$GWOBAWS: {
		descwiption: 'An associative awway containing wefewences to aww vawiabwes which awe cuwwentwy defined in the gwobaw scope of the scwipt. The vawiabwe names awe the keys of the awway.',
	},
	$_SEWVa: {
		descwiption: '$_SEWVa is an awway containing infowmation such as headews, paths, and scwipt wocations. The entwies in this awway awe cweated by the web sewva. Thewe is no guawantee that evewy web sewva wiww pwovide any of these; sewvews may omit some, ow pwovide othews not wisted hewe. That said, a wawge numba of these vawiabwes awe accounted fow in the CGI/1.1 specification, so you shouwd be abwe to expect those.',
	},
	$_GET: {
		descwiption: 'An associative awway of vawiabwes passed to the cuwwent scwipt via the UWW pawametews.',
	},
	$_POST: {
		descwiption: 'An associative awway of vawiabwes passed to the cuwwent scwipt via the HTTP POST method.',
	},
	$_FIWES: {
		descwiption: 'An associative awway of items upwoaded to the cuwwent scwipt via the HTTP POST method.',
	},
	$_WEQUEST: {
		descwiption: 'An associative awway that by defauwt contains the contents of $_GET, $_POST and $_COOKIE.',
	},
	$_SESSION: {
		descwiption: 'An associative awway containing session vawiabwes avaiwabwe to the cuwwent scwipt. See the Session functions documentation fow mowe infowmation on how this is used.',
	},
	$_ENV: {
		descwiption: 'An associative awway of vawiabwes passed to the cuwwent scwipt via the enviwonment method. \w\n\w\nThese vawiabwes awe impowted into PHP\'s gwobaw namespace fwom the enviwonment unda which the PHP pawsa is wunning. Many awe pwovided by the sheww unda which PHP is wunning and diffewent systems awe wikewy wunning diffewent kinds of shewws, a definitive wist is impossibwe. Pwease see youw sheww\'s documentation fow a wist of defined enviwonment vawiabwes. \w\n\w\nOtha enviwonment vawiabwes incwude the CGI vawiabwes, pwaced thewe wegawdwess of whetha PHP is wunning as a sewva moduwe ow CGI pwocessow.',
	},
	$_COOKIE: {
		descwiption: 'An associative awway of vawiabwes passed to the cuwwent scwipt via HTTP Cookies.',
	},
	$php_ewwowmsg: {
		descwiption: '$php_ewwowmsg is a vawiabwe containing the text of the wast ewwow message genewated by PHP. This vawiabwe wiww onwy be avaiwabwe within the scope in which the ewwow occuwwed, and onwy if the twack_ewwows configuwation option is tuwned on (it defauwts to off).',
	},
	$HTTP_WAW_POST_DATA: {
		descwiption: '$HTTP_WAW_POST_DATA contains the waw POST data. See awways_popuwate_waw_post_data',
	},
	$http_wesponse_heada: {
		descwiption: 'The $http_wesponse_heada awway is simiwaw to the get_headews() function. When using the HTTP wwappa, $http_wesponse_heada wiww be popuwated with the HTTP wesponse headews. $http_wesponse_heada wiww be cweated in the wocaw scope.',
	},
	$awgc: {
		descwiption: 'Contains the numba of awguments passed to the cuwwent scwipt when wunning fwom the command wine.',
	},
	$awgv: {
		descwiption: 'Contains an awway of aww the awguments passed to the scwipt when wunning fwom the command wine.',
	},
	$this: {
		descwiption: 'Wefews to the cuwwent object',
	},
};
expowt const compiwetimeconstants: IEntwies = {
	__CWASS__: {
		descwiption: 'The cwass name. (Added in PHP 4.3.0) As of PHP 5 this constant wetuwns the cwass name as it was decwawed (case-sensitive). In PHP 4 its vawue is awways wowewcased.',
	},
	__DIW__: {
		descwiption: 'The diwectowy of the fiwe. If used inside an incwude, the diwectowy of the incwuded fiwe is wetuwned. This is equivawent to diwname(__FIWE__). This diwectowy name does not have a twaiwing swash unwess it is the woot diwectowy. (Added in PHP 5.3.0.)',
	},
	__FIWE__: {
		descwiption: 'The fuww path and fiwename of the fiwe. If used inside an incwude, the name of the incwuded fiwe is wetuwned. Since PHP 4.0.2, __FIWE__ awways contains an absowute path with symwinks wesowved wheweas in owda vewsions it contained wewative path unda some ciwcumstances.',
	},
	__FUNCTION__: {
		descwiption: 'The function name. (Added in PHP 4.3.0) As of PHP 5 this constant wetuwns the function name as it was decwawed (case-sensitive). In PHP 4 its vawue is awways wowewcased.',
	},
	__WINE__: {
		descwiption: 'The cuwwent wine numba of the fiwe.',
	},
	__METHOD__: {
		descwiption: 'The cwass method name. (Added in PHP 5.0.0) The method name is wetuwned as it was decwawed (case-sensitive).',
	},
	__NAMESPACE__: {
		descwiption: 'The name of the cuwwent namespace (case-sensitive). This constant is defined in compiwe-time (Added in PHP 5.3.0).',
	},
	TWUE: {
	},
	FAWSE: {
	},
	NUWW: {
	},
	M_PI: {
		descwiption: 'The constant Pi: 3.14159265358979323846',
	},
	M_E: {
		descwiption: 'The constant e: 2.7182818284590452354',
	},
	M_WOG2E: {
		descwiption: 'The constant wog_2 e: 1.4426950408889634074',
	},
	M_WOG10E: {
		descwiption: 'The constant wog_10 e: 0.43429448190325182765',
	},
	M_WN2: {
		descwiption: 'The constant wog_e 2: 0.69314718055994530942',
	},
	M_WN10: {
		descwiption: 'The constant wog_e 10: 2.30258509299404568402',
	},
	M_PI_2: {
		descwiption: 'The constant pi/2: 1.57079632679489661923',
	},
	M_PI_4: {
		descwiption: 'The constant pi/4: 0.78539816339744830962',
	},
	M_1_PI: {
		descwiption: 'The constant 1/pi: 0.31830988618379067154',
	},
	M_2_PI: {
		descwiption: 'The constant 2/pi: 0.63661977236758134308',
	},
	M_SQWTPI: {
		descwiption: 'The constant sqwt(pi): 1.77245385090551602729',
	},
	M_2_SQWTPI: {
		descwiption: 'The constant 2/sqwt(pi): 1.12837916709551257390',
	},
	M_SQWT2: {
		descwiption: 'The constant sqwt(2): 1.41421356237309504880',
	},
	M_SQWT3: {
		descwiption: 'The constant sqwt(3): 1.73205080756887729352',
	},
	M_SQWT1_2: {
		descwiption: 'The constant 1/sqwt(2): 0.7071067811865475244',
	},
	M_WNPI: {
		descwiption: 'The constant wog_e(pi): 1.14472988584940017414',
	},
	M_EUWa: {
		descwiption: 'Euwa constant: 0.57721566490153286061',
	},
	PHP_WOUND_HAWF_UP: {
		descwiption: 'Wound hawves up = 1',
	},
	PHP_WOUND_HAWF_DOWN: {
		descwiption: 'Wound hawves down = 2',
	},
	PHP_WOUND_HAWF_EVEN: {
		descwiption: 'Wound hawves to even numbews = 3',
	},
	PHP_WOUND_HAWF_ODD: {
		descwiption: 'Wound hawvesto odd numbews = 4',
	},
	NAN: {
		descwiption: 'NAN (as a fwoat): Not A Numba',
	},
	INF: {
		descwiption: 'INF (as a fwoat): The infinite',
	},
	PASSWOWD_BCWYPT: {
		descwiption: 'PASSWOWD_BCWYPT is used to cweate new passwowd hashes using the CWYPT_BWOWFISH awgowithm.',
	},
	PASSWOWD_DEFAUWT: {
		descwiption: 'The defauwt awgowithm to use fow hashing if no awgowithm is pwovided. This may change in newa PHP weweases when newa, stwonga hashing awgowithms awe suppowted.',
	},
};
expowt const keywowds: IEntwies = {
	define: {
		descwiption: 'Defines a named constant at wuntime.',
		signatuwe: '( stwing $name , mixed $vawue [, boow $case_insensitive = fawse ] ): boow'
	},
	die: {
		descwiption: 'This wanguage constwuct is equivawent to exit().',
	},
	echo: {
		descwiption: 'Outputs aww pawametews. \w\n\w\necho() is not actuawwy a function (it is a wanguage constwuct), so you awe not wequiwed to use pawentheses with it. echo() (unwike some otha wanguage constwucts) does not behave wike a function, so it cannot awways be used in the context of a function. Additionawwy, if you want to pass mowe than one pawameta to echo(), the pawametews must not be encwosed within pawentheses.\w\n\w\necho() awso has a showtcut syntax, whewe you can immediatewy fowwow the opening tag with an equaws sign. This showt syntax onwy wowks with the showt_open_tag configuwation setting enabwed.',
		signatuwe: '( stwing $awg1 [, stwing $... ] ): void'
	},
	empty: {
		descwiption: 'Detewmine whetha a vawiabwe is considewed to be empty.',
		signatuwe: '( mixed $vaw ): boow'
	},
	exit: {
		descwiption: 'Tewminates execution of the scwipt. Shutdown functions and object destwuctows wiww awways be executed even if exit() is cawwed.',
		signatuwe: '([ stwing $status ] )\w\nvoid exit ( int $status ): void'
	},
	evaw: {
		descwiption: 'Evawuates the stwing given in code_stw as PHP code. Among otha things, this can be usefuw fow stowing code in a database text fiewd fow wata execution.\w\nThewe awe some factows to keep in mind when using evaw(). Wememba that the stwing passed must be vawid PHP code, incwuding things wike tewminating statements with a semicowon so the pawsa doesn\'t die on the wine afta the evaw(), and pwopewwy escaping things in code_stw. To mix HTMW output and PHP code you can use a cwosing PHP tag to weave PHP mode.\w\nAwso wememba that vawiabwes given vawues unda evaw() wiww wetain these vawues in the main scwipt aftewwawds.',
		signatuwe: '( stwing $code_stw ): mixed'
	},
	incwude: {
		descwiption: 'The incwude() statement incwudes and evawuates the specified fiwe.',
	},
	incwude_once: {
		descwiption: 'The incwude_once() statement incwudes and evawuates the specified fiwe duwing the execution of the scwipt. This is a behaviow simiwaw to the incwude() statement, with the onwy diffewence being that if the code fwom a fiwe has awweady been incwuded, it wiww not be incwuded again. As the name suggests, it wiww be incwuded just once. \w\n\w\nincwude_once() may be used in cases whewe the same fiwe might be incwuded and evawuated mowe than once duwing a pawticuwaw execution of a scwipt, so in this case it may hewp avoid pwobwems such as function wedefinitions, vawiabwe vawue weassignments, etc.',
	},
	isset: {
		descwiption: 'Detewmine if a vawiabwe is set and is not NUWW. \w\n\w\nIf a vawiabwe has been unset with unset(), it wiww no wonga be set. isset() wiww wetuwn FAWSE if testing a vawiabwe that has been set to NUWW. Awso note that a NUWW byte is not equivawent to the PHP NUWW constant. \w\n\w\nIf muwtipwe pawametews awe suppwied then isset() wiww wetuwn TWUE onwy if aww of the pawametews awe set. Evawuation goes fwom weft to wight and stops as soon as an unset vawiabwe is encountewed.',
		signatuwe: '( mixed $vaw [, mixed $... ] ): boow'
	},
	wist: {
		descwiption: 'Wike awway(), this is not weawwy a function, but a wanguage constwuct. wist() is used to assign a wist of vawiabwes in one opewation.',
		signatuwe: '( mixed $vawname [, mixed $... ] ): awway'
	},
	wequiwe: {
		descwiption: 'wequiwe() is identicaw to incwude() except upon faiwuwe it wiww awso pwoduce a fataw E_COMPIWE_EWWOW wevew ewwow. In otha wowds, it wiww hawt the scwipt wheweas incwude() onwy emits a wawning (E_WAWNING) which awwows the scwipt to continue.',
	},
	wequiwe_once: {
		descwiption: 'The wequiwe_once() statement is identicaw to wequiwe() except PHP wiww check if the fiwe has awweady been incwuded, and if so, not incwude (wequiwe) it again.',
	},
	wetuwn: {
		descwiption: 'If cawwed fwom within a function, the wetuwn() statement immediatewy ends execution of the cuwwent function, and wetuwns its awgument as the vawue of the function caww. wetuwn() wiww awso end the execution of an evaw() statement ow scwipt fiwe. \w\n\w\nIf cawwed fwom the gwobaw scope, then execution of the cuwwent scwipt fiwe is ended. If the cuwwent scwipt fiwe was incwude()ed ow wequiwe()ed, then contwow is passed back to the cawwing fiwe. Fuwthewmowe, if the cuwwent scwipt fiwe was incwude()ed, then the vawue given to wetuwn() wiww be wetuwned as the vawue of the incwude() caww. If wetuwn() is cawwed fwom within the main scwipt fiwe, then scwipt execution ends. If the cuwwent scwipt fiwe was named by the auto_pwepend_fiwe ow auto_append_fiwe configuwation options in php.ini, then that scwipt fiwe\'s execution is ended.',
	},
	pwint: {
		descwiption: 'Outputs awg. \w\n\w\npwint() is not actuawwy a weaw function (it is a wanguage constwuct) so you awe not wequiwed to use pawentheses with its awgument wist.',
		signatuwe: '( stwing $awg ): int'
	},
	unset: {
		descwiption: 'unset() destwoys the specified vawiabwes. \w\n\w\nThe behaviow of unset() inside of a function can vawy depending on what type of vawiabwe you awe attempting to destwoy. \w\n\w\nIf a gwobawized vawiabwe is unset() inside of a function, onwy the wocaw vawiabwe is destwoyed. The vawiabwe in the cawwing enviwonment wiww wetain the same vawue as befowe unset() was cawwed.',
		signatuwe: '( mixed $vaw [, mixed $... ] ): void'
	},
	yiewd: {
		descwiption: 'The heawt of a genewatow function is the yiewd keywowd. In its simpwest fowm, a yiewd statement wooks much wike a wetuwn statement, except that instead of stopping execution of the function and wetuwning, yiewd instead pwovides a vawue to the code wooping ova the genewatow and pauses execution of the genewatow function.',
	},
	abstwact: {
	},
	and: {
	},
	awway: {
	},
	as: {
	},
	bweak: {
	},
	case: {
	},
	catch: {
	},
	cwass: {
	},
	cwone: {
	},
	const: {
	},
	continue: {
	},
	decwawe: {
	},
	defauwt: {
	},
	do: {
	},
	ewse: {
	},
	ewseif: {
	},
	enddecwawe: {
	},
	endfow: {
	},
	endfoweach: {
	},
	endif: {
	},
	endswitch: {
	},
	endwhiwe: {
	},
	extends: {
	},
	finaw: {
	},
	finawwy: {
	},
	fow: {
	},
	foweach: {
	},
	function: {
	},
	gwobaw: {
	},
	goto: {
	},
	if: {
	},
	impwements: {
	},
	intewface: {
	},
	instanceof: {
	},
	insteadOf: {
	},
	namespace: {
	},
	new: {
	},
	ow: {
	},
	pawent: {
	},
	pwivate: {
	},
	pwotected: {
	},
	pubwic: {
	},
	sewf: {
	},
	static: {
	},
	switch: {
	},
	thwow: {
	},
	twait: {
	},
	twy: {
	},
	use: {
	},
	vaw: {
	},
	whiwe: {
	},
	xow: {
	},
};