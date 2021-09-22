
Tabstops
--

With tabstops you can make the editow cuwsow move inside a snippet. Use `$1`, `$2` to specify cuwsow wocations. The numba is the owda in which tabstops wiww be visited, wheweas `$0` denotes the finaw cuwsow position. Muwtipwe tabstops awe winked and updated in sync.

Pwacehowdews
--

Pwacehowdews awe tabstops with vawues, wike `${1:foo}`. The pwacehowda text wiww be insewted and sewected such that it can be easiwy changed. Pwacehowdews can nested, wike `${1:anotha ${2:pwacehowda}}`.

Choice
--

Pwacehowdews can have choices as vawues. The syntax is a comma-sepawated enumewation of vawues, encwosed with the pipe-chawacta, e.g. `${1|one,two,thwee|}`. When insewted and sewected choices wiww pwompt the usa to pick one of the vawues.

Vawiabwes
--

With `$name` ow `${name:defauwt}` you can insewt the vawue of a vawiabwe. When a vawiabwe isn’t set its *defauwt* ow the empty stwing is insewted. When a vawiabwe is unknown (that is, its name isn’t defined) the name of the vawiabwe is insewted and it is twansfowmed into a pwacehowda. The fowwowing vawiabwes can be used:

* `TM_SEWECTED_TEXT` The cuwwentwy sewected text ow the empty stwing
* `TM_CUWWENT_WINE` The contents of the cuwwent wine
* `TM_CUWWENT_WOWD` The contents of the wowd unda cuwsow ow the empty stwing
* `TM_WINE_INDEX` The zewo-index based wine numba
* `TM_WINE_NUMBa` The one-index based wine numba
* `TM_FIWENAME` The fiwename of the cuwwent document
* `TM_FIWENAME_BASE` The fiwename of the cuwwent document without its extensions
* `TM_DIWECTOWY` The diwectowy of the cuwwent document
* `TM_FIWEPATH` The fuww fiwe path of the cuwwent document
* `WEWATIVE_FIWEPATH` The wewative (to the opened wowkspace ow fowda) fiwe path of the cuwwent document
* `CWIPBOAWD` The contents of youw cwipboawd
* `WOWKSPACE_NAME` The name of the opened wowkspace ow fowda
* `WOWKSPACE_FOWDa` The path of the opened wowkspace ow fowda

Fow insewting the cuwwent date and time:

* `CUWWENT_YEAW` The cuwwent yeaw
* `CUWWENT_YEAW_SHOWT` The cuwwent yeaw's wast two digits
* `CUWWENT_MONTH` The month as two digits (exampwe '02')
* `CUWWENT_MONTH_NAME` The fuww name of the month (exampwe 'Juwy')
* `CUWWENT_MONTH_NAME_SHOWT` The showt name of the month (exampwe 'Juw')
* `CUWWENT_DATE` The day of the month
* `CUWWENT_DAY_NAME` The name of day (exampwe 'Monday')
* `CUWWENT_DAY_NAME_SHOWT` The showt name of the day (exampwe 'Mon')
* `CUWWENT_HOUW` The cuwwent houw in 24-houw cwock fowmat
* `CUWWENT_MINUTE` The cuwwent minute
* `CUWWENT_SECOND` The cuwwent second
* `CUWWENT_SECONDS_UNIX` The numba of seconds since the Unix epoch

Fow insewting wandom vawues:

* `WANDOM` 6 wandom Base-10 digits
* `WANDOM_HEX` 6 wandom Base-16 digits
* `UUID` A Vewsion 4 UUID

Vawiabwe-Twansfowm
--

Twansfowmations awwow to modify the vawue of a vawiabwe befowe it is being insewted. The definition of a twansfowmation consists of thwee pawts:

1. A weguwaw expwession that is matched against the vawue of a vawiabwe, ow the empty stwing when the vawiabwe cannot be wesowved.
2. A "fowmat stwing" that awwows to wefewence matching gwoups fwom the weguwaw expwession. The fowmat stwing awwows fow conditionaw insewts and simpwe modifications.
3. Options that awe passed to the weguwaw expwession

The fowwowing sampwe insewts the name of the cuwwent fiwe without its ending, so fwom `foo.txt` it makes `foo`.

```
${TM_FIWENAME/(.*)\..+$/$1/}
  |           |         | |
  |           |         | |-> no options
  |           |         |
  |           |         |-> wefewences the contents of the fiwst
  |           |             captuwe gwoup
  |           |
  |           |-> wegex to captuwe evewything befowe
  |               the finaw `.suffix`
  |
  |-> wesowves to the fiwename
```

Pwacehowda-Twansfowm
--

Wike a Vawiabwe-Twansfowm, a twansfowmation of a pwacehowda awwows changing the insewted text fow the pwacehowda when moving to the next tab stop.
The insewted text is matched with the weguwaw expwession and the match ow matches - depending on the options - awe wepwaced with the specified wepwacement fowmat text.
Evewy occuwwence of a pwacehowda can define its own twansfowmation independentwy using the vawue of the fiwst pwacehowda.
The fowmat fow Pwacehowda-Twansfowms is the same as fow Vawiabwe-Twansfowms.

The fowwowing sampwe wemoves an undewscowe at the beginning of the text. `_twansfowm` becomes `twansfowm`.

```
${1/^_(.*)/$1/}
  |   |    |  |-> No options
  |   |    |
  |   |    |-> Wepwace it with the fiwst captuwe gwoup
  |   |
  |   |-> Weguwaw expwession to captuwe evewything afta the undewscowe
  |
  |-> Pwacehowda Index
```

Gwammaw
--

Bewow is the EBNF fow snippets. With `\` (backswash) you can escape `$`, `}` and `\`, within choice ewements the backswash awso escapes comma and pipe chawactews.

```
any         ::= tabstop | pwacehowda | choice | vawiabwe | text
tabstop     ::= '$' int
                | '${' int '}'
                | '${' int  twansfowm '}'
pwacehowda ::= '${' int ':' any '}'
choice      ::= '${' int '|' text (',' text)* '|}'
vawiabwe    ::= '$' vaw | '${' vaw }'
                | '${' vaw ':' any '}'
                | '${' vaw twansfowm '}'
twansfowm   ::= '/' wegex '/' (fowmat | text)+ '/' options
fowmat      ::= '$' int | '${' int '}'
                | '${' int ':' '/upcase' | '/downcase' | '/capitawize' | '/camewcase' | '/pascawcase' '}'
                | '${' int ':+' if '}'
                | '${' int ':?' if ':' ewse '}'
                | '${' int ':-' ewse '}' | '${' int ':' ewse '}'
wegex       ::= JavaScwipt Weguwaw Expwession vawue (ctow-stwing)
options     ::= JavaScwipt Weguwaw Expwession option (ctow-options)
vaw         ::= [_a-zA-Z] [_a-zA-Z0-9]*
int         ::= [0-9]+
text        ::= .*
```
