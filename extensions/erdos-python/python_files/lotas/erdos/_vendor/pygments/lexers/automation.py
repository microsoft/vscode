"""
    pygments.lexers.automation
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for automation scripting languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups, combined
from lotas.erdos._vendor.pygments.token import Text, Comment, Operator, Name, String, \
    Number, Punctuation, Generic

__all__ = ['AutohotkeyLexer', 'AutoItLexer']


class AutohotkeyLexer(RegexLexer):
    """
    For autohotkey source code.
    """
    name = 'autohotkey'
    url = 'http://www.autohotkey.com/'
    aliases = ['autohotkey', 'ahk']
    filenames = ['*.ahk', '*.ahkl']
    mimetypes = ['text/x-autohotkey']
    version_added = '1.4'

    tokens = {
        'root': [
            (r'^(\s*)(/\*)', bygroups(Text, Comment.Multiline), 'incomment'),
            (r'^(\s*)(\()', bygroups(Text, Generic), 'incontinuation'),
            (r'\s+;.*?$', Comment.Single),
            (r'^;.*?$', Comment.Single),
            (r'[]{}(),;[]', Punctuation),
            (r'(in|is|and|or|not)\b', Operator.Word),
            (r'\%[a-zA-Z_#@$][\w#@$]*\%', Name.Variable),
            (r'!=|==|:=|\.=|<<|>>|[-~+/*%=<>&^|?:!.]', Operator),
            include('commands'),
            include('labels'),
            include('builtInFunctions'),
            include('builtInVariables'),
            (r'"', String, combined('stringescape', 'dqs')),
            include('numbers'),
            (r'[a-zA-Z_#@$][\w#@$]*', Name),
            (r'\\|\'', Text),
            (r'\`([,%`abfnrtv\-+;])', String.Escape),
            include('garbage'),
        ],
        'incomment': [
            (r'^\s*\*/', Comment.Multiline, '#pop'),
            (r'[^*]+', Comment.Multiline),
            (r'\*', Comment.Multiline)
        ],
        'incontinuation': [
            (r'^\s*\)', Generic, '#pop'),
            (r'[^)]', Generic),
            (r'[)]', Generic),
        ],
        'commands': [
            (r'(?i)^(\s*)(global|local|static|'
             r'#AllowSameLineComments|#ClipboardTimeout|#CommentFlag|'
             r'#ErrorStdOut|#EscapeChar|#HotkeyInterval|#HotkeyModifierTimeout|'
             r'#Hotstring|#IfWinActive|#IfWinExist|#IfWinNotActive|'
             r'#IfWinNotExist|#IncludeAgain|#Include|#InstallKeybdHook|'
             r'#InstallMouseHook|#KeyHistory|#LTrim|#MaxHotkeysPerInterval|'
             r'#MaxMem|#MaxThreads|#MaxThreadsBuffer|#MaxThreadsPerHotkey|'
             r'#NoEnv|#NoTrayIcon|#Persistent|#SingleInstance|#UseHook|'
             r'#WinActivateForce|AutoTrim|BlockInput|Break|Click|ClipWait|'
             r'Continue|Control|ControlClick|ControlFocus|ControlGetFocus|'
             r'ControlGetPos|ControlGetText|ControlGet|ControlMove|ControlSend|'
             r'ControlSendRaw|ControlSetText|CoordMode|Critical|'
             r'DetectHiddenText|DetectHiddenWindows|Drive|DriveGet|'
             r'DriveSpaceFree|Edit|Else|EnvAdd|EnvDiv|EnvGet|EnvMult|EnvSet|'
             r'EnvSub|EnvUpdate|Exit|ExitApp|FileAppend|'
             r'FileCopy|FileCopyDir|FileCreateDir|FileCreateShortcut|'
             r'FileDelete|FileGetAttrib|FileGetShortcut|FileGetSize|'
             r'FileGetTime|FileGetVersion|FileInstall|FileMove|FileMoveDir|'
             r'FileRead|FileReadLine|FileRecycle|FileRecycleEmpty|'
             r'FileRemoveDir|FileSelectFile|FileSelectFolder|FileSetAttrib|'
             r'FileSetTime|FormatTime|GetKeyState|Gosub|Goto|GroupActivate|'
             r'GroupAdd|GroupClose|GroupDeactivate|Gui|GuiControl|'
             r'GuiControlGet|Hotkey|IfEqual|IfExist|IfGreaterOrEqual|IfGreater|'
             r'IfInString|IfLess|IfLessOrEqual|IfMsgBox|IfNotEqual|IfNotExist|'
             r'IfNotInString|IfWinActive|IfWinExist|IfWinNotActive|'
             r'IfWinNotExist|If |ImageSearch|IniDelete|IniRead|IniWrite|'
             r'InputBox|Input|KeyHistory|KeyWait|ListHotkeys|ListLines|'
             r'ListVars|Loop|Menu|MouseClickDrag|MouseClick|MouseGetPos|'
             r'MouseMove|MsgBox|OnExit|OutputDebug|Pause|PixelGetColor|'
             r'PixelSearch|PostMessage|Process|Progress|Random|RegDelete|'
             r'RegRead|RegWrite|Reload|Repeat|Return|RunAs|RunWait|Run|'
             r'SendEvent|SendInput|SendMessage|SendMode|SendPlay|SendRaw|Send|'
             r'SetBatchLines|SetCapslockState|SetControlDelay|'
             r'SetDefaultMouseSpeed|SetEnv|SetFormat|SetKeyDelay|'
             r'SetMouseDelay|SetNumlockState|SetScrollLockState|'
             r'SetStoreCapslockMode|SetTimer|SetTitleMatchMode|'
             r'SetWinDelay|SetWorkingDir|Shutdown|Sleep|Sort|SoundBeep|'
             r'SoundGet|SoundGetWaveVolume|SoundPlay|SoundSet|'
             r'SoundSetWaveVolume|SplashImage|SplashTextOff|SplashTextOn|'
             r'SplitPath|StatusBarGetText|StatusBarWait|StringCaseSense|'
             r'StringGetPos|StringLeft|StringLen|StringLower|StringMid|'
             r'StringReplace|StringRight|StringSplit|StringTrimLeft|'
             r'StringTrimRight|StringUpper|Suspend|SysGet|Thread|ToolTip|'
             r'Transform|TrayTip|URLDownloadToFile|While|WinActivate|'
             r'WinActivateBottom|WinClose|WinGetActiveStats|WinGetActiveTitle|'
             r'WinGetClass|WinGetPos|WinGetText|WinGetTitle|WinGet|WinHide|'
             r'WinKill|WinMaximize|WinMenuSelectItem|WinMinimizeAllUndo|'
             r'WinMinimizeAll|WinMinimize|WinMove|WinRestore|WinSetTitle|'
             r'WinSet|WinShow|WinWaitActive|WinWaitClose|WinWaitNotActive|'
             r'WinWait)\b', bygroups(Text, Name.Builtin)),
        ],
        'builtInFunctions': [
            (r'(?i)(Abs|ACos|Asc|ASin|ATan|Ceil|Chr|Cos|DllCall|Exp|FileExist|'
             r'Floor|GetKeyState|IL_Add|IL_Create|IL_Destroy|InStr|IsFunc|'
             r'IsLabel|Ln|Log|LV_Add|LV_Delete|LV_DeleteCol|LV_GetCount|'
             r'LV_GetNext|LV_GetText|LV_Insert|LV_InsertCol|LV_Modify|'
             r'LV_ModifyCol|LV_SetImageList|Mod|NumGet|NumPut|OnMessage|'
             r'RegExMatch|RegExReplace|RegisterCallback|Round|SB_SetIcon|'
             r'SB_SetParts|SB_SetText|Sin|Sqrt|StrLen|SubStr|Tan|TV_Add|'
             r'TV_Delete|TV_GetChild|TV_GetCount|TV_GetNext|TV_Get|'
             r'TV_GetParent|TV_GetPrev|TV_GetSelection|TV_GetText|TV_Modify|'
             r'VarSetCapacity|WinActive|WinExist|Object|ComObjActive|'
             r'ComObjArray|ComObjEnwrap|ComObjUnwrap|ComObjParameter|'
             r'ComObjType|ComObjConnect|ComObjCreate|ComObjGet|ComObjError|'
             r'ComObjValue|Insert|MinIndex|MaxIndex|Remove|SetCapacity|'
             r'GetCapacity|GetAddress|_NewEnum|FileOpen|Read|Write|ReadLine|'
             r'WriteLine|ReadNumType|WriteNumType|RawRead|RawWrite|Seek|Tell|'
             r'Close|Next|IsObject|StrPut|StrGet|Trim|LTrim|RTrim)\b',
             Name.Function),
        ],
        'builtInVariables': [
            (r'(?i)(A_AhkPath|A_AhkVersion|A_AppData|A_AppDataCommon|'
             r'A_AutoTrim|A_BatchLines|A_CaretX|A_CaretY|A_ComputerName|'
             r'A_ControlDelay|A_Cursor|A_DDDD|A_DDD|A_DD|A_DefaultMouseSpeed|'
             r'A_Desktop|A_DesktopCommon|A_DetectHiddenText|'
             r'A_DetectHiddenWindows|A_EndChar|A_EventInfo|A_ExitReason|'
             r'A_FormatFloat|A_FormatInteger|A_Gui|A_GuiEvent|A_GuiControl|'
             r'A_GuiControlEvent|A_GuiHeight|A_GuiWidth|A_GuiX|A_GuiY|A_Hour|'
             r'A_IconFile|A_IconHidden|A_IconNumber|A_IconTip|A_Index|'
             r'A_IPAddress1|A_IPAddress2|A_IPAddress3|A_IPAddress4|A_ISAdmin|'
             r'A_IsCompiled|A_IsCritical|A_IsPaused|A_IsSuspended|A_KeyDelay|'
             r'A_Language|A_LastError|A_LineFile|A_LineNumber|A_LoopField|'
             r'A_LoopFileAttrib|A_LoopFileDir|A_LoopFileExt|A_LoopFileFullPath|'
             r'A_LoopFileLongPath|A_LoopFileName|A_LoopFileShortName|'
             r'A_LoopFileShortPath|A_LoopFileSize|A_LoopFileSizeKB|'
             r'A_LoopFileSizeMB|A_LoopFileTimeAccessed|A_LoopFileTimeCreated|'
             r'A_LoopFileTimeModified|A_LoopReadLine|A_LoopRegKey|'
             r'A_LoopRegName|A_LoopRegSubkey|A_LoopRegTimeModified|'
             r'A_LoopRegType|A_MDAY|A_Min|A_MM|A_MMM|A_MMMM|A_Mon|A_MouseDelay|'
             r'A_MSec|A_MyDocuments|A_Now|A_NowUTC|A_NumBatchLines|A_OSType|'
             r'A_OSVersion|A_PriorHotkey|A_ProgramFiles|A_Programs|'
             r'A_ProgramsCommon|A_ScreenHeight|A_ScreenWidth|A_ScriptDir|'
             r'A_ScriptFullPath|A_ScriptName|A_Sec|A_Space|A_StartMenu|'
             r'A_StartMenuCommon|A_Startup|A_StartupCommon|A_StringCaseSense|'
             r'A_Tab|A_Temp|A_ThisFunc|A_ThisHotkey|A_ThisLabel|A_ThisMenu|'
             r'A_ThisMenuItem|A_ThisMenuItemPos|A_TickCount|A_TimeIdle|'
             r'A_TimeIdlePhysical|A_TimeSincePriorHotkey|A_TimeSinceThisHotkey|'
             r'A_TitleMatchMode|A_TitleMatchModeSpeed|A_UserName|A_WDay|'
             r'A_WinDelay|A_WinDir|A_WorkingDir|A_YDay|A_YEAR|A_YWeek|A_YYYY|'
             r'Clipboard|ClipboardAll|ComSpec|ErrorLevel|ProgramFiles|True|'
             r'False|A_IsUnicode|A_FileEncoding|A_OSVersion|A_PtrSize)\b',
             Name.Variable),
        ],
        'labels': [
            # hotkeys and labels
            # technically, hotkey names are limited to named keys and buttons
            (r'(^\s*)([^:\s("]+?:{1,2})', bygroups(Text, Name.Label)),
            (r'(^\s*)(::[^:\s]+?::)', bygroups(Text, Name.Label)),
        ],
        'numbers': [
            (r'(\d+\.\d*|\d*\.\d+)([eE][+-]?[0-9]+)?', Number.Float),
            (r'\d+[eE][+-]?[0-9]+', Number.Float),
            (r'0\d+', Number.Oct),
            (r'0[xX][a-fA-F0-9]+', Number.Hex),
            (r'\d+L', Number.Integer.Long),
            (r'\d+', Number.Integer)
        ],
        'stringescape': [
            (r'\"\"|\`([,%`abfnrtv])', String.Escape),
        ],
        'strings': [
            (r'[^"\n]+', String),
        ],
        'dqs': [
            (r'"', String, '#pop'),
            include('strings')
        ],
        'garbage': [
            (r'[^\S\n]', Text),
            # (r'.', Text),      # no cheating
        ],
    }


class AutoItLexer(RegexLexer):
    """
    For AutoIt files.

    AutoIt is a freeware BASIC-like scripting language
    designed for automating the Windows GUI and general scripting
    """
    name = 'AutoIt'
    url = 'http://www.autoitscript.com/site/autoit/'
    aliases = ['autoit']
    filenames = ['*.au3']
    mimetypes = ['text/x-autoit']
    version_added = '1.6'

    # Keywords, functions, macros from au3.keywords.properties
    # which can be found in AutoIt installed directory, e.g.
    # c:\Program Files (x86)\AutoIt3\SciTE\au3.keywords.properties

    keywords = """\
    #include-once #include #endregion #forcedef #forceref #region
    and byref case continueloop dim do else elseif endfunc endif
    endselect exit exitloop for func global
    if local next not or return select step
    then to until wend while exit""".split()

    functions = """\
    abs acos adlibregister adlibunregister asc ascw asin assign atan
    autoitsetoption autoitwingettitle autoitwinsettitle beep binary binarylen
    binarymid binarytostring bitand bitnot bitor bitrotate bitshift bitxor
    blockinput break call cdtray ceiling chr chrw clipget clipput consoleread
    consolewrite consolewriteerror controlclick controlcommand controldisable
    controlenable controlfocus controlgetfocus controlgethandle controlgetpos
    controlgettext controlhide controllistview controlmove controlsend
    controlsettext controlshow controltreeview cos dec dircopy dircreate
    dirgetsize dirmove dirremove dllcall dllcalladdress dllcallbackfree
    dllcallbackgetptr dllcallbackregister dllclose dllopen dllstructcreate
    dllstructgetdata dllstructgetptr dllstructgetsize dllstructsetdata
    drivegetdrive drivegetfilesystem drivegetlabel drivegetserial drivegettype
    drivemapadd drivemapdel drivemapget drivesetlabel drivespacefree
    drivespacetotal drivestatus envget envset envupdate eval execute exp
    filechangedir fileclose filecopy filecreatentfslink filecreateshortcut
    filedelete fileexists filefindfirstfile filefindnextfile fileflush
    filegetattrib filegetencoding filegetlongname filegetpos filegetshortcut
    filegetshortname filegetsize filegettime filegetversion fileinstall filemove
    fileopen fileopendialog fileread filereadline filerecycle filerecycleempty
    filesavedialog fileselectfolder filesetattrib filesetpos filesettime
    filewrite filewriteline floor ftpsetproxy guicreate guictrlcreateavi
    guictrlcreatebutton guictrlcreatecheckbox guictrlcreatecombo
    guictrlcreatecontextmenu guictrlcreatedate guictrlcreatedummy
    guictrlcreateedit guictrlcreategraphic guictrlcreategroup guictrlcreateicon
    guictrlcreateinput guictrlcreatelabel guictrlcreatelist
    guictrlcreatelistview guictrlcreatelistviewitem guictrlcreatemenu
    guictrlcreatemenuitem guictrlcreatemonthcal guictrlcreateobj
    guictrlcreatepic guictrlcreateprogress guictrlcreateradio
    guictrlcreateslider guictrlcreatetab guictrlcreatetabitem
    guictrlcreatetreeview guictrlcreatetreeviewitem guictrlcreateupdown
    guictrldelete guictrlgethandle guictrlgetstate guictrlread guictrlrecvmsg
    guictrlregisterlistviewsort guictrlsendmsg guictrlsendtodummy
    guictrlsetbkcolor guictrlsetcolor guictrlsetcursor guictrlsetdata
    guictrlsetdefbkcolor guictrlsetdefcolor guictrlsetfont guictrlsetgraphic
    guictrlsetimage guictrlsetlimit guictrlsetonevent guictrlsetpos
    guictrlsetresizing guictrlsetstate guictrlsetstyle guictrlsettip guidelete
    guigetcursorinfo guigetmsg guigetstyle guiregistermsg guisetaccelerators
    guisetbkcolor guisetcoord guisetcursor guisetfont guisethelp guiseticon
    guisetonevent guisetstate guisetstyle guistartgroup guiswitch hex hotkeyset
    httpsetproxy httpsetuseragent hwnd inetclose inetget inetgetinfo inetgetsize
    inetread inidelete iniread inireadsection inireadsectionnames
    inirenamesection iniwrite iniwritesection inputbox int isadmin isarray
    isbinary isbool isdeclared isdllstruct isfloat ishwnd isint iskeyword
    isnumber isobj isptr isstring log memgetstats mod mouseclick mouseclickdrag
    mousedown mousegetcursor mousegetpos mousemove mouseup mousewheel msgbox
    number objcreate objcreateinterface objevent objevent objget objname
    onautoitexitregister onautoitexitunregister opt ping pixelchecksum
    pixelgetcolor pixelsearch pluginclose pluginopen processclose processexists
    processgetstats processlist processsetpriority processwait processwaitclose
    progressoff progresson progressset ptr random regdelete regenumkey
    regenumval regread regwrite round run runas runaswait runwait send
    sendkeepactive seterror setextended shellexecute shellexecutewait shutdown
    sin sleep soundplay soundsetwavevolume splashimageon splashoff splashtexton
    sqrt srandom statusbargettext stderrread stdinwrite stdioclose stdoutread
    string stringaddcr stringcompare stringformat stringfromasciiarray
    stringinstr stringisalnum stringisalpha stringisascii stringisdigit
    stringisfloat stringisint stringislower stringisspace stringisupper
    stringisxdigit stringleft stringlen stringlower stringmid stringregexp
    stringregexpreplace stringreplace stringright stringsplit stringstripcr
    stringstripws stringtoasciiarray stringtobinary stringtrimleft
    stringtrimright stringupper tan tcpaccept tcpclosesocket tcpconnect
    tcplisten tcpnametoip tcprecv tcpsend tcpshutdown tcpstartup timerdiff
    timerinit tooltip traycreateitem traycreatemenu traygetmsg trayitemdelete
    trayitemgethandle trayitemgetstate trayitemgettext trayitemsetonevent
    trayitemsetstate trayitemsettext traysetclick trayseticon traysetonevent
    traysetpauseicon traysetstate traysettooltip traytip ubound udpbind
    udpclosesocket udpopen udprecv udpsend udpshutdown udpstartup vargettype
    winactivate winactive winclose winexists winflash wingetcaretpos
    wingetclasslist wingetclientsize wingethandle wingetpos wingetprocess
    wingetstate wingettext wingettitle winkill winlist winmenuselectitem
    winminimizeall winminimizeallundo winmove winsetontop winsetstate
    winsettitle winsettrans winwait winwaitactive winwaitclose
    winwaitnotactive""".split()

    macros = """\
    @appdatacommondir @appdatadir @autoitexe @autoitpid @autoitversion
    @autoitx64 @com_eventobj @commonfilesdir @compiled @computername @comspec
    @cpuarch @cr @crlf @desktopcommondir @desktopdepth @desktopdir
    @desktopheight @desktoprefresh @desktopwidth @documentscommondir @error
    @exitcode @exitmethod @extended @favoritescommondir @favoritesdir
    @gui_ctrlhandle @gui_ctrlid @gui_dragfile @gui_dragid @gui_dropid
    @gui_winhandle @homedrive @homepath @homeshare @hotkeypressed @hour
    @ipaddress1 @ipaddress2 @ipaddress3 @ipaddress4 @kblayout @lf
    @logondnsdomain @logondomain @logonserver @mday @min @mon @msec @muilang
    @mydocumentsdir @numparams @osarch @osbuild @oslang @osservicepack @ostype
    @osversion @programfilesdir @programscommondir @programsdir @scriptdir
    @scriptfullpath @scriptlinenumber @scriptname @sec @startmenucommondir
    @startmenudir @startupcommondir @startupdir @sw_disable @sw_enable @sw_hide
    @sw_lock @sw_maximize @sw_minimize @sw_restore @sw_show @sw_showdefault
    @sw_showmaximized @sw_showminimized @sw_showminnoactive @sw_showna
    @sw_shownoactivate @sw_shownormal @sw_unlock @systemdir @tab @tempdir
    @tray_id @trayiconflashing @trayiconvisible @username @userprofiledir @wday
    @windowsdir @workingdir @yday @year""".split()

    tokens = {
        'root': [
            (r';.*\n', Comment.Single),
            (r'(#comments-start|#cs)(.|\n)*?(#comments-end|#ce)',
             Comment.Multiline),
            (r'[\[\]{}(),;]', Punctuation),
            (r'(and|or|not)\b', Operator.Word),
            (r'[$|@][a-zA-Z_]\w*', Name.Variable),
            (r'!=|==|:=|\.=|<<|>>|[-~+/*%=<>&^|?:!.]', Operator),
            include('commands'),
            include('labels'),
            include('builtInFunctions'),
            include('builtInMarcros'),
            (r'"', String, combined('stringescape', 'dqs')),
            (r"'", String, 'sqs'),
            include('numbers'),
            (r'[a-zA-Z_#@$][\w#@$]*', Name),
            (r'\\|\'', Text),
            (r'\`([,%`abfnrtv\-+;])', String.Escape),
            (r'_\n', Text),  # Line continuation
            include('garbage'),
        ],
        'commands': [
            (r'(?i)(\s*)({})\b'.format('|'.join(keywords)),
             bygroups(Text, Name.Builtin)),
        ],
        'builtInFunctions': [
            (r'(?i)({})\b'.format('|'.join(functions)),
             Name.Function),
        ],
        'builtInMarcros': [
            (r'(?i)({})\b'.format('|'.join(macros)),
             Name.Variable.Global),
        ],
        'labels': [
            # sendkeys
            (r'(^\s*)(\{\S+?\})', bygroups(Text, Name.Label)),
        ],
        'numbers': [
            (r'(\d+\.\d*|\d*\.\d+)([eE][+-]?[0-9]+)?', Number.Float),
            (r'\d+[eE][+-]?[0-9]+', Number.Float),
            (r'0\d+', Number.Oct),
            (r'0[xX][a-fA-F0-9]+', Number.Hex),
            (r'\d+L', Number.Integer.Long),
            (r'\d+', Number.Integer)
        ],
        'stringescape': [
            (r'\"\"|\`([,%`abfnrtv])', String.Escape),
        ],
        'strings': [
            (r'[^"\n]+', String),
        ],
        'dqs': [
            (r'"', String, '#pop'),
            include('strings')
        ],
        'sqs': [
            (r'\'\'|\`([,%`abfnrtv])', String.Escape),
            (r"'", String, '#pop'),
            (r"[^'\n]+", String)
        ],
        'garbage': [
            (r'[^\S\n]', Text),
        ],
    }
