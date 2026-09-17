import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    setError(null);
    setStarting(true);

    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (result && !stopped) {
            stopped = true;
            controls?.stop();
            onDetected(result.getText());
            onOpenChange(false);
          }
        },
      )
      .then((c) => {
        controls = c;
        setStarting(false);
        if (stopped) c.stop();
      })
      .catch((e) => {
        setStarting(false);
        setError(e instanceof Error ? e.message : "Não foi possível acessar a câmera");
      });

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bipar com a câmera</DialogTitle></DialogHeader>
        <div className="relative overflow-hidden rounded-lg bg-black aspect-[4/3]">
          <video ref={videoRef} className="size-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-primary/80" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </div>
        {error
          ? <p className="text-sm text-destructive">{error}</p>
          : <p className="text-xs text-muted-foreground">Aponte a câmera para o código de barras do produto.</p>}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  );
}
