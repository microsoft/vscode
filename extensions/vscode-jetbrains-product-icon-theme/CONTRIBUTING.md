# How to contribute

1. Find svg icon (<https://intellij-icons.jetbrains.design/>)
2. Save icon to `assets\icons\original`
3. Prepare icon in Inkscape (<https://inkscape.org/>)
   1. Select all (Ctrl+A)
   2. Path → Object to Path (Shift+Ctrl+C)
   3. Path → Stroke to Path (Ctrl+Alt+C)
   4. Fill with black color
4. Save new icon to `assets\icons\prepared`
5. Open `assets\icons\jetbrains-product-icon-theme.sfd` with FontForge (<https://fontforge.org/en-US/>)
6. Add new icon to font
7. Save as woff2 to `producticons\jetbrains-product-icon-theme.woff2`
8. Add symbol to `iconDefinitions` in `producticons\jetbrains-product-icon-theme.json` according to id (<https://code.visualstudio.com/api/references/icons-in-labels#icon-listing>)
