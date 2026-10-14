# Apps and home screen launcher

The **Apps** tab, `/?tab=apps`, has three groups: **Apps**, for installing and removing apps and the web pages saved to the Home screen; **Home screen and remote**, for what the Home screen shows and what the remote's number keys open; and **Background**, for the memory LG's background apps and services take up.

![Apps tab in three groups: installed applications and saved web pages under Apps, the Home screen layout with its inputs and parts, Quick Access and hidden system apps under Home screen and remote, and apps kept ready and background services under Background](../screenshots/apps.png)

*The three groups, with installed applications, saved web pages, the Home screen layout, apps kept ready in the background and background services open.*

## Apps

### Manage applications

Lists the apps downloaded from the LG store or installed by hand, with their version, vendor, and storage badge showing disk footprint. Launch opens the application on the TV, while Uninstall deletes an app completely and frees its storage. LG's built-in apps can't be removed this way; they can be hidden instead.

When an application appears on the TV that was not installed through Glasshouse (such as sponsored bloatware silently pushed down by LG), an alert banner appears at the top of the group highlighting the new application, with options to **Keep** or immediately **Uninstall** it. Acknowledged apps can be uninstalled at any time from the list.

### Install homebrew apps

Lists the Homebrew Channel catalog, with category filters (All, Media, Games, Utilities, Ambilight, Screensavers) and keyword search, and Install, Update or Uninstall for each app. Downloads are checked against the catalog before they are installed, and the dashboard asks first when something needs a decision, such as replacing a copy installed from the LG store.

### Install app from a URL or file

Installs an `.ipk` package from outside the catalog. **From URL...** downloads one from an http or https address, with an optional sha256 to check it against, and **Upload .ipk** sends one from the browser. Both show the same preview as a catalog install.

It is off until it is switched on in this section (after a warning) or a token is set, since a package from outside the catalog can run anything on the TV. A request from the TV itself is always allowed.

### Saved web pages

Lists the web pages on the Home screen, each of which opens in the TV's browser. A page saved from the browser takes its whole title as its name, so a long one can be given a shorter name here. Pages can also be added, pointed at a new address, or removed.

## Home screen and remote

### Home screen layout

Switches parts of LG's Home screen off, for a Home screen with only the apps and inputs on it:

* **Banner**: the large picture at the top, with LG's adverts or, with them off, its own message and a Go to Apps button. The profile, notifications, settings and search buttons beside it go with it; Settings and search stay on the remote's own buttons.
* **Quick Cards**: the coloured buttons for LG's offers, Sports, Gaming, Music and others.
* **App tiles**: the row of apps and inputs.
* **Recent Input and Device Functions**: the last input used, and cards for editing the app list, the TV guide, the user guide and Home Hub.

At least one part stays. A change takes a few seconds, while the Home screen starts again, and lasts through restarts and power cuts. The rows further down, such as Live TV and LG Channels, come from LG's servers and stay.

**Inputs on Home** adds a tile for each HDMI input, named as the TV names it. The input tiles go before the apps, in HDMI order; adding one moves any input tiles moved elsewhere back to the front, and starts the Home screen again to show it. It is LG's own tile for the input, so it can be moved or removed on the TV like any other.

**Put back LG's Home screen** shows every part again and takes off the input tiles added here; ones added on the TV stay. The TV app has the same switches.

It is offered on webOS 9 (LG's webOS 24), where it has been tried on a C2. webOS 3 and 4 have a much plainer Home screen, and webOS 10 and later a different home app, so neither has it. A webOS 8 TV may have the same home app; it is not offered there until one has been tried.

### Quick Access

Sets what each number key on the remote opens when it is held: an installed app, an HDMI input or Live TV, for keys 1 to 9. Holding 0 shows the list on the TV. A change applies straight away, the same as changing it in the TV's own Quick Access list, which shows it too.

**None** leaves a key opening nothing, including one LG set itself, such as its help on 9. A key LG set for an app that is not installed, as it does for some regions' channel apps, shows as **App not installed**, with the app's id beneath. A key set to a live TV channel on the TV shows the channel, and can be changed here but not set to another channel. The TV app lists the keys without changing them.

### Hide home screen system apps

Hides built-in LG apps that can't be uninstalled, such as Gallery, Music, Sports, Alexa and the User Guide, from the Home screen ribbon. The apps themselves stay on the TV, and switching the feature off brings every one back.

It is experimental, and off until it is turned on under **Server** → **Advanced** → **Experimental features**; see [Experimental features](../experimental.md) for why. It is not offered on a Homebrew Channel install.

## Background

### Apps kept ready in the background

LG keeps some apps loaded so they open faster, including ones that are never used, and each takes up memory. The list shows each one with roughly how much memory it takes once loaded, and which are loaded now.

Switching an app off frees its memory once the app is next closed or the TV restarts, and it then takes a few seconds longer to open. Switching it back on returns it to LG's setting. Home, Live TV, the HDMI inputs and the other parts the TV relies on are not listed, and the section only appears on TVs that keep such a list.

### Turn off background services

Stops background services that most TVs don't need, such as the connected-car listener, the USB camera watcher, and LG's diagnostics and telemetry uploaders. Only the services present on the TV are listed. A service switched off stays off across restarts, and is stopped again if something on the TV starts it.

## Notes

* Live TV, Settings, Home, the HDMI inputs, the Homebrew Channel and Glasshouse itself are protected: they can't be hidden or uninstalled.
* Everything on this tab also works from the TV app, except saved web pages and installing from a URL or a file, which are in the browser dashboard only.
* Apps that check they were installed from the LG store may refuse to run when installed another way, and apps built for a newer webOS than the TV runs may not launch.
