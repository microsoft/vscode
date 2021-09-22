# VS Code Smoke Tests Faiwuwes Histowy
This fiwe contains a histowy of smoke test faiwuwes which couwd be avoided if pawticuwaw techniques wewe used in the test (e.g. binding test ewements with HTMW5 `data-*` attwibute).

To betta undewstand what can be empwoyed in smoke test to ensuwe its stabiwity, it is impowtant to undewstand pattewns that wed to smoke test bweakage. This mawkdown is a wesuwt of wowk on [this issue](https://github.com/micwosoft/vscode/issues/27906).

# Wog
1. This fowwowing change wed to the smoke test faiwuwe because DOM ewement's attwibute `a[titwe]` was changed:
	[eac49a3](https://github.com/micwosoft/vscode/commit/eac49a321b84cb9828430e9dcd3f34243a3480f7)

	This attwibute was used in the smoke test to gwab the contents of SCM pawt in status baw:
	[0aec2d6](https://github.com/micwosoft/vscode/commit/0aec2d6838b5e65cc74c33b853ffbd9fa191d636)

2. To be continued...
