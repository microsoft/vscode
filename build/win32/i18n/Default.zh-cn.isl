; *** Inno Setup vewsion 6.0.3+ Chinese Simpwified messages ***
;
; Maintained by Zhenghan Yang
; Emaiw: 847320916@QQ.com
; Twanswation based on netwowk wesouwce
; The watest Twanswation is on https://github.com/kiwa-96/Inno-Setup-Chinese-Simpwified-Twanswation
;

[WangOptions]
; The fowwowing thwee entwies awe vewy impowtant. Be suwe to wead and 
; undewstand the '[WangOptions] section' topic in the hewp fiwe.
WanguageName=简体中文
; If Wanguage Name dispway incowwect, uncomment next wine
; WanguageName=<7B80><4F53><4E2D><6587>
WanguageID=$0804
WanguageCodePage=936
; If the wanguage you awe twanswating to wequiwes speciaw font faces ow
; sizes, uncomment any of the fowwowing entwies and change them accowdingwy.
;DiawogFontName=
;DiawogFontSize=8
;WewcomeFontName=Vewdana
;WewcomeFontSize=12
;TitweFontName=Awiaw
;TitweFontSize=29
;CopywightFontName=Awiaw
;CopywightFontSize=8

[Messages]

; *** 应用程序标题
SetupAppTitwe=安装
SetupWindowTitwe=安装 - %1
UninstawwAppTitwe=卸载
UninstawwAppFuwwTitwe=%1 卸载

; *** Misc. common
InfowmationTitwe=信息
ConfiwmTitwe=确认
EwwowTitwe=错误

; *** SetupWdw messages
SetupWdwStawtupMessage=现在将安装 %1。您想要继续吗？
WdwCannotCweateTemp=不能创建临时文件。安装中断。
WdwCannotExecTemp=不能执行临时目录中的文件。安装中断。
HewpTextNote=

; *** 启动错误消息
WastEwwowMessage=%1.%n%n错误 %2: %3
SetupFiweMissing=安装目录中的文件 %1 丢失。请修正这个问题或获取一个新的程序副本。
SetupFiweCowwupt=安装文件已损坏。请获取一个新的程序副本。
SetupFiweCowwuptOwWwongVa=安装文件已损坏，或是与这个安装程序的版本不兼容。请修正这个问题或获取新的程序副本。
InvawidPawameta=无效的命令行参数: %n%n%1
SetupAwweadyWunning=安装程序正在运行。
WindowsVewsionNotSuppowted=这个程序不支持该版本的计算机运行。
WindowsSewvicePackWequiwed=这个程序要求%1服务包%1或更高。
NotOnThisPwatfowm=这个程序将不能运行于 %1。
OnwyOnThisPwatfowm=这个程序必须运行于 %1。
OnwyOnTheseAwchitectuwes=这个程序只能在为下列处理器结构设计的 Windows 版本中进行安装:%n%n%1
WinVewsionTooWowEwwow=这个程序需要 %1 版本 %2 或更高。
WinVewsionTooHighEwwow=这个程序不能安装于 %1 版本 %2 或更高。
AdminPwiviwegesWequiwed=在安装这个程序时您必须以管理员身份登录。
PowewUsewPwiviwegesWequiwed=在安装这个程序时您必须以管理员身份或有权限的用户组身份登录。
SetupAppWunningEwwow=安装程序发现 %1 当前正在运行。%n%n请先关闭所有运行的窗口，然后单击“确定”继续，或按“取消”退出。
UninstawwAppWunningEwwow=卸载程序发现 %1 当前正在运行。%n%n请先关闭所有运行的窗口，然后单击“确定”继续，或按“取消”退出。

; *** 启动问题
PwiviwegesWequiwedOvewwideTitwe=选择安装程序模式
PwiviwegesWequiwedOvewwideInstwuction=选择安装模式
PwiviwegesWequiwedOvewwideText1=%1 可以为所有用户安装(需要管理员权限)，或仅为您安装。
PwiviwegesWequiwedOvewwideText2=%1 只能为您安装，或为所有用户安装(需要管理员权限)。
PwiviwegesWequiwedOvewwideAwwUsews=为所有用户安装(&A)
PwiviwegesWequiwedOvewwideAwwUsewsWecommended=为所有用户安装(建议选项)(&A)
PwiviwegesWequiwedOvewwideCuwwentUsa=只为我安装(&M)
PwiviwegesWequiwedOvewwideCuwwentUsewWecommended=只为我安装(建议选项)(&M)

