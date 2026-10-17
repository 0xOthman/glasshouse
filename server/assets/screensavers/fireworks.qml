/*
 * Fireworks screen saver.
 *
 * Pure GPU OpenGL point-sprite pyrotechnics built on QtQuick.Particles 2.0
 * using ImageParticle ("star.png") and TrailEmitter — zero ItemParticle scene
 * nodes, zero Canvas FBOs, and zero per-frame JavaScript evaluations.
 *
 * Why ImageParticle + TrailEmitter instead of ItemParticle:
 *   - ItemParticle creates and moves a full QQuickItem scene-graph subtree on
 *     the CPU for every particle, which caps particle count and costs ~38% CPU.
 *   - ImageParticle with "star.png" renders all particles and trails as a
 *     single hardware-accelerated OpenGL point-sprite batch in C++, allowing
 *     thousands of fine luminous sparks and continuous parabolic silk trails
 *     at a locked 60 FPS with minimal CPU load on both webOS 4 and webOS 9+.
 *   - Note on star.png sizing: star.png has a tight bright core (~25% of its
 *     64x64 texture) surrounded by a soft radial falloff, so a 14-18px sprite
 *     renders as a crisp ~3.5-4.5px incandescent pinpoint with a natural glow.
 */
import QtQuick 2.4
import QtQuick.Particles 2.0
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

    property real unit: win.height / 1080

    // Dim or bright, written in when the screen saver is staged.
    property int level: __TVWEB_LEVEL__
    property real grow: level > 0 ? 1.25 : 1.0
    property real headAlpha: level > 0 ? 1.00 : 0.72
    property real trailAlpha: level > 0 ? 0.86 : 0.54

    // 8-colour pyrotechnic colours (with explicit dim-mode RGB values):
    property var shellColors: [
        level > 0 ? "#ff3b5c" : "#8c2234", // 0: Crimson Ruby
        level > 0 ? "#ffd24c" : "#8f752a", // 1: Imperial Gold
        level > 0 ? "#33e8ff" : "#1c808c", // 2: Electric Cyan
        level > 0 ? "#c670ff" : "#6d3e8c", // 3: Royal Amethyst
        level > 0 ? "#42ff9e" : "#248c57", // 4: Emerald Jade
        level > 0 ? "#ff7e38" : "#8c451f", // 5: Tangerine Coral
        level > 0 ? "#ff58ce" : "#8c3071", // 6: Sakura Magenta
        level > 0 ? "#5492ff" : "#2e508c"  // 7: Sapphire Blue
    ]

    property color goldCol:   level > 0 ? "#ffd26e" : "#8c6e37"
    property color silverCol: level > 0 ? "#ffffff" : "#94908a"

    property var pistilPair: [ 1, 2, 6, 1, 2, 1, 2, 1 ]
    property var ringEmitters: []
    property var peonyEmitters: []
    property var pistilEmitters: []
    property var launchSlots: []
    property int launchStep: 0

    ParticleSystem {
        id: sys
        anchors.fill: parent
    }

    // -------------------------------------------------------------------------
    // Reusable Particle Components (Eliminates Per-Colour Boilerplate)
    // -------------------------------------------------------------------------
    Component {
        id: colorHeadParticleComp
        ImageParticle {
            property int colorIdx: 0
            system: sys
            groups: [ "head" + colorIdx ]
            source: "star.png"
            color: win.shellColors[colorIdx]
            colorVariation: 0.08
            alpha: win.headAlpha
            alphaVariation: 0.08
        }
    }

    Component {
        id: colorTailParticleComp
        ImageParticle {
            property int colorIdx: 0
            system: sys
            groups: [ "pistil" + colorIdx, "tail" + colorIdx ]
            source: "star.png"
            color: win.shellColors[colorIdx]
            colorVariation: 0.06
            alpha: win.trailAlpha
            alphaVariation: 0.10
        }
    }

    Component {
        id: colorTailEmitterComp
        TrailEmitter {
            property int colorIdx: 0
            system: sys
            group: "tail" + colorIdx
            follow: "head" + colorIdx
            emitRatePerParticle: 74
            lifeSpan: 440
            lifeSpanVariation: 80
            size: Math.round(11.5 * win.unit * win.grow)
            endSize: Math.round(3.0 * win.unit)
            velocity: AngleDirection {
                angle: 0
                angleVariation: 360
                magnitude: Math.round(2 * win.unit)
            }
        }
    }

    Component {
        id: headSparkEmitterComp
        TrailEmitter {
            property int colorIdx: 0
            system: sys
            group: "headSpark"
            follow: "head" + colorIdx
            emitRatePerParticle: 14
            lifeSpan: 90
            size: Math.round(9.5 * win.unit * win.grow)
            endSize: Math.round(4.0 * win.unit)
        }
    }

    // -------------------------------------------------------------------------
    // Shared Pyrotechnic Point-Sprite Painters (Gold Trails, Willow & Crackle)
    // -------------------------------------------------------------------------
    ImageParticle {
        system: sys
        groups: [ "rocketHead", "willowHead", "willowTrail", "rocketTrail" ]
        source: "star.png"
        color: win.goldCol
        colorVariation: 0.08
        alpha: win.headAlpha
    }

    ImageParticle {
        system: sys
        groups: [ "crackleSilver", "flashCore", "headSpark" ]
        source: "star.png"
        color: win.silverCol
        colorVariation: 0.04
        alpha: win.headAlpha
        alphaVariation: 0.12
    }

    // Brief incandescent ignition flash at burst apex
    Emitter {
        id: flashEmitter
        system: sys
        group: "flashCore"
        enabled: false
        emitRate: 0
        x: -500; y: -500
        lifeSpan: 240
        size: Math.round(58 * win.unit * win.grow)
        endSize: Math.round(4 * win.unit)
    }

    // Rocket head emitters (burst(1, x, y) launches a single climbing rocket)
    Emitter {
        id: rocketEmitterL
        system: sys
        group: "rocketHead"
        enabled: false
        emitRate: 0
        x: -500; y: -500
        lifeSpan: 760
        size: Math.round(18 * win.unit * win.grow)
        endSize: Math.round(12 * win.unit * win.grow)
        velocity: AngleDirection {
            angle: 266
            angleVariation: 4
            magnitude: Math.round(820 * win.unit)
            magnitudeVariation: Math.round(40 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(360 * win.unit) }
    }

    Emitter {
        id: rocketEmitterR
        system: sys
        group: "rocketHead"
        enabled: false
        emitRate: 0
        x: -500; y: -500
        lifeSpan: 760
        size: Math.round(18 * win.unit * win.grow)
        endSize: Math.round(12 * win.unit * win.grow)
        velocity: AngleDirection {
            angle: 274
            angleVariation: 4
            magnitude: Math.round(820 * win.unit)
            magnitudeVariation: Math.round(40 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(360 * win.unit) }
    }

    // Continuous fine spark tail behind climbing rockets
    TrailEmitter {
        system: sys
        group: "rocketTrail"
        follow: "rocketHead"
        emitRatePerParticle: 140
        lifeSpan: 360
        lifeSpanVariation: 90
        size: Math.round(11 * win.unit * win.grow)
        endSize: Math.round(3 * win.unit)
        velocity: AngleDirection {
            angle: 90
            angleVariation: 24
            magnitude: Math.round(40 * win.unit)
            magnitudeVariation: Math.round(16 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(80 * win.unit) }
    }

    // Weeping willow / brocade gold crown stars + trailing gold filaments
    Emitter {
        id: willowEmitter
        system: sys
        group: "willowHead"
        enabled: false
        emitRate: 0
        x: -500; y: -500
        lifeSpan: 2450
        lifeSpanVariation: 450
        size: Math.round(15 * win.unit * win.grow)
        sizeVariation: Math.round(3 * win.unit)
        endSize: Math.round(4 * win.unit)
        velocity: AngleDirection {
            angle: 0
            angleVariation: 360
            magnitude: Math.round(215 * win.unit)
            magnitudeVariation: Math.round(85 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(135 * win.unit) }
    }

    TrailEmitter {
        system: sys
        group: "willowTrail"
        follow: "willowHead"
        emitRatePerParticle: 68
        lifeSpan: 480
        lifeSpanVariation: 110
        size: Math.round(10.5 * win.unit * win.grow)
        endSize: Math.round(3.0 * win.unit)
        velocity: AngleDirection {
            angle: 90
            angleVariation: 180
            magnitude: Math.round(3 * win.unit)
        }
    }

    // Fine white-silver crackle micro-sparks
    Emitter {
        id: crackleEmitter
        system: sys
        group: "crackleSilver"
        enabled: false
        emitRate: 0
        x: -500; y: -500
        lifeSpan: 1200
        lifeSpanVariation: 380
        size: Math.round(12 * win.unit * win.grow)
        sizeVariation: Math.round(3 * win.unit)
        endSize: Math.round(3 * win.unit)
        velocity: AngleDirection {
            angle: 0
            angleVariation: 360
            magnitude: Math.round(235 * win.unit)
            magnitudeVariation: Math.round(115 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(105 * win.unit) }
    }

    // -------------------------------------------------------------------------
    // Per-Colour Shell Emitters & Launch Slots
    // -------------------------------------------------------------------------
    Item {
        anchors.fill: parent

        Repeater {
            model: 8

            Item {
                anchors.fill: parent

                // 1A: Crisp spherical ring shell emitter (tight velocity band)
                Emitter {
                    id: ringShell
                    system: sys
                    group: "head" + index
                    enabled: false
                    emitRate: 0
                    x: -500; y: -500
                    lifeSpan: 2150
                    lifeSpanVariation: 380
                    size: Math.round(17 * win.unit * win.grow)
                    sizeVariation: Math.round(3 * win.unit)
                    endSize: Math.round(4 * win.unit)
                    velocity: AngleDirection {
                        angle: 0
                        angleVariation: 360
                        magnitude: Math.round(310 * win.unit)
                        magnitudeVariation: Math.round(36 * win.unit)
                    }
                    acceleration: PointDirection { y: Math.round(112 * win.unit) }
                }

                // 1B: Volumetric 3D peony/chrysanthemum emitter (fills sphere interior to rim)
                Emitter {
                    id: peonyShell
                    system: sys
                    group: "head" + index
                    enabled: false
                    emitRate: 0
                    x: -500; y: -500
                    lifeSpan: 2300
                    lifeSpanVariation: 520
                    size: Math.round(16 * win.unit * win.grow)
                    sizeVariation: Math.round(3.5 * win.unit)
                    endSize: Math.round(3.5 * win.unit)
                    velocity: AngleDirection {
                        angle: 0
                        angleVariation: 360
                        magnitude: Math.round(255 * win.unit)
                        magnitudeVariation: Math.round(135 * win.unit)
                    }
                    acceleration: PointDirection { y: Math.round(118 * win.unit) }
                }

                // 2: Contrasting inner pistil flower core emitter
                Emitter {
                    id: pistilShell
                    system: sys
                    group: "head" + index
                    enabled: false
                    emitRate: 0
                    x: -500; y: -500
                    lifeSpan: 1750
                    lifeSpanVariation: 360
                    size: Math.round(14 * win.unit * win.grow)
                    sizeVariation: Math.round(2.5 * win.unit)
                    endSize: Math.round(3.0 * win.unit)
                    velocity: AngleDirection {
                        angle: 0
                        angleVariation: 360
                        magnitude: Math.round(160 * win.unit)
                        magnitudeVariation: Math.round(45 * win.unit)
                    }
                    acceleration: PointDirection { y: Math.round(92 * win.unit) }
                }

                Component.onCompleted: {
                    win.ringEmitters.push(ringShell);
                    win.peonyEmitters.push(peonyShell);
                    win.pistilEmitters.push(pistilShell);
                }
            }
        }

        // 3 concurrent launch slots (Rocket Ascent -> Apex Bloom -> Crackle)
        Repeater {
            model: 3

            Item {
                id: slotItem
                property real targetX: 960
                property real targetY: 360
                property int primaryIdx: 0
                property int secondaryIdx: 1
                property int burstStyle: 0

                function schedule(tx, ty, pIdx, sIdx, style) {
                    targetX = tx;
                    targetY = ty;
                    primaryIdx = pIdx;
                    secondaryIdx = sIdx;
                    burstStyle = style;
                    burstTimer.restart();
                }

                Timer {
                    id: burstTimer
                    interval: 750
                    running: false
                    repeat: false
                    onTriggered: {
                        win.triggerBurst(slotItem.targetX, slotItem.targetY, slotItem.primaryIdx, slotItem.secondaryIdx, slotItem.burstStyle);
                        crackleTimer.restart();
                    }
                }

                Timer {
                    id: crackleTimer
                    interval: 240
                    running: false
                    repeat: false
                    onTriggered: win.triggerCrackle(slotItem.targetX, slotItem.targetY, slotItem.primaryIdx, slotItem.burstStyle)
                }

                Component.onCompleted: win.launchSlots.push(slotItem)
            }
        }
    }

    // -------------------------------------------------------------------------
    // Modular Burst Style Helpers (Low Cyclomatic Complexity)
    // -------------------------------------------------------------------------
    function burstPeonyPistil(x, y, pIdx, sIdx) {
        // Style 0: Classic Peony + Contrasting Inner Pistil + Gold Core
        ringEmitters[pIdx].burst(34, x, y);
        peonyEmitters[pIdx].burst(38, x, y);
        pistilEmitters[sIdx].burst(30, x, y);
        willowEmitter.burst(16, x, y);
    }

    function burstChrysanthemumWillow(x, y, pIdx, sIdx) {
        // Style 1: Chrysanthemum / Weeping Willow Gold Crown
        peonyEmitters[pIdx].burst(46, x, y);
        willowEmitter.burst(38, x, y);
        pistilEmitters[sIdx].burst(26, x, y);
    }

    function burstDoubleRingDiadem(x, y, pIdx, sIdx) {
        // Style 2: Double-Ring Diadem (concentric outer & mid colour rings)
        ringEmitters[pIdx].burst(42, x, y);
        ringEmitters[sIdx].burst(30, x, y);
        pistilEmitters[sIdx].burst(28, x, y);
        crackleEmitter.burst(18, x, y);
    }

    function burstCrossetteBlossom(x, y, pIdx, sIdx) {
        // Style 3: Crossette Multi-Blossom (central flower + 4 sub-clusters)
        ringEmitters[pIdx].burst(36, x, y);
        pistilEmitters[sIdx].burst(24, x, y);
        var off = Math.round(52 * win.unit);
        var pPistil = pistilEmitters[pIdx];
        var sPistil = pistilEmitters[sIdx];
        pPistil.burst(12, x - off, y - off);
        pPistil.burst(12, x + off, y - off);
        sPistil.burst(12, x - off, y + off);
        sPistil.burst(12, x + off, y + off);
    }

    function burstTwinBrocade(x, y, pIdx, sIdx) {
        // Style 4: Twin-Hue Brocade Canopy
        peonyEmitters[pIdx].burst(38, x, y);
        peonyEmitters[sIdx].burst(34, x, y);
        willowEmitter.burst(26, x, y);
    }

    function triggerBurst(x, y, pIdx, sIdx, style) {
        if (ringEmitters.length < 8) return;
        flashEmitter.burst(2, x, y);

        var recipes = [
            burstPeonyPistil,
            burstChrysanthemumWillow,
            burstDoubleRingDiadem,
            burstCrossetteBlossom,
            burstTwinBrocade
        ];
        recipes[style % recipes.length](x, y, pIdx, sIdx);
    }

    function triggerCrackle(x, y, pIdx, style) {
        if (pistilEmitters.length < 8) return;
        crackleEmitter.burst(style === 1 ? 30 : 22, x, y);
        pistilEmitters[pIdx].burst(12, x, y);
    }

    // -------------------------------------------------------------------------
    // Salvo Selection & Rocket Launch Helpers
    // -------------------------------------------------------------------------
    function pickSecondaryColor(pIdx) {
        var n = shellColors.length;
        if (Math.random() < 0.70) return pistilPair[pIdx];
        return (pIdx + 1 + Math.floor(Math.random() * (n - 1))) % n;
    }

    function launchRocketTo(tx, ty) {
        var leanRight = (Math.random() < 0.5);
        var startY = ty + Math.round(495 * win.unit);
        var offset = Math.round(32 * win.unit);
        var startX = tx + (leanRight ? -offset : offset);
        var emitter = leanRight ? rocketEmitterR : rocketEmitterL;
        emitter.burst(1, startX, startY);
    }

    function launchSlot(slotIdx, regionMinX, regionMaxX) {
        if (launchSlots.length <= slotIdx) return;

        var pIdx = Math.floor(Math.random() * shellColors.length);
        var sIdx = pickSecondaryColor(pIdx);
        var style = Math.floor(Math.random() * 5);
        var tx = regionMinX + Math.random() * (regionMaxX - regionMinX);
        var ty = win.height * 0.20 + Math.random() * (win.height * 0.36);

        launchRocketTo(tx, ty);
        launchSlots[slotIdx].schedule(tx, ty, pIdx, sIdx, style);
    }

    function fireSalvo() {
        launchStep = (launchStep + 1) % 4;
        var mx = win.width * 0.18;

        if (launchStep % 2 === 1) {
            launchSlot(0, mx, win.width * 0.46);
            duetDelayTimer.restart();
            return;
        }
        var soloSlot = (launchStep === 0) ? 0 : 2;
        launchSlot(soloSlot, mx, win.width - mx);
    }

    Timer {
        id: duetDelayTimer
        interval: 340
        running: false
        repeat: false
        onTriggered: win.launchSlot(1, win.width * 0.54, win.width * 0.82)
    }

    Timer {
        interval: 2350
        running: true
        repeat: true
        onTriggered: win.fireSalvo()
    }

    function initColorParticles() {
        for (var i = 0; i < shellColors.length; i++) {
            colorHeadParticleComp.createObject(win, { colorIdx: i });
            colorTailParticleComp.createObject(win, { colorIdx: i });
            colorTailEmitterComp.createObject(win, { colorIdx: i });
            headSparkEmitterComp.createObject(win, { colorIdx: i });
        }
    }

    Component.onCompleted: {
        initColorParticles();
        fireSalvo();
    }
}
