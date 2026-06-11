import { useEffect, useRef, useState } from 'react';

// Interactive speech bubble:
// - drag anywhere to move the window (same screenX delta pattern as Shrimp)
// - any press pins it (cancels the auto-close timer in main)
// - ✕ button closes it; once pinned, only the user closes it
// - reports its content height so long messages are never clipped
export function Bubble({ message, mood }: { message: string; mood: string }) {
  const [enter, setEnter] = useState(false);
  const [pinned, setPinned] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number; moved: boolean }>({
    dragging: false, lastX: 0, lastY: 0, moved: false,
  });

  useEffect(() => {
    requestAnimationFrame(() => setEnter(true));
  }, []);

  // Auto-size the window to the rendered bubble:
  // stage top padding (12) + bubble height + tail clearance (14)
  useEffect(() => {
    const el = bubbleRef.current;
    const api = (window as any).bubbleAPI;
    if (!el || !api) return;
    const report = () => api.resize(el.offsetHeight + 12 + 14);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [message]);

  const pin = () => {
    if (pinned) return;
    setPinned(true);
    (window as any).bubbleAPI?.pin();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    pin(); // user touched the bubble — it now stays until they close it
    dragRef.current = { dragging: true, lastX: e.screenX, lastY: e.screenY, moved: false };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.screenX - dragRef.current.lastX;
      const dy = e.screenY - dragRef.current.lastY;
      dragRef.current.lastX = e.screenX;
      dragRef.current.lastY = e.screenY;
      if (dx !== 0 || dy !== 0) dragRef.current.moved = true;
      (window as any).bubbleAPI?.drag(dx, dy);
    };
    const onUp = () => { dragRef.current.dragging = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className={`bubble-stage ${enter ? 'enter' : ''}`}>
      <div ref={bubbleRef} className={`bubble mood-${mood} ${pinned ? 'pinned' : ''}`} onMouseDown={onMouseDown}>
        <button
          className="bubble-close"
          title="关闭"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => (window as any).bubbleAPI?.close()}
        >
          ✕
        </button>
        <div className="bubble-text">{message}</div>
        <div className="bubble-tail" />
      </div>
    </div>
  );
}