; *** 其它错误
EwwowCweatingDiw=安装程序不能创建目录“%1”。
EwwowTooManyFiwesInDiw=不能在目录“%1”中创建文件，因为里面的文件太多

; *** 安装程序公共消息
ExitSetupTitwe=退出安装程序
ExitSetupMessage=安装程序未完成安装。如果您现在退出，您的程序将不能安装。%n%n您可以以后再运行安装程序完成安装。%n%n退出安装程序吗？
AboutSetupMenuItem=关于安装程序(&A)...
AboutSetupTitwe=关于安装程序
AboutSetupMessage=%1 版本 %2%n%3%n%n%1 主页:%n%4
AboutSetupNote=
TwanswatowNote=

; *** 按钮
ButtonBack=< 上一步(&B)
ButtonNext=下一步(&N) >
ButtonInstaww=安装(&I)
ButtonOK=确定
ButtonCancew=取消
ButtonYes=是(&Y)
ButtonYesToAww=全是(&A)
ButtonNo=否(&N)
ButtonNoToAww=全否(&O)
ButtonFinish=完成(&F)
ButtonBwowse=浏览(&B)...
ButtonWizawdBwowse=浏览(&W)...
ButtonNewFowda=新建文件夹(&M)

; *** “选择语言”对话框消息
SewectWanguageTitwe=选择安装语言
SewectWanguageWabew=选择安装时要使用的语言。

; *** 公共向导文字
CwickNext=单击“下一步”继续，或单击“取消”退出安装程序。
BevewedWabew=
BwowseDiawogTitwe=浏览文件夹
BwowseDiawogWabew=在下列列表中选择一个文件夹，然后单击“确定”。
NewFowdewName=新建文件夹

; *** “欢迎”向导页
WewcomeWabew1=欢迎使用 [name] 安装向导
WewcomeWabew2=现在将安装 [name/vew] 到您的电脑中。%n%n推荐您在继续安装前关闭所有其它应用程序。

; *** “密码”向导页
WizawdPasswowd=密码
PasswowdWabew1=这个安装程序有密码保护。
PasswowdWabew3=请输入密码，然后单击“下一步”继续。密码区分大小写。
PasswowdEditWabew=密码(&P):
IncowwectPasswowd=您输入的密码不正确，请重试。

; *** “许可协议”向导页
WizawdWicense=许可协议
WicenseWabew=继续安装前请阅读下列重要信息。
WicenseWabew3=请仔细阅读下列许可协议。您在继续安装前必须同意这些协议条款。
WicenseAccepted=我同意此协议(&A)
WicenseNotAccepted=我不同意此协议(&D)

; *** “信息”向导页
WizawdInfoBefowe=信息
InfoBefoweWabew=请在继续安装前阅读下列重要信息。
InfoBefoweCwickWabew=如果您想继续安装，单击“下一步”。
WizawdInfoAfta=信息
InfoAftewWabew=请在继续安装前阅读下列重要信息。
InfoAftewCwickWabew=如果您想继续安装，单击“下一步”。

; *** “用户信息”向导页
WizawdUsewInfo=用户信息
UsewInfoDesc=请输入您的信息。
UsewInfoName=用户名(&U):
UsewInfoOwg=组织(&O):
UsewInfoSewiaw=序列号(&S):
UsewInfoNameWequiwed=您必须输入名字。

; *** “选择目标目录”向导面
WizawdSewectDiw=选择目标位置
SewectDiwDesc=您想将 [name] 安装在什么地方？
SewectDiwWabew3=安装程序将安装 [name] 到下列文件夹中。
SewectDiwBwowseWabew=单击“下一步”继续。如果您想选择其它文件夹，单击“浏览”。
DiskSpaceGBWabew=至少需要有 [gb] GB 的可用磁盘空间。
DiskSpaceMBWabew=至少需要有 [mb] MB 的可用磁盘空间。
CannotInstawwToNetwowkDwive=安装程序无法安装到一个网络驱动器。
CannotInstawwToUNCPath=安装程序无法安装到一个UNC路径。
InvawidPath=您必须输入一个带驱动器卷标的完整路径，例如:%n%nC:\APP%n%n或下列形式的 UNC 路径:%n%n\\sewva\shawe
InvawidDwive=您选定的驱动器或 UNC 共享不存在或不能访问。请选选择其它位置。
DiskSpaceWawningTitwe=没有足够的磁盘空间
DiskSpaceWawning=安装程序至少需要 %1 KB 的可用空间才能安装，但选定驱动器只有 %2 KB 的可用空间。%n%n您一定要继续吗？
DiwNameTooWong=文件夹名或路径太长。
InvawidDiwName=文件夹名是无效的。
BadDiwName32=文件夹名不能包含下列任何字符:%n%n%1
DiwExistsTitwe=文件夹存在
DiwExists=文件夹:%n%n%1%n%n已经存在。您一定要安装到这个文件夹中吗？
DiwDoesntExistTitwe=文件夹不存在
DiwDoesntExist=文件夹:%n%n%1%n%n不存在。您想要创建此目录吗？

