import { forwardRef, useEffect, useMemo, useState } from "react";
import { fallbackImage, imageSrcSet, optimizedImage, originalImage } from "../utils/imageAssets";

const ResponsiveImage = forwardRef(function ResponsiveImage({
  src,
  alt,
  width,
  height,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  loading = "lazy",
  fetchPriority,
  className,
  onError,
  ...props
}, ref) {
  const fallbackChain = useMemo(() => {
    const optimized = optimizedImage(src, Number(width) || 640);
    const original = originalImage(src);
    return Array.from(new Set([optimized, original, fallbackImage()].filter(Boolean)));
  }, [src, width]);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const currentSrc = fallbackChain[fallbackIndex] || fallbackImage();
  const canUseSrcSet = fallbackIndex === 0 && currentSrc !== originalImage(src);

  useEffect(() => {
    setFallbackIndex(0);
  }, [fallbackChain]);

  return (
    <img
      ref={ref}
      src={currentSrc}
      srcSet={canUseSrcSet ? imageSrcSet(src) : undefined}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      className={className}
      onError={(event) => {
        if (fallbackIndex < fallbackChain.length - 1) {
          setFallbackIndex((index) => index + 1);
          return;
        }
        onError?.(event);
      }}
      {...props}
    />
  );
});

export default ResponsiveImage;
