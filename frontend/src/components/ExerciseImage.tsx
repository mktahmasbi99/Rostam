import versions from "../generated/exercise-artwork-versions.json";

interface Props {
  imageKey: string | null;
  name: string;
  size?: "small" | "large";
}

export function ExerciseImage({ imageKey, name, size = "small" }: Props) {
  if (!imageKey) return <div className={`exercise-image image-fallback ${size}`}>{name.slice(0, 1).toUpperCase()}</div>;
  const custom = imageKey.startsWith("custom:");
  const src = custom
    ? `/api/exercise-images/${encodeURIComponent(imageKey)}`
    : `/exercise-assets/${imageKey}/frame-1.${versions[imageKey as keyof typeof versions] ?? "missing"}.png`;
  return (
    <div className={`exercise-image ${size}`}>
      <img className={custom ? "custom-exercise-art" : "bundled-exercise-art"} src={src} alt="" loading="lazy" />
    </div>
  );
}

