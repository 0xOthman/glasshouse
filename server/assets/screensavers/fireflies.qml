/*
 * Fireflies screen saver.
 *
 * Bioluminescent fireflies drifting and pulsing through a dark glade at three
 * optical depth planes — deep background spores, mid-glade luciferin lime-gold
 * and mint-emerald fireflies, and foreground warm-amber lanterns — with soft
 * radial glow auras ("star.png" at 60-110px), incandescent pinpoint cores, and
 * periodic synchronized chorus waves that ripple across the glade.
 *
 * Efficiency architecture:
 *   - Runs entirely on the GPU via QtQuick.Particles 2.0 ImageParticle
 *     ("star.png"), TrailEmitter, and Wander affectors — zero ItemParticle
 *     scene-graph nodes, zero Canvas FBOs, and zero per-frame JavaScript.
 *   - Uses 4 ImageParticle painters in total (lime-gold, warm-amber,
 *     mint-emerald, and incandescent white-gold cores/spores), keeping steady
 *     qml-runner CPU usage around ~8-10% on C2.
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
    property real grow: level > 0 ? 1.22 : 1.0
    property real bodyAlpha: level > 0 ? 0.95 : 0.66
    property real auraAlpha: level > 0 ? 0.34 : 0.20

    // Bioluminescent palette (explicit dim-mode RGB values for dark rooms):
    property color limeGold:  level > 0 ? "#c8ff42" : "#6b8a24"
    property color warmAmber: level > 0 ? "#ffbe38" : "#8c681f"
    property color mintGlow:  level > 0 ? "#4cffb8" : "#298a64"
    property color coreSpark: level > 0 ? "#ffffdc" : "#999982"

    property int waveStep: 0

    ParticleSystem {
        id: sys
        anchors.fill: parent
    }

    // -------------------------------------------------------------------------
    // 1. GPU Point-Sprite Painters (Soft Radial Glow via star.png, No Hard Rings)
    // -------------------------------------------------------------------------
    ImageParticle {
        system: sys
        groups: [ "limeBody", "limeAura", "deepSpore" ]
        source: "star.png"
        color: win.limeGold
        colorVariation: 0.10
        alpha: win.bodyAlpha
        alphaVariation: 0.12
        entryEffect: ImageParticle.Scale
    }

    ImageParticle {
        system: sys
        groups: [ "amberBody", "amberAura" ]
        source: "star.png"
        color: win.warmAmber
        colorVariation: 0.08
        alpha: win.bodyAlpha
        alphaVariation: 0.12
        entryEffect: ImageParticle.Scale
    }

    ImageParticle {
        system: sys
        groups: [ "mintBody", "mintAura" ]
        source: "star.png"
        color: win.mintGlow
        colorVariation: 0.08
        alpha: win.bodyAlpha
        alphaVariation: 0.12
        entryEffect: ImageParticle.Scale
    }

    ImageParticle {
        system: sys
        groups: [ "hotCore" ]
        source: "star.png"
        color: win.coreSpark
        colorVariation: 0.04
        alpha: win.bodyAlpha
        entryEffect: ImageParticle.Fade
    }

    // -------------------------------------------------------------------------
    // 2. Deep Background Spores & Distant Canopy Glows (Depth Layer 1)
    // -------------------------------------------------------------------------
    Emitter {
        system: sys
        group: "deepSpore"
        startTime: 10000
        x: 0
        y: win.height * 0.05
        width: win.width
        height: win.height * 0.90
        shape: RectangleShape { fill: true }
        emitRate: 14
        maximumEmitted: 140
        lifeSpan: 9500
        lifeSpanVariation: 2500
        size: Math.round(11 * win.unit * win.grow)
        sizeVariation: Math.round(4 * win.unit)
        endSize: Math.round(3 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 160
            magnitude: Math.round(11 * win.unit)
            magnitudeVariation: Math.round(6 * win.unit)
        }
    }

    // Soft diffuse background forest glows (uses star.png radial falloff, never rings)
    Emitter {
        system: sys
        group: "limeAura"
        startTime: 8000
        x: 0
        y: win.height * 0.12
        width: win.width
        height: win.height * 0.78
        shape: RectangleShape { fill: true }
        emitRate: 2.2
        maximumEmitted: 20
        lifeSpan: 8500
        lifeSpanVariation: 2000
        size: Math.round(105 * win.unit * win.grow)
        sizeVariation: Math.round(35 * win.unit)
        endSize: Math.round(28 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 150
            magnitude: Math.round(14 * win.unit)
            magnitudeVariation: Math.round(6 * win.unit)
        }
    }

    // -------------------------------------------------------------------------
    // 3. Mid-Glade & Foreground Pulsing Fireflies (Depth Layers 2 & 3)
    // -------------------------------------------------------------------------
    // 3A: Mid-glade Luciferin Lime-Gold Fireflies (pulse swell via Scale + endSize)
    Emitter {
        system: sys
        group: "limeBody"
        startTime: 5000
        x: 0
        y: win.height * 0.08
        width: win.width
        height: win.height * 0.84
        shape: RectangleShape { fill: true }
        emitRate: 9.0
        maximumEmitted: 48
        lifeSpan: 4800
        lifeSpanVariation: 1400
        size: Math.round(36 * win.unit * win.grow)
        sizeVariation: Math.round(10 * win.unit)
        endSize: Math.round(4 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 155
            magnitude: Math.round(22 * win.unit)
            magnitudeVariation: Math.round(12 * win.unit)
        }
        acceleration: AngleDirection {
            angle: 0
            angleVariation: 360
            magnitude: Math.round(9 * win.unit)
        }
    }

    // 3B: Foreground Warm Amber Lanterns (Close to viewer, lush golden halo + white core)
    Emitter {
        system: sys
        group: "amberBody"
        startTime: 5000
        x: 0
        y: win.height * 0.14
        width: win.width
        height: win.height * 0.78
        shape: RectangleShape { fill: true }
        emitRate: 5.5
        maximumEmitted: 32
        lifeSpan: 5200
        lifeSpanVariation: 1500
        size: Math.round(48 * win.unit * win.grow)
        sizeVariation: Math.round(14 * win.unit)
        endSize: Math.round(6 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 140
            magnitude: Math.round(18 * win.unit)
            magnitudeVariation: Math.round(10 * win.unit)
        }
        acceleration: AngleDirection {
            angle: 0
            angleVariation: 360
            magnitude: Math.round(8 * win.unit)
        }
    }

    // 3C: Canopy Mint-Emerald Fireflies
    Emitter {
        system: sys
        group: "mintBody"
        startTime: 5000
        x: 0
        y: win.height * 0.06
        width: win.width
        height: win.height * 0.80
        shape: RectangleShape { fill: true }
        emitRate: 4.5
        maximumEmitted: 26
        lifeSpan: 4600
        lifeSpanVariation: 1200
        size: Math.round(32 * win.unit * win.grow)
        sizeVariation: Math.round(8 * win.unit)
        endSize: Math.round(4 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 165
            magnitude: Math.round(25 * win.unit)
            magnitudeVariation: Math.round(12 * win.unit)
        }
        acceleration: AngleDirection {
            angle: 0
            angleVariation: 360
            magnitude: Math.round(10 * win.unit)
        }
    }

    // -------------------------------------------------------------------------
    // 4. Continuous Silky Bioluminescent Trails & Incandescent Lantern Cores
    // -------------------------------------------------------------------------
    // Because fireflies drift at ~18-25 px/s, emitRatePerParticle: 20 places a
    // soft 22px glow sprite every ~1px so the wake is a smooth, continuous ribbon
    // (never dotted beads) while a white-gold hotCore rides at the lantern head.
    TrailEmitter {
        system: sys
        group: "limeAura"
        follow: "limeBody"
        emitRatePerParticle: 18
        maximumEmitted: 480
        lifeSpan: 480
        lifeSpanVariation: 90
        size: Math.round(22 * win.unit * win.grow)
        endSize: Math.round(6 * win.unit)
    }

    TrailEmitter {
        system: sys
        group: "amberAura"
        follow: "amberBody"
        emitRatePerParticle: 18
        maximumEmitted: 360
        lifeSpan: 540
        lifeSpanVariation: 100
        size: Math.round(28 * win.unit * win.grow)
        endSize: Math.round(8 * win.unit)
    }

    TrailEmitter {
        system: sys
        group: "mintAura"
        follow: "mintBody"
        emitRatePerParticle: 18
        maximumEmitted: 260
        lifeSpan: 440
        lifeSpanVariation: 80
        size: Math.round(20 * win.unit * win.grow)
        endSize: Math.round(5 * win.unit)
    }

    // Incandescent white-gold pinpoint heart inside lime & amber fireflies
    TrailEmitter {
        system: sys
        group: "hotCore"
        follow: "amberBody"
        emitRatePerParticle: 14
        maximumEmitted: 180
        lifeSpan: 140
        size: Math.round(18 * win.unit * win.grow)
        endSize: Math.round(8 * win.unit)
    }

    TrailEmitter {
        system: sys
        group: "hotCore"
        follow: "limeBody"
        emitRatePerParticle: 12
        maximumEmitted: 220
        lifeSpan: 120
        size: Math.round(15 * win.unit * win.grow)
        endSize: Math.round(6 * win.unit)
    }

    // -------------------------------------------------------------------------
    // 5. Gentle Night-Air Drift Affector
    // -------------------------------------------------------------------------
    Wander {
        system: sys
        groups: [ "limeBody", "amberBody", "mintBody", "deepSpore" ]
        affectedParameter: Wander.Velocity
        pace: Math.round(42 * win.unit)
        xVariance: Math.round(34 * win.unit)
        yVariance: Math.round(28 * win.unit)
    }

    // -------------------------------------------------------------------------
    // 6. Synchronized Chorus Flash Swells (Rippling Glade Illumination)
    // -------------------------------------------------------------------------
    Emitter {
        id: chorusLimeEmitter
        system: sys
        group: "limeBody"
        enabled: false
        emitRate: 0
        maximumEmitted: 36
        x: -500; y: -500
        lifeSpan: 2800
        lifeSpanVariation: 700
        size: Math.round(44 * win.unit * win.grow)
        sizeVariation: Math.round(12 * win.unit)
        endSize: Math.round(6 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 150
            magnitude: Math.round(24 * win.unit)
            magnitudeVariation: Math.round(12 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(-5 * win.unit) }
    }

    Emitter {
        id: chorusAmberEmitter
        system: sys
        group: "amberBody"
        enabled: false
        emitRate: 0
        maximumEmitted: 28
        x: -500; y: -500
        lifeSpan: 3000
        lifeSpanVariation: 700
        size: Math.round(54 * win.unit * win.grow)
        sizeVariation: Math.round(14 * win.unit)
        endSize: Math.round(8 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 140
            magnitude: Math.round(20 * win.unit)
            magnitudeVariation: Math.round(10 * win.unit)
        }
        acceleration: PointDirection { y: Math.round(-4 * win.unit) }
    }

    Emitter {
        id: chorusAuraEmitter
        system: sys
        group: "amberAura"
        enabled: false
        emitRate: 0
        maximumEmitted: 16
        x: -500; y: -500
        lifeSpan: 2200
        lifeSpanVariation: 500
        size: Math.round(115 * win.unit * win.grow)
        sizeVariation: Math.round(30 * win.unit)
        endSize: Math.round(24 * win.unit)
        velocity: AngleDirection {
            angle: 270
            angleVariation: 120
            magnitude: Math.round(10 * win.unit)
        }
    }

    function pulseGladeCluster(cx, cy) {
        var spreadX = Math.round(220 * win.unit);
        var spreadY = Math.round(130 * win.unit);
        chorusAuraEmitter.burst(2, cx, cy);
        for (var i = 0; i < 4; i++) {
            var px = cx + (Math.random() - 0.5) * spreadX * 2;
            var py = cy + (Math.random() - 0.5) * spreadY * 2;
            chorusLimeEmitter.burst(2, px, py);
            chorusAmberEmitter.burst(2, px, py);
        }
    }

    function triggerChorusWave() {
        waveStep = (waveStep + 1) % 5;
        var zoneWidth = win.width * 0.16;
        var baseX = win.width * 0.12 + waveStep * zoneWidth;
        var cx = baseX + (Math.random() - 0.5) * (zoneWidth * 0.8);
        var cy = win.height * 0.26 + Math.random() * (win.height * 0.50);
        pulseGladeCluster(cx, cy);
    }

    Timer {
        interval: 2600
        running: true
        repeat: true
        onTriggered: win.triggerChorusWave()
    }

    Component.onCompleted: triggerChorusWave()
}
