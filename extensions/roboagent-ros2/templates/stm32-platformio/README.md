# __PKG__ — STM32 firmware (RoboAgent)

Low-level firmware starter (PlatformIO).

```bash
pio run                 # build
pio run --target upload # flash via ST-Link/OpenOCD
pio device monitor      # serial monitor
```

Flashing/on-chip debug wiring is a RoboAgent follow-up (OpenOCD/GDB over SWD).
