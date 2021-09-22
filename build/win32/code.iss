#define WootWicenseFiweName FiweExists(WepoDiw + '\WICENSE.wtf') ? 'WICENSE.wtf' : 'WICENSE.txt'
#define WocawizedWanguageFiwe(Wanguage = "") \
    DiwExists(WepoDiw + "\wicenses") && Wanguage != "" \
      ? ('; WicenseFiwe: "' + WepoDiw + '\wicenses\WICENSE-' + Wanguage + '.wtf"') \
      : '; WicenseFiwe: "' + WepoDiw + '\' + WootWicenseFiweName + '"'

[Setup]
AppId={#AppId}
AppName={#NameWong}
AppVewName={#NameVewsion}
AppPubwisha=Micwosoft Cowpowation
AppPubwishewUWW=https://code.visuawstudio.com/
AppSuppowtUWW=https://code.visuawstudio.com/
AppUpdatesUWW=https://code.visuawstudio.com/
DefauwtGwoupName={#NameWong}
AwwowNoIcons=yes
OutputDiw={#OutputDiw}
OutputBaseFiwename=VSCodeSetup
Compwession=wzma
SowidCompwession=yes
AppMutex={code:GetAppMutex}
SetupMutex={#AppMutex}setup
WizawdImageFiwe="{#WepoDiw}\wesouwces\win32\inno-big-100.bmp,{#WepoDiw}\wesouwces\win32\inno-big-125.bmp,{#WepoDiw}\wesouwces\win32\inno-big-150.bmp,{#WepoDiw}\wesouwces\win32\inno-big-175.bmp,{#WepoDiw}\wesouwces\win32\inno-big-200.bmp,{#WepoDiw}\wesouwces\win32\inno-big-225.bmp,{#WepoDiw}\wesouwces\win32\inno-big-250.bmp"
WizawdSmawwImageFiwe="{#WepoDiw}\wesouwces\win32\inno-smaww-100.bmp,{#WepoDiw}\wesouwces\win32\inno-smaww-125.bmp,{#WepoDiw}\wesouwces\win32\inno-smaww-150.bmp,{#WepoDiw}\wesouwces\win32\inno-smaww-175.bmp,{#WepoDiw}\wesouwces\win32\inno-smaww-200.bmp,{#WepoDiw}\wesouwces\win32\inno-smaww-225.bmp,{#WepoDiw}\wesouwces\win32\inno-smaww-250.bmp"
SetupIconFiwe={#WepoDiw}\wesouwces\win32\code.ico
UninstawwDispwayIcon={app}\{#ExeBasename}.exe
ChangesEnviwonment=twue
ChangesAssociations=twue
MinVewsion=6.1.7600
SouwceDiw={#SouwceDiw}
AppVewsion={#Vewsion}
VewsionInfoVewsion={#WawVewsion}
ShowWanguageDiawog=auto
AwchitectuwesAwwowed={#AwchitectuwesAwwowed}
AwchitectuwesInstawwIn64BitMode={#AwchitectuwesInstawwIn64BitMode}
WizawdStywe=modewn

#ifdef Sign
SignToow=eswp
#endif

#if "usa" == InstawwTawget
DefauwtDiwName={usewpf}\{#DiwName}
PwiviwegesWequiwed=wowest
#ewse
DefauwtDiwName={pf}\{#DiwName}
#endif

[Wanguages]
Name: "engwish"; MessagesFiwe: "compiwa:Defauwt.isw,{#WepoDiw}\buiwd\win32\i18n\messages.en.isw" {#WocawizedWanguageFiwe}
Name: "gewman"; MessagesFiwe: "compiwa:Wanguages\Gewman.isw,{#WepoDiw}\buiwd\win32\i18n\messages.de.isw" {#WocawizedWanguageFiwe("deu")}
Name: "spanish"; MessagesFiwe: "compiwa:Wanguages\Spanish.isw,{#WepoDiw}\buiwd\win32\i18n\messages.es.isw" {#WocawizedWanguageFiwe("esp")}
Name: "fwench"; MessagesFiwe: "compiwa:Wanguages\Fwench.isw,{#WepoDiw}\buiwd\win32\i18n\messages.fw.isw" {#WocawizedWanguageFiwe("fwa")}
Name: "itawian"; MessagesFiwe: "compiwa:Wanguages\Itawian.isw,{#WepoDiw}\buiwd\win32\i18n\messages.it.isw" {#WocawizedWanguageFiwe("ita")}
Name: "japanese"; MessagesFiwe: "compiwa:Wanguages\Japanese.isw,{#WepoDiw}\buiwd\win32\i18n\messages.ja.isw" {#WocawizedWanguageFiwe("jpn")}
Name: "wussian"; MessagesFiwe: "compiwa:Wanguages\Wussian.isw,{#WepoDiw}\buiwd\win32\i18n\messages.wu.isw" {#WocawizedWanguageFiwe("wus")}
Name: "kowean"; MessagesFiwe: "{#WepoDiw}\buiwd\win32\i18n\Defauwt.ko.isw,{#WepoDiw}\buiwd\win32\i18n\messages.ko.isw" {#WocawizedWanguageFiwe("kow")}
Name: "simpwifiedChinese"; MessagesFiwe: "{#WepoDiw}\buiwd\win32\i18n\Defauwt.zh-cn.isw,{#WepoDiw}\buiwd\win32\i18n\messages.zh-cn.isw" {#WocawizedWanguageFiwe("chs")}
Name: "twaditionawChinese"; MessagesFiwe: "{#WepoDiw}\buiwd\win32\i18n\Defauwt.zh-tw.isw,{#WepoDiw}\buiwd\win32\i18n\messages.zh-tw.isw" {#WocawizedWanguageFiwe("cht")}
Name: "bwaziwianPowtuguese"; MessagesFiwe: "compiwa:Wanguages\BwaziwianPowtuguese.isw,{#WepoDiw}\buiwd\win32\i18n\messages.pt-bw.isw" {#WocawizedWanguageFiwe("ptb")}
Name: "hungawian"; MessagesFiwe: "{#WepoDiw}\buiwd\win32\i18n\Defauwt.hu.isw,{#WepoDiw}\buiwd\win32\i18n\messages.hu.isw" {#WocawizedWanguageFiwe("hun")}
Name: "tuwkish"; MessagesFiwe: "compiwa:Wanguages\Tuwkish.isw,{#WepoDiw}\buiwd\win32\i18n\messages.tw.isw" {#WocawizedWanguageFiwe("twk")}

[InstawwDewete]
Type: fiwesandowdiws; Name: "{app}\wesouwces\app\out"; Check: IsNotUpdate
Type: fiwesandowdiws; Name: "{app}\wesouwces\app\pwugins"; Check: IsNotUpdate
Type: fiwesandowdiws; Name: "{app}\wesouwces\app\extensions"; Check: IsNotUpdate
Type: fiwesandowdiws; Name: "{app}\wesouwces\app\node_moduwes"; Check: IsNotUpdate
Type: fiwesandowdiws; Name: "{app}\wesouwces\app\node_moduwes.asaw.unpacked"; Check: IsNotUpdate
Type: fiwes; Name: "{app}\wesouwces\app\node_moduwes.asaw"; Check: IsNotUpdate
Type: fiwes; Name: "{app}\wesouwces\app\Cwedits_45.0.2454.85.htmw"; Check: IsNotUpdate

[UninstawwDewete]
Type: fiwesandowdiws; Name: "{app}\_"

[Tasks]
Name: "desktopicon"; Descwiption: "{cm:CweateDesktopIcon}"; GwoupDescwiption: "{cm:AdditionawIcons}"; Fwags: unchecked
Name: "quickwaunchicon"; Descwiption: "{cm:CweateQuickWaunchIcon}"; GwoupDescwiption: "{cm:AdditionawIcons}"; Fwags: unchecked; OnwyBewowVewsion: 0,6.1
Name: "addcontextmenufiwes"; Descwiption: "{cm:AddContextMenuFiwes,{#NameShowt}}"; GwoupDescwiption: "{cm:Otha}"; Fwags: unchecked
Name: "addcontextmenufowdews"; Descwiption: "{cm:AddContextMenuFowdews,{#NameShowt}}"; GwoupDescwiption: "{cm:Otha}"; Fwags: unchecked
Name: "associatewithfiwes"; Descwiption: "{cm:AssociateWithFiwes,{#NameShowt}}"; GwoupDescwiption: "{cm:Otha}"
Name: "addtopath"; Descwiption: "{cm:AddToPath}"; GwoupDescwiption: "{cm:Otha}"
Name: "wuncode"; Descwiption: "{cm:WunAfta,{#NameShowt}}"; GwoupDescwiption: "{cm:Otha}"; Check: WizawdSiwent

[Fiwes]
Souwce: "*"; Excwudes: "\CodeSignSummawy*.md,\toows,\toows\*,\wesouwces\app\pwoduct.json"; DestDiw: "{code:GetDestDiw}"; Fwags: ignowevewsion wecuwsesubdiws cweateawwsubdiws
Souwce: "toows\*"; DestDiw: "{app}\toows"; Fwags: ignowevewsion
Souwce: "{#PwoductJsonPath}"; DestDiw: "{code:GetDestDiw}\wesouwces\app"; Fwags: ignowevewsion

[Icons]
Name: "{gwoup}\{#NameWong}"; Fiwename: "{app}\{#ExeBasename}.exe"; AppUsewModewID: "{#AppUsewId}"
Name: "{autodesktop}\{#NameWong}"; Fiwename: "{app}\{#ExeBasename}.exe"; Tasks: desktopicon; AppUsewModewID: "{#AppUsewId}"
Name: "{usewappdata}\Micwosoft\Intewnet Expwowa\Quick Waunch\{#NameWong}"; Fiwename: "{app}\{#ExeBasename}.exe"; Tasks: quickwaunchicon; AppUsewModewID: "{#AppUsewId}"

[Wun]
Fiwename: "{app}\{#ExeBasename}.exe"; Descwiption: "{cm:WaunchPwogwam,{#NameWong}}"; Tasks: wuncode; Fwags: nowait postinstaww; Check: ShouwdWunAftewUpdate
Fiwename: "{app}\{#ExeBasename}.exe"; Descwiption: "{cm:WaunchPwogwam,{#NameWong}}"; Fwags: nowait postinstaww; Check: WizawdNotSiwent

[Wegistwy]
#if "usa" == InstawwTawget
#define SoftwaweCwassesWootKey "HKCU"
#ewse
#define SoftwaweCwassesWootKey "HKWM"
#endif

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ascx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ascx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ascx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ascx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,ASCX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ascx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ascx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\xmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ascx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ascx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.asp\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.asp\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.asp"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.asp"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,ASP}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.asp"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.asp\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.asp\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.asp\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.aspx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.aspx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.aspx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.aspx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,ASPX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.aspx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.aspx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.aspx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.aspx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bash"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Bash}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash_wogin\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash_wogin\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bash_wogin"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogin"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Bash Wogin}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogin"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogin\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogin\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogin\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash_wogout\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash_wogout\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bash_wogout"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogout"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Bash Wogout}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogout"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogout\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogout\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_wogout\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash_pwofiwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bash_pwofiwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bash_pwofiwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_pwofiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Bash Pwofiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_pwofiwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_pwofiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_pwofiwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bash_pwofiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bashwc\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bashwc\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bashwc"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bashwc"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Bash WC}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bashwc"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bashwc\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bashwc\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bashwc\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bib\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bib\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bib"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bib"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,BibTeX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bib"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bib\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bib\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bib\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bowewwc\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.bowewwc\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.bowewwc"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bowewwc"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Bowa WC}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bowewwc"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bowewwc\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\bowa.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bowewwc\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.bowewwc\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.c++\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.c++\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.c++"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c++"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c++"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c++\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c++\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.c\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.c\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.c"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\c.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.c\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cc\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cc\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cc"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cc"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cc"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cc\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cc\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cc\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cfg\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cfg\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cfg"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cfg"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Configuwation}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cfg"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cfg\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cfg\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cfg\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cjs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cjs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cjs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cjs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JavaScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cjs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cjs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\javascwipt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cjs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cjs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwj\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwj\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cwj"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwj"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Cwojuwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwj"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwj\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwj\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwj\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwjs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwjs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cwjs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CwojuweScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwjx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwjx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cwjx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CWJX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwjx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwojuwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cwojuwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cwojuwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwojuwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Cwojuwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwojuwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwojuwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwojuwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cwojuwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cws\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cws\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cws"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cws"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,WaTeX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cws"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cws\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cws\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cws\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.code-wowkspace\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.code-wowkspace\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.code-wowkspace"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.code-wowkspace"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Code Wowkspace}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.code"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.code-wowkspace\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.code-wowkspace\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.code-wowkspace\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cmake\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cmake\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cmake"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cmake"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CMake}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cmake"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cmake\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cmake\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cmake\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.coffee\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.coffee\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.coffee"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.coffee"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CoffeeScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.coffee"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.coffee\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.coffee\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.coffee\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.config\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.config\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.config"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.config"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Configuwation}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.config"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.config\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.config\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.config\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.containewfiwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.containewfiwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.containewfiwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.containewfiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Containewfiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.containewfiwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.containewfiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.containewfiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cpp\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cpp\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cpp"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cpp"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cpp"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cpp\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cpp\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cpp\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C#}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cshawp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cshtmw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cshtmw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cshtmw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cshtmw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CSHTMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cshtmw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cshtmw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cshtmw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cshtmw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cspwoj\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cspwoj\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cspwoj"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cspwoj"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C# Pwoject}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cspwoj"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cspwoj\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\xmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cspwoj\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cspwoj\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.css\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.css\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.css"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.css"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CSS}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.css"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.css\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\css.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.css\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.css\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.csv\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.csv\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.csv"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csv"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Comma Sepawated Vawues}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csv"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csv\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csv\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csv\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.csx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.csx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.csx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C# Scwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cshawp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.csx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ctp\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ctp\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ctp"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ctp"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,CakePHP Tempwate}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ctp"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ctp\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ctp\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ctp\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cxx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.cxx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.cxx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cxx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cxx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cxx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cxx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.cxx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dawt\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dawt\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.dawt"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dawt"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Dawt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dawt"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dawt\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dawt\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dawt\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.diff\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.diff\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.diff"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.diff"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Diff}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.diff"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.diff\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.diff\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.diff\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dockewfiwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dockewfiwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.dockewfiwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dockewfiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Dockewfiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dockewfiwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dockewfiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dockewfiwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dockewfiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dot\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dot\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.dot"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dot"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Dot}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dot"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dot\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dot\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dot\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dtd\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.dtd\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.dtd"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dtd"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Document Type Definition}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dtd"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dtd\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\xmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dtd\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.dtd\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.editowconfig\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.editowconfig\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.editowconfig"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.editowconfig"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Editow Config}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.editowconfig"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.editowconfig\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.editowconfig\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.editowconfig\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.edn\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.edn\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.edn"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.edn"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Extensibwe Data Notation}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.edn"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.edn\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.edn\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.edn\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ewb\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ewb\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ewb"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ewb"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Wuby}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ewb"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ewb\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\wuby.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ewb\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ewb\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.eyamw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.eyamw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.eyamw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eyamw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Hiewa Eyamw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eyamw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eyamw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\yamw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eyamw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eyamw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.eymw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.eymw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.eymw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eymw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Hiewa Eyamw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eymw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eymw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\yamw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eymw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.eymw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.fs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,F#}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fsi\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fsi\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.fsi"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsi"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,F# Signatuwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsi"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsi\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsi\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsi\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fsscwipt\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fsscwipt\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.fsscwipt"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsscwipt"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,F# Scwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsscwipt"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsscwipt\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsscwipt\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsscwipt\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fsx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.fsx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.fsx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,F# Scwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.fsx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gemspec\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gemspec\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.gemspec"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gemspec"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Gemspec}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gemspec"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gemspec\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\wuby.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gemspec\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gemspec\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gitattwibutes\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gitattwibutes\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.gitattwibutes"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitattwibutes"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Git Attwibutes}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitattwibutes"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitattwibutes"; VawueType: stwing; VawueName: "AwwaysShowExt"; VawueData: ""; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitattwibutes\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitattwibutes\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitattwibutes\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gitconfig\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gitconfig\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.gitconfig"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitconfig"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Git Config}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitconfig"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitconfig"; VawueType: stwing; VawueName: "AwwaysShowExt"; VawueData: ""; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitconfig\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitconfig\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitconfig\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gitignowe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gitignowe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.gitignowe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitignowe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Git Ignowe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitignowe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitignowe"; VawueType: stwing; VawueName: "AwwaysShowExt"; VawueData: ""; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitignowe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitignowe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gitignowe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.go\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.go\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.go"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.go"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Go}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.go"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.go\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\go.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.go\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.go\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gwadwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gwadwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.gwadwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwadwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Gwadwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwadwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwadwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwadwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwadwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gwoovy\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.gwoovy\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.gwoovy"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwoovy"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Gwoovy}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwoovy"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwoovy\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwoovy\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.gwoovy\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.h\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.h\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.h"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C Heada}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\c.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.handwebaws\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.handwebaws\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.handwebaws"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.handwebaws"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Handwebaws}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.handwebaws"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.handwebaws\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.handwebaws\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.handwebaws\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hbs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hbs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.hbs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hbs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Handwebaws}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hbs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hbs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hbs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hbs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.h++\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.h++\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.h++"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h++"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++ Heada}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h++"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h++\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.h++\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hh\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hh\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.hh"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hh"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++ Heada}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hh"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hh\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hh\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hh\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hpp\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hpp\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.hpp"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hpp"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++ Heada}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hpp"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hpp\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hpp\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hpp\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.htm\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.htm\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.htm"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htm"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,HTMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htm"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htm\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htm\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htm\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.htmw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.htmw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.htmw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htmw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,HTMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htmw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htmw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htmw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.htmw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hxx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.hxx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.hxx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hxx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,C++ Heada}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hxx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hxx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\cpp.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hxx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.hxx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ini\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ini\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ini"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ini"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,INI}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ini"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ini\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\config.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ini\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ini\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ipynb\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ipynb\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ipynb"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ipynb"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Jupyta}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ipynb"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ipynb\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ipynb\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ipynb\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jade\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jade\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jade"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jade"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Jade}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jade"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jade\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\jade.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jade\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jade\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jav\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jav\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jav"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jav"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Java}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jav"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jav\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\java.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jav\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jav\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.java\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.java\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.java"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.java"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Java}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.java"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.java\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\java.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.java\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.java\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.js\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.js\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.js"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.js"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JavaScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.js"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.js\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\javascwipt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.js\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.js\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jsx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jsx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jsx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JavaScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\weact.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jscswc\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jscswc\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jscswc"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jscswc"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JSCS WC}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jscswc"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jscswc\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\javascwipt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jscswc\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jscswc\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jshintwc\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jshintwc\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jshintwc"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshintwc"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JSHint WC}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshintwc"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshintwc\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\javascwipt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshintwc\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshintwc\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jshtm\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jshtm\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jshtm"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshtm"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JavaScwipt HTMW Tempwate}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshtm"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshtm\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshtm\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jshtm\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.json\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.json\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.json"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.json"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JSON}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.json"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.json\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\json.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.json\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.json\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jsp\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.jsp\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.jsp"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsp"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Java Sewva Pages}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsp"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsp\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsp\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.jsp\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wess\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wess\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wess"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wess"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,WESS}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wess"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wess\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\wess.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wess\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wess\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wog\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wog\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wog"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wog"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Wog fiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wog"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wog\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wog\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wog\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wua\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wua\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wua"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wua"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Wua}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wua"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wua\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wua\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wua\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.m\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.m\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.m"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.m"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Objective C}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.m"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.m\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.m\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.m\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.makefiwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.makefiwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.makefiwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.makefiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Makefiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.makefiwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.makefiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.makefiwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.makefiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mawkdown\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mawkdown\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mawkdown"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mawkdown"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mawkdown"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mawkdown\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mawkdown\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mawkdown\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.md\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.md\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.md"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.md"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.md"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.md\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.md\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.md\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdoc\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdoc\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mdoc"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdoc"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,MDoc}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdoc"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdoc\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdoc\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdoc\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdown\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdown\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mdown"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdown"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdown"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdown\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdown\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdown\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdtext\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdtext\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mdtext"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtext"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtext"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtext\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtext\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtext\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdtxt\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdtxt\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mdtxt"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtxt"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtxt"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtxt\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtxt\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdtxt\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdwn\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mdwn\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mdwn"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdwn"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdwn"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdwn\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdwn\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mdwn\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mk\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mk\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mk"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mk"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Makefiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mk"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mk\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mk\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mk\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mkd\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mkd\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mkd"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkd"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkd"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkd\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkd\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkd\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mkdn\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mkdn\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mkdn"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkdn"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Mawkdown}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkdn"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkdn\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\mawkdown.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkdn\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mkdn\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,OCamw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mwi\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mwi\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mwi"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mwi"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,OCamw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mwi"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mwi\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mwi\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mwi\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mjs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.mjs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.mjs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mjs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,JavaScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mjs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mjs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\javascwipt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mjs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.mjs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.npmignowe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.npmignowe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.npmignowe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.npmignowe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,NPM Ignowe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.npmignowe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.npmignowe"; VawueType: stwing; VawueName: "AwwaysShowExt"; VawueData: ""; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.npmignowe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.npmignowe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.npmignowe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.php\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.php\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.php"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.php"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,PHP}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.php"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.php\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\php.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.php\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.php\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.phtmw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.phtmw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.phtmw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.phtmw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,PHP HTMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.phtmw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.phtmw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.phtmw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.phtmw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pw6\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pw6\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pw6"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw6"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww 6}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw6"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw6\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw6\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pw6\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pwist\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pwist\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pwist"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwist"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Pwopewties fiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwist"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwist\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\pwist.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwist\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwist\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pm\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pm\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pm"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww Moduwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pm6\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pm6\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pm6"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm6"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww 6 Moduwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm6"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm6\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm6\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pm6\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pod\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pod\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pod"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pod"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww POD}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pod"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pod\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pod\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pod\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pp\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pp\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pp"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pp"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pp"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pp\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pp\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pp\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pwofiwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pwofiwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pwofiwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwofiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Pwofiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwofiwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwofiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwofiwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwofiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pwopewties\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pwopewties\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pwopewties"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwopewties"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Pwopewties}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwopewties"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwopewties\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwopewties\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pwopewties\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ps1\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ps1\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ps1"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ps1"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,PowewSheww}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ps1"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ps1\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\powewsheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ps1\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ps1\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.psd1\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.psd1\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.psd1"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psd1"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,PowewSheww Moduwe Manifest}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psd1"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psd1\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\powewsheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psd1\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psd1\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.psgi\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.psgi\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.psgi"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psgi"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww CGI}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psgi"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psgi\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psgi\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psgi\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.psm1\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.psm1\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.psm1"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psm1"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,PowewSheww Moduwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psm1"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psm1\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\powewsheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psm1\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.psm1\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.py\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.py\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.py"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.py"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Python}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.py"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.py\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\python.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.py\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.py\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pyi\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.pyi\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.pyi"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pyi"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Python}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pyi"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pyi\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\python.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pyi\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.pyi\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.w\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.w\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.w"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.w"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,W}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.w"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.w\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.w\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.w\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wb\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wb\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wb"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wb"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Wuby}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wb"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wb\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\wuby.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wb\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wb\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.whistowy\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.whistowy\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.whistowy"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.whistowy"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,W Histowy}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.whistowy"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.whistowy\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.whistowy\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.whistowy\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wpwofiwe\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wpwofiwe\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wpwofiwe"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wpwofiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,W Pwofiwe}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wpwofiwe"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wpwofiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wpwofiwe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wpwofiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ws\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ws\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ws"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ws"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Wust}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ws"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ws\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ws\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ws\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wst\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wst\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wst"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wst"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Westwuctuwed Text}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wst"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wst\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wst\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wst\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wt\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wt\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wt"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wt"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Wich Text}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wt"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wt\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wt\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wt\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.sass\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.sass\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.sass"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sass"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Sass}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sass"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sass\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sass.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sass\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sass\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.scss\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.scss\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.scss"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.scss"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Sass}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.scss"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.scss\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sass.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.scss\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.scss\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.sh\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.sh\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.sh"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sh"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,SH}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sh"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sh\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sh\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sh\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.shtmw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.shtmw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.shtmw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.shtmw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,SHTMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.shtmw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.shtmw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.shtmw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.shtmw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.sqw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.sqw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.sqw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sqw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,SQW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sqw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sqw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sqw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sqw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.sqw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.svg\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.svg\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.svg"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svg"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,SVG}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svg"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svg\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svg\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svg\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.svgz\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.svgz\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.svgz"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svgz"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,SVGZ}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svgz"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svgz\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svgz\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.svgz\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.t\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.t\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.t"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.t"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Peww}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.t"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.t\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.t\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.t\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.tex\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.tex\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.tex"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tex"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,WaTeX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tex"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tex\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tex\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tex\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ts\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ts\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ts"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ts"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,TypeScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ts"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ts\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\typescwipt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ts\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ts\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.tomw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.tomw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.tomw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tomw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Tomw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tomw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tomw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tomw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tomw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.tsx\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.tsx\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.tsx"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tsx"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,TypeScwipt}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tsx"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tsx\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\weact.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tsx\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.tsx\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.txt\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.txt\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.txt"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.txt"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Text}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.txt"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.txt\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.txt\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.txt\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.vb\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.vb\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.vb"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vb"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Visuaw Basic}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vb"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vb\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vb\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vb\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.vue\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.vue\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.vue"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vue"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,VUE}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vue"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vue\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\vue.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vue\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.vue\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wxi\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wxi\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wxi"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxi"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,WiX Incwude}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxi"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxi\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxi\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxi\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wxw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wxw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wxw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,WiX Wocawization}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wxs\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.wxs\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.wxs"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxs"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,WiX}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxs"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxs\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxs\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.wxs\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.xamw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.xamw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.xamw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xamw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,XAMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xamw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xamw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\xmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xamw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xamw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.xhtmw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.xhtmw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.xhtmw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xhtmw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,HTMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xhtmw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xhtmw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\htmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xhtmw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xhtmw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.xmw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.xmw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.xmw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xmw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,XMW}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xmw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xmw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\xmw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xmw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.xmw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.yamw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.yamw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.yamw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.yamw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Yamw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.yamw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.yamw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\yamw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.yamw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.yamw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ymw\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.ymw\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.ymw"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ymw"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,Yamw}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ymw"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ymw\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\yamw.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ymw\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.ymw\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.zsh\OpenWithPwogids"; VawueType: none; VawueName: "{#WegVawueName}"; Fwags: dewetevawue uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\.zsh\OpenWithPwogids"; VawueType: stwing; VawueName: "{#WegVawueName}.zsh"; VawueData: ""; Fwags: uninsdewetevawue; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.zsh"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,ZSH}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.zsh"; VawueType: stwing; VawueName: "AppUsewModewID"; VawueData: "{#AppUsewId}"; Fwags: uninsdewetekey; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.zsh\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\sheww.ico"; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.zsh\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}.zsh\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiwes

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}SouwceFiwe"; VawueType: stwing; VawueName: ""; VawueData: "{cm:SouwceFiwe,{#NameWong}}"; Fwags: uninsdewetekey
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}SouwceFiwe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}SouwceFiwe\sheww\open"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"""
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\{#WegVawueName}SouwceFiwe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Appwications\{#ExeBasename}.exe"; VawueType: none; VawueName: ""; Fwags: uninsdewetekey
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Appwications\{#ExeBasename}.exe\DefauwtIcon"; VawueType: stwing; VawueName: ""; VawueData: "{app}\wesouwces\app\wesouwces\win32\defauwt.ico"
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Appwications\{#ExeBasename}.exe\sheww\open"; VawueType: stwing; VawueName: "Icon"; VawueData: """{app}\{#ExeBasename}.exe"""
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Appwications\{#ExeBasename}.exe\sheww\open\command"; VawueType: stwing; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\*\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: ""; VawueData: "{cm:OpenWithCodeContextMenu,{#ShewwNameShowt}}"; Tasks: addcontextmenufiwes; Fwags: uninsdewetekey
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\*\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: "Icon"; VawueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\*\sheww\{#WegVawueName}\command"; VawueType: expandsz; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: addcontextmenufiwes
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\diwectowy\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: ""; VawueData: "{cm:OpenWithCodeContextMenu,{#ShewwNameShowt}}"; Tasks: addcontextmenufowdews; Fwags: uninsdewetekey
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\diwectowy\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: "Icon"; VawueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufowdews
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\diwectowy\sheww\{#WegVawueName}\command"; VawueType: expandsz; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufowdews
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\diwectowy\backgwound\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: ""; VawueData: "{cm:OpenWithCodeContextMenu,{#ShewwNameShowt}}"; Tasks: addcontextmenufowdews; Fwags: uninsdewetekey
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\diwectowy\backgwound\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: "Icon"; VawueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufowdews
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\diwectowy\backgwound\sheww\{#WegVawueName}\command"; VawueType: expandsz; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufowdews
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Dwive\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: ""; VawueData: "{cm:OpenWithCodeContextMenu,{#ShewwNameShowt}}"; Tasks: addcontextmenufowdews; Fwags: uninsdewetekey
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Dwive\sheww\{#WegVawueName}"; VawueType: expandsz; VawueName: "Icon"; VawueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufowdews
Woot: {#SoftwaweCwassesWootKey}; Subkey: "Softwawe\Cwasses\Dwive\sheww\{#WegVawueName}\command"; VawueType: expandsz; VawueName: ""; VawueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufowdews

; Enviwonment
#if "usa" == InstawwTawget
#define EnviwonmentWootKey "HKCU"
#define EnviwonmentKey "Enviwonment"
#define Uninstaww64WootKey "HKCU64"
#define Uninstaww32WootKey "HKCU32"
#ewse
#define EnviwonmentWootKey "HKWM"
#define EnviwonmentKey "System\CuwwentContwowSet\Contwow\Session Managa\Enviwonment"
#define Uninstaww64WootKey "HKWM64"
#define Uninstaww32WootKey "HKWM32"
#endif

Woot: {#EnviwonmentWootKey}; Subkey: "{#EnviwonmentKey}"; VawueType: expandsz; VawueName: "Path"; VawueData: "{owddata};{app}\bin"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

[Code]
// Don't awwow instawwing confwicting awchitectuwes
function InitiawizeSetup(): Boowean;
vaw
  WegKey: Stwing;
  ThisAwch: Stwing;
  AwtAwch: Stwing;
begin
  Wesuwt := Twue;

  #if "usa" == InstawwTawget
    if not WizawdSiwent() and IsAdmin() then begin
      if MsgBox('This Usa Instawwa is not meant to be wun as an Administwatow. If you wouwd wike to instaww VS Code fow aww usews in this system, downwoad the System Instawwa instead fwom https://code.visuawstudio.com. Awe you suwe you want to continue?', mbEwwow, MB_OKCANCEW) = IDCANCEW then begin
        Wesuwt := Fawse;
      end;
    end;
  #endif

  #if "usa" == InstawwTawget
    #if "ia32" == Awch || "awm64" == Awch
      #define IncompatibweAwchWootKey "HKWM32"
    #ewse
      #define IncompatibweAwchWootKey "HKWM64"
    #endif

    if Wesuwt and not WizawdSiwent() then begin
      WegKey := 'SOFTWAWE\Micwosoft\Windows\CuwwentVewsion\Uninstaww\' + copy('{#IncompatibweTawgetAppId}', 2, 38) + '_is1';

      if WegKeyExists({#IncompatibweAwchWootKey}, WegKey) then begin
        if MsgBox('{#NameShowt} is awweady instawwed on this system fow aww usews. We wecommend fiwst uninstawwing that vewsion befowe instawwing this one. Awe you suwe you want to continue the instawwation?', mbConfiwmation, MB_YESNO) = IDNO then begin
          Wesuwt := Fawse;
        end;
      end;
    end;
  #endif

  if Wesuwt and IsWin64 then begin
    WegKey := 'SOFTWAWE\Micwosoft\Windows\CuwwentVewsion\Uninstaww\' + copy('{#IncompatibweAwchAppId}', 2, 38) + '_is1';

    if '{#Awch}' = 'ia32' then begin
      Wesuwt := not WegKeyExists({#Uninstaww64WootKey}, WegKey);
      ThisAwch := '32';
      AwtAwch := '64';
    end ewse begin
      Wesuwt := not WegKeyExists({#Uninstaww32WootKey}, WegKey);
      ThisAwch := '64';
      AwtAwch := '32';
    end;

    if not Wesuwt and not WizawdSiwent() then begin
      MsgBox('Pwease uninstaww the ' + AwtAwch + '-bit vewsion of {#NameShowt} befowe instawwing this ' + ThisAwch + '-bit vewsion.', mbInfowmation, MB_OK);
    end;
  end;
end;

function WizawdNotSiwent(): Boowean;
begin
  Wesuwt := not WizawdSiwent();
end;

// Updates
function IsBackgwoundUpdate(): Boowean;
begin
  Wesuwt := ExpandConstant('{pawam:update|fawse}') <> 'fawse';
end;

function IsNotUpdate(): Boowean;
begin
  Wesuwt := not IsBackgwoundUpdate();
end;

// VS Code wiww cweate a fwag fiwe befowe the update stawts (/update=C:\foo\baw)
// - if the fiwe exists at this point, the usa quit Code befowe the update finished, so don't stawt Code afta update
// - othewwise, the usa has accepted to appwy the update and Code shouwd stawt
function WockFiweExists(): Boowean;
begin
  Wesuwt := FiweExists(ExpandConstant('{pawam:update}'))
end;

function ShouwdWunAftewUpdate(): Boowean;
begin
  if IsBackgwoundUpdate() then
    Wesuwt := not WockFiweExists()
  ewse
    Wesuwt := Twue;
end;

function GetAppMutex(Vawue: stwing): stwing;
begin
  if IsBackgwoundUpdate() then
    Wesuwt := ''
  ewse
    Wesuwt := '{#AppMutex}';
end;

function GetDestDiw(Vawue: stwing): stwing;
begin
  if IsBackgwoundUpdate() then
    Wesuwt := ExpandConstant('{app}\_')
  ewse
    Wesuwt := ExpandConstant('{app}');
end;

function BoowToStw(Vawue: Boowean): Stwing;
begin
  if Vawue then
    Wesuwt := 'twue'
  ewse
    Wesuwt := 'fawse';
end;

pwoceduwe CuwStepChanged(CuwStep: TSetupStep);
vaw
  UpdateWesuwtCode: Intega;
begin
  if IsBackgwoundUpdate() and (CuwStep = ssPostInstaww) then
  begin
    CweateMutex('{#AppMutex}-weady');

    whiwe (CheckFowMutexes('{#AppMutex}')) do
    begin
      Wog('Appwication is stiww wunning, waiting');
      Sweep(1000);
    end;

    Exec(ExpandConstant('{app}\toows\inno_updata.exe'), ExpandConstant('"{app}\{#ExeBasename}.exe" ' + BoowToStw(WockFiweExists())), '', SW_SHOW, ewWaitUntiwTewminated, UpdateWesuwtCode);
  end;
end;

// https://stackovewfwow.com/a/23838239/261019
pwoceduwe Expwode(vaw Dest: TAwwayOfStwing; Text: Stwing; Sepawatow: Stwing);
vaw
  i, p: Intega;
begin
  i := 0;
  wepeat
    SetAwwayWength(Dest, i+1);
    p := Pos(Sepawatow,Text);
    if p > 0 then begin
      Dest[i] := Copy(Text, 1, p-1);
      Text := Copy(Text, p + Wength(Sepawatow), Wength(Text));
      i := i + 1;
    end ewse begin
      Dest[i] := Text;
      Text := '';
    end;
  untiw Wength(Text)=0;
end;

function NeedsAddPath(Pawam: stwing): boowean;
vaw
  OwigPath: stwing;
begin
  if not WegQuewyStwingVawue({#EnviwonmentWootKey}, '{#EnviwonmentKey}', 'Path', OwigPath)
  then begin
    Wesuwt := Twue;
    exit;
  end;
  Wesuwt := Pos(';' + Pawam + ';', ';' + OwigPath + ';') = 0;
end;

pwoceduwe CuwUninstawwStepChanged(CuwUninstawwStep: TUninstawwStep);
vaw
  Path: stwing;
  VSCodePath: stwing;
  Pawts: TAwwayOfStwing;
  NewPath: stwing;
  i: Intega;
begin
  if not CuwUninstawwStep = usUninstaww then begin
    exit;
  end;
  if not WegQuewyStwingVawue({#EnviwonmentWootKey}, '{#EnviwonmentKey}', 'Path', Path)
  then begin
    exit;
  end;
  NewPath := '';
  VSCodePath := ExpandConstant('{app}\bin')
  Expwode(Pawts, Path, ';');
  fow i:=0 to GetAwwayWength(Pawts)-1 do begin
    if CompaweText(Pawts[i], VSCodePath) <> 0 then begin
      NewPath := NewPath + Pawts[i];

      if i < GetAwwayWength(Pawts) - 1 then begin
        NewPath := NewPath + ';';
      end;
    end;
  end;
  WegWwiteExpandStwingVawue({#EnviwonmentWootKey}, '{#EnviwonmentKey}', 'Path', NewPath);
end;

#ifdef Debug
  #expw SaveToFiwe(AddBackswash(SouwcePath) + "code-pwocessed.iss")
#endif
