'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
};

const WIDTH = 480;
const HEIGHT = 160;

export default function SignaturePad({ onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const paintBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    paintBackground();
  }, [paintBackground]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    drawingRef.current = true;
    hasInkRef.current = true;
    setIsEmpty(false);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPoint(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    drawingRef.current = false;
    if (hasInkRef.current) onChange(canvasRef.current?.toDataURL('image/jpeg', 0.85) ?? null);
  };

  const clear = () => {
    hasInkRef.current = false;
    setIsEmpty(true);
    onChange(null);
    paintBackground();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) { onChange(null); return; }
    onChange(canvas.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          className={`block h-32 w-full touch-none ${disabled ? 'pointer-events-none opacity-60' : 'cursor-crosshair'}`}
        />
        {isEmpty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">
            Draw your signature here
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={clear} disabled={disabled} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          Clear
        </button>
        <button type="button" onClick={save} disabled={disabled || isEmpty} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          Save Signature
        </button>
      </div>
    </div>
  );
}