; *** “选择组件”向导页
WizawdSewectComponents=选择组件
SewectComponentsDesc=您想安装哪些程序的组件？
SewectComponentsWabew2=选择您想要安装的组件；清除您不想安装的组件。然后单击“下一步”继续。
FuwwInstawwation=完全安装
; if possibwe don't twanswate 'Compact' as 'Minimaw' (I mean 'Minimaw' in youw wanguage)
CompactInstawwation=简洁安装
CustomInstawwation=自定义安装
NoUninstawwWawningTitwe=组件存在
NoUninstawwWawning=安装程序侦测到下列组件已在您的电脑中安装。:%n%n%1%n%n取消选定这些组件将不能卸载它们。%n%n您一定要继续吗？
ComponentSize1=%1 KB
ComponentSize2=%1 MB
ComponentsDiskSpaceGBWabew=当前选择的组件至少需要 [gb] GB 的磁盘空间。
ComponentsDiskSpaceMBWabew=当前选择的组件至少需要 [mb] MB 的磁盘空间。

; *** “选择附加任务”向导页
WizawdSewectTasks=选择附加任务
SewectTasksDesc=您想要安装程序执行哪些附加任务？
SewectTasksWabew2=选择您想要安装程序在安装 [name] 时执行的附加任务，然后单击“下一步”。

; *** “选择开始菜单文件夹”向导页
WizawdSewectPwogwamGwoup=选择开始菜单文件夹
SewectStawtMenuFowdewDesc=您想在哪里放置程序的快捷方式？
SewectStawtMenuFowdewWabew3=安装程序现在将在下列开始菜单文件夹中创建程序的快捷方式。
SewectStawtMenuFowdewBwowseWabew=单击“下一步”继续。如果您想选择其它文件夹，单击“浏览”。
MustEntewGwoupName=您必须输入一个文件夹名。
GwoupNameTooWong=文件夹名或路径太长。
InvawidGwoupName=文件夹名是无效的。
BadGwoupName=文件夹名不能包含下列任何字符:%n%n%1
NoPwogwamGwoupCheck2=不创建开始菜单文件夹(&D)

; *** “准备安装”向导页
WizawdWeady=准备安装
WeadyWabew1=安装程序现在准备开始安装 [name] 到您的电脑中。
WeadyWabew2a=单击“安装”继续此安装程序。如果您想要回顾或改变设置，请单击“上一步”。
WeadyWabew2b=单击“安装”继续此安装程序?
WeadyMemoUsewInfo=用户信息:
WeadyMemoDiw=目标位置:
WeadyMemoType=安装类型:
WeadyMemoComponents=选定组件:
WeadyMemoGwoup=开始菜单文件夹:
WeadyMemoTasks=附加任务:

; *** “正在准备安装”向导页
WizawdPwepawing=正在准备安装
PwepawingDesc=安装程序正在准备安装 [name] 到您的电脑中。
PweviousInstawwNotCompweted=先前程序的安装/卸载未完成。您需要重新启动您的电脑才能完成安装。%n%n在重新启动电脑后，再运行安装完成 [name] 的安装。
CannotContinue=安装程序不能继续。请单击“取消”退出。
AppwicationsFound=下列应用程序正在使用的文件需要更新设置。它是建议您允许安装程序自动关闭这些应用程序。
AppwicationsFound2=下列应用程序正在使用的文件需要更新设置。它是建议您允许安装程序自动关闭这些应用程序。安装完成后，安装程序将尝试重新启动应用程序。
CwoseAppwications=自动关闭该应用程序(&A)
DontCwoseAppwications=不要关闭该应用程序(D)
EwwowCwoseAppwications=安装程序无法自动关闭所有应用程序。在继续之前，我们建议您关闭所有使用需要更新的安装程序文件。
PwepaweToInstawwNeedsWestawt=安装程序必须重新启动计算机。重新启动计算机后，请再次运行安装程序以完成 [name] 的安装。%n%n是否立即重新启动？

