/*
 * Panel vitals screen saver — Keynote Bento Edition.
 *
 * Presents the TV's live hardware telemetry (/api/stats) as an asymmetric
 * 6-tile Bento grid inspired by Apple Keynote hardware slides and the
 * Glasshouse Metrics tab:
 *   - Wide Hero tiles: OLED Panel Life (with milestone bar), Thermal Telemetry
 *     (with 20-bar live temperature history chart), Signal & Picture Engine
 *     (with HDR/colorimetry/HDMI link pills), and OLED Pixel Care (with
 *     circular compensation progress ring).
 *   - Standard tiles: LG SoC Silicon Die (A-series style chip package with
 *     neon bevel glow), Magic Remote Battery Ring, 4-Core CPU Activity Meters,
 *     Unified Memory & zram Bars, eMMC Flash Silicon Matrix, Network & AdBlock
 *     Shield, and System Clock & Dual Uptime.
 *
 * Burn-in prevention:
 *   1. Compact 6-box Bento stage (1112x488) on pure #000000 OLED black.
 *   2. Every 4 seconds, a single Bento box flips out, swaps to the next metric
 *      card in the deck, and flips back in.
 *   3. Every 24 seconds, all 6 boxes stagger-fade out to pure black, the stage
 *      relocates to a new quadrant of the 1920x1080 screen, permutes its
 *      Wide/Standard column geometry so borders never land on the same pixels,
 *      and stagger-builds back in.
 *
 * Strictly QtQuick 2.4 and Eos.Window 0.1 for webOS 2 through webOS 11.
 */
import QtQuick 2.4
import Eos.Window 0.1

