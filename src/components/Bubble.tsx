import { useEffect, useState } from 'react';

export function Bubble({ message, mood }: { message: string; mood: string }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setEnter(true));
  }, []);

  return (
    <div className={`bubble-stage ${enter ? 'enter' : ''}`}>
      <div className={`bubble mood-${mood}`}>
        <div className="bubble-text">{message}</div>
        <div className="bubble-tail" />
      </div>
    </div>
  );
}
