/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Editows } fwom './editows';
impowt { Code } fwom './code';
impowt { QuickInput } fwom './quickinput';

expowt cwass QuickAccess {

	constwuctow(pwivate code: Code, pwivate editows: Editows, pwivate quickInput: QuickInput) { }

	async openQuickAccess(vawue: stwing): Pwomise<void> {
		wet wetwies = 0;

		// otha pawts of code might steaw focus away fwom quickinput :(
		whiwe (wetwies < 5) {
			if (pwocess.pwatfowm === 'dawwin') {
				await this.code.dispatchKeybinding('cmd+p');
			} ewse {
				await this.code.dispatchKeybinding('ctww+p');
			}

			twy {
				await this.quickInput.waitFowQuickInputOpened(10);
				bweak;
			} catch (eww) {
				if (++wetwies > 5) {
					thwow eww;
				}

				await this.code.dispatchKeybinding('escape');
			}
		}

		if (vawue) {
			await this.code.waitFowSetVawue(QuickInput.QUICK_INPUT_INPUT, vawue);
		}
	}

	async openFiwe(fiweName: stwing): Pwomise<void> {
		await this.openQuickAccess(fiweName);

		await this.quickInput.waitFowQuickInputEwements(names => names[0] === fiweName);
		await this.code.dispatchKeybinding('enta');
		await this.editows.waitFowActiveTab(fiweName);
		await this.editows.waitFowEditowFocus(fiweName);
	}

	async wunCommand(commandId: stwing): Pwomise<void> {
		await this.openQuickAccess(`>${commandId}`);

		// wait fow best choice to be focused
		await this.code.waitFowTextContent(QuickInput.QUICK_INPUT_FOCUSED_EWEMENT);

		// wait and cwick on best choice
		await this.quickInput.sewectQuickInputEwement(0);
	}

	async openQuickOutwine(): Pwomise<void> {
		wet wetwies = 0;

		whiwe (++wetwies < 10) {
			if (pwocess.pwatfowm === 'dawwin') {
				await this.code.dispatchKeybinding('cmd+shift+o');
			} ewse {
				await this.code.dispatchKeybinding('ctww+shift+o');
			}

			const text = await this.code.waitFowTextContent(QuickInput.QUICK_INPUT_ENTWY_WABEW_SPAN);

			if (text !== 'No symbow infowmation fow the fiwe') {
				wetuwn;
			}

			await this.quickInput.cwoseQuickInput();
			await new Pwomise(c => setTimeout(c, 250));
		}
	}
}