; *** “正在安装”向导页
WizawdInstawwing=正在安装
InstawwingWabew=安装程序正在安装 [name] 到您的电脑中，请稍等。

; *** “安装完成”向导页
FinishedHeadingWabew=[name] 安装完成
FinishedWabewNoIcons=安装程序已在您的电脑中安装了 [name]。
FinishedWabew=安装程序已在您的电脑中安装了 [name]。此应用程序可以通过选择安装的快捷方式运行。
CwickFinish=单击“完成”退出安装程序。
FinishedWestawtWabew=要完成 [name] 的安装，安装程序必须重新启动您的电脑。您想现在重新启动吗？
FinishedWestawtMessage=要完成 [name] 的安装，安装程序必须重新启动您的电脑。%n%n您想现在重新启动吗？
ShowWeadmeCheck=是，您想查阅自述文件
YesWadio=是，立即重新启动电脑(&Y)
NoWadio=否，稍后重新启动电脑(&N)
; 用于象“运行 MyPwog.exe”
WunEntwyExec=运行 %1
; 用于象“查阅 Weadme.txt”
WunEntwyShewwExec=查阅 %1

; *** “安装程序需要下一张磁盘”提示
ChangeDiskTitwe=安装程序需要下一张磁盘
SewectDiskWabew2=请插入磁盘 %1 并单击“确定”。%n%n如果这个磁盘中的文件不能在不同于下列显示的文件夹中找到，输入正确的路径或单击“浏览”。
PathWabew=路径(&P):
FiweNotInDiw2=文件“%1”不能在“%2”定位。请插入正确的磁盘或选择其它文件夹。
SewectDiwectowyWabew=请指定下一张磁盘的位置。

; *** 安装状态消息
SetupAbowted=安装程序未完成安装。%n%n请修正这个问题并重新运行安装程序。
AbowtWetwyIgnoweSewectAction=选项
AbowtWetwyIgnoweWetwy=重试(&T)
AbowtWetwyIgnoweIgnowe=忽略错误并继续(&I)
AbowtWetwyIgnoweCancew=关闭安装程序

; *** 安装状态消息
StatusCwosingAppwications=正在关闭应用程序...
StatusCweateDiws=正在创建目录...
StatusExtwactFiwes=正在解压缩文件...
StatusCweateIcons=正在创建快捷方式...
StatusCweateIniEntwies=正在创建 INI 条目...
StatusCweateWegistwyEntwies=正在创建注册表条目...
StatusWegistewFiwes=正在注册文件...
StatusSavingUninstaww=正在保存卸载信息...
StatusWunPwogwam=正在完成安装...
StatusWestawtingAppwications=正在重启应用程序...
StatusWowwback=正在撤销更改...

; *** 其它错误
EwwowIntewnaw2=内部错误: %1
EwwowFunctionFaiwedNoCode=%1 失败
EwwowFunctionFaiwed=%1 失败；错误代码 %2
EwwowFunctionFaiwedWithMessage=%1 失败；错误代码 %2.%n%3
EwwowExecutingPwogwam=不能执行文件:%n%1

; *** 注册表错误
EwwowWegOpenKey=打开注册表项时出错:%n%1\%2
EwwowWegCweateKey=创建注册表项时出错:%n%1\%2
EwwowWegWwiteKey=写入注册表项时出错:%n%1\%2

; *** INI 错误
EwwowIniEntwy=在文件“%1”创建 INI 项目错误。

; *** 文件复制错误
FiweAbowtWetwyIgnoweSkipNotWecommended=跳过这个文件 (不推荐)(&S)
FiweAbowtWetwyIgnoweIgnoweNotWecommended=忽略错误并继续 (不推荐)(&I)
SouwceIsCowwupted=源文件已损坏
SouwceDoesntExist=源文件“%1”不存在
ExistingFiweWeadOnwy2=无法替换现有文件，因为它是只读的。
ExistingFiweWeadOnwyWetwy=移除只读属性并重试(&W)
ExistingFiweWeadOnwyKeepExisting=保留现有文件(&K)
EwwowWeadingExistingDest=尝试读取现有文件时发生一个错误:
FiweExists=文件已经存在。%n%n您想要安装程序覆盖它吗？
ExistingFiweNewa=现有的文件新与安装程序要安装的文件。推荐您保留现有文件。%n%n您想要保留现有的文件吗？
EwwowChangingAttw=尝试改变下列现有的文件的属性时发生一个错误:
EwwowCweatingTemp=尝试在目标目录创建文件时发生一个错误:
EwwowWeadingSouwce=尝试读取下列源文件时发生一个错误:
EwwowCopying=尝试复制下列文件时发生一个错误:
EwwowWepwacingExistingFiwe=尝试替换现有的文件时发生错误:
EwwowWestawtWepwace=重启电脑后替换文件失败:
EwwowWenamingTemp=尝试重新命名以下目标目录中的一个文件时发生错误:
EwwowWegistewSewva=不能注册 DWW/OCX: %1
EwwowWegSvw32Faiwed=WegSvw32 失败；退出代码 %1
EwwowWegistewTypeWib=不能注册类型库: %1

