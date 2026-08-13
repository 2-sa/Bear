import { useEffect, useRef, useState } from "react";

function Layer({ url, onReady }: { url: string; onReady: () => void }) {
  const highUrl = url.replace(/\/t\/p\/(w\d+|original)\//, "/t/p/original/");
  const [ready, setReady] = useState(false);
  const done = () => {
    setReady(true);
    onReady();
  };
  return (
    <img
      src={highUrl}
      alt=""
      decoding="async"
      fetchPriority="high"
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) done();
      }}
      onLoad={done}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}

export function HeroBackdrop({ url }: { url: string }) {
  const [layers, setLayers] = useState<{ id: number; url: string }[]>([{ id: 0, url }]);
  const nextId = useRef(1);
  useEffect(() => {
    const id = nextId.current++;
    setLayers((prev) =>
      prev[prev.length - 1]?.url === url ? prev : [...prev, { id, url }],
    );
  }, [url]);
  const settle = (id: number) =>
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      return idx > 0 ? prev.slice(idx) : prev;
    });
  return (
    <>
      {layers.map((l) => (
        <Layer key={l.id} url={l.url} onReady={() => settle(l.id)} />
      ))}
    </>
  );
}
