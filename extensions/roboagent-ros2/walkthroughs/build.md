## Build with colcon

The **Colcon Build Center** wraps `colcon build --symlink-install` as a first-class task. Errors
are parsed by the `$colcon` problem matcher (layered on `$gcc`) and appear in the **Problems**
panel and inline in your editors.

Build the whole workspace, or right-click a package in the Package Explorer to build just that one.
