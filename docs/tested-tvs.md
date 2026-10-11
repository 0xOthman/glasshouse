# Tested TVs

Confirmed on 41 TVs across 27 series so far (webOS 3.4 through 26). Other rooted models should work.

Sizes and regional variants of one series run the same software, so the table below has one row per series. Years are LG's model years; many TVs have since been updated to a later webOS.

The Luna service names and `/proc/lg` paths this relies on may differ across webOS versions and panel types.

| Series        | Year | Panel | webOS seen        | Reports |
| :------------ | :--- | :---- | :---------------- | :------ |
| UH6030        | 2016 | LCD   | 3.4               | 1       |
| UH610V        | 2016 | LCD   | 3.4               | 1       |
| UH635V        | 2016 | LCD   | 3.x               | 1       |
| B7            | 2017 | OLED  | 3.9               | 1       |
| B8            | 2018 | OLED  | 4.4               | 1       |
| C8            | 2018 | OLED  | 4.4               | 1       |
| LM57          | 2019 | LCD   | 4.5               | 1       |
| C9            | 2019 | OLED  | 4.9 – 4.10        | 3       |
| CX            | 2020 | OLED  | 5.5 – 5.6         | 4       |
| GX            | 2020 | OLED  | 5.6               | 1       |
| C1            | 2021 | OLED  | 6.x               | 2       |
| UP80          | 2021 | LCD   | 6.5               | 1       |
| UP81          | 2021 | LCD   | 6.5               | 1       |
| C2            | 2022 | OLED  | 9.2 (22)          | 1       |
| G2            | 2022 | OLED  | 7.4 (22)          | 1       |
| QNED82        | 2022 | LCD   | 7.6               | 1       |
| LX3           | 2022 | OLED  | —                 | 1       |
| CS            | 2022 | OLED  | 25                | 1       |
| C3            | 2023 | OLED  | 25                | 2       |
| G3            | 2023 | OLED  | 26                | 1       |
| B4            | 2024 | OLED  | 24                | 1       |
| C4            | 2024 | OLED  | 24 – 25           | 4       |
| G4            | 2024 | OLED  | 24 – 25           | 2       |
| UT81          | 2024 | LCD   | 25                | 1       |
| C5            | 2025 | OLED  | 25                | 3       |
| G5            | 2025 | OLED  | 25 – 26           | 2       |
| NU80          | 2026 | LCD   | 26                | 1       |

<details markdown="1">
<summary>All reports</summary>

