"use client";

// A small, self-contained looping video used as a wordless visual cue.
//
// Every "wait" state in the student app (loading, sending answers, building
// lessons) and the "finished" state (lesson completed) shows one of these. The
// looping motion is the universal signal that the app is alive and working —
// understandable even by students with little English. A still poster keeps the
// box from flashing empty before the video paints.
export default function LoopVideo({
  src,
  poster,
  label,
  className = "",
  size = "w-40",
}: {
  src: string;
  poster?: string;
  label: string;
  className?: string;
  size?: string;
}) {
  return (
    <div
      className={`relative ${size} aspect-square overflow-hidden rounded-3xl ${className}`}
    >
      <video
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
