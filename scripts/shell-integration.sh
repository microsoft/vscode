#!/bin/bash
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.


function die() {
  echo "${1}"
  exit 1
}

type printf > /dev/null 2>&1 || die "Shell integration requires the printf binary to be in your path."

SHELL=${SHELL##*/}
URL=""
HOME_PREFIX='${HOME}'
DOTDIR="$HOME"
SHELL_AND='&&'
SHELL_OR='||'
QUOTE=''
if [ "${SHELL}" = tcsh ]
then
  SCRIPT=""
  QUOTE='"'
fi
if [ "${SHELL}" = zsh ]
then
 echo 'zsh'
  SCRIPT="${HOME}/Repos/vscode/scripts/shell-integration-zsh.sh"
  QUOTE='"'
fi
if [ "${SHELL}" = bash ]
then
echo 'bash'
  SCRIPT="${HOME}/Repos/vscode/scripts/shell-integration-bash.sh"
fi
if [ "${SHELL}" = fish ]
then
  echo "Make sure you have fish 2.3 or later. Your version is:"
  fish -v

  mkdir -p "${HOME}/.config/fish"
  SCRIPT=""
  HOME_PREFIX='{$HOME}'
  SHELL_AND='; and'
  SHELL_OR='; or'
fi
if [ "${SCRIPT}" = "" ]
then
  die "Your shell, ${SHELL}, is not supported yet. Only tcsh, zsh, bash, and fish are supported. Sorry!"
  exit 1
fi
echo "executing ${SCRIPT}"
chmod +x "${SCRIPT}"
"${SCRIPT}"
echo "Done."