| Model       | webOS        | Firmware | Panel | Notes                                                          |
| :---------- | :----------- | :------- | :---- | :------------------------------------------------------------- |
| 43UH610V-ZB | 3.4.3        | 05.70.50 | LCD   | No SoC temp, eMMC wear, or OLED metrics by hardware design     |
| 55UH6030-UC | 3.4.3        | —        | LCD   |                                                                |
| 58UH635V    | 3.x          | 05.70.40 | LCD   | no eMMC wear reported                                          |
| OLED65B7V-Z | 3.9.3        | 06.10.65 | OLED  | No SoC temperature or eMMC wear readings                       |
| OLED65C8PUA | 4.4.0        | 05.50.15 | OLED  | No `getAdid` on this firmware                                  |
| OLED65B8SLC | 4.4.3        | 05.50.70 | OLED  | Everything works. Misses a few metrics found on newer versions |
| 43LM5760PTC | 4.5          | —        | LCD   | Configured with panel: lcd; service and web UI confirmed       |
| OLED55C9PLA | 4.9.0        | 05.30.40 | OLED  | Working fine                                                   |
| OLED65C9AUA | 4.9.x (4.5+) | 05.50.00 | OLED  |                                                                |
| OLED65C9PLA | 4.10.2       | —        | OLED  | Working fine                                                   |
| OLED77CX6LA | 5.5.0        | 04.50.90 | OLED  | OLED Care, telemetry and MQTT bridge confirmed                 |
| OLED77CXAUA | 5.6.0        | 04.60.65 | OLED  | Rooted with faultmanager; SSH install; dashboard and telemetry |
| OLED48CXPUB | 5.6.2        | 04.64.00 | OLED  | Rooted with slopbro; dashboard, telemetry and API .ipk installs |
| OLED65CXPUA | 5.6.2        | 04.64.00 | OLED  | Rooted with slopbro; dashboard, telemetry and API .ipk installs |
| OLED55GX6LA | 5.6.2        | 04.64.00 | OLED  | MQTT bridge and screen savers confirmed                        |
| OLED55C17LB | 6.x          | —        | OLED  | HDMI 2.1 diagnostics and remote battery reporting              |
| OLED55C1PUB | 6.x (6.3+)   | 03.53.45 | OLED  | SSH install and MQTT bridge confirmed                          |
| 50UP81006LR | 6.5.0        | 03.51.16 | LCD   | Installed over telnet; in-app update confirmed                 |
| 43UP80006LA | 6.5.3        | 03.53.45 | LCD   | MQTT bridge confirmed                                          |
| OLED65G29LA | 7.4.0 (22)   | 04.40.90 | OLED  | Confirmed working                                              |
| 55QNED826QB | 7.6.0        | 04.60.90 | LCD   | Installed over SSH; MQTT bridge confirmed                      |
| OLED42C24LA | 9.2.2 (22+)  | 23.25.55 | OLED  | Rooted with jsbro-autoroot                                     |
| OLED55C4PUA | 24 (9.2.0)   | 23.20.35 | OLED  | Rooted with faultmanager; SSH install; no internet access      |
| OLED55B46LA | 24 (9.24.8)  | 23.23.30 | OLED  | Installed over telnet                                          |
| OLED55G42LW | 24           | 33.31.68 | OLED  | Rooted with slopbro, not the Homebrew Channel                  |
| 50UT81006LA | 25 (10.2.1)  | 33.22.56 | LCD   | Partial: blocking works; some settings reported not to apply   |
| OLED55C31LA | 25 (10.2.2)  | 33.22.80 | OLED  | Installed over SSH; in-app updates confirmed                   |
| OLED65CSPSA | 25 (10.3.0)  | 33.31.20 | OLED  | Reported working                                               |
| OLED65C41LA | 25 (10.3.0)  | 33.31.24 | OLED  | Rooted with Dangbro; installed with webOS Dev Manager          |
| OLED65C3PUA | 25 (10.3.1)  | 33.31.68 | OLED  | MQTT and volume control confirmed                              |
| OLED65C4PSA | 25 (10.3.1)  | 33.31.6  | OLED  |                                                                |
| OLED65G45LW | 25 (10.3.1)  | —        | OLED  | Rooted with Dangbro                                            |
| OLED77C4PSA | 25 (10.3.1)  | 33.31.68 | OLED  | Rooted with Dangbro; resolution reported stuck at 1920x1081    |
| OLED48C55LA | 25 (10.3.1)  | 33.31.68 | OLED  | Installed over telnet; in-app update to 0.37.2 confirmed       |
| OLED77C57LA | 25 (10.3.1)  | 33.31.68 | OLED  | MQTT, privacy, screen saver and web dashboard confirmed        |
| OLED48C5PUA | 25 (10.3.1)  | 33.31.69 | OLED  | Rooted with slopbro; dashboard, telemetry and API .ipk installs |
| OLED65G5WUA | 25           | 33.30.69 | OLED  | No screen saver tab; volume stuck at +10 on optical output     |
| 42LX3Q6LA   | —            | 33.31.68 | OLED  | Flex; model number has no OLED prefix                          |
| 43NU800BPSC | 26 (11.0.0)  | 43.02.50 | LCD   | Rooted with slopbro; privacy controls confirmed                |
| OLED65G36LA | 26 (11.2.0)  | 43.21.71 | OLED  | Rooted with DualBro; privacy and app installs confirmed        |
| OLED83G5WUA | 26 (11.2.0)  | 43.21.71 | OLED  | Rooted with DualBro; runs with internet access blocked         |

</details>

**Tested on another model?** Please [open an issue](https://github.com/rorygallagher2024/glasshouse/issues/new) with the TV model, webOS version, and the contents of `/var/lib/tvweb/tvweb.log` — whether everything worked or something broke — and we will add a row.
