/**
 * PrinterAssembly.jsx
 *
 * Reference layout (from product image):
 *
 *   [FINISHER]  [===PRINTER===]  [LARGE CAP TRAY]
 *
 *  • Finisher   → LEFT  of printer (dx negative), floor-aligned
 *  • paper-tray → RIGHT of printer (dx positive), floor-aligned
 *
 * Coordinate system
 * ─────────────────
 *  Stage is DESIGN_WIDTH × STAGE_HEIGHT px, scaled uniformly.
 *  All positions use `bottom` (distance from stage bottom edge) + `dx`
 *  (horizontal offset from the stage horizontal centre).
 *  z-index: accessories under printer (z<30) except finisher (beside, z=20).
 */

import "./PrinterAssembly.css";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── Stage dimensions ──────────────────────────────────────────────────── */
const DESIGN_WIDTH = 620;   // wider to accommodate finisher + tray on sides
const STAGE_HEIGHT = 600;

/* Vertical floor offset – how far the bottom of every floor-level item sits
   from the bottom edge of the stage. */
const FLOOR = 28;

/* Rendered height of the base printer image. */
const BASE_HEIGHT = 380;

/* ── Accessory placement table ─────────────────────────────────────────────
 *
 *  height  – rendered image height (px)
 *  dx      – horizontal shift from stage centre (+ = right, − = left)
 *  bottom  – bottom edge distance from stage bottom (px)
 *  z       – CSS z-index (printer base = 30)
 *
 *  Image aspect ratios (approximate, from visual inspection):
 *    paper-tray.png   : ~0.85 (slightly taller than wide)  → at h=200 → w≈170
 *    finisher.png     : ~0.72 (portrait tall unit)         → at h=310 → w≈223
 * ─────────────────────────────────────────────────────────────────────── */

const PLACEMENT = {
  /**
   * Large Capacity Tray (BP-LC18)  →  RIGHT side of printer, floor-aligned.
   * paper-tray.png is a side-view box ~0.85 aspect (h>w).
   * Rendered h=210 → w≈178 → half≈89
   * Printer half-width ≈ 152px → dx = 152+89+4 = +245
   */
  paperTray: {
    height: 210,
    dx: +200,          // RIGHT of printer
    bottom: FLOOR,
    z: 16,
  },

  /**
   * Finisher (BP-FN3)  →  LEFT side of printer, floor-aligned.
   * Portrait image ~0.72 aspect → h=320 → w≈230 → half≈115
   * Printer half-width ≈ 152px → overlap ~8px → dx = -(152+115-8) = -259
   */
  finisher: {
    height: 320,
    dx: -215,          // LEFT of printer
    bottom: FLOOR,
    z: 20,
  },
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

/* ── Attachment sub-component ───────────────────────────────────────────── */
function Attachment({ image, name, placement }) {
  if (!image || !placement) return null;
  return (
    <div
      className="assembly-attachment"
      style={{
        left: "50%",
        bottom: placement.bottom,
        zIndex: placement.z,
        transform: `translateX(calc(-50% + ${placement.dx}px))`,
      }}
    >
      <img
        src={image}
        alt={name}
        draggable="false"
        style={{ height: placement.height }}
      />
      <span className="assembly-label">{name}</span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function PrinterAssembly({
  baseImage,
  baseName,
  paperTray = false,   // Large Capacity Tray → RIGHT
  finisher = false,   // Finisher unit        → LEFT
  onCapture,             // (dataURL) => void
}) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);

  /* Responsive scaling – fit stage into available panel width */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / DESIGN_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* html2canvas capture – fires after every config change */
  const captureStage = useCallback(async () => {
    if (!stageRef.current || !onCapture) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(stageRef.current, {
        backgroundColor: "#f8f8f8",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      onCapture(canvas.toDataURL("image/png"));
    } catch {/* non-critical */ }
  }, [onCapture]);

  useEffect(() => {
    if (!onCapture) return;
    const t = setTimeout(captureStage, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImage, paperTray, finisher]);

  return (
    <div
      ref={containerRef}
      className="assembly-container"
      style={{ height: STAGE_HEIGHT * scale }}
    >
      <div
        ref={stageRef}
        className="assembly-stage"
        style={{
          width: DESIGN_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      >
        {/* Floor shadow */}
        <div className="assembly-shadow" />

        {/* ── RIGHT of printer ───────────────────────────────────────── */}

        {paperTray && (
          <Attachment
            image="/images/paper-tray.png"
            name="Large Capacity Tray"
            placement={PLACEMENT.paperTray}
          />
        )}

        {/* ── LEFT of printer ────────────────────────────────────────── */}

        {finisher && (
          <Attachment
            image="/images/finisher.png"
            name="Finisher Unit"
            placement={PLACEMENT.finisher}
          />
        )}

        {/* ── Base printer ─────────── */}
        <div
          className="assembly-base"
          style={{
            bottom: FLOOR,
            zIndex: 30,
            transform: "translateX(-50%)",
          }}
        >
          <img
            src={baseImage}
            alt={baseName}
            draggable="false"
            style={{ height: BASE_HEIGHT }}
          />
        </div>
      </div>
    </div>
  );
}
