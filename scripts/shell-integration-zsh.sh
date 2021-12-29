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

if [[ -o interactive ]]; then
  if [ "${ENABLE_SHELL_INTEGRATION_WITH_TMUX-}""$TERM" != "screen" -a "${SHELL_INTEGRATION_INSTALLED-}" = "" -a "$TERM" != linux -a "$TERM" != dumb ]; then
    SHELL_INTEGRATION_INSTALLED=Yes
    SHOULD_DECORATE_PROMPT="1"
    # Indicates start of command output. Runs just before command executes.
    before_cmd_executes() {
      printf "\033]133;C;\007"
    }

    set_user_var() {
      printf "\033]1337;SetUserVar=%s=%s\007" "$1" $(printf "%s" "$2" | base64 | tr -d '\n')
    }

    print_state_data() {
      local _hostname="${hostname-}"
      if [ -z "${hostname:-}" ]; then
        _hostname=$(hostname -f 2>/dev/null)
      fi
      printf "\033]1337;RemoteHost=%s@%s\007" "$USER" "${_hostname-}"
      printf "\033]1337;CurrentDir=%s\007" "$PWD"
      print_user_vars
    }

    # Report return code of command; runs after command finishes but before prompt
    after_cmd_executes() {
      printf "\033]133;D;%s\007" "$STATUS"
      print_state_data
    }

    # Mark start of prompt
    prompt_mark() {
      printf "\033]133;A\007"
    }

    # Mark end of prompt
    prompt_end() {
      printf "\033]133;B\007"
    }

    # There are three possible paths in life.
    #
    # 1) A command is entered at the prompt and you press return.
    #    The following steps happen:
    #    * preexec is invoked
    #      * PS1 is set to PRECMD_PS1
    #      * SHOULD_DECORATE_PROMPT is set to 1
    #    * The command executes (possibly reading or modifying PS1)
    #    * precmd is invoked
    #      * PRECMD_PS1 is set to PS1 (as modified by command execution)
    #      * PS1 gets our escape sequences added to it
    #    * zsh displays your prompt
    #    * You start entering a command
    #
    # 2) You press ^C while entering a command at the prompt.
    #    The following steps happen:
    #    * (preexec is NOT invoked)
    #    * precmd is invoked
    #      * before_cmd_executes is called since we detected that preexec was not run
    #      * (PRECMD_PS1 and PS1 are not messed with, since PS1 already has our escape
    #        sequences and PRECMD_PS1 already has PS1's original value)
    #    * zsh displays your prompt
    #    * You start entering a command
    #
    # 3) A new shell is born.
    #    * PS1 has some initial value, either zsh's default or a value set before this script is sourced.
    #    * precmd is invoked
    #      * SHOULD_DECORATE_PROMPT is initialized to 1
    #      * PRECMD_PS1 is set to the initial value of PS1
    #      * PS1 gets our escape sequences added to it
    #    * Your prompt is shown and you may begin entering a command.
    #
    # Invariants:
    # * SHOULD_DECORATE_PROMPT is 1 during and just after command execution, and "" while the prompt is
    #   shown and until you enter a command and press return.
    # * PS1 does not have our escape sequences during command execution
    # * After the command executes but before a new one begins, PS1 has escape sequences and
    #   PRECMD_PS1 has PS1's original value.
    decorate_prompt() {
      # This should be a raw PS1
      # execution.
      PRECMD_PS1="$PS1"
      SHOULD_DECORATE_PROMPT=""

      # Add our escape sequences just before the prompt is shown.
      # Use SQUELCH_MARK for people who can't mdoify PS1 directly, like powerlevel9k users.
      # This is gross but I had a heck of a time writing a correct if statetment for zsh 5.0.2.
      local PREFIX=""
      if [[ $PS1 == *"$(prompt_mark)"* ]]; then
        PREFIX=""
      elif [[ "${SQUELCH_MARK-}" != "" ]]; then
        PREFIX=""
      else
        PREFIX="%{$(prompt_mark)%}"
      fi
      PS1="$PREFIX$PS1%{$(prompt_end)%}"
    }

    precmd() {
      local STATUS="$?"
      if [ -z "${SHOULD_DECORATE_PROMPT-}" ]; then
        # You pressed ^C while entering a command (preexec did not run)
        before_cmd_executes
      fi

      after_cmd_executes "$STATUS"

      if [ -n "$SHOULD_DECORATE_PROMPT" ]; then
        decorate_prompt
      fi
    }

    # This is not run if you press ^C while entering a command.
    preexec() {
      # Set PS1 back to its raw value prior to executing the command.
      PS1="$PRECMD_PS1"
      SHOULD_DECORATE_PROMPT="1"
      before_cmd_executes
    }

    # If hostname -f is slow on your system set hostname prior to
    # sourcing this script. We know it is fast on macOS so we don't cache
    # it. That lets us handle the hostname changing like when you attach
    # to a VPN.
    if [ -z "${hostname-}" ]; then
      if [ "$(uname)" != "Darwin" ]; then
        hostname=`hostname -f 2>/dev/null`
        # Some flavors of BSD (i.e. NetBSD and OpenBSD) don't have the -f option.
        if [ $? -ne 0 ]; then
          hostname=`hostname`
        fi
      fi
    fi

    [[ -z ${precmd_functions-} ]] && precmd_functions=()
    precmd_functions=($precmd_functions precmd)

    [[ -z ${preexec_functions-} ]] && preexec_functions=()
    preexec_functions=($preexec_functions preexec)

    print_state_data
    printf "\033]1337;ShellIntegrationVersion=12;shell=zsh\007"
  fi
fi
