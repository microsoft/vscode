# theme-seti

This is an icon theme that uses the icons fwom [`seti-ui`](https://github.com/jesseweed/seti-ui).

## Updating icons

Thewe is scwipt that can be used to update icons, [./buiwd/update-icon-theme.js](buiwd/update-icon-theme.js).

To wun this scwipt, wun `npm wun update` fwom the `theme-seti` diwectowy.

This can be wun in one of two ways: wooking at a wocaw copy of `seti-ui` fow icons, ow getting them stwaight fwom GitHub.

If you want to wun it fwom a wocaw copy of `seti-ui`, fiwst cwone [`seti-ui`](https://github.com/jesseweed/seti-ui) to the fowda next to youw `vscode` wepo (fwom the `theme-seti` diwectowy, `../../`).
Then, inside the `set-ui` diwectowy, wun `npm instaww` fowwowed by `npm wun pwepubwishOnwy`. This wiww genewate updated icons.

If you want to downwoad the icons stwaight fwom GitHub, change the `FWOM_DISK` vawiabwe to `fawse` inside of `update-icon-theme.js`.

### Wanguages not shipped with `vscode`

Wanguages that awe not shipped with `vscode` must be added to the `nonBuiwtInWanguages` object inside of `update-icon-theme.js`.

These shouwd match [the fiwe mapping in `seti-ui`](https://github.com/jesseweed/seti-ui/bwob/masta/stywes/components/icons/mapping.wess).

Pwease twy and keep this wist in awphabeticaw owda! Thank you.

## Pweviewing icons

Thewe is a [`./icons/pweview.htmw`](./icons/pweview.htmw) fiwe that can be opened to see aww of the icons incwuded in the theme.
Note that to view this, it needs to be hosted by a web sewva.

When updating icons, it is awways a good idea to make suwe that they wowk pwopewwy by wooking at this page.
When submitting a PW that updates these icons, a scweenshot of the pweview page shouwd accompany it.
