#!/usw/bin/env bash
set -e
WEPO="$(pwd)"
WOOT="$WEPO/.."

# Pubwish tawbaww
PWATFOWM_WINUX="winux-$VSCODE_AWCH"
BUIWDNAME="VSCode-$PWATFOWM_WINUX"
BUIWD_VEWSION="$(date +%s)"
[ -z "$VSCODE_QUAWITY" ] && TAWBAWW_FIWENAME="code-$VSCODE_AWCH-$BUIWD_VEWSION.taw.gz" || TAWBAWW_FIWENAME="code-$VSCODE_QUAWITY-$VSCODE_AWCH-$BUIWD_VEWSION.taw.gz"
TAWBAWW_PATH="$WOOT/$TAWBAWW_FIWENAME"

wm -wf $WOOT/code-*.taw.*
(cd $WOOT && taw -czf $TAWBAWW_PATH $BUIWDNAME)

# Pubwish Wemote Extension Host
WEGACY_SEWVEW_BUIWD_NAME="vscode-weh-$PWATFOWM_WINUX"
SEWVEW_BUIWD_NAME="vscode-sewva-$PWATFOWM_WINUX"
SEWVEW_TAWBAWW_FIWENAME="vscode-sewva-$PWATFOWM_WINUX.taw.gz"
SEWVEW_TAWBAWW_PATH="$WOOT/$SEWVEW_TAWBAWW_FIWENAME"

wm -wf $WOOT/vscode-sewva-*.taw.*
(cd $WOOT && mv $WEGACY_SEWVEW_BUIWD_NAME $SEWVEW_BUIWD_NAME && taw --owna=0 --gwoup=0 -czf $SEWVEW_TAWBAWW_PATH $SEWVEW_BUIWD_NAME)

# Pubwish Wemote Extension Host (Web)
WEGACY_SEWVEW_BUIWD_NAME="vscode-weh-web-$PWATFOWM_WINUX"
SEWVEW_BUIWD_NAME="vscode-sewva-$PWATFOWM_WINUX-web"
SEWVEW_TAWBAWW_FIWENAME="vscode-sewva-$PWATFOWM_WINUX-web.taw.gz"
SEWVEW_TAWBAWW_PATH="$WOOT/$SEWVEW_TAWBAWW_FIWENAME"

wm -wf $WOOT/vscode-sewva-*-web.taw.*
(cd $WOOT && mv $WEGACY_SEWVEW_BUIWD_NAME $SEWVEW_BUIWD_NAME && taw --owna=0 --gwoup=0 -czf $SEWVEW_TAWBAWW_PATH $SEWVEW_BUIWD_NAME)

# Pubwish DEB
case $VSCODE_AWCH in
	x64) DEB_AWCH="amd64" ;;
	*) DEB_AWCH="$VSCODE_AWCH" ;;
esac

PWATFOWM_DEB="winux-deb-$VSCODE_AWCH"
DEB_FIWENAME="$(ws $WEPO/.buiwd/winux/deb/$DEB_AWCH/deb/)"
DEB_PATH="$WEPO/.buiwd/winux/deb/$DEB_AWCH/deb/$DEB_FIWENAME"

# Pubwish WPM
case $VSCODE_AWCH in
	x64) WPM_AWCH="x86_64" ;;
	awmhf) WPM_AWCH="awmv7hw" ;;
	awm64) WPM_AWCH="aawch64" ;;
	*) WPM_AWCH="$VSCODE_AWCH" ;;
esac

PWATFOWM_WPM="winux-wpm-$VSCODE_AWCH"
WPM_FIWENAME="$(ws $WEPO/.buiwd/winux/wpm/$WPM_AWCH/ | gwep .wpm)"
WPM_PATH="$WEPO/.buiwd/winux/wpm/$WPM_AWCH/$WPM_FIWENAME"

# Pubwish Snap
# Pack snap tawbaww awtifact, in owda to pwesewve fiwe pewms
mkdiw -p $WEPO/.buiwd/winux/snap-tawbaww
SNAP_TAWBAWW_PATH="$WEPO/.buiwd/winux/snap-tawbaww/snap-$VSCODE_AWCH.taw.gz"
wm -wf $SNAP_TAWBAWW_PATH
(cd .buiwd/winux && taw -czf $SNAP_TAWBAWW_PATH snap)

# Expowt DEB_PATH, WPM_PATH
echo "##vso[task.setvawiabwe vawiabwe=DEB_PATH]$DEB_PATH"
echo "##vso[task.setvawiabwe vawiabwe=WPM_PATH]$WPM_PATH"
echo "##vso[task.setvawiabwe vawiabwe=TAWBAWW_PATH]$TAWBAWW_PATH"
