# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
import sys
import os

class _vsCodeXonsh:
	"""vscode shell integration for xonsh shell."""

	def __init__(self):
		self._vscode_nonce = __xonsh__.env.get('VSCODE_NONCE', '')

		if 'VSCODE_INJECTION' in __xonsh__.env:
			self.stdout = sys.stdout
			self.vsc_apply_xonshrc()
			self.vsc_wrapped_prompt()
			self.add_vsc_events()
			__xonsh__.env['VSCODE_SHELL_INTEGRATION'] = '1'
			del __xonsh__.env['VSCODE_INJECTION']

	def vsc_apply_xonshrc(self):
		vscode_xonshrc = __xonsh__.env.get('XONSHRC', '')
		if vscode_xonshrc:
			for _vsc_rc_file in vscode_xonshrc:
				if _vsc_rc_file and os.path.isfile(_vsc_rc_file):
					try:
						source @(_vsc_rc_file)
					except Exception:
						pass

	def _write_begin_osc(self):
		self.stdout.write("\x1b]")

	def _write_end_osc(self):
		self.stdout.write("\x07")
		self.stdout.flush()

	def write_osc(self, msg):
		self._write_begin_osc()
		self.stdout.write(f"{msg}")
		self._write_end_osc()

	def vsc_wrapped_prompt(self):
		"""Generate prompt with A marker before it"""
		_vsc_orig_prompt = $PROMPT

		if callable(_vsc_orig_prompt):
			original = _vsc_orig_prompt()
		else:
			original = str(_vsc_orig_prompt)

		if '\001' in original:
			return original

		$PROMPT = f'\001\x1b]633;A\x07\002{original}\001\x1b]633;B\x07\002'

	def _vsc_escape_value(self, value):
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

	def _vsc_command_executed(self, cmd):
		"""
			Send OSC 633 ; E and C - Command line and execution started
			note: When sending E before C - vscode is overriding the sent command
		"""
		trimmed_cmd = cmd.strip() if cmd else ''
		escaped_cmd = self._vsc_escape_value(trimmed_cmd)
		self.write_osc(f'633;C')
		self.write_osc(f'633;E;{escaped_cmd};{self._vscode_nonce}')

	def _vsc_command_finished(self, cmd, exit_code=None):
		"""Send OSC 633 ; D - Command finished with exit code"""
		if not cmd or cmd.strip() == '' or exit_code is None:
			# Empty command (just pressed Enter)
			self.write_osc('633;D')
		else:
			self.write_osc(f'633;D;{exit_code}')

	def add_vsc_events(self):
		@events.on_precommand
		def _vsc_on_precommand(cmd, **kwargs):
			"""Called before a command is executed"""
			self._vsc_command_executed(cmd)

		@events.on_postcommand
		def _vsc_on_postcommand(cmd, rtn, out, ts, **kwargs):
			"""Called after a command is executed"""
			self._vsc_command_finished(cmd, rtn if rtn is not None else 0)

		@events.on_pre_prompt
		def _vsc_on_pre_prompt(**kwargs):
			self.vsc_wrapped_prompt()


if 'VSCODE_SHELL_INTEGRATION' not in __xonsh__.env:
	__xonsh__.vsc = _vsCodeXonsh()
