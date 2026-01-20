import os
import sys

# Prevent the script from running multiple times
if 'VSCODE_SHELL_INTEGRATION' not in __xonsh__.env:

	__xonsh__.env['VSCODE_SHELL_INTEGRATION'] = '1'
	_vscode_nonce = os.environ.pop('VSCODE_NONCE', '')

	def _vsc_escape_value(value: str) -> str:
		"""
		Escape a value for use in OSC sequences.
		Backslashes are doubled, semicolons and control chars are hex-escaped.
		"""
		if not value:
			return ''

		result = []
		for char in value:
			code = ord(char)
			if code < 32:
				result.append(f'\\x{code:02x}')
			elif char == '\\':
				result.append('\\\\')
			elif char == ';':
				result.append('\\x3b')
			else:
				result.append(char)

		return ''.join(result)

	def _vsc_command_executed(cmd: str):
		"""Send OSC 633 ; E and C - Command line and execution started"""
		# Trim whitespace to match how VS Code stores commands in history
		trimmed_cmd = cmd.strip() if cmd else ''
		escaped_cmd = _vsc_escape_value(trimmed_cmd)
		# Send command executed marker first (VS Code indiscriminately reads buffer here)
		print('\x1b]633;C\x07', end='', flush=True)
		# Then send command line (overwriting the buffer reading with the correct command)
		print(f'\x1b]633;E;{escaped_cmd};{_vscode_nonce}\x07', end='', flush=True)

	def _vsc_command_finished(cmd, exit_code=None):
		"""Send OSC 633 ; D - Command finished with exit code"""
		if not cmd or cmd == '':
			# Empty command (just pressed Enter)
			print('\x1b]633;D\x07', end='', flush=True)
		else:
			# Command with exit code
			print(f'\x1b]633;D;{exit_code};{_vscode_nonce}\x07', end='', flush=True)



	# --- Apply Environment Variable Collections ---

	def _vsc_apply_env_replace():
		"""Apply VSCODE_ENV_REPLACE mutations"""
		env_replace = os.environ.pop('VSCODE_ENV_REPLACE', '')
		if env_replace:
			for item in env_replace.split(':'):
				if '=' in item:
					varname, value = item.split('=', 1)
					os.environ[varname] = value

	def _vsc_apply_env_prepend():
		"""Apply VSCODE_ENV_PREPEND mutations"""
		env_prepend = os.environ.pop('VSCODE_ENV_PREPEND', '')
		if env_prepend:
			for item in env_prepend.split(':'):
				if '=' in item:
					varname, value = item.split('=', 1)
					current = os.environ.get(varname, '')
					os.environ[varname] = value + current

	def _vsc_apply_env_append():
		"""Apply VSCODE_ENV_APPEND mutations"""
		env_append = os.environ.pop('VSCODE_ENV_APPEND', '')
		if env_append:
			for item in env_append.split(':'):
				if '=' in item:
					varname, value = item.split('=', 1)
					current = os.environ.get(varname, '')
					os.environ[varname] = current + value

	# Apply environment variable collections
	_vsc_apply_env_replace()
	_vsc_apply_env_prepend()
	_vsc_apply_env_append()

	# --- Hook into Xonsh Events ---

	@events.on_precommand
	def _vsc_on_precommand(cmd, **kwargs):
		"""Called before a command is executed"""
		_vsc_command_executed(cmd)

	@events.on_postcommand
	def _vsc_on_postcommand(cmd, rtn, out, ts, **kwargs):
		"""Called after a command is executed"""
		_vsc_command_finished(cmd, rtn if rtn is not None else 0)

	# --- Source User's RC Files ---
	# Since VS Code uses --rc to inject this script, xonsh's normal rc files
	# are not loaded. We need to source them manually from $XONSHRC.

	_vsc_xonshrc = os.environ.get('XONSHRC', '')
	if _vsc_xonshrc:
		for _vsc_rc_file in _vsc_xonshrc.split(':'):
			if _vsc_rc_file and os.path.isfile(_vsc_rc_file):
				try:
					source @(_vsc_rc_file)
				except Exception:
					# Silently ignore errors in rc files to avoid breaking the terminal
					pass

	# Apply path prefix fix (for macOS path_helper issue)
	_vsc_path_prefix = os.environ.pop('VSCODE_PATH_PREFIX', '')
	if _vsc_path_prefix:
		$PATH = _vsc_path_prefix + $PATH

	if 'VSCODE_INJECTION' in os.environ:
		del os.environ['VSCODE_INJECTION']


	# print("\001\x1b]633;A\x07\002", end="", flush=True)
	# Report shell properties
	print('\x1b]633;P;HasRichCommandDetection=True\x07', end='', flush=True)

	# --- Set Up Prompts ---
	# Print A before prompt and B after prompt

	_vsc_orig_prompt = $PROMPT

	def _vsc_wrapped_prompt():
		"""Generate prompt with A marker before it"""
		global _vsc_orig_prompt
		# Get the original prompt value
		if callable(_vsc_orig_prompt):
			original = _vsc_orig_prompt()
		else:
			original = str(_vsc_orig_prompt)
		# Return prompt with A and B markers wrapped in \001 and \002
		# \001 and \002 mark non-printing characters for readline to avoid wrapping issues
		return f'\001\x1b]633;A\x07\002{original}\001\x1b]633;B\x07\002'

	$PROMPT = _vsc_wrapped_prompt

