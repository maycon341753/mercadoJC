import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, SwitchCamera } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
};

/** Leitor de código de barras usando a câmera do celular. */
export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let raf = 0;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);

    setError(null);
    setStarting(true);

    const start = async () => {
      // Espera o dialog terminar de montar o <video>
      for (let i = 0; i < 20 && !videoRef.current; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const video = videoRef.current;
      if (!video || stopped) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        // fallback: qualquer câmera disponível
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch((e) => {
          throw e;
        });
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      video.setAttribute("autoplay", "true");
      video.muted = true;
      video.playsInline = true;
      await video.play().catch(() => undefined);

      // Leitor nativo do navegador (Chrome/Android) — mais rápido e preciso quando disponível
      type NativeDetector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
      let native: NativeDetector | null = null;
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector;
      if (BD) {
        try { native = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] }); }
        catch { native = null; }
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const found = (code: string) => {
        if (stopped || !code) return;
        stopped = true;
        onDetected(code);
        onOpenChange(false);
      };
      const loop = async () => {
        if (stopped || !videoRef.current) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            if (native) {
              const codes = await native.detect(video);
              if (codes.length > 0) { found(codes[0].rawValue); return; }
            } else if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const result = await reader.decodeFromCanvas(canvas);
              if (result) { found(result.getText()); return; }
            }
          }
        } catch {
          // quadro sem código — segue tentando
        }
        await new Promise((r) => setTimeout(r, 150));
        raf = requestAnimationFrame(() => void loop());
      };
      setStarting(false);
      void loop();
    };

    start().catch((e) => {
      if (stopped) return;
      setStarting(false);
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permissão de câmera negada. Libere o acesso nas configurações do navegador."
          : e instanceof Error
            ? e.message
            : "Não foi possível acessar a câmera",
      );
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, facing, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bipar com a câmera</DialogTitle></DialogHeader>
        <div className="relative overflow-hidden rounded-lg bg-black aspect-[4/3]">
          <video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline />
          <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-primary/80" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 size-8"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label="Trocar câmera"
          >
            <SwitchCamera className="size-4" />
          </Button>
        </div>
        {error
          ? <p className="text-sm text-destructive">{error}</p>
          : <p className="text-xs text-muted-foreground">Aponte a câmera para o código de barras do produto.</p>}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  );
}
