import { useEffect, useRef } from 'react';
export default function VideoPlayer({ src, poster }) {
  const el = useRef(null);
  useEffect(() => { const p = window.videojs(el.current, { controls: true, fluid: true, preload: 'metadata', poster, sources: [{ src, type: /\.webm$/i.test(src) ? 'video/webm' : 'video/mp4' }] }); return () => p.dispose(); }, [src, poster]);
  return <div className="mt-5 rounded-2xl overflow-hidden bg-black"><div data-vjs-player><video ref={el} className="video-js vjs-big-play-centered" playsInline /></div></div>;
}