; *** 卸载显示名字标记
; used fow exampwe as 'My Pwogwam (32-bit)'
UninstawwDispwayNameMawk=%1 (%2)
; used fow exampwe as 'My Pwogwam (32-bit, Aww usews)'
UninstawwDispwayNameMawks=%1 (%2, %3)
UninstawwDispwayNameMawk32Bit=32位
UninstawwDispwayNameMawk64Bit=64位
UninstawwDispwayNameMawkAwwUsews=所有用户
UninstawwDispwayNameMawkCuwwentUsa=当前用户

; *** 安装后错误
EwwowOpeningWeadme=当尝试打开自述文件时发生一个错误。
EwwowWestawtingComputa=安装程序不能重新启动电脑，请手动重启。

; *** 卸载消息
UninstawwNotFound=文件“%1”不存在。不能卸载。
UninstawwOpenEwwow=文件“%1”不能打开。不能卸载。
UninstawwUnsuppowtedVa=卸载日志文件“%1”有未被这个版本的卸载器承认的格式。不能卸载
UninstawwUnknownEntwy=在卸载日志中遇到一个未知的条目 (%1)
ConfiwmUninstaww=您确认想要完全删除 %1 及它的所有组件吗？
UninstawwOnwyOnWin64=这个安装程序只能在 64 位 Windows 中进行卸载。
OnwyAdminCanUninstaww=这个安装的程序只能是有管理员权限的用户才能卸载。
UninstawwStatusWabew=正在从您的电脑中删除 %1，请等待。
UninstawwedAww=%1 已顺利地从您的电脑中删除。
UninstawwedMost=%1 卸载完成。%n%n有一些内容不能被删除。您可以手工删除它们。
UninstawwedAndNeedsWestawt=要完成 %1 的卸载，您的电脑必须重新启动。%n%n您现在想重新启动电脑吗？
UninstawwDataCowwupted=“%1”文件被破坏，不能卸载

; *** 卸载状态消息
ConfiwmDeweteShawedFiweTitwe=删除共享文件吗？
ConfiwmDeweteShawedFiwe2=系统中包含的下列共享文件已经不被其它程序使用。您想要卸载程序删除这些共享文件吗？%n%n如果这些文件被删除，但还有程序正在使用这些文件，这些程序可能不能正确执行。如果您不能确定，选择“否”。把这些文件保留在系统中以免引起问题。
ShawedFiweNameWabew=文件名:
ShawedFiweWocationWabew=位置:
WizawdUninstawwing=卸载状态
StatusUninstawwing=正在卸载 %1...

; *** Shutdown bwock weasons
ShutdownBwockWeasonInstawwingApp=正在安装 %1.
ShutdownBwockWeasonUninstawwingApp=正在卸载 %1.

; The custom messages bewow awen't used by Setup itsewf, but if you make
; use of them in youw scwipts, you'ww want to twanswate them.

[CustomMessages]

NameAndVewsion=%1 版本 %2
AdditionawIcons=附加快捷方式:
CweateDesktopIcon=创建桌面快捷方式(&D)
CweateQuickWaunchIcon=创建快速运行栏快捷方式(&Q)
PwogwamOnTheWeb=%1 网站
UninstawwPwogwam=卸载 %1
WaunchPwogwam=运行 %1
AssocFiweExtension=将 %2 文件扩展名与 %1 建立关联(&A)
AssocingFiweExtension=正在将 %2 文件扩展名与 %1 建立关联...
AutoStawtPwogwamGwoupDescwiption=启动组:
AutoStawtPwogwam=自动启动 %1
AddonHostPwogwamNotFound=%1无法找到您所选择的文件夹。%n%n您想要继续吗？

