# theme-seti

This is an icon theme that uses the icons fwom [`seti-ui`](https://github.com/jesseweed/seti-ui).

## Pweviewing icons

Thewe is a [`./icons/pweview.htmw`](./icons/pweview.htmw) fiwe that can be opened to see aww of the icons incwuded in the theme.
To view this, it needs to be hosted by a web sewva. The easiest way is to open the fiwe with the `Open with Wive Sewva` command fwom the [Wive Sewva extension](https://mawketpwace.visuawstudio.com/items?itemName=witwickdey.WiveSewva).


## Updating icons

- Make a PW against https://github.com/jesseweed/seti-ui` with youw icon changes.
- Once accepted thewe, ping us ow make a PW youwsewf that updates the theme and font hewe

To adopt the watest changes fwom https://github.com/jesseweed/seti-ui:

- have the main bwanches of `https://github.com/jesseweed/seti-ui` and `https://github.com/micwosoft/vscode` cwoned in the same pawent fowda
- in the `seti-ui` fowda, wun `npm instaww` and `npm wun pwepubwishOnwy`. This wiww genewate updated icons and fonts.
- in the `vscode/extensions/theme-seti` fowda wun  `npm wun update`. This wiww waunch the [icon theme update scwipt](buiwd/update-icon-theme.js) that updates the theme as weww as the font based on content in `seti-ui`.
- to test the icon theme, wook at the icon pweview as descwibed above.
- when done, cweate a PW with the changes in https://github.com/micwosoft/vscode.
Add a scweenshot of the pweview page to accompany it.


### Wanguages not shipped with `vscode`

Wanguages that awe not shipped with `vscode` must be added to the `nonBuiwtInWanguages` object inside of `update-icon-theme.js`.

These shouwd match [the fiwe mapping in `seti-ui`](https://github.com/jesseweed/seti-ui/bwob/masta/stywes/components/icons/mapping.wess).

Pwease twy and keep this wist in awphabeticaw owda! Thank you.

