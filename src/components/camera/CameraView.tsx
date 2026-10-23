"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface CameraViewHandle {
  capturePhoto: () => string | null;
}

interface CameraViewProps {
  onError?: (error: string) => void;
  onReady?: (ready: boolean) => void;
}

const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(
  ({ onError, onReady }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [failed,setFailed]=useState(false);

    useEffect(() => {
      let mounted = true;
      onReady?.(false);

      async function startCamera() {
        try {
          let stream: MediaStream;

          try {
            // Prefer rear camera on mobile devices
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" } },
              audio: false,
            });
          } catch {
            // Fallback for laptops/desktops without a rear camera
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }

          if (!mounted) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = stream;

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            if (mounted) { setIsReady(true); onReady?.(true); }
          }
        } catch (err: any) {
          console.error("Camera access error:", err);
          if (!mounted) return;
          setFailed(true);
          onError?.(err.message || "Unable to access camera. Please check permissions.");
        }
      }

      startCamera();

      return () => {
        mounted = false;
        streamRef.current?.getTracks().forEach((track) => track.stop());
      };
    }, [onError, onReady]);

    useImperativeHandle(ref, () => ({
      capturePhoto: () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || !isReady || !video.videoWidth || !video.videoHeight) return null;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.85);
      },
    }));

    return (
      <div className="relative w-full h-[min(42vh,480px)] min-h-[260px] bg-slate-900 overflow-hidden rounded-2xl">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          aria-label="Live camera preview"
        />
        <canvas ref={canvasRef} className="hidden" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm text-center p-8">
            {failed ? "Camera unavailable. Allow camera access and try again." : "Starting your camera..."}
          </div>
        )}
      </div>
    );
  }
);

CameraView.displayName = "CameraView";

export default CameraView;