WebOSWindow {
    id: win

    // Sized for the compositor's 1920x1080 layout rather than from Screen,
    // which can report smaller: a 43LM5760PTC drew the window in a corner.
    width: 1920
    height: 1080

    windowType: "_WEBOS_WINDOW_TYPE_SCREENSAVER"
    appId: "com.webos.app.screensaver"
    title: "Screen Saver"
    visible: true
    color: "black"

    FontLoader { id: thinFace;  source: "file:///usr/share/fonts/MuseoSans-Thin.ttf" }
    FontLoader { id: lightFace; source: "file:///usr/share/fonts/MuseoSans-Light.ttf" }
    FontLoader { id: medFace;   source: "file:///usr/share/fonts/MuseoSans-Medium.ttf" }
    FontLoader { id: boldFace;  source: "file:///usr/share/fonts/MuseoSans-Bold.ttf" }

    // Candidates for large figures, best first - see chooseDigitFamily.
    FontLoader { id: misoBold;  source: "file:///usr/share/fonts/Miso-Bold.ttf" }
    FontLoader { id: misoFace;  source: "file:///usr/share/fonts/Miso-Light.ttf" }
    FontLoader { id: lgLight;   source: "file:///usr/share/fonts/LG_Display-Light.ttf" }
    FontLoader { id: lgRegular; source: "file:///usr/share/fonts/LG_Display-Regular.ttf" }

    Text { id: metric; visible: false; text: "0" }

    property string digitFamily: ""
    property string labelFamily: lightFace.status === FontLoader.Ready ? lightFace.name : ""
    property string boldLabelFamily: boldFace.status === FontLoader.Ready ? boldFace.name
                                   : (medFace.status === FontLoader.Ready ? medFace.name : labelFamily)

    function chooseDigitFamily(px) {
        var cands = [lgRegular, lgLight, misoBold, misoFace, boldFace, lightFace, thinFace];
        metric.font.pixelSize = px;
        for (var i = 0; i < cands.length; i++) {
            if (cands[i].status !== FontLoader.Ready) continue;
            metric.font.family = cands[i].name;
            if (metric.width > 0 && metric.width / px < 0.9) return cands[i].name;
        }
        return "";
    }

    property real unit: win.height / 1080

    // Dim or bright, written in when the screen saver is staged.
    property int level: __TVWEB_LEVEL__

    // Surface & typography palette (scaled down for Dim mode)
    property color boxOuterBg:   level > 0 ? "#0c0f16" : "#06080c"
    property color boxInnerBg:   level > 0 ? "#07090d" : "#040508"
    property color boxWellBg:    level > 0 ? "#111520" : "#090b10"
    property color boxBorder:    level > 0 ? "#242b3b" : "#141822"
    property color boxHighlight: level > 0 ? "#30394f" : "#1a202c"
    property color trackBg:      level > 0 ? "#181d28" : "#0d1017"

    property color inkHero:      level > 0 ? "#f5f7fa" : "#8e96a4"
    property color inkSub:       level > 0 ? "#b8c0ce" : "#68707d"
    property color inkMuted:     level > 0 ? "#6e7787" : "#434954"

    // Velo accent swatches (dimmed in Dim mode so no pixel is bright)
    property color accGreen:     level > 0 ? "#30DE61" : "#1c8239"
    property color accBlue:      level > 0 ? "#3b76ff" : "#224699"
    property color accCool:      level > 0 ? "#D4E3FF" : "#788499"
    property color accWarm:      level > 0 ? "#FFDEA1" : "#96825e"
    property color accAmber:     level > 0 ? "#FFB04F" : "#96672e"
    property color accPurple:    level > 0 ? "#B57BFF" : "#6c4999"
    property color accRed:       level > 0 ? "#FF4242" : "#992828"

    // Stage geometry: 2 rows, each with 1 Wide tile (496) + 2 Standard tiles (292)
    property int tileH:     Math.round(236 * win.unit)
    property int stdW:      Math.round(292 * win.unit)
    property int wideW:     Math.round(496 * win.unit)
    property int gap:       Math.round(16 * win.unit)
    property int stageW:    wideW + stdW * 2 + gap * 2
    property int stageH:    tileH * 2 + gap
    property int tileRad:   Math.round(24 * win.unit)

    // Layout permutation (0, 1, 2) shifts which column holds the Wide tile in each row
    property int layoutPerm: 0
    property int statsRev: 0

    // Parsed telemetry state & hardware capability flags
    property bool isOled: false
    property bool hasOledCare: false
    property bool hasThermal: false
    property bool hasEmmc: false
    property bool hasAppStorage: false
    property bool hasSwap: false
    property bool isWifi: false
    property bool hasAdblock: false
    property bool hasRemote: false

    property string tvModel: "LG WEBOS TV"
    property string webosVer: "webOS"
    property string fwVer: ""
    property string socName: "ARM"
    property string socCaption: "Processor"
    property int cpuMhz: 0
    property int cpuLoad: 0
    property int cpuPeak: 0
    property var cpuCores: [8, 6, 10, 5]
    property int socTemp: 0
    property real tempMin: 35.0
    property real tempSpan: 30.0
    property var tempHistory: [48, 48, 49, 49, 50, 50, 50, 51, 51, 51, 52, 52, 52, 53, 53, 53, 54, 54, 54, 55]
    property int panelHours: 0
    property var panelPills: ["webOS"]
    property real hoursUntilComp: 4.0
    property real hoursSinceComp: 0.0
    property real compInterval: 4.0
    property int refresherRemaining: 2000
    property string screenShiftState: "Off"
    property int ramPct: 0
    property string ramUsedStr: "—"
    property string ramTotalStr: "—"
    property string ramAvailStr: "—"
    property int swapPct: 0
    property string swapStr: ""
    property int remoteBatt: 0
    property string remoteModel: "Magic Remote"
    property bool remoteConnected: false
    property string signalHero: "Active"
    property string inputLabel: "WEBOS"
    property string picModeLabel: "Standard"
    property var signalPills: ["SDR"]
    property string emmcWearStr: "0-10%"
    property string emmcEolStr: "Normal"
    property int emmcHealthyBlocks: 9
    property string storageFreeStr: "Mounted"
    property int storageUsedPct: 30
    property int wifiBars: 4
    property string wifiLabel: "Network Link"
    property string netIfaceLabel: "LAN"
    property string netRateStr: "↓ Idle  ↑ Idle"
    property string netTotalStr: ""
    property bool adblockOn: false
    property int adblockCount: 0
    property string bootUptimeStr: "—"
    property string activeUptimeStr: "—"
    property string clockH: "00"
    property string clockM: "00"
    property int soundVol: 0
    property bool soundMuted: false
    property string soundOutLabel: "TV Speaker"

    // Card decks: dynamically filtered in collect() based on what hardware exists on the TV
    property var wideDeck: ["panel", "signal", "memwide"]
    property var stdDeck:  ["silicon", "remote", "cpu", "memory", "network", "uptime"]

    // Current card assigned to each of the 6 slots (initialized to universal cards safe on all TVs)
    property string slot0Card: "panel"
    property string slot1Card: "silicon"
    property string slot2Card: "remote"
    property string slot3Card: "cpu"
    property string slot4Card: "signal"
    property string slot5Card: "uptime"

    property int nextWideIdx: 2
    property int nextStdIdx: 4
    property int flipCursor: 0

    function two(n) { return n < 10 ? "0" + n : "" + n; }

    function grouped(n) {
        var s = String(Math.round(n));
        var out = "";
        for (var i = 0; i < s.length; i++) {
            if (i > 0 && (s.length - i) % 3 === 0) out += ",";
            out += s.charAt(i);
        }
        return out;
    }

    function fmtHours(v) {
        if (v === null || v === undefined) return "—";
        return (v >= 100 ? grouped(v) : (Math.round(v * 10) / 10)) + " h";
    }

    function fmtUptime(sec) {
        if (sec === null || sec === undefined) return "—";
        var d = Math.floor(sec / 86400);
        var h = Math.floor((sec % 86400) / 3600);
        var m = Math.floor((sec % 3600) / 60);
        if (d > 0) return d + "d " + h + "h";
        if (h > 0) return h + "h " + m + "m";
        return Math.max(1, m) + "m";
    }

    function fmtRate(bytesPerSec) {
        if (!bytesPerSec || bytesPerSec < 100) return "Idle";
        if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(1) + " MB/s";
        return Math.max(1, Math.round(bytesPerSec / 1024)) + " KB/s";
    }

    function fmtBytes(bytes) {
        if (!bytes || bytes <= 0) return "0 MB";
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
        return Math.max(1, Math.round(bytes / 1048576)) + " MB";
    }

    function capFirst(s) {
        if (!s) return "";
        var str = String(s);
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function isSlotWide(slotIdx) {
        // Row 0 (slots 0, 1, 2): wide slot is layoutPerm % 3
        // Row 1 (slots 3, 4, 5): wide slot is (layoutPerm + 1) % 3 + 3
        if (slotIdx < 3) return slotIdx === (win.layoutPerm % 3);
        return (slotIdx - 3) === ((win.layoutPerm + 1) % 3);
    }

    function slotWidth(slotIdx) {
        return isSlotWide(slotIdx) ? win.wideW : win.stdW;
    }

    function slotX(slotIdx) {
        var rowBase = slotIdx < 3 ? 0 : 3;
        var xPos = 0;
        for (var i = rowBase; i < slotIdx; i++) {
            xPos += slotWidth(i) + win.gap;
        }
        return xPos;
    }

    function slotY(slotIdx) {
        return slotIdx < 3 ? 0 : (win.tileH + win.gap);
    }

    function getSlotCard(slotIdx) {
        if (slotIdx === 0) return win.slot0Card;
        if (slotIdx === 1) return win.slot1Card;
        if (slotIdx === 2) return win.slot2Card;
        if (slotIdx === 3) return win.slot3Card;
        if (slotIdx === 4) return win.slot4Card;
        return win.slot5Card;
    }

    function setSlotCard(slotIdx, cardId) {
        if (slotIdx === 0) win.slot0Card = cardId;
        else if (slotIdx === 1) win.slot1Card = cardId;
        else if (slotIdx === 2) win.slot2Card = cardId;
        else if (slotIdx === 3) win.slot3Card = cardId;
        else if (slotIdx === 4) win.slot4Card = cardId;
        else win.slot5Card = cardId;
    }

    function assignDeckForLayout() {
        var wIdx = win.nextWideIdx;
        var sIdx = win.nextStdIdx;
        for (var i = 0; i < 6; i++) {
            if (isSlotWide(i)) {
                setSlotCard(i, win.wideDeck[wIdx % win.wideDeck.length]);
                wIdx++;
            } else {
                setSlotCard(i, win.stdDeck[sIdx % win.stdDeck.length]);
                sIdx++;
            }
        }
        win.nextWideIdx = (wIdx + 1) % win.wideDeck.length;
        win.nextStdIdx = (sIdx + 1) % win.stdDeck.length;
    }

    // Ensure no currently displayed slot holds a card that isn't supported on this TV
    function sanitizeVisibleSlots() {
        for (var i = 0; i < 6; i++) {
            var wide = isSlotWide(i);
            var deck = wide ? win.wideDeck : win.stdDeck;
            var cur = getSlotCard(i);
            var valid = false;
            for (var k = 0; k < deck.length; k++) {
                if (deck[k] === cur) { valid = true; break; }
            }
            if (!valid) {
                for (var m = 0; m < deck.length; m++) {
                    var cand = deck[m];
                    var alreadyShown = false;
                    for (var j = 0; j < 6; j++) {
                        if (i !== j && getSlotCard(j) === cand) { alreadyShown = true; break; }
                    }
                    if (!alreadyShown) {
                        setSlotCard(i, cand);
                        break;
                    }
                }
            }
        }
    }

    function collect(d) {
        if (!d) return;
        var modelRaw = (d.device && d.device.model) ? String(d.device.model) : String(d.model || "LG WEBOS TV");
        win.tvModel = modelRaw.split(".")[0].toUpperCase();

        if (d.system && d.system.webos) win.webosVer = "webOS " + d.system.webos;
        if (d.system && d.system.firmware) win.fwVer = "FW " + d.system.firmware;

        var totalCores = (d.coresTotal && d.coresTotal > 0) ? Math.min(8, Number(d.coresTotal))
                       : ((d.cores && d.cores.length > 0) ? Math.min(8, d.cores.length) : 4);

        win.cpuMhz = d.mhz || 0;
        var mhzPart = win.cpuMhz > 0 ? (win.cpuMhz + " MHz") : (totalCores + "-Core");

        if (d.hardware && d.hardware.soc_arch) {
            var rawSoc = String(d.hardware.soc_arch);
            var paren = rawSoc.match(/\(([^)]+)\)/);
            if (paren && paren[1]) {
                win.socName = paren[1].trim().toUpperCase().slice(0, 6);
                var outerName = rawSoc.replace(/\s*\([^)]*\)/, "").trim();
                win.socCaption = (outerName ? outerName : (totalCores + "-Core")) + (win.cpuMhz > 0 ? (" · " + win.cpuMhz + " MHz") : "");
            } else if (rawSoc.length <= 6) {
                win.socName = rawSoc.toUpperCase();
                win.socCaption = totalCores + "-Core · " + mhzPart;
            } else {
                win.socName = rawSoc.split(/[\s-]/)[0].toUpperCase().slice(0, 6);
                win.socCaption = rawSoc;
            }
        } else {
            win.socName = "ARM";
            win.socCaption = totalCores + "-Core · " + mhzPart;
        }

        win.cpuLoad = d.load !== undefined && d.load !== null ? Math.round(d.load) : 0;
        win.cpuPeak = d.loadPeak !== undefined && d.loadPeak !== null ? Math.round(d.loadPeak) : win.cpuLoad;

        var cList = [];
        for (var ci = 0; ci < totalCores; ci++) {
            if (d.cores && ci < d.cores.length && d.cores[ci] !== null && d.cores[ci] !== undefined) {
                cList.push(Math.max(4, Math.min(100, Math.round(d.cores[ci]))));
            } else if (!d.cores || d.cores.length === 0) {
                cList.push(Math.max(4, Math.min(100, win.cpuLoad)));
            } else {
                // Core is parked / offline by kernel hotplug
                cList.push(0);
            }
        }
        win.cpuCores = cList;

        if (d.temp !== undefined && d.temp !== null && Number(d.temp) > 0) {
            win.hasThermal = true;
            win.socTemp = Math.round(Number(d.temp));
            var tOut = [];
            var count = 20;
            if (d.temps && d.temps.length > 0) {
                var start = Math.max(0, d.temps.length - count);
                for (var ti = start; ti < d.temps.length; ti++) {
                    var tv = Number(d.temps[ti]);
                    tOut.push(tv > 0 ? tv : win.socTemp);
                }
            }
            while (tOut.length < count) tOut.unshift(tOut.length > 0 ? tOut[0] : win.socTemp);
            var minT = tOut[0];
            var maxT = tOut[0];
            for (var tk = 1; tk < tOut.length; tk++) {
                if (tOut[tk] < minT) minT = tOut[tk];
                if (tOut[tk] > maxT) maxT = tOut[tk];
            }
            var midT = (minT + maxT) * 0.5;
            var span = Math.max(10.0, (maxT - minT) * 1.6);
            win.tempMin = midT - span * 0.5;
            win.tempSpan = span;
            win.tempHistory = tOut;
        } else {
            win.hasThermal = false;
            win.socTemp = 0;
        }

        win.bootUptimeStr = fmtUptime(d.uptime);
        if (d.powerState && d.powerState.onTime && d.powerState.onTime.ontime !== undefined) {
            win.activeUptimeStr = fmtUptime(d.powerState.onTime.ontime);
        } else {
            win.activeUptimeStr = win.bootUptimeStr;
        }

        var oled = d.oled;
        if (oled && oled.panel_hours !== undefined && oled.panel_hours !== null) {
            win.isOled = true;
            win.panelHours = Math.round(oled.panel_hours);
            win.hasOledCare = (oled.hours_until_comp !== undefined && oled.hours_until_comp !== null);
            win.hoursUntilComp = win.hasOledCare ? Number(oled.hours_until_comp) : 4.0;
            win.hoursSinceComp = oled.hours_since_comp !== undefined && oled.hours_since_comp !== null ? Number(oled.hours_since_comp) : 0.0;
            win.compInterval = oled.comp_interval_hours ? Number(oled.comp_interval_hours) : 4.0;
            win.refresherRemaining = oled.hours_until_refresher !== undefined && oled.hours_until_refresher !== null ? Math.round(oled.hours_until_refresher) : 2000;
            win.screenShiftState = oled.screen_shift === "on" ? "On" : "Off";

            var pPills = [];
            if (oled.comp_cycles !== undefined && oled.comp_cycles !== null && oled.comp_cycles > 0) {
                pPills.push(grouped(oled.comp_cycles) + " Short Cleans");
            } else if (oled.last_compensation_hours !== undefined && oled.last_compensation_hours !== null) {
                pPills.push("Last Clean @ " + grouped(oled.last_compensation_hours) + " h");
            }
            if (d.panel_silicon && d.panel_silicon.cell) {
                pPills.push("Cell " + d.panel_silicon.cell);
            }
            if (oled.tpc_enabled && oled.gsr_enabled) {
                pPills.push("TPC · GSR Active");
            } else if (oled.tpc_enabled) {
                pPills.push("TPC Active");
            }
            if (pPills.length < 3 && oled.logo_dimming && oled.logo_dimming !== "off") {
                pPills.push("Logo Dim: " + capFirst(oled.logo_dimming));
            }
            if (pPills.length === 0) pPills.push("OLED Care Active");
            win.panelPills = pPills.slice(0, 3);
        } else {
            win.isOled = false;
            win.hasOledCare = false;
            var sysPills = [win.webosVer];
            if (win.fwVer) sysPills.push(win.fwVer);
            if (win.socName) sysPills.push(win.socName + " Silicon");
            win.panelPills = sysPills.slice(0, 3);
        }

        if (d.mem && d.mem.total) {
            var usedKb = Math.max(0, d.mem.total - (d.mem.avail || 0));
            win.ramPct = Math.round((usedKb / d.mem.total) * 100);
            win.ramUsedStr = (usedKb / 1048576).toFixed(1) + " GB";
            win.ramTotalStr = (d.mem.total / 1048576).toFixed(1) + " GB";
            win.ramAvailStr = ((d.mem.avail || 0) / 1048576).toFixed(1) + " GB free";
        }
        if (d.swap && d.swap.total && d.swap.total > 0) {
            win.hasSwap = true;
            var swUsed = Math.max(0, d.swap.total - (d.swap.free || 0));
            win.swapPct = Math.round((swUsed / d.swap.total) * 100);
            win.swapStr = (d.swap.backing || "zram") + " · " + win.swapPct + "%";
        } else {
            win.hasSwap = false;
            win.swapPct = 0;
            win.swapStr = win.ramAvailStr;
        }

        if (d.remote && d.remote.battery !== undefined && d.remote.battery !== null) {
            win.hasRemote = true;
            win.remoteBatt = Math.max(0, Math.min(100, Math.round(d.remote.battery)));
            win.remoteModel = d.remote.model ? String(d.remote.model) : "Magic Remote";
            win.remoteConnected = !!d.remote.connected;
        } else {
            win.hasRemote = false;
        }

        win.soundVol = d.volume !== undefined && d.volume !== null ? Math.round(d.volume) : 0;
        win.soundMuted = !!d.muted;
        win.soundOutLabel = (d.sound && d.sound.output) ? String(d.sound.output) : String(d.audio_output || "TV Speaker");

        win.inputLabel = String(d.display_title || d.app_name || d.app || "webOS").toUpperCase();
        win.picModeLabel = (d.picture && d.picture.mode) ? String(d.picture.mode) : "Standard";
        if (d.signal && String(d.signal).length > 0) {
            win.signalHero = String(d.signal).replace("x", "×");
        } else {
            win.signalHero = win.picModeLabel;
        }

        var pills = [];
        if (d.picture && d.picture.dynamicRange) pills.push(String(d.picture.dynamicRange).split("·")[0].trim());
        if (d.colorimetry) pills.push(String(d.colorimetry));
        if (d.hdmi_diag) {
            if (d.hdmi_diag.phy_mode) pills.push(String(d.hdmi_diag.phy_mode));
            if (d.hdmi_diag.chroma) pills.push(String(d.hdmi_diag.chroma));
            if (d.hdmi_diag.allm) pills.push("ALLM");
            if (d.hdmi_diag.vrr) pills.push("VRR");
        }
        if (pills.length === 0) {
            pills.push(win.picModeLabel);
            pills.push(win.soundOutLabel);
        }
        win.signalPills = pills.slice(0, 4);

        if (d.emmc && (d.emmc.wear || d.emmc.life)) {
            win.hasEmmc = true;
            win.emmcWearStr = String(d.emmc.wear || d.emmc.life);
            win.emmcEolStr = String(d.emmc.eol || "Normal");
            var m = win.emmcWearStr.match(/(\d+)/);
            var wearHigh = m ? parseInt(m[1], 10) : 10;
            win.emmcHealthyBlocks = Math.max(1, Math.min(10, Math.round((100 - wearHigh) / 10)));
        } else {
            win.hasEmmc = false;
        }

        if (d.appStorage && d.appStorage.freeMb !== undefined && d.appStorage.freeMb !== null) {
            win.hasAppStorage = true;
            var freeMb = Number(d.appStorage.freeMb);
            win.storageFreeStr = freeMb >= 1024 ? (freeMb / 1024).toFixed(1) + " GB free" : Math.round(freeMb) + " MB free";
            win.storageUsedPct = d.appStorage.pct !== undefined && d.appStorage.pct !== null ? Math.round(d.appStorage.pct) : 30;
        } else {
            win.hasAppStorage = false;
            win.storageFreeStr = "System Partition";
        }

        if (d.wifi && d.wifi.level !== undefined && d.wifi.level !== null) {
            win.isWifi = true;
            var dbm = Number(d.wifi.level);
            win.wifiBars = dbm >= -55 ? 5 : dbm >= -65 ? 4 : dbm >= -75 ? 3 : dbm >= -82 ? 2 : 1;
            win.wifiLabel = "Wi-Fi Link · " + dbm + " dBm";
            win.netIfaceLabel = "WLAN0";
        } else {
            win.isWifi = false;
            win.wifiBars = 0;
            var iface = (d.netTotal && d.netTotal.iface) ? String(d.netTotal.iface).toUpperCase() : "";
            win.netIfaceLabel = iface || "LAN";
            win.wifiLabel = iface === "ETH0" ? "Wired Ethernet · Connected" : (iface ? ("Interface · " + iface) : "Local Network");
        }

        if (d.net) {
            win.netRateStr = "↓ " + fmtRate(d.net.rx) + "  ↑ " + fmtRate(d.net.tx);
        }
        if (d.netTotal && (d.netTotal.rx || d.netTotal.tx)) {
            win.netTotalStr = "↓ " + fmtBytes(d.netTotal.rx) + " · ↑ " + fmtBytes(d.netTotal.tx);
        } else {
            win.netTotalStr = "Session active";
        }

        if (d.privacy && d.privacy.adblock) {
            win.hasAdblock = true;
            win.adblockOn = !!d.privacy.adblock.enabled;
            win.adblockCount = d.privacy.adblock.count || 0;
        } else {
            win.hasAdblock = false;
            win.adblockOn = false;
        }

        // Build filtered Wide and Standard decks so unsupported cards never appear
        var wDeck = ["panel", "signal"];
        if (win.hasThermal) wDeck.push("thermal");
        if (win.hasOledCare) wDeck.push("oledcare");
        if (wDeck.length < 4) wDeck.push("memwide");
        if (wDeck.length < 4) wDeck.push("netwide");
        win.wideDeck = wDeck;

        var sDeck = ["silicon", "remote", "cpu", "memory", "network", "uptime"];
        if (win.hasEmmc || win.hasAppStorage) sDeck.push("storage");
        win.stdDeck = sDeck;

        sanitizeVisibleSlots();
        win.statsRev = win.statsRev + 1;
    }

    function poll() {
        var x = new XMLHttpRequest();
        x.onreadystatechange = function () {
            if (x.readyState !== XMLHttpRequest.DONE) return;
            if (x.status !== 200) return;
            try { collect(JSON.parse(x.responseText)); } catch (e) { }
        };
        x.open("GET", "__TVWEB_URL__");
        x.send();
    }

    function refreshClock() {
        var now = new Date();
        win.clockH = win.two(now.getHours());
        win.clockM = win.two(now.getMinutes());
    }

    // Relocate the entire 6-tile Bento stage to a new screen region and permute its layout
    function pickNewStagePosition() {
        var marginX = Math.round(72 * win.unit);
        var marginY = Math.round(64 * win.unit);
        var spanX = Math.max(0, win.width - win.stageW - marginX * 2);
        var spanY = Math.max(0, win.height - win.stageH - marginY * 2);
        var nx = marginX;
        var ny = marginY;
        for (var i = 0; i < 10; i++) {
            nx = Math.round(marginX + Math.random() * spanX);
            ny = Math.round(marginY + Math.random() * spanY);
            if (Math.abs(nx - bentoStage.x) > win.width * 0.16 ||
                Math.abs(ny - bentoStage.y) > win.height * 0.16) {
                break;
            }
        }
        bentoStage.x = nx;
        bentoStage.y = ny;
    }

    // Flip a single tile on screen to the next metric card in its deck
    function flipOneSlot() {
        if (stageRebuildAnim.running) return;
        var s = win.flipCursor % 6;
        win.flipCursor = (win.flipCursor + 1) % 6;

        // Pick a card not currently displayed in another slot of the same width class
        var wide = isSlotWide(s);
        var deck = wide ? win.wideDeck : win.stdDeck;
        var candidate = deck[0];
        for (var k = 0; k < deck.length; k++) {
            var idx = wide ? ((win.nextWideIdx + k) % deck.length) : ((win.nextStdIdx + k) % deck.length);
            var c = deck[idx];
            var used = false;
            for (var j = 0; j < 6; j++) {
                if (getSlotCard(j) === c) { used = true; break; }
            }
            if (!used) {
                candidate = c;
                if (wide) win.nextWideIdx = (idx + 1) % deck.length;
                else win.nextStdIdx = (idx + 1) % deck.length;
                break;
            }
        }
        var item = tileRepeater.itemAt(s);
        if (item) item.flipTo(candidate);
    }

    // -------------------------------------------------------------------------
    // Bento Stage Container
    // -------------------------------------------------------------------------
    Item {
        id: bentoStage
        width: win.stageW
        height: win.stageH
        x: Math.round((win.width - width) * 0.5)
        y: Math.round((win.height - height) * 0.5)

        Repeater {
            id: tileRepeater
            model: 6

            Item {
                id: tileSlot
                property int slotIndex: index
                property bool wide: win.isSlotWide(index)
                property string cardId: win.getSlotCard(index)
                property string pendingCardId: ""

                x: win.slotX(index)
                y: win.slotY(index)
                width: win.slotWidth(index)
                height: win.tileH

                function flipTo(nextCard) {
                    pendingCardId = nextCard;
                    singleFlipAnim.restart();
                }

                SequentialAnimation {
                    id: singleFlipAnim
                    ParallelAnimation {
                        NumberAnimation { target: cardChamber; property: "opacity"; to: 0.0; duration: 320; easing.type: Easing.InQuad }
                        NumberAnimation { target: cardScale; property: "xScale"; to: 0.93; duration: 320; easing.type: Easing.InQuad }
                        NumberAnimation { target: cardScale; property: "yScale"; to: 0.93; duration: 320; easing.type: Easing.InQuad }
                    }
                    ScriptAction {
                        script: win.setSlotCard(tileSlot.slotIndex, tileSlot.pendingCardId)
                    }
                    ParallelAnimation {
                        NumberAnimation { target: cardChamber; property: "opacity"; to: 1.0; duration: 420; easing.type: Easing.OutCubic }
                        NumberAnimation { target: cardScale; property: "xScale"; to: 1.0; duration: 420; easing.type: Easing.OutBack }
                        NumberAnimation { target: cardScale; property: "yScale"; to: 1.0; duration: 420; easing.type: Easing.OutBack }
                    }
                }

                // Sculpted Keynote Bento Chamber
                Rectangle {
                    id: cardChamber
                    anchors.fill: parent
                    radius: win.tileRad
                    color: win.boxOuterBg
                    border.width: Math.max(1, Math.round(1.5 * win.unit))
                    border.color: win.boxBorder

                    transform: Scale {
                        id: cardScale
                        origin.x: cardChamber.width * 0.5
                        origin.y: cardChamber.height * 0.5
                        xScale: 1.0
                        yScale: 1.0
                    }

                    // Inner recessed well (gives the Keynote 3D bento box depth)
                    Rectangle {
                        anchors.fill: parent
                        anchors.margins: Math.round(6 * win.unit)
                        radius: Math.round(19 * win.unit)
                        color: win.boxInnerBg
                        border.width: 1
                        border.color: win.boxWellBg
                    }

                    // Top specular hairline highlight
                    Rectangle {
                        width: parent.width - Math.round(48 * win.unit)
                        height: 1
                        x: Math.round(24 * win.unit)
                        y: 1
                        color: win.boxHighlight
                        opacity: 0.55
                    }

                    // =========================================================
                    // CARD 1: "panel" — OLED Panel Usage / System Runtime (Wide)
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(24 * win.unit)
                        visible: tileSlot.cardId === "panel"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            font.letterSpacing: Math.round(2.5 * win.unit)
                            color: win.inkMuted
                            text: win.isOled ? "OLED PANEL USAGE" : "SYSTEM RUNTIME"
                        }

                        // Model badge pill top-right
                        Rectangle {
                            height: Math.round(24 * win.unit)
                            width: modelBadgeText.width + Math.round(18 * win.unit)
                            anchors.right: parent.right
                            y: -Math.round(3 * win.unit)
                            radius: height / 2
                            color: win.trackBg
                            border.width: 1
                            border.color: win.boxBorder

                            Text {
                                id: modelBadgeText
                                anchors.centerIn: parent
                                font.family: win.boldLabelFamily
                                font.pixelSize: Math.round(12 * win.unit)
                                color: win.accCool
                                text: win.tvModel
                            }
                        }

                        // Giant Keynote figure
                        Row {
                            x: 0
                            y: Math.round(18 * win.unit)
                            spacing: Math.round(10 * win.unit)

                            Text {
                                font.family: win.digitFamily
                                font.pixelSize: Math.round(74 * win.unit)
                                color: win.inkHero
                                text: win.isOled ? win.grouped(win.panelHours) : win.bootUptimeStr
                            }
                            Text {
                                visible: win.isOled
                                y: Math.round(38 * win.unit)
                                font.family: win.boldLabelFamily
                                font.pixelSize: Math.round(19 * win.unit)
                                color: win.accCool
                                text: "HRS USED"
                            }
                        }

                        Text {
                            x: 0
                            y: Math.round(116 * win.unit)
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(15 * win.unit)
                            color: win.inkSub
                            text: win.isOled ? "Total cumulative power-on hours" : ("Active session: " + win.activeUptimeStr)
                        }

                        // Hardware capability & maintenance pills at bottom
                        Row {
                            x: 0
                            anchors.bottom: parent.bottom
                            spacing: Math.round(8 * win.unit)

                            Repeater {
                                model: win.panelPills
                                Rectangle {
                                    height: Math.round(30 * win.unit)
                                    width: panelPillText.width + Math.round(22 * win.unit)
                                    radius: Math.round(8 * win.unit)
                                    color: win.trackBg
                                    border.width: 1
                                    border.color: index === 0 ? win.accBlue : win.boxBorder

                                    Text {
                                        id: panelPillText
                                        anchors.centerIn: parent
                                        font.family: win.boldLabelFamily
                                        font.pixelSize: Math.round(13 * win.unit)
                                        color: index === 0 ? win.accCool : win.inkHero
                                        text: String(modelData)
                                    }
                                }
                            }
                        }
                    }

                    // =========================================================
                    // CARD 2: "thermal" — SoC Thermal & Live Sparkline (Wide)
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(24 * win.unit)
                        visible: tileSlot.cardId === "thermal"

                        property color thermColor: win.socTemp >= 72 ? win.accRed
                                                 : win.socTemp >= 62 ? win.accAmber
                                                 : win.accCool

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            font.letterSpacing: Math.round(2.5 * win.unit)
                            color: win.inkMuted
                            text: "THERMAL TELEMETRY"
                        }

                        Rectangle {
                            height: Math.round(24 * win.unit)
                            width: thermStateText.width + Math.round(18 * win.unit)
                            anchors.right: parent.right
                            y: -Math.round(3 * win.unit)
                            radius: height / 2
                            color: win.trackBg
                            border.width: 1
                            border.color: parent.thermColor

                            Text {
                                id: thermStateText
                                anchors.centerIn: parent
                                font.family: win.boldLabelFamily
                                font.pixelSize: Math.round(12 * win.unit)
                                color: parent.parent.thermColor
                                text: win.socTemp >= 72 ? "HOT" : win.socTemp >= 62 ? "WARM" : "OPTIMAL"
                            }
                        }

                        // Left: Big temperature figure
                        Text {
                            x: 0
                            y: Math.round(30 * win.unit)
                            font.family: win.digitFamily
                            font.pixelSize: Math.round(86 * win.unit)
                            color: win.inkHero
                            text: win.socTemp > 0 ? (win.socTemp + "°") : "—"
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(15 * win.unit)
                            color: win.inkSub
                            text: "SoC die sensor · Celsius"
                        }

                        // Right: 20-bar live thermal history sparkline
                        Row {
                            anchors.right: parent.right
                            y: Math.round(48 * win.unit)
                            spacing: Math.round(4 * win.unit)

                            Repeater {
                                model: 20
                                Item {
                                    width: Math.round(8 * win.unit)
                                    height: Math.round(108 * win.unit)

                                    property real sampleVal: (win.tempHistory && index < win.tempHistory.length)
                                                             ? win.tempHistory[index] : win.socTemp
                                    property real norm: Math.max(0.22, Math.min(1.0, (sampleVal - win.tempMin) / Math.max(1.0, win.tempSpan)))
                                    property int barH: Math.round(height * norm)

                                    Rectangle {
                                        width: parent.width
                                        height: parent.barH
                                        y: parent.height - height
                                        radius: Math.round(3 * win.unit)
                                        color: index === 19 ? win.accAmber
                                             : index >= 16 ? win.accCool
                                             : win.accBlue
                                        opacity: 0.35 + 0.65 * (index / 19.0)
                                    }
                                }
                            }
                        }
                    }

                    // =========================================================
                    // CARD 3: "signal" — Signal & Picture Engine (Wide)
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(24 * win.unit)
                        visible: tileSlot.cardId === "signal"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            font.letterSpacing: Math.round(2.5 * win.unit)
                            color: win.inkMuted
                            text: "PICTURE & SIGNAL PIPELINE"
                        }

                        Rectangle {
                            height: Math.round(24 * win.unit)
                            width: srcPillText.width + Math.round(18 * win.unit)
                            anchors.right: parent.right
                            y: -Math.round(3 * win.unit)
                            radius: height / 2
                            color: win.trackBg
                            border.width: 1
                            border.color: win.boxBorder

                            Text {
                                id: srcPillText
                                anchors.centerIn: parent
                                font.family: win.boldLabelFamily
                                font.pixelSize: Math.round(12 * win.unit)
                                color: win.accGreen
                                text: win.inputLabel
                            }
                        }

                        Text {
                            x: 0
                            y: Math.round(42 * win.unit)
                            width: parent.width
                            elide: Text.ElideRight
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(40 * win.unit)
                            color: win.inkHero
                            text: win.signalHero
                        }

                        Text {
                            x: 0
                            y: Math.round(96 * win.unit)
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(16 * win.unit)
                            color: win.inkSub
                            text: "Picture mode: " + win.picModeLabel
                        }

                        // Feature badges row at bottom
                        Row {
                            x: 0
                            anchors.bottom: parent.bottom
                            spacing: Math.round(8 * win.unit)

                            Repeater {
                                model: win.signalPills
                                Rectangle {
                                    height: Math.round(30 * win.unit)
                                    width: sigTagText.width + Math.round(22 * win.unit)
                                    radius: Math.round(8 * win.unit)
                                    color: win.trackBg
                                    border.width: 1
                                    border.color: index === 0 ? win.accPurple : win.boxBorder

                                    Text {
                                        id: sigTagText
                                        anchors.centerIn: parent
                                        font.family: win.boldLabelFamily
                                        font.pixelSize: Math.round(13 * win.unit)
                                        color: index === 0 ? win.accPurple : win.inkHero
                                        text: String(modelData)
                                    }
                                }
                            }
                        }
                    }

                    // =========================================================
                    // CARD 4: "oledcare" — OLED Pixel Care & Ring Gauge (Wide)
                    // =========================================================
                    Item {
                        id: oledCareCard
                        anchors.fill: parent
                        anchors.margins: Math.round(24 * win.unit)
                        visible: tileSlot.cardId === "oledcare"

                        property int revTrigger: win.statsRev
                        onRevTriggerChanged: if (visible) compRingCanvas.requestPaint()
                        onVisibleChanged: if (visible) compRingCanvas.requestPaint()

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            font.letterSpacing: Math.round(2.5 * win.unit)
                            color: win.inkMuted
                            text: "OLED PIXEL CARE"
                        }

                        // Screen Shift status badge pill top-right
                        Rectangle {
                            height: Math.round(24 * win.unit)
                            width: shiftBadgeText.width + Math.round(18 * win.unit)
                            anchors.right: parent.right
                            y: -Math.round(3 * win.unit)
                            radius: height / 2
                            color: win.trackBg
                            border.width: 1
                            border.color: win.boxBorder

                            Text {
                                id: shiftBadgeText
                                anchors.centerIn: parent
                                font.family: win.boldLabelFamily
                                font.pixelSize: Math.round(12 * win.unit)
                                color: win.accGreen
                                text: "SHIFT · " + win.screenShiftState.toUpperCase()
                            }
                        }

                        // Left: Circular compensation progress ring
                        Item {
                            x: 0
                            y: Math.round(34 * win.unit)
                            width: Math.round(144 * win.unit)
                            height: Math.round(144 * win.unit)

                            Canvas {
                                id: compRingCanvas
                                anchors.fill: parent
                                onPaint: {
                                    var ctx = getContext("2d");
                                    ctx.clearRect(0, 0, width, height);
                                    var cx = width * 0.5;
                                    var cy = height * 0.5;
                                    var r = width * 0.41;
                                    var lw = Math.max(6, Math.round(10 * win.unit));

                                    ctx.beginPath();
                                    ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
                                    ctx.lineWidth = lw;
                                    ctx.strokeStyle = win.trackBg;
                                    ctx.stroke();

                                    var frac = win.compInterval > 0
                                        ? Math.max(0.08, Math.min(1.0, win.hoursSinceComp / win.compInterval))
                                        : 0.75;
                                    var startA = -Math.PI * 0.5;
                                    var endA = startA + frac * Math.PI * 2;
                                    ctx.beginPath();
                                    ctx.arc(cx, cy, r, startA, endA, false);
                                    ctx.lineCap = "round";
                                    ctx.lineWidth = lw;
                                    ctx.strokeStyle = win.hoursUntilComp <= 0.2 ? win.accAmber : win.accGreen;
                                    ctx.stroke();
                                }
                            }

                            Column {
                                anchors.centerIn: parent
                                spacing: Math.round(2 * win.unit)

                                Text {
                                    width: Math.round(110 * win.unit)
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.digitFamily
                                    font.pixelSize: Math.round(36 * win.unit)
                                    color: win.inkHero
                                    text: win.fmtHours(win.hoursUntilComp)
                                }
                                Text {
                                    width: Math.round(110 * win.unit)
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(11 * win.unit)
                                    color: win.inkMuted
                                    text: "UNTIL CLEAN"
                                }
                            }
                        }

                        // Right: Refresher & protection readouts
                        Column {
                            x: Math.round(168 * win.unit)
                            y: Math.round(42 * win.unit)
                            spacing: Math.round(14 * win.unit)

                            Column {
                                spacing: Math.round(3 * win.unit)
                                Text {
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(12 * win.unit)
                                    color: win.inkMuted
                                    text: "SHORT COMPENSATION"
                                }
                                Text {
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(20 * win.unit)
                                    color: win.hoursUntilComp <= 0.2 ? win.accAmber : win.accGreen
                                    text: win.hoursUntilComp <= 0.05 ? "Ready on next standby" : ("In " + win.fmtHours(win.hoursUntilComp))
                                }
                            }

                            Column {
                                spacing: Math.round(3 * win.unit)
                                Text {
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(12 * win.unit)
                                    color: win.inkMuted
                                    text: "2,000-HOUR PIXEL REFRESHER"
                                }
                                Text {
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(20 * win.unit)
                                    color: win.inkHero
                                    text: win.grouped(win.refresherRemaining) + " h remaining"
                                }
                            }
                        }
                    }

                    // =========================================================
                    // CARD 5: "silicon" — Apple Keynote A18-Style Silicon Die
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(20 * win.unit)
                        visible: tileSlot.cardId === "silicon"

                        // Iridescent Keynote rim glow behind the silicon die
                        Rectangle {
                            width: Math.round(124 * win.unit)
                            height: Math.round(124 * win.unit)
                            x: Math.round((parent.width - width) * 0.5 - 3 * win.unit)
                            y: Math.round(14 * win.unit)
                            radius: Math.round(18 * win.unit)
                            color: win.accPurple
                            opacity: 0.28
                        }
                        Rectangle {
                            width: Math.round(124 * win.unit)
                            height: Math.round(124 * win.unit)
                            x: Math.round((parent.width - width) * 0.5 + 3 * win.unit)
                            y: Math.round(20 * win.unit)
                            radius: Math.round(18 * win.unit)
                            color: win.accBlue
                            opacity: 0.28
                        }

                        // Brushed dark silicon package die
                        Rectangle {
                            id: siliconDie
                            width: Math.round(120 * win.unit)
                            height: Math.round(120 * win.unit)
                            x: Math.round((parent.width - width) * 0.5)
                            y: Math.round(17 * win.unit)
                            radius: Math.round(14 * win.unit)
                            color: win.boxInnerBg
                            border.width: Math.max(1, Math.round(2 * win.unit))
                            border.color: win.accCool

                            // Inner die substrate frame
                            Rectangle {
                                anchors.fill: parent
                                anchors.margins: Math.round(8 * win.unit)
                                radius: Math.round(9 * win.unit)
                                color: win.boxOuterBg
                                border.width: 1
                                border.color: win.boxBorder
                            }

                            Column {
                                anchors.centerIn: parent
                                spacing: Math.round(2 * win.unit)

                                Text {
                                    width: siliconDie.width
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(11 * win.unit)
                                    font.letterSpacing: Math.round(2 * win.unit)
                                    color: win.accAmber
                                    text: "LG SILICON"
                                }
                                Text {
                                    width: siliconDie.width
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: win.socName.length > 4 ? Math.round(26 * win.unit) : Math.round(34 * win.unit)
                                    color: win.inkHero
                                    text: win.socName
                                }
                            }
                        }

                        Text {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            anchors.bottom: parent.bottom
                            elide: Text.ElideRight
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(15 * win.unit)
                            color: win.inkSub
                            text: win.socCaption
                        }
                    }

                    // =========================================================
                    // CARD 6: "remote" — Magic Remote Battery Ring (or Audio)
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(20 * win.unit)
                        visible: tileSlot.cardId === "remote"

                        property int revTrigger: win.statsRev
                        onRevTriggerChanged: if (visible) remoteRingCanvas.requestPaint()
                        onVisibleChanged: if (visible) remoteRingCanvas.requestPaint()

                        // Glowing circular battery/level ring (Keynote top-left style)
                        Item {
                            width: Math.round(126 * win.unit)
                            height: Math.round(126 * win.unit)
                            x: Math.round((parent.width - width) * 0.5)
                            y: Math.round(8 * win.unit)

                            Canvas {
                                id: remoteRingCanvas
                                anchors.fill: parent
                                onPaint: {
                                    var ctx = getContext("2d");
                                    ctx.clearRect(0, 0, width, height);
                                    var cx = width * 0.5;
                                    var cy = height * 0.5;
                                    var r = width * 0.41;
                                    var lw = Math.max(6, Math.round(10 * win.unit));

                                    ctx.beginPath();
                                    ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
                                    ctx.lineWidth = lw;
                                    ctx.strokeStyle = win.trackBg;
                                    ctx.stroke();

                                    var pct = win.hasRemote ? win.remoteBatt : win.soundVol;
                                    var frac = Math.max(0.06, Math.min(1.0, pct / 100.0));
                                    var startA = -Math.PI * 0.5;
                                    var endA = startA + frac * Math.PI * 2;
                                    ctx.beginPath();
                                    ctx.arc(cx, cy, r, startA, endA, false);
                                    ctx.lineCap = "round";
                                    ctx.lineWidth = lw;
                                    ctx.strokeStyle = (win.hasRemote && win.remoteBatt <= 20) ? win.accAmber : win.accGreen;
                                    ctx.stroke();
                                }
                            }

                            Text {
                                anchors.centerIn: parent
                                font.family: win.digitFamily
                                font.pixelSize: Math.round(40 * win.unit)
                                color: win.inkHero
                                text: win.hasRemote ? (win.remoteBatt + "%") : (win.soundMuted ? "MUTE" : (win.soundVol + ""))
                            }
                        }

                        Text {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            y: Math.round(144 * win.unit)
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(16 * win.unit)
                            color: win.inkHero
                            text: win.hasRemote ? win.remoteModel : "Audio Stage"
                        }

                        Text {
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.hasRemote ? (win.remoteConnected ? win.accGreen : win.inkMuted) : win.inkSub
                            text: win.hasRemote ? (win.remoteConnected ? "● Connected · BLE" : "● Standby · Paired") : win.soundOutLabel
                        }
                    }

                    // =========================================================
                    // CARD 7: "cpu" — Multi-Core Processor Activity Meters
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(22 * win.unit)
                        visible: tileSlot.cardId === "cpu"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(13 * win.unit)
                            font.letterSpacing: Math.round(2 * win.unit)
                            color: win.inkMuted
                            text: "CPU CORES"
                        }

                        Text {
                            x: 0
                            y: Math.round(28 * win.unit)
                            font.family: win.digitFamily
                            font.pixelSize: Math.round(68 * win.unit)
                            color: win.inkHero
                            text: win.cpuLoad + "%"
                        }

                        Text {
                            x: 0
                            y: Math.round(104 * win.unit)
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.inkMuted
                            text: "Peak " + win.cpuPeak + "%"
                        }

                        // Right: dynamic N-core vertical gauges (adapts to 2-core or 4-core SoCs)
                        Row {
                            anchors.right: parent.right
                            y: Math.round(30 * win.unit)
                            spacing: Math.round(10 * win.unit)

                            Repeater {
                                model: win.cpuCores ? win.cpuCores.length : 4
                                Column {
                                    spacing: Math.round(6 * win.unit)

                                    property int barW: (win.cpuCores && win.cpuCores.length <= 2)
                                                       ? Math.round(28 * win.unit)
                                                       : Math.round(18 * win.unit)

                                    Rectangle {
                                        width: parent.barW
                                        height: Math.round(112 * win.unit)
                                        radius: Math.round(6 * win.unit)
                                        color: win.trackBg

                                        property int cVal: (win.cpuCores && index < win.cpuCores.length) ? win.cpuCores[index] : 0
                                        Rectangle {
                                            width: parent.width
                                            height: parent.cVal > 0
                                                ? Math.max(Math.round(10 * win.unit), Math.round(parent.height * (parent.cVal / 100.0)))
                                                : Math.round(4 * win.unit)
                                            y: parent.height - height
                                            radius: Math.round(6 * win.unit)
                                            color: parent.cVal === 0 ? win.boxBorder
                                                 : (parent.cVal > 75 ? win.accAmber : win.accBlue)
                                        }
                                    }

                                    Text {
                                        width: parent.barW
                                        horizontalAlignment: Text.AlignHCenter
                                        font.family: win.boldLabelFamily
                                        font.pixelSize: Math.round(11 * win.unit)
                                        color: win.inkMuted
                                        text: "C" + index
                                    }
                                }
                            }
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.inkSub
                            text: win.cpuMhz > 0 ? (win.cpuMhz + " MHz clock") : ((win.cpuCores ? win.cpuCores.length : 4) + " Cores")
                        }
                    }

                    // =========================================================
                    // CARD 8: "memory" — Unified Memory & zram Gauges
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(22 * win.unit)
                        visible: tileSlot.cardId === "memory"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(13 * win.unit)
                            font.letterSpacing: Math.round(2 * win.unit)
                            color: win.inkMuted
                            text: win.hasSwap ? "MEMORY & ZRAM" : "SYSTEM MEMORY"
                        }

                        Row {
                            x: 0
                            y: Math.round(24 * win.unit)
                            spacing: Math.round(10 * win.unit)

                            Text {
                                font.family: win.digitFamily
                                font.pixelSize: Math.round(64 * win.unit)
                                color: win.inkHero
                                text: win.ramPct + "%"
                            }
                            Text {
                                y: Math.round(32 * win.unit)
                                font.family: win.labelFamily
                                font.pixelSize: Math.round(15 * win.unit)
                                color: win.inkSub
                                text: win.ramUsedStr
                            }
                        }

                        // RAM gauge bar (+ optional zram swap bar when present)
                        Column {
                            x: 0
                            y: Math.round(108 * win.unit)
                            width: parent.width
                            spacing: Math.round(6 * win.unit)

                            Rectangle {
                                width: parent.width
                                height: win.hasSwap ? Math.round(12 * win.unit) : Math.round(18 * win.unit)
                                radius: height / 2
                                color: win.trackBg

                                Rectangle {
                                    width: Math.max(parent.height, Math.round(parent.width * (win.ramPct / 100.0)))
                                    height: parent.height
                                    radius: parent.radius
                                    color: win.accPurple
                                }
                            }

                            // zram swap bar
                            Rectangle {
                                visible: win.hasSwap
                                width: parent.width
                                height: Math.round(8 * win.unit)
                                radius: Math.round(4 * win.unit)
                                color: win.trackBg

                                Rectangle {
                                    width: Math.max(Math.round(8 * win.unit), Math.round(parent.width * (win.swapPct / 100.0)))
                                    height: parent.height
                                    radius: parent.radius
                                    color: win.accBlue
                                }
                            }
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.inkSub
                            text: "Total " + win.ramTotalStr + (win.swapStr ? ("  ·  " + win.swapStr) : "")
                        }
                    }

                    // =========================================================
                    // CARD 9: "storage" — eMMC Silicon Wear / App Storage Matrix
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(22 * win.unit)
                        visible: tileSlot.cardId === "storage"

                        property int filledCells: win.hasEmmc
                            ? win.emmcHealthyBlocks
                            : Math.max(1, Math.min(10, Math.round(win.storageUsedPct / 10.0)))

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(13 * win.unit)
                            font.letterSpacing: Math.round(2 * win.unit)
                            color: win.inkMuted
                            text: win.hasEmmc ? "FLASH SILICON" : "APP STORAGE"
                        }

                        Text {
                            x: 0
                            y: Math.round(30 * win.unit)
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(40 * win.unit)
                            color: win.inkHero
                            text: win.hasEmmc ? win.emmcWearStr : (win.storageUsedPct + "%")
                        }

                        Text {
                            x: 0
                            y: Math.round(80 * win.unit)
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.hasEmmc ? win.accGreen : win.accCool
                            text: win.hasEmmc ? ("eMMC Wear · " + win.emmcEolStr) : "Apps Partition Used"
                        }

                        // 10-cell visual matrix
                        Row {
                            x: 0
                            y: Math.round(118 * win.unit)
                            spacing: Math.round(6 * win.unit)

                            Repeater {
                                model: 10
                                Rectangle {
                                    width: Math.round(19 * win.unit)
                                    height: Math.round(24 * win.unit)
                                    radius: Math.round(5 * win.unit)
                                    color: index < parent.parent.filledCells
                                        ? (win.hasEmmc ? win.accGreen : win.accBlue)
                                        : win.trackBg
                                    opacity: index < parent.parent.filledCells ? 0.85 : 0.45
                                }
                            }
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.inkSub
                            text: "Apps partition · " + win.storageFreeStr
                        }
                    }

                    // =========================================================
                    // CARD 10: "network" — Wi-Fi / Ethernet Link & AdBlock Shield
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(22 * win.unit)
                        visible: tileSlot.cardId === "network"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(13 * win.unit)
                            font.letterSpacing: Math.round(2 * win.unit)
                            color: win.inkMuted
                            text: win.hasAdblock ? "NETWORK & PRIVACY" : "NETWORK LINK"
                        }

                        // 5 ascending Wi-Fi signal bars when on Wi-Fi
                        Row {
                            visible: win.isWifi
                            x: 0
                            y: Math.round(36 * win.unit)
                            spacing: Math.round(8 * win.unit)

                            Repeater {
                                model: 5
                                Item {
                                    width: Math.round(14 * win.unit)
                                    height: Math.round(56 * win.unit)

                                    Rectangle {
                                        width: parent.width
                                        height: Math.round((16 + index * 10) * win.unit)
                                        y: parent.height - height
                                        radius: Math.round(4 * win.unit)
                                        color: index < win.wifiBars ? win.accCool : win.trackBg
                                    }
                                }
                            }
                        }

                        // Wired Ethernet / non-Wi-Fi badge when Wi-Fi is off
                        Rectangle {
                            visible: !win.isWifi
                            x: 0
                            y: Math.round(46 * win.unit)
                            width: Math.round(112 * win.unit)
                            height: Math.round(44 * win.unit)
                            radius: Math.round(12 * win.unit)
                            color: win.trackBg
                            border.width: 1
                            border.color: win.accBlue

                            Column {
                                anchors.centerIn: parent
                                spacing: Math.round(2 * win.unit)
                                Text {
                                    width: Math.round(96 * win.unit)
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(11 * win.unit)
                                    color: win.accCool
                                    text: win.netIfaceLabel
                                }
                                Text {
                                    width: Math.round(96 * win.unit)
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.labelFamily
                                    font.pixelSize: Math.round(12 * win.unit)
                                    color: win.inkHero
                                    text: "LINK ACTIVE"
                                }
                            }
                        }

                        // AdBlock shield pill on the right (or session transfer pill if adblock not present)
                        Rectangle {
                            anchors.right: parent.right
                            y: Math.round(46 * win.unit)
                            width: Math.round(118 * win.unit)
                            height: Math.round(44 * win.unit)
                            radius: Math.round(12 * win.unit)
                            color: win.trackBg
                            border.width: 1
                            border.color: (win.hasAdblock && win.adblockOn) ? win.accGreen : win.boxBorder

                            Column {
                                anchors.centerIn: parent
                                spacing: Math.round(2 * win.unit)
                                Text {
                                    width: Math.round(100 * win.unit)
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(11 * win.unit)
                                    color: (win.hasAdblock && win.adblockOn) ? win.accGreen : win.inkMuted
                                    text: win.hasAdblock ? (win.adblockOn ? "AD SHIELD ON" : "AD SHIELD") : "INTERFACE"
                                }
                                Text {
                                    width: Math.round(100 * win.unit)
                                    horizontalAlignment: Text.AlignHCenter
                                    font.family: win.labelFamily
                                    font.pixelSize: Math.round(12 * win.unit)
                                    color: win.inkHero
                                    text: win.hasAdblock ? (win.adblockOn ? (win.adblockCount + " blocked") : "Off") : win.netIfaceLabel
                                }
                            }
                        }

                        Text {
                            x: 0
                            y: Math.round(112 * win.unit)
                            width: parent.width
                            elide: Text.ElideRight
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(16 * win.unit)
                            color: win.inkHero
                            text: win.wifiLabel
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.inkSub
                            text: win.netRateStr
                        }
                    }

                    // =========================================================
                    // CARD 12: "memwide" — Universal Wide Memory & Storage Card
                    // (Used on LCD TVs or TVs without thermal sensors)
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(24 * win.unit)
                        visible: tileSlot.cardId === "memwide"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            font.letterSpacing: Math.round(2.5 * win.unit)
                            color: win.inkMuted
                            text: "MEMORY & SYSTEM STORAGE"
                        }

                        Row {
                            x: 0
                            y: Math.round(24 * win.unit)
                            spacing: Math.round(12 * win.unit)

                            Text {
                                font.family: win.digitFamily
                                font.pixelSize: Math.round(80 * win.unit)
                                color: win.inkHero
                                text: win.ramPct + "%"
                            }
                            Column {
                                y: Math.round(24 * win.unit)
                                spacing: Math.round(4 * win.unit)
                                Text {
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(16 * win.unit)
                                    color: win.inkHero
                                    text: win.ramUsedStr + " / " + win.ramTotalStr
                                }
                                Text {
                                    font.family: win.labelFamily
                                    font.pixelSize: Math.round(14 * win.unit)
                                    color: win.inkSub
                                    text: win.swapStr
                                }
                            }
                        }

                        Rectangle {
                            x: 0
                            y: Math.round(124 * win.unit)
                            width: parent.width
                            height: Math.round(12 * win.unit)
                            radius: Math.round(6 * win.unit)
                            color: win.trackBg

                            Rectangle {
                                width: Math.max(Math.round(12 * win.unit), Math.round(parent.width * (win.ramPct / 100.0)))
                                height: parent.height
                                radius: parent.radius
                                color: win.accPurple
                            }
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(15 * win.unit)
                            color: win.inkSub
                            text: "Apps partition · " + win.storageFreeStr + (win.hasEmmc ? ("  ·  eMMC wear " + win.emmcWearStr) : "")
                        }
                    }

                    // =========================================================
                    // CARD 13: "netwide" — Universal Wide Network & Throughput Card
                    // (Used on LCD TVs or TVs without thermal sensors)
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(24 * win.unit)
                        visible: tileSlot.cardId === "netwide"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            font.letterSpacing: Math.round(2.5 * win.unit)
                            color: win.inkMuted
                            text: "NETWORK & DATA TRANSFER"
                        }

                        Rectangle {
                            height: Math.round(24 * win.unit)
                            width: netWideBadge.width + Math.round(18 * win.unit)
                            anchors.right: parent.right
                            y: -Math.round(3 * win.unit)
                            radius: height / 2
                            color: win.trackBg
                            border.width: 1
                            border.color: win.boxBorder

                            Text {
                                id: netWideBadge
                                anchors.centerIn: parent
                                font.family: win.boldLabelFamily
                                font.pixelSize: Math.round(12 * win.unit)
                                color: win.accCool
                                text: win.netIfaceLabel
                            }
                        }

                        Text {
                            x: 0
                            y: Math.round(38 * win.unit)
                            width: parent.width
                            elide: Text.ElideRight
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(36 * win.unit)
                            color: win.inkHero
                            text: win.wifiLabel
                        }

                        Text {
                            x: 0
                            y: Math.round(92 * win.unit)
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(16 * win.unit)
                            color: win.accCool
                            text: "Throughput: " + win.netRateStr
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(15 * win.unit)
                            color: win.inkSub
                            text: "Session total: " + win.netTotalStr + (win.hasAdblock && win.adblockOn ? ("  ·  " + win.adblockCount + " ads blocked") : "")
                        }
                    }

                    // =========================================================
                    // CARD 11: "uptime" — Live Clock & Dual Uptime
                    // =========================================================
                    Item {
                        anchors.fill: parent
                        anchors.margins: Math.round(22 * win.unit)
                        visible: tileSlot.cardId === "uptime"

                        Text {
                            x: 0; y: 0
                            font.family: win.boldLabelFamily
                            font.pixelSize: Math.round(13 * win.unit)
                            font.letterSpacing: Math.round(2 * win.unit)
                            color: win.inkMuted
                            text: "TIME & UPTIME"
                        }

                        // Large tabular clock with two-dot separator
                        Row {
                            x: 0
                            y: Math.round(26 * win.unit)
                            spacing: Math.round(6 * win.unit)

                            Text {
                                font.family: win.digitFamily
                                font.pixelSize: Math.round(72 * win.unit)
                                color: win.inkHero
                                text: win.clockH
                            }
                            Column {
                                y: Math.round(26 * win.unit)
                                spacing: Math.round(12 * win.unit)
                                Rectangle {
                                    width: Math.round(6 * win.unit)
                                    height: width
                                    radius: width / 2
                                    color: win.accCool
                                }
                                Rectangle {
                                    width: Math.round(6 * win.unit)
                                    height: width
                                    radius: width / 2
                                    color: win.accCool
                                }
                            }
                            Text {
                                font.family: win.digitFamily
                                font.pixelSize: Math.round(72 * win.unit)
                                color: win.inkHero
                                text: win.clockM
                            }
                        }

                        // Dual uptime badges
                        Row {
                            x: 0
                            y: Math.round(118 * win.unit)
                            spacing: Math.round(8 * win.unit)

                            Rectangle {
                                height: Math.round(28 * win.unit)
                                width: bootUpTxt.width + Math.round(18 * win.unit)
                                radius: Math.round(8 * win.unit)
                                color: win.trackBg
                                Text {
                                    id: bootUpTxt
                                    anchors.centerIn: parent
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(12 * win.unit)
                                    color: win.inkSub
                                    text: "Boot " + win.bootUptimeStr
                                }
                            }
                            Rectangle {
                                height: Math.round(28 * win.unit)
                                width: actUpTxt.width + Math.round(18 * win.unit)
                                radius: Math.round(8 * win.unit)
                                color: win.trackBg
                                Text {
                                    id: actUpTxt
                                    anchors.centerIn: parent
                                    font.family: win.boldLabelFamily
                                    font.pixelSize: Math.round(12 * win.unit)
                                    color: win.accGreen
                                    text: "Active " + win.activeUptimeStr
                                }
                            }
                        }

                        Text {
                            x: 0
                            anchors.bottom: parent.bottom
                            font.family: win.labelFamily
                            font.pixelSize: Math.round(14 * win.unit)
                            color: win.inkMuted
                            text: win.webosVer + (win.fwVer ? "  ·  " + win.fwVer : "")
                        }
                    }
                }
            }
        }
    }

    // Full stage relocation + column layout permutation animation every 24 seconds
    SequentialAnimation {
        id: stageRebuildAnim
        NumberAnimation { target: bentoStage; property: "opacity"; to: 0.0; duration: 550; easing.type: Easing.InOutQuad }
        PauseAnimation { duration: 350 }
        ScriptAction {
            script: {
                win.layoutPerm = (win.layoutPerm + 1) % 3;
                win.assignDeckForLayout();
                win.pickNewStagePosition();
            }
        }
        NumberAnimation { target: bentoStage; property: "opacity"; to: 1.0; duration: 650; easing.type: Easing.OutCubic }
    }

    Timer { interval: 1000;  running: true; repeat: true; onTriggered: win.refreshClock() }
    Timer { interval: 4200;  running: true; repeat: true; onTriggered: win.flipOneSlot() }
    Timer { interval: 24000; running: true; repeat: true; onTriggered: stageRebuildAnim.restart() }
    Timer { interval: 60000; running: true; repeat: true; onTriggered: win.poll() }

    Component.onCompleted: {
        digitFamily = chooseDigitFamily(Math.round(88 * win.unit));
        refreshClock();
        assignDeckForLayout();
        pickNewStagePosition();
        poll();
    }
}
