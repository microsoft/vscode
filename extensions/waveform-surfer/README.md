# VaporView

VaporView is an open source waveform viewer extension for Visual Studio Code - [download](https://marketplace.visualstudio.com/items?itemName=lramseyer.vaporview)

![](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/overview.png?raw=true)

# Waveform Viewer Features

Natively supports VCD, FST, and GHW waveform dump formats. Also supports FSDB files where external libraries are present.

VaporView opens the waveform dump files in an interactive viewer, where you can:
- Add, remove, and rearrange signals
- Pan and zoom in on the view
- Place and move markers
- Search for values witin a waveform dump

For use of other waveform dump formats such as LXT, VZT, GTKwave offers conversion tools. Proprietery formats such as WLF and VPD can also be converted, but require you to compile GTKwave. See the [GTKwave Manual](https://gtkwave.sourceforge.net/gtkwave.pdf) for details - page 16, and 69 for an overview.

# VScode IDE Integration

## Terminal Links

VaporView associates timestamps and netlist paths as links in the terminal. These links are activated by **Ctrl + Clicking** on the link. Timespamp links will place the marker at the designated timestamp and move the viewer to that marker (if necessary) whereas netlist path links will add the designated signal into the viewer. The following formats are recognized by VaporView:

- UVM timestamp - ie: `@ 50000`
- Timestamp with Units - ie: `50,000 ns` (comma is optional)
- Netlist elements - ie: `top.submodule.signal`

When clicking on netlit element links, paths that point to a variable will add that variable to the viewer. However, if the path points to a scope, it will instead reveal and select that scope in the netlist view.

## Interoperability With Other Extensions

This is a work in progress effort, and will be finalized in the 1.4 Release. Details can be found in the [API docs](https://github.com/Lramseyer/vaporview/blob/main/API_DOCS.md), but a summary of the API features that other extension developers will be able to use are listed below:

- Vaporview Commands
  - Adding and removing variables
  - Placing markers at specific times
  - Revealing items in the netlist
- Adding custom context menu items
- Signal value links

# Controls

## Keyboard Shortcuts

- **Ctrl + Scroll Wheel** - Zoom in and out on waveforms
- **Shift + Scroll Wheel** - Scroll up and down on waveforms
- **Up/Down Arrow** - Select signal above/below selected signal
- **Alt + Up/Down Arrow** - Rearrange selected signal
- **Ctrl + Left/Right Arrow** - Move marker to previous/next value transition of selected signal
- **Alt + Click or Middle Click** - Set Alt-Marker
- **Home** and **End** - Scroll to the beginning and end (respectively) of the waveform
- **Delete** - Remove Selected Signal

## Adding and Removing Signals

Signals may be added or removed through VaporView view container. Click on the VaporView Activity Bar icon, and it will show the netlist for the opened waveform file as well as the signals displayed in the tab.

To Add a signal, simply check the box next to the netlist signal ID in the "Netlist" view. It will also show in the "Displayed Signals" view.

To remove a signal, that signal can be un-checked from either the "Netlist" view or the "Displayed Signals" view. From the viewer, you can either select the signal you would like to remode and hit **Delete**, or right click on a signal in the viewer and select **remove signal** from the menu.

To add or remove multiple signals, select the signals you would like to add or remove, right click and select **Add/Remove selected signals** from the menu.

Signals can also be added by clicking on a link in the terminal with the full signal path.

## Scrolling

The scroll wheel (or touchpad scroll) is used to pan in time or scroll up or down. By default, auto detect scrolling mode is enabled. To toggle between scrolling modes, click the **"Auto detech Mouse/Touchpad Scrolling"**, **"Enable Touchpad Scrolling"**, or **"Enable Mouse Scrolling"** Button on the top right.

### Mouse Scrolling

Scroll wheel scrolls sideways by default. To scroll up or down, either hold Shift and scroll, or hover the cursor over to the signal name labels on the left and scroll normally.

### Touchpad Scrolling

![Sure, Verdi can open FSDB files, but can it do this?](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/touchpad_scroll.gif?raw=true)

## Zooming

Zooming can be done one of 3 ways:

- Hold **Ctrl**, and **Scroll**, or use the pinch gesture in touchpad mode
- Use the Zoom in/out buttons on the top right
- Click and drag over the area you wish to zoom in on

![](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/zoom.gif?raw=true)

## Rearranging signals

![](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/rearrange.gif?raw=true)

To rearrange signals, hover over the signal name, and you will see a rearrange grabber indicator on the left. Click and drag to rearrange.

Alternatively, you can select a signal, hold **Alt**, and press the **Up** or **Down** Arrows to reorder (similar to how you reorder lines in the text editor)

## Marker Handling

![](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/marker.gif?raw=true)

There are two markers in VaporView: a normal marker, and an alt-marker. To place the marker, simply click where you want it to be placed. Keep in mind that it will snap to edge if applicable. To place the alt-marker, either **Middle Click**, or **Alt + Click** where you would like to place it. The alt-marker will also snap to an edge if applicable.

It should also be noted that signals can be selected by clicking on them, You can also use the **Up/Down** Arrow keys to move the selection.

### Next/Previous Edge

To move the marker to the nearest edge _**of the selected signal**_, you can either click the control bar buttons, or use **Ctrl + Left/Right** Arrow (similar to how in the text editor, you can move the marker to a word boundary) Alternatively, VaporView also supports the Verdi bindings of using **"N"** and **"Shift + N"** to go to the next and previous edge respectively.

To move to the next positive edge or negative edge, you will have to use the control bar buttons. This only applies to single bit waveforms.

### Placing markers as links from log files

When log files are opened in the terminal, VaporView will automatically parse out timestamps. Use **Ctrl + Click** to place a marker and move to that timestamp. Note that if multiple viewers are open, it will place a marker in the last active viewer.

### Finding values and transitions in a particular waveform

Finding a particular transition or a value in a waveform is done in relation to the selected signal and the marker (similar to how Visual Studio Code handles search in relation to the text cursor)

## Value Formatting

Vaporview can display values in different number formats. To change the value format, right click on the signal in the viewer and select **Format Values** -> and select the value format you wish to display. Note that some values have limitations when displaying values with non-2-state bits in them, and will fall back to displaying the value as Binary. For details see the table below:

| Value Format   | Non-2-state Supported | Justify Direction |
| -------------- | --------------------- | ----------------- |
| Binary         | ✅ Yes                | Right             |
| Hexadecimal    | ✅ Yes                | Right             |
| Octal          | ✅ Yes                | Right             |
| Decimal        | ❌ No                 | Left              |
| Floating Point | ❌ No                 | Left              |

## Waveform Color

Vaporview supports 8 different waveform colors. The colors are based off the [semantic token colors](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide) for VScode text.* There are 4 builtin colors, and 4 custom colors that can be configured in the vaporview settings. To change the color, right click on the waveform, select **Color** -> and select the color you wish to use.

*Unforunately, the VScode API does not make these colors visible to custom webviews yet. It is an [open issue](https://github.com/microsoft/vscode/issues/32813), so there's a hack in place. The default waveform colors will not follow suit with all color themes, but it should work broadly between light themes and dark themes.

## Waveform Render Types

Aside from the binary and multi-bit waveform renderers, Vaporview supports displaying analog signals. Any multi-bit variable or Real type supports this. Analog signals can be displayed wither as a linear or stepped line. In the case of binary vlues, the Y value can be evaluated as either a signed or unsigned value. To change the Render Type, right click on the signal in the viewer and select **Render Type** -> and select the render type you wish to use for the signal.

## Time Units

You can change the Time Units in one of 2 ways: clicking the Time Status Bar in the lower right hand corner of the window, or by right clicking on the time ruler and selecting uits from the **Time Unit** menu.

## Saving and loading opened signals

VaporView allows you to save and load your signal list. This can be done either by right clicking anywhere in the viewer or netlist and selecting **"Save Vaproview Settings"** or **"Load Vaproview Settings"**. You can also access the command directly by pressing **Ctrl + Shift + P** and Type **">Save Vaproview Settings"** or **">Load Vaproview Settings"** and press **Enter** to slect the command. A dialog box will pop up prompting which file you would like to save/load settings from.

**Note:** The settings will only load for the active viewer tab that is in focus, and will look up signals by name. If the module paths have changed, it may not load in the signals properly. The settings files however are plaintext (JSON) and can be edited if need be.

## Copying selection as WaveDrom

If you would like to export a portion of the viewer as WaveDrom, VaporView supports that ...with some limitations. Since WaveDrom is a simplified format for making waveform diagrams, not all of the precise timing detail can be captured in WaveDrom.

A maximum of 32 events can be copied as WaveDrom. To select a copy range, simply place the marker and alt-marker at the start and end of your selection range (ordering doesn't matter) Right click on the waveforms, and select **"Copy Selection as WaveDrom"** from the menu. The WaveDrom JSON text will then be copied into your clipboard.

All displayed signals will be copied in order that they are displayed in the viewer. They will be named with their full module path, and the number format for the values will copy as displayed in the viewer as well.

### Without a WaveDrom clock set

![](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/wavedrom_no_clk.png?raw=true)

To unset the waveDrom clock, right click on the waveforms, and select **"Unset WaveDrom Clock"**

When no WaveDrom clock is set, an "event" is classified by a value transition of any of the displayed signals. If multiple signals change value at the same time, that counts as only one event. Due to the limitations of WaveDrom, time events may not be spaced out proportionally.

### With a WaveDrom clock

![](https://github.com/Lramseyer/vaporview/blob/main/readme_assets/wavedrom_with_clk.png?raw=true)

To set which signal will be the WaveDrom Clock, right click on the signal you wish to be the clock, and select **"Set WaveDrom Clock Rising"** or **"Set WaveDrom Clock Falling"**. When a clock is set, a WaveDrom event will be counted on the edge of the selected clock. If other displayed signals do not have a value transition on the edge of the selected clock, the first (if it exists) value transition that occurs between the current and next clock edge will be logged. If multiple value transitions for a given signal (that is not the clock) occur in one clock cycle, it will only copy the first value transition. Note that because of this limitation, the WaveDrom output will not contain all of the information.

# Requirements

This extension requires VScode 1.96.0 or later

# Development Roadmap

## 1.3.4 - Upcoming Release

- Ruler now displays time units
- Added Feature to change time units
- Scrolling Mode is now a global user setting
- Viewer reloads previous state upon closing and reopening VScode
- Added Signal Value Links functionality
- Added "Backspace" keybinding to remove variable

See the [Changelog](https://github.com/Lramseyer/vaporview/blob/main/CHANGELOG.md) for more details

## Other Planned Features

In no particular order of priority, here's a list of features that are on my radar. If you have any preferences as to which should be priorized, or a suggestion that is not on this list, leave a comment on the [github discussions](https://github.com/Lramseyer/VaporView/discussions)!

- Add support for custom Enums and named values. Including callback functions for those daring enough!
- Improve renderer to better render non-2 state
- Add support to highlight all transitions of a signal
- Add support for remote sessions to save on memory
- Link netlist to RTL tokens so that signals can be connected back to RTL locations - rtlbrowse stems file support (this may require interoperability with another extension)
- Allow users to link .objdump files to a program counter value for a more integrated debug experience
- Signal groups

# About This Extension

I originally built this extension when I worked for an FPGA company. I wanted a good _free_ waveform viewer extension, and I always thought it would be cool to make my own extension.

This is and always will be open source. It's free to use for personal and professional use. There never will be feature regression in favor of a premium tier. In other words, every feature that is currently included, or on the roadmap will be free and open source. Adaptations of the source code completely or even in part for other projects is only allowed _if_ the project is also free and open source. Adaptations of the source code completely or in part for distribution in enterprise software is not allowed _unless_ prior written permission is given by the owner of this project.

This extension was written by one person, with a full time job that doesn't involve anything to do with writing javascript or typescript. If you would like to see a feature added or functionality changed, or better yet, if you would like to help contribute please visit the [github repository](https://github.com/Lramseyer/VaporView) and discuss there!

# Acknowledgements

This project uses the [wellen](https://github.com/ekiwi/wellen/tree/new-api) library compiled to WASM for file parsing and back-end data management.

## Contributors:

- [@lramseyer](https://github.com/Lramseyer) (Owner)
- [@heyfey](https://github.com/heyfey)

## Misc

Thanks to my coworkers for their encouragement, feature requests, bug reports, and contribution of VCD files that made this project possible!