/**
 * ColorPicker Component
 *
 * A custom color picker with hue/saturation picker, hex input, and swatches.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import './ColorPicker.css';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  label?: string;
}

// Convert hex to HSV (better for color picker UI)
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, v: 100 };

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  if (max !== min) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s, v };
}

// Convert HSV to hex
function hsvToHex(h: number, s: number, v: number): string {
  h = h / 360;
  s = s / 100;
  v = v / 100;

  let r = 0, g = 0, b = 0;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Validate hex color
function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// Recent colors (shared across all color pickers in session)
const recentColors: string[] = [];
const MAX_RECENT_COLORS = 8;

function addRecentColor(color: string) {
  const normalized = color.toUpperCase();
  const index = recentColors.indexOf(normalized);
  if (index !== -1) {
    recentColors.splice(index, 1);
  }
  recentColors.unshift(normalized);
  if (recentColors.length > MAX_RECENT_COLORS) {
    recentColors.pop();
  }
}

export function ColorPicker({ color, onChange, onClose, label }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color.toUpperCase());
  const satBrightnessRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Update hex input when hsv changes
  useEffect(() => {
    const newHex = hsvToHex(hsv.h, hsv.s, hsv.v);
    setHexInput(newHex.toUpperCase());
    onChange(newHex);
  }, [hsv, onChange]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        addRecentColor(hsvToHex(hsv.h, hsv.s, hsv.v));
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, hsv]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        addRecentColor(hsvToHex(hsv.h, hsv.s, hsv.v));
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, hsv]);

  // Handle saturation/brightness picker (x = saturation, y = value/brightness)
  const handleSatBrightnessMove = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!satBrightnessRef.current) return;

      const rect = satBrightnessRef.current.getBoundingClientRect();
      let x = (e.clientX - rect.left) / rect.width;
      let y = (e.clientY - rect.top) / rect.height;

      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));

      // x = saturation (0-100), y = inverse of value (0 at top = 100% value)
      const s = x * 100;
      const v = (1 - y) * 100;

      setHsv(prev => ({ ...prev, s, v }));
    },
    []
  );

  // Handle hue slider
  const handleHueMove = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!hueRef.current) return;

      const rect = hueRef.current.getBoundingClientRect();
      let x = (e.clientX - rect.left) / rect.width;
      x = Math.max(0, Math.min(1, x));

      setHsv(prev => ({ ...prev, h: x * 360 }));
    },
    []
  );

  // Mouse drag handlers
  const startDrag = (
    moveHandler: (e: MouseEvent) => void
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    moveHandler(e.nativeEvent);

    const handleMouseMove = (e: MouseEvent) => {
      moveHandler(e);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle hex input change
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase();
    if (!value.startsWith('#')) {
      value = '#' + value;
    }
    setHexInput(value);

    if (isValidHex(value)) {
      setHsv(hexToHsv(value));
    }
  };

  // Apply preset color
  const applyColor = (hex: string) => {
    setHsv(hexToHsv(hex));
    setHexInput(hex.toUpperCase());
  };

  // Common colors
  const presetColors = [
    '#FF0000', '#FF8800', '#FFFF00', '#88FF00',
    '#00FF00', '#00FF88', '#00FFFF', '#0088FF',
    '#0000FF', '#8800FF', '#FF00FF', '#FF0088',
    '#FFFFFF', '#CCCCCC', '#888888', '#444444',
  ];

  return (
    <div className="color-picker-overlay">
      <div className="color-picker-modal" ref={modalRef}>
        {label && <div className="color-picker-label">{label}</div>}

        {/* Saturation/Brightness picker */}
        <div
          className="color-picker-saturation"
          ref={satBrightnessRef}
          style={{
            background: `linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
          }}
          onMouseDown={startDrag(handleSatBrightnessMove)}
        >
          <div className="color-picker-saturation-overlay" />
          <div
            className="color-picker-cursor"
            style={{
              left: `${hsv.s}%`,
              top: `${100 - hsv.v}%`,
            }}
          />
        </div>

        {/* Hue slider */}
        <div
          className="color-picker-hue"
          ref={hueRef}
          onMouseDown={startDrag(handleHueMove)}
        >
          <div
            className="color-picker-hue-cursor"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>

        {/* Color preview and hex input */}
        <div className="color-picker-inputs">
          <div
            className="color-picker-preview"
            style={{ backgroundColor: hexInput }}
          />
          <input
            type="text"
            className="color-picker-hex-input"
            value={hexInput}
            onChange={handleHexChange}
            maxLength={7}
            placeholder="#000000"
          />
          <button
            className="color-picker-copy-btn"
            onClick={() => navigator.clipboard.writeText(hexInput)}
            title="Copy hex value"
          >
            Copy
          </button>
        </div>

        {/* Preset colors */}
        <div className="color-picker-presets">
          {presetColors.map(preset => (
            <button
              key={preset}
              className="color-picker-preset"
              style={{ backgroundColor: preset }}
              onClick={() => applyColor(preset)}
              title={preset}
            />
          ))}
        </div>

        {/* Recent colors */}
        {recentColors.length > 0 && (
          <div className="color-picker-recent">
            <span className="color-picker-recent-label">Recent:</span>
            {recentColors.map((recent, index) => (
              <button
                key={`${recent}-${index}`}
                className="color-picker-preset"
                style={{ backgroundColor: recent }}
                onClick={() => applyColor(recent)}
                title={recent}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="color-picker-actions">
          <button className="color-picker-done" onClick={() => {
            addRecentColor(hsvToHex(hsv.h, hsv.s, hsv.v));
            onClose();
          }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
