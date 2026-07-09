import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import MotionPhotoPreview from "@/components/MotionPhotoPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import useMediaQuery from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import type { PreviewMediaItem } from "@/utils/media-item";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imgUrls?: string[];
  items?: PreviewMediaItem[];
  initialIndex?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;
const DOUBLE_TAP_ZOOM = 2;

const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

function PreviewImageDialog({ open, onOpenChange, imgUrls = [], items, initialIndex = 0 }: Props) {
  const sm = useMediaQuery("sm");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomScale, setZoomScale] = useState(MIN_ZOOM);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const mediaWrapperRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const [imageTranslate, setImageTranslate] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isPinching, setIsPinching] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const translateStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(MIN_ZOOM);
  const pinchStartMidpointRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const lastTouchDblTapTimeRef = useRef<number>(0);
  const isDoubleTappingRef = useRef<boolean>(false);
  const previewItems = useMemo(
    () => items ?? imgUrls.map((url) => ({ id: url, kind: "image" as const, sourceUrl: url, posterUrl: url, filename: "Image" })),
    [imgUrls, items],
  );

  const clampImageTranslation = (x: number, y: number, scale: number) => {
    if (!imageRef.current || !mediaWrapperRef.current) {
      return { x, y };
    }

    const img = imageRef.current;
    const container = mediaWrapperRef.current;

    const naturalWidth = img.naturalWidth || 1;
    const naturalHeight = img.naturalHeight || 1;
    const clientWidth = img.clientWidth;
    const clientHeight = img.clientHeight;

    const naturalRatio = naturalWidth / naturalHeight;
    const clientRatio = clientWidth / clientHeight;

    let renderedWidth = clientWidth;
    let renderedHeight = clientHeight;

    if (clientRatio > naturalRatio) {
      renderedWidth = clientHeight * naturalRatio;
    } else {
      renderedHeight = clientWidth / naturalRatio;
    }

    const scaledWidth = renderedWidth * scale;
    const scaledHeight = renderedHeight * scale;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const maxTranslateX = scaledWidth > containerWidth ? (scaledWidth - containerWidth) / 2 : 0;
    const maxTranslateY = scaledHeight > containerHeight ? (scaledHeight - containerHeight) / 2 : 0;

    return {
      x: Math.max(-maxTranslateX, Math.min(maxTranslateX, x)),
      y: Math.max(-maxTranslateY, Math.min(maxTranslateY, y)),
    };
  };

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, open]);

  const itemCount = previewItems.length;
  const safeIndex = Math.max(0, Math.min(currentIndex, itemCount - 1));
  const currentItem = previewItems[safeIndex];
  const hasMultiple = itemCount > 1;
  const isImagePreview = currentItem?.kind === "image";
  const canGoPrevious = safeIndex > 0;
  const canGoNext = safeIndex < itemCount - 1;
  const zoomPercent = Math.round(zoomScale * 100);
  const isZoomed = zoomScale > MIN_ZOOM;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        return;
      }

      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }

      if (event.key === "ArrowLeft") {
        handlePrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        handleNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [itemCount, onOpenChange, open, currentIndex]);

  useEffect(() => {
    setZoomScale(MIN_ZOOM);
    setImageTranslate({ x: 0, y: 0 });
    setIsLoaded(false);
  }, [currentItem?.id, open]);

  useEffect(() => {
    if (offsetX !== 0) {
      if (mediaWrapperRef.current) {
        // Force a style recalculation to apply the translation immediately
        const _ = mediaWrapperRef.current.offsetHeight;
      }
      setIsDragging(false);
      setOffsetX(0);
    }
  }, [currentIndex]);

  const handleClose = () => onOpenChange(false);

  const changeIndexWithSlide = (nextIndex: number, direction: "left" | "right") => {
    if (nextIndex === currentIndex || nextIndex < 0 || nextIndex >= itemCount) {
      return;
    }
    const slideWidth = mediaWrapperRef.current ? mediaWrapperRef.current.clientWidth : window.innerWidth;
    const baseOffset = direction === "left" ? (slideWidth + 24) : -(slideWidth + 24);
    const entryOffset = baseOffset + offsetX;

    setIsDragging(true);
    setOffsetX(entryOffset);
    setCurrentIndex(nextIndex);
  };

  const handlePrevious = () => {
    changeIndexWithSlide(safeIndex - 1, "right");
  };
  const handleNext = () => {
    changeIndexWithSlide(safeIndex + 1, "left");
  };

  const zoomScaleRef = useRef(zoomScale);
  const imageTranslateRef = useRef(imageTranslate);
  const isDraggingImageRef = useRef(isDraggingImage);
  const isPinchingRef = useRef(isPinching);
  const isDraggingRef = useRef(isDragging);
  const offsetXRef = useRef(offsetX);

  zoomScaleRef.current = zoomScale;
  imageTranslateRef.current = imageTranslate;
  isDraggingImageRef.current = isDraggingImage;
  isPinchingRef.current = isPinching;
  isDraggingRef.current = isDragging;
  offsetXRef.current = offsetX;

  useEffect(() => {
    const surface = zoomSurfaceRef.current;
    if (!surface) return;

    const onTouchStart = (e: TouchEvent) => {
      lastTouchDblTapTimeRef.current = Date.now();
      const currentZoomScale = zoomScaleRef.current;
      const currentImageTranslate = imageTranslateRef.current;

      if (e.touches.length === 1) {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
          e.preventDefault(); // Prevent native double-tap-to-zoom
          isDoubleTappingRef.current = true;
          setIsDraggingImage(false);
          setIsPinching(false);
          touchStartRef.current = null;

          if (currentZoomScale > MIN_ZOOM || currentImageTranslate.x !== 0 || currentImageTranslate.y !== 0) {
            resetZoom();
          } else {
            setZoomScale(DOUBLE_TAP_ZOOM);
            setImageTranslate({ x: 0, y: 0 });
          }

          lastTapTimeRef.current = 0;
          return;
        }
        lastTapTimeRef.current = now;

        if (currentZoomScale > MIN_ZOOM) {
          setIsDraggingImage(true);
          dragStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
          translateStartRef.current = { ...currentImageTranslate };
        } else {
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }
      } else if (e.touches.length === 2) {
        e.preventDefault(); // Prevent native pinch-to-zoom
        setIsPinching(true);
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        pinchStartDistanceRef.current = dist;
        pinchStartScaleRef.current = currentZoomScale;

        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        pinchStartMidpointRef.current = { x: midX, y: midY };
        translateStartRef.current = { ...currentImageTranslate };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentZoomScale = zoomScaleRef.current;
      const currentIsDraggingImage = isDraggingImageRef.current;
      const currentIsDragging = isDraggingRef.current;
      const currentIsPinching = isPinchingRef.current;

      if (e.touches.length === 1) {
        if (currentZoomScale > MIN_ZOOM && currentIsDraggingImage) {
          const deltaX = e.touches[0].clientX - dragStartRef.current.x;
          const deltaY = e.touches[0].clientY - dragStartRef.current.y;
          const targetX = translateStartRef.current.x + deltaX;
          const targetY = translateStartRef.current.y + deltaY;
          setImageTranslate(clampImageTranslation(targetX, targetY, currentZoomScale));
        } else if (currentZoomScale === MIN_ZOOM && touchStartRef.current) {
          const touch = e.touches[0];
          const deltaX = touch.clientX - touchStartRef.current.x;
          const deltaY = touch.clientY - touchStartRef.current.y;

          if (!currentIsDragging && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
            setIsDragging(true);
          }

          if (currentIsDragging) {
            if ((deltaX > 0 && !canGoPrevious) || (deltaX < 0 && !canGoNext)) {
              setOffsetX(deltaX * 0.3);
            } else {
              setOffsetX(deltaX);
            }
          }
        }
      } else if (e.touches.length === 2 && currentIsPinching) {
        e.preventDefault(); // Prevent native pinch-to-zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        if (pinchStartDistanceRef.current !== null) {
          const factor = dist / pinchStartDistanceRef.current;
          const newScale = clampZoom(pinchStartScaleRef.current * factor);
          setZoomScale(newScale);

          if (pinchStartMidpointRef.current) {
            const midX = (t1.clientX + t2.clientX) / 2;
            const midY = (t1.clientY + t2.clientY) / 2;
            const deltaX = midX - pinchStartMidpointRef.current.x;
            const deltaY = midY - pinchStartMidpointRef.current.y;
            const targetX = translateStartRef.current.x + deltaX;
            const targetY = translateStartRef.current.y + deltaY;
            setImageTranslate(clampImageTranslation(targetX, targetY, newScale));
          }
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const currentZoomScale = zoomScaleRef.current;
      const currentIsDraggingImage = isDraggingImageRef.current;
      const currentIsDragging = isDraggingRef.current;
      const currentIsPinching = isPinchingRef.current;

      if (isDoubleTappingRef.current) {
        e.preventDefault();
        isDoubleTappingRef.current = false;
      }
      if (currentIsDraggingImage) {
        setIsDraggingImage(false);
      }
      if (currentIsPinching) {
        setIsPinching(false);
        pinchStartDistanceRef.current = null;
        pinchStartMidpointRef.current = null;
      }

      if (!touchStartRef.current) {
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch || currentZoomScale > MIN_ZOOM) {
        touchStartRef.current = null;
        setIsDragging(false);
        setOffsetX(0);
        return;
      }

      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      const minSwipeDistance = 50;
      if (currentIsDragging && Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX > 0 && canGoPrevious) {
          handlePrevious();
          return;
        } else if (deltaX < 0 && canGoNext) {
          handleNext();
          return;
        }
      }

      setIsDragging(false);
      setOffsetX(0);
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: false });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
    };
  }, [
    canGoPrevious,
    canGoNext,
    itemCount,
    currentIndex,
    open
  ]);


  const updateZoom = (nextScale: number) => {
    const clamped = clampZoom(nextScale);
    setZoomScale(clamped);
    if (clamped === MIN_ZOOM) {
      setImageTranslate({ x: 0, y: 0 });
    } else {
      setImageTranslate((prev) => clampImageTranslation(prev.x, prev.y, clamped));
    }
  };

  const resetZoom = () => {
    setZoomScale(MIN_ZOOM);
    setImageTranslate({ x: 0, y: 0 });
  };

  const handleZoomIn = () => updateZoom(zoomScale + ZOOM_STEP);
  const handleZoomOut = () => updateZoom(zoomScale - ZOOM_STEP);
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (isImagePreview) {
      event.preventDefault();
      updateZoom(zoomScale + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }
  };

  const handleDoubleClick = () => {
    if (Date.now() - lastTouchDblTapTimeRef.current < 1000) {
      // Ignore simulated double click following touch activity on mobile
      return;
    }

    if (zoomScale > MIN_ZOOM || imageTranslate.x !== 0 || imageTranslate.y !== 0) {
      resetZoom();
    } else {
      setZoomScale(DOUBLE_TAP_ZOOM);
      setImageTranslate({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomScale > MIN_ZOOM && isImagePreview) {
      if (e.button !== 0) return;
      setIsDraggingImage(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      translateStartRef.current = { ...imageTranslate };
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomScale > MIN_ZOOM && isDraggingImage) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      const targetX = translateStartRef.current.x + deltaX;
      const targetY = translateStartRef.current.y + deltaY;
      setImageTranslate(clampImageTranslation(targetX, targetY, zoomScale));
    }
  };

  const handleMouseUp = () => {
    if (isDraggingImage) {
      setIsDraggingImage(false);
    }
  };

  const renderMediaItem = (item: PreviewMediaItem, index: number, isCurrent: boolean) => {
    if (item.kind === "video") {
      return (
        <video
          key={item.id}
          src={item.sourceUrl}
          poster={item.posterUrl}
          className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]"
          controls={isCurrent}
          autoPlay={isCurrent}
          playsInline
        />
      );
    }

    if (item.kind === "motion") {
      return (
        <MotionPhotoPreview
          key={item.id}
          posterUrl={item.posterUrl}
          motionUrl={item.motionUrl}
          alt={`Preview live photo ${index + 1} of ${itemCount}`}
          presentationTimestampUs={item.presentationTimestampUs}
          badgeClassName="left-3 top-3 sm:left-4 sm:top-4"
          mediaClassName="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]"
        />
      );
    }

    if (isCurrent) {
      return (
        <div className="relative flex items-center justify-center max-h-full max-w-full" style={{ touchAction: "none" }}>
          {!isLoaded && item.posterUrl && (
            <img
              src={item.posterUrl}
              alt=""
              className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain select-none sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)] blur-xs"
              draggable={false}
            />
          )}
          <img
            ref={imageRef}
            src={item.sourceUrl}
            alt={`Preview image ${index + 1} of ${itemCount}`}
            className={cn(
              "max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain select-none sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]",
              !isLoaded && "absolute opacity-0 pointer-events-none"
            )}
            onLoad={() => setIsLoaded(true)}
            style={{
              transform: `translate3d(${imageTranslate.x}px, ${imageTranslate.y}px, 0) scale(${zoomScale})`,
              transition: (isDraggingImage || isPinching) ? "none" : "transform 120ms ease-out",
              transformOrigin: "center center",
              touchAction: "none",
            }}
            onDoubleClick={handleDoubleClick}
            draggable={false}
            loading="eager"
          />
        </div>
      );
    }

    return (
      <img
        src={item.sourceUrl}
        alt={`Preview image ${index + 1} of ${itemCount}`}
        className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain select-none sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]"
        draggable={false}
        loading="lazy"
      />
    );
  };

  if (!itemCount || !currentItem) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!h-[100vh] !w-[100vw] !max-h-[100vh] !max-w-[100vw] overflow-hidden border-0 bg-black/92 p-0 shadow-none"
        style={{ touchAction: "none" }}
      >
        <VisuallyHidden>
          <DialogTitle>{currentItem.filename || "Attachment preview"}</DialogTitle>
          <DialogDescription>
            Attachment preview dialog. Press Escape to close, use left or right arrow keys to switch items, and zoom images with the
            controls, mouse wheel, or double tap.
          </DialogDescription>
        </VisuallyHidden>

        <div className="absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/70 via-black/35 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-medium">{currentItem.filename || "Attachment"}</div>
              {hasMultiple && (
                <div className="mt-1 text-xs text-white/70">
                  {safeIndex + 1} / {itemCount}
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={handleClose}
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full bg-white/10 text-white hover:bg-white/16 hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={zoomSurfaceRef}
          data-testid={isImagePreview ? "preview-zoom-surface" : undefined}
          className={cn(
            "flex h-full w-full items-center justify-center px-3 pb-20 pt-16 sm:px-16 sm:pb-8 sm:pt-20",
            isImagePreview && (zoomScale > MIN_ZOOM ? (isDraggingImage ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"),
          )}
          style={{ touchAction: "none" }}
          onWheel={handleWheel}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isZoomed) {
              handleClose();
            }
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={mediaWrapperRef}
            className="relative w-full h-full flex items-center justify-center overflow-visible"
            onClick={(event) => event.stopPropagation()}
            style={{
              transform: `translate3d(${offsetX}px, 0px, 0)`,
              transition: isDragging ? "none" : "transform 200ms ease-out",
            }}
          >
            {canGoPrevious && (
              <div
                className="absolute w-full h-full flex items-center justify-center"
                style={{ transform: `translate3d(calc(-100% - 24px), 0px, 0)` }}
              >
                {renderMediaItem(previewItems[safeIndex - 1], safeIndex - 1, false)}
              </div>
            )}
            <div
              className="absolute w-full h-full flex items-center justify-center"
              style={{ transform: `translate3d(0px, 0px, 0)` }}
            >
              {renderMediaItem(previewItems[safeIndex], safeIndex, true)}
            </div>
            {canGoNext && (
              <div
                className="absolute w-full h-full flex items-center justify-center"
                style={{ transform: `translate3d(calc(100% + 24px), 0px, 0)` }}
              >
                {renderMediaItem(previewItems[safeIndex + 1], safeIndex + 1, false)}
              </div>
            )}
          </div>
        </div>

        {isImagePreview && (
          <div className="absolute inset-x-0 bottom-0 z-30 px-3 pb-3 pt-6">
            <div className="mx-auto flex w-fit items-center gap-1 rounded-full bg-black/60 px-2 py-2 text-white shadow-lg backdrop-blur-sm">
              {hasMultiple && !sm && (
                <>
                  <ZoomButton label="Previous item" onClick={handlePrevious} disabled={!canGoPrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </ZoomButton>
                  <div className="min-w-9 px-1 text-center text-xs font-medium tabular-nums text-white/75">
                    {safeIndex + 1}/{itemCount}
                  </div>
                  <ZoomButton label="Next item" onClick={handleNext} disabled={!canGoNext}>
                    <ChevronRight className="h-4 w-4" />
                  </ZoomButton>
                  <div className="mx-1 h-5 w-px bg-white/18" />
                </>
              )}
              <ZoomButton label="Zoom out" onClick={handleZoomOut} disabled={zoomScale === MIN_ZOOM}>
                <ZoomOut className="h-4 w-4" />
              </ZoomButton>
              <div className="min-w-12 px-2 text-center text-xs font-medium tabular-nums text-white/80">{zoomPercent}%</div>
              <ZoomButton label="Zoom in" onClick={handleZoomIn} disabled={zoomScale === MAX_ZOOM}>
                <ZoomIn className="h-4 w-4" />
              </ZoomButton>
              <div className="mx-1 h-5 w-px bg-white/18" />
              <ZoomButton label="Reset zoom" onClick={resetZoom} disabled={!isZoomed}>
                <RotateCcw className="h-4 w-4" />
              </ZoomButton>
            </div>
          </div>
        )}

        {hasMultiple && sm && (
          <>
            <NavButton
              side="left"
              disabled={!canGoPrevious}
              label="Previous item"
              onClick={handlePrevious}
              icon={<ChevronLeft className="h-5 w-5" />}
            />
            <NavButton
              side="right"
              disabled={!canGoNext}
              label="Next item"
              onClick={handleNext}
              icon={<ChevronRight className="h-5 w-5" />}
            />
          </>
        )}

        {hasMultiple && !sm && !isImagePreview && (
          <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-6">
            <div className="mx-auto flex max-w-xs items-center justify-between rounded-full bg-black/55 px-2 py-2 backdrop-blur-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={!canGoPrevious}
                className="rounded-full px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
              >
                Prev
              </Button>
              <div className="px-3 text-xs text-white/75">
                {safeIndex + 1} / {itemCount}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={!canGoNext}
                className="rounded-full px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface NavButtonProps {
  side: "left" | "right";
  disabled: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}

const NavButton = ({ side, disabled, label, onClick, icon }: NavButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    disabled={disabled}
    onClick={onClick}
    aria-label={label}
    className={cn(
      "absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/16 hover:text-white disabled:opacity-25 sm:flex",
      side === "left" ? "left-4" : "right-4",
    )}
  >
    {icon}
  </Button>
);

const ZoomButton = ({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    disabled={disabled}
    onClick={onClick}
    aria-label={label}
    className="h-9 w-9 rounded-full text-white hover:bg-white/12 hover:text-white disabled:text-white/35"
  >
    {children}
  </Button>
);

export default PreviewImageDialog;